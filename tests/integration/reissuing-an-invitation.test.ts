import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import { INVITATION_LIFETIME_DAYS } from '~/domain/invitations'
import { createCommandService } from '~/service/command-service'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Sending a Leader a fresh Invitation Link.
 *
 * The gap this closes was a dead end rather than a missing convenience. The tick
 * stops reminding a Leader once their link has run out -- deliberately, because a
 * reminder carrying a dead link sends them to a page telling them to find an Admin
 * -- and raises `relationship_unaccepted` instead. The Admin then had nothing to do
 * about it: the expiry page tells the Leader to ask whoever invited them for a new
 * one, and nothing in the product could issue it.
 */

describe('re-issuing an Invitation Link', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-03-02T09:00:00Z')
  const clock = createTestClock(at)
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`
  const roster = async (fullName: string) =>
    personId(await addPerson(ministry, fullName, { phone: aNumber() }))

  const pair = async (leader: PersonId, participant: PersonId) => {
    const { effects } = await service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds: [leader],
      participantIds: [participant],
    })
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was created')
    return created.relationship.id
  }

  const invitationFor = async (person: PersonId) => {
    const { rows } = await pool.query<{
      token: string
      created_at: Date
      expires_at: Date
    }>(
      `select token, created_at, expires_at from invitation
        where person_id = $1 and consumed_at is null`,
      [person],
    )
    return rows[0] ?? null
  }

  const messagesTo = async (person: PersonId) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  /**
   * Ages the link out from under the Leader, the way a fortnight of silence does.
   * Both ends of the window move: `invitation_expires_after_it_is_issued` refuses a
   * link that ran out before it was issued, and a link that has genuinely expired
   * was genuinely issued a fortnight ago.
   */
  const day = 24 * 60 * 60 * 1000
  const expireTheLink = async (person: PersonId) => {
    await pool.query(
      `update invitation set created_at = $2, expires_at = $3
        where person_id = $1 and consumed_at is null`,
      [person, new Date(at.getTime() - 15 * day), new Date(at.getTime() - day)],
    )
  }

  const reissue = (relationship: string, person: PersonId) =>
    service().execute({
      type: 'invitation.reissue',
      ministryId: ministry.id,
      relationshipId: relationshipId(relationship),
      personId: person,
    })

  it('mints a fresh link and texts it when the one they hold has run out', async () => {
    const leader = await roster('Gideon Lapsed')
    const relationship = await pair(leader, await roster('Rami Lapsed'))

    const before = await invitationFor(leader)
    await expireTheLink(leader)

    await reissue(relationship, leader)

    const after = await invitationFor(leader)
    expect(after).not.toBeNull()
    // A new token, and the dead one gone rather than left beside it: the partial
    // unique index permits one live invitation per person per relationship, and two
    // rows either of which opens the door is the thing it exists to refuse.
    expect(after!.token).not.toEqual(before!.token)
    expect(after!.expires_at.getTime()).toEqual(at.getTime() + INVITATION_LIFETIME_DAYS * day)

    const texts = await messagesTo(leader)
    expect(texts).toHaveLength(2)
    expect(texts[1]).toContain(`https://discipler.test/invitation/${after!.token}`)
  })

  it('replaces a link that is still live, and the superseded one opens nothing', async () => {
    // Re-issuing is the only revocation an Invitation Link has. It authenticates by
    // possession of the phone it was texted to and nothing else, so a link that
    // reached the wrong number -- the condition `invitation.dispute_number` records
    // and deliberately does not act on -- can be taken back in exactly one way:
    // minting over it. The Leader who merely lost the text pays for that by having
    // to use the newest message, which is a thing an Admin can tell them.
    const leader = await roster('Hana Live')
    const relationship = await pair(leader, await roster('Sara Live'))

    const before = await invitationFor(leader)
    await reissue(relationship, leader)
    const after = await invitationFor(leader)

    expect(after!.token).not.toEqual(before!.token)
    expect(after!.expires_at.getTime()).toEqual(at.getTime() + INVITATION_LIFETIME_DAYS * day)

    // Not merely superseded: gone. `reissueInvitation` writes the new token over the
    // same row, so the old one names nothing -- neither a live invitation nor a
    // spent one that a resolve could still report on.
    const { rows } = await pool.query(`select 1 from invitation where token = $1`, [
      before!.token,
    ])
    expect(rows).toHaveLength(0)

    const texts = await messagesTo(leader)
    expect(texts).toHaveLength(2)
    expect(texts[1]).toContain(`https://discipler.test/invitation/${after!.token}`)
  })

  it('records that a link was re-issued, and never the token', async () => {
    const leader = await roster('Ivo Recorded')
    const relationship = await pair(leader, await roster('Tal Recorded'))
    await expireTheLink(leader)

    await reissue(relationship, leader)

    const { rows } = await pool.query<{ type: string; payload: Record<string, unknown> }>(
      `select type, payload from ministry_event
        where subject_id = $1 and type = 'invitation.reissued'`,
      [relationship],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.payload.personId).toEqual(leader)
    // The window, not the credential. History is read on an Admin surface, and a
    // token written there is a way into somebody's acceptance kept forever.
    expect(JSON.stringify(rows[0]?.payload)).not.toContain('token')
  })

  it('counts as the reminder the tick would otherwise send', async () => {
    // The tick gives each Leader one reminder and reads *whether it has sent one*
    // from `relationship.acceptance_reminded`. A re-issue that recorded only its own
    // event would leave that null against a link which is live again, and the next
    // tick would send the identical sentence -- the Admin's chase and the automatic
    // one arriving as two texts nobody meant to send twice.
    const leader = await roster('Lena Chased')
    const relationship = await pair(leader, await roster('Wren Chased'))
    await expireTheLink(leader)

    await reissue(relationship, leader)

    const { rows } = await pool.query<{ person_id: string }>(
      `select payload ->> 'personId' as person_id from ministry_event
        where subject_id = $1 and type = 'relationship.acceptance_reminded'`,
      [relationship],
    )
    expect(rows.map((row) => row.person_id)).toEqual([leader])
  })

  it('records the window it replaced, so the superseded issuance is not lost', async () => {
    // `reissueInvitation` overwrites the row in place. Without both ends in history
    // the issuance it superseded is gone rather than recorded, which is the one
    // thing this repo's rules say not to do to a past fact.
    const leader = await roster('Mira Superseded')
    const relationship = await pair(leader, await roster('Xan Superseded'))
    const before = await invitationFor(leader)
    await expireTheLink(leader)

    await reissue(relationship, leader)
    const after = await invitationFor(leader)

    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'invitation.reissued'`,
      [relationship],
    )

    // The window that was replaced is the aged one, not the one issued at pairing.
    expect(rows[0]?.payload.supersededExpiresAt).toEqual(
      new Date(at.getTime() - day).toISOString(),
    )
    expect(rows[0]?.payload.expiresAt).toEqual(after!.expires_at.toISOString())
    expect(before!.token).toBeDefined()
  })

  it('does nothing once that Leader has accepted', async () => {
    const leader = await roster('Jonah Accepted')
    const relationship = await pair(leader, await roster('Uri Accepted'))

    // Accepted straight in the table rather than through the flow: this test is
    // about what re-issuing does to a relationship nobody is waiting on, and the
    // acceptance path is proven in its own suite.
    await pool.query(`update relationship_member set accepted_at = $2 where person_id = $1`, [
      leader,
      at,
    ])
    await pool.query(`update relationship set accepted_at = $2 where id = $1`, [relationship, at])

    const before = await messagesTo(leader)
    await reissue(relationship, leader)

    // No second text, and no second token. There is nothing to accept.
    expect(await messagesTo(leader)).toEqual(before)
  })

  it('says nothing to a Leader in another Ministry’s relationship', async () => {
    const elsewhere = await createMinistryWithAdmin('Northgate Fellowship')
    const leader = await roster('Kofi Isolated')
    const relationship = await pair(leader, await roster('Vin Isolated'))

    const before = await messagesTo(leader)

    await createCommandService({
      clock,
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    }).execute({
      type: 'invitation.reissue',
      ministryId: elsewhere.id,
      relationshipId: relationshipId(relationship),
      personId: leader,
    })

    expect(await messagesTo(leader)).toEqual(before)
  })
})
