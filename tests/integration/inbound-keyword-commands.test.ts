import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, hours, weeks } from '~/domain/clock'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMembership,
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The inbound keyword commands, driven through the command boundary against the
 * real database.
 *
 * What is only provable here: that a Keyword Exchange survives between two texts,
 * that the partial unique index really does hold a Person to one open exchange, and
 * that a pause taken by keyword lands in the same two events an Admin's does -- so
 * `relationship_pauses` reports it and the check-in cadence stops asking.
 *
 * Every scenario gets a Ministry of its own, for the reason the pause tests do: the
 * derivations run for a whole Ministry at once, and two scenarios sharing one would
 * be coupled to each other rather than to the product.
 */

describe('a Leader texting a keyword', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }

  beforeAll(async () => {
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

  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name)

    const texting = (from: PersonId, body: string, now = at) =>
      createCommandService({
        clock: createTestClock(now),
        ids,
        store,
        appBaseUrl: 'https://discipler.test',
      }).execute({ type: 'sms.inbound', ministryId: ministry.id, personId: from, body })

    const congregant = async (fullName: string) => {
      const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
      await completeIntake(ministry, id)
      return id
    }

    // Each one a week older than the last, so a menu's numbering is decided by the
    // start dates it is meant to be decided by. Two formed in the same instant fall
    // through to the identifier tiebreak, which is arbitrary on purpose -- and a
    // test asserting insertion order would be asserting the tiebreak was not needed.
    let formed = 0
    const aRelationship = async (leader: PersonId, participantName: string) => {
      const participant = await congregant(participantName)
      const createdAt = new Date(at.getTime() - weeks(8) + weeks(++formed))
      const relationship = await pairOneToOne(ministry, leader, participant, {
        createdAt,
        acceptedAt: createdAt,
      })
      return { participant, relationship: relationshipId(relationship) }
    }

    return { ministry, texting, congregant, aRelationship }
  }

  /** Everything Discipler has queued for one Person, oldest first. */
  const sentTo = async (person: PersonId): Promise<string[]> => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at, id`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  const openExchange = async (person: PersonId) => {
    const { rows } = await pool.query(
      `select keyword, options, target_id, clarifications_sent, outcome, closed_at
         from keyword_exchange where person_id = $1 order by opened_at`,
      [person],
    )
    return rows
  }

  const pauseOn = async (ministry: MinistryFixture, relationship: string) => {
    const { rows } = await pool.query(
      `select paused_at, period_weeks from public.relationship_pauses($1)
        where relationship_id = $2`,
      [ministry.id, relationship],
    )
    return rows[0] ?? null
  }

  it('pauses a relationship only after the confirmation, and through the same two events an Admin uses', async () => {
    const { ministry, texting, congregant, aRelationship } = await aMinistry('Keyword Pause')
    const james = await congregant('James Harden')
    const { relationship, participant } = await aRelationship(james, 'Emily Johnson')

    await texting(james, 'PAUSE')

    // Asked, not applied. The exchange is the accidental-tap protection.
    expect(await pauseOn(ministry, relationship)).toBeNull()
    expect(await openExchange(james)).toMatchObject([
      { keyword: 'PAUSE', target_id: relationship, closed_at: null },
    ])

    await texting(james, '4', new Date(at.getTime() + hours(1)))

    // The same row the Admin route produces, read by the same function the tick and
    // Care Needed both read.
    expect(await pauseOn(ministry, relationship)).toMatchObject({ period_weeks: 4 })
    expect(await openExchange(james)).toMatchObject([{ outcome: 'applied' }])

    // And the Participant is told nothing at all. Deliberate silence: their
    // relationship has not changed, they have never received a check-in, and a
    // message explaining the absence of something they never knew existed would be
    // worse than saying nothing.
    expect((await sentTo(participant)).filter((body) => body.includes('paus'))).toEqual([])
    expect((await sentTo(james)).at(-1)).toContain('paused for 4 weeks')
  })

  it('holds a Person to one open exchange, replacing the first with the second', async () => {
    const { texting, congregant, aRelationship } = await aMinistry('Keyword Replace')
    const james = await congregant('James Harden')
    await aRelationship(james, 'Emily Johnson')

    await texting(james, 'PAUSE')
    await texting(james, 'SWAP', new Date(at.getTime() + hours(1)))

    // The unique index would have refused the second insert had the first not
    // closed, so this passing at all is the index being satisfied rather than
    // worked around.
    const exchanges = await openExchange(james)
    expect(exchanges).toMatchObject([{ keyword: 'PAUSE', outcome: 'replaced' }])
    // `SWAP` resolved to one relationship and applied directly, so it opened none.
    expect(exchanges).toHaveLength(1)
  })

  it('numbers a menu, remembers the numbering between two texts, and applies the choice', async () => {
    const { ministry, texting, congregant, aRelationship } = await aMinistry('Keyword Menu')
    const james = await congregant('James Harden')
    const first = await aRelationship(james, 'Emily Johnson')
    const second = await aRelationship(james, 'Sarah Reed')

    await texting(james, 'SWAP')

    const [menu] = await openExchange(james)
    expect(menu).toMatchObject({ keyword: 'SWAP', target_id: null })
    // Stored in the order the message printed, which is what makes the reply
    // tomorrow mean what the message said today.
    expect(menu?.options).toEqual([first.relationship, second.relationship])

    await texting(james, '2', new Date(at.getTime() + hours(2)))

    const { rows: items } = await pool.query(
      `select kind, relationship_id, person_id, payload
         from follow_up_item where ministry_id = $1`,
      [ministry.id],
    )
    expect(items).toMatchObject([
      {
        kind: 'swap_requested',
        relationship_id: second.relationship,
        person_id: james,
        payload: { requestedBy: 'leader' },
      },
    ])
  })

  it('keeps a menu numbered the way it was printed, even after one of its relationships ends', async () => {
    // The defect this exists to stop: ending a relationship closes *every*
    // membership in it, so a read that joined only open memberships would return
    // nothing for the ended one -- and the entry would vanish, renumbering every
    // line under it. The Leader replies `2` meaning Bob and swaps Carol.
    const { ministry, texting, congregant } = await aMinistry('Keyword Renumber')
    const james = await congregant('James Harden')

    // Dated by hand rather than through `pairOneToOne`, which starts the Leader's
    // membership at wall-clock now -- and an ending stamped on this test's clock
    // would then land before the membership it closes.
    let formed = 0
    const dated = async (participantName: string) => {
      const participant = await congregant(participantName)
      const startedAt = new Date(at.getTime() - weeks(8) + weeks(++formed))
      const relationship = await createRelationship(ministry, 'one_to_one', {
        createdAt: startedAt,
        acceptedAt: startedAt,
      })
      for (const [person, role] of [
        [james, 'leader'],
        [participant, 'participant'],
      ] as const) {
        await addMembership({
          ministry,
          relationshipId: relationship,
          kind: 'one_to_one',
          personId: person,
          role,
          startedAt,
        })
      }
      return { participant, relationship: relationshipId(relationship) }
    }

    const first = await dated('Emily Johnson')
    const second = await dated('Sarah Reed')
    const third = await dated('David Ellis')

    await texting(james, 'SWAP')
    expect((await openExchange(james))[0]?.options).toEqual([
      first.relationship,
      second.relationship,
      third.relationship,
    ])

    // An Admin ends the first one while the Leader is still deciding.
    await createCommandService({
      clock: createTestClock(new Date(at.getTime() + hours(1))),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    }).execute({
      type: 'relationship.end',
      ministryId: ministry.id,
      relationshipId: first.relationship,
      reason: 'They moved away.',
      outcome: 'completed',
      endedBy: ministry.adminUserId,
    })

    // `2` still means the second line the message printed.
    await texting(james, '2', new Date(at.getTime() + hours(2)))

    const { rows: items } = await pool.query(
      `select relationship_id from follow_up_item
        where ministry_id = $1 and kind = 'swap_requested'`,
      [ministry.id],
    )
    expect(items).toEqual([{ relationship_id: second.relationship }])
  })

  it('resumes early, releasing the Resume Message and leaving nothing for the tick to expire', async () => {
    const { ministry, texting, congregant, aRelationship } = await aMinistry('Keyword Resume')
    const james = await congregant('James Harden')
    const { relationship, participant } = await aRelationship(james, 'Emily Johnson')

    await texting(james, 'PAUSE')
    await texting(james, 'YES', new Date(at.getTime() + hours(1)))
    expect(await pauseOn(ministry, relationship)).not.toBeNull()

    await texting(james, 'RESUME', new Date(at.getTime() + hours(2)))

    // No standing pause, so the tick has nothing to raise a `pause_expired` item
    // about however long it runs for.
    expect(await pauseOn(ministry, relationship)).toBeNull()
    expect((await sentTo(participant)).at(-1)).toContain('has been resumed')
    expect((await sentTo(james)).at(-1)).toContain('has been resumed')
  })

  it('lets an exchange expire after twenty-four hours, having sent no reminder', async () => {
    const { ministry, texting, congregant, aRelationship } = await aMinistry('Keyword Expiry')
    const james = await congregant('James Harden')
    const { relationship } = await aRelationship(james, 'Emily Johnson')

    await texting(james, 'PAUSE')
    const askedOnce = (await sentTo(james)).length

    // A day later, and the Leader finally says yes. It is too late: the request
    // they walked away from is not one Discipler still holds.
    await texting(james, 'YES', new Date(at.getTime() + hours(25)))

    expect(await pauseOn(ministry, relationship)).toBeNull()
    expect(await openExchange(james)).toMatchObject([{ outcome: 'expired' }])
    // Nothing was re-sent while it waited: only the confirmation and the reply to
    // the reply that arrived too late.
    expect((await sentTo(james)).length).toBe(askedOnce + 1)
  })

  it('takes a Participant’s SWAP as the same request, recording which side asked', async () => {
    const { ministry, texting, congregant, aRelationship } = await aMinistry('Keyword Participant')
    const james = await congregant('James Harden')
    const { relationship, participant } = await aRelationship(james, 'Emily Johnson')

    await texting(participant, 'SWAP')

    const { rows: items } = await pool.query(
      `select kind, relationship_id, person_id, payload
         from follow_up_item where ministry_id = $1`,
      [ministry.id],
    )
    expect(items).toMatchObject([
      {
        kind: 'swap_requested',
        relationship_id: relationship,
        person_id: participant,
        payload: { requestedBy: 'participant' },
      },
    ])
  })

  it('puts a Participant’s PAUSE in front of an Admin instead of pausing anything', async () => {
    const { ministry, texting, congregant, aRelationship } = await aMinistry('Keyword Passed On')
    const james = await congregant('James Harden')
    const { relationship, participant } = await aRelationship(james, 'Emily Johnson')

    await texting(participant, 'PAUSE')

    expect(await pauseOn(ministry, relationship)).toBeNull()
    const { rows: items } = await pool.query(
      `select kind, person_id, relationship_id, payload
         from follow_up_item where ministry_id = $1`,
      [ministry.id],
    )
    expect(items).toMatchObject([
      {
        kind: 'participant_keyword',
        person_id: participant,
        relationship_id: null,
        payload: { keyword: 'PAUSE' },
      },
    ])
  })

  it('resumes a relationship whose Participant has opted out, writing only to the Leader', async () => {
    // Opting out ends no relationship, so the Participant is still an open member.
    // A Resume Message composed for them is refused by the outbound queue, and the
    // refusal would take the Leader's resume down with it.
    const { ministry, texting, congregant, aRelationship } = await aMinistry('Keyword Resume Stop')
    const james = await congregant('James Harden')
    const { relationship, participant } = await aRelationship(james, 'Emily Johnson')

    await texting(james, 'PAUSE')
    await texting(james, 'YES', new Date(at.getTime() + hours(1)))
    await texting(participant, 'STOP', new Date(at.getTime() + hours(2)))

    const before = (await sentTo(participant)).length
    await texting(james, 'RESUME', new Date(at.getTime() + hours(3)))

    // The resume happened, and nothing further reached the Participant.
    expect(await pauseOn(ministry, relationship)).toBeNull()
    expect((await sentTo(james)).at(-1)).toContain('has been resumed')
    expect(await sentTo(participant)).toHaveLength(before)
  })

  it('answers nothing at all to somebody who never consented to be texted', async () => {
    // Reachable by phone number alone, and unreachable by message. Every reply
    // Discipler might compose is refused at the outbound floor, and the refusal would
    // abort the command -- so their text would fail outright and be retried forever.
    const { ministry, texting } = await aMinistry('Keyword No Consent')
    // Imported onto the Roster and never through Intake, so no SMS consent stands.
    const stranger = personId(
      await addPerson(ministry, 'Otis Bramble', { phone: aNumber(), intake: false }),
    )

    await expect(texting(stranger, 'HELP')).resolves.toBeTruthy()
    expect(await sentTo(stranger)).toEqual([])
  })

  it('restores messaging on START, and resumes nothing', async () => {
    const { ministry, texting, congregant, aRelationship } = await aMinistry('Keyword Start')
    const james = await congregant('James Harden')
    const { relationship } = await aRelationship(james, 'Emily Johnson')

    await texting(james, 'PAUSE')
    await texting(james, 'YES', new Date(at.getTime() + hours(1)))
    await texting(james, 'STOP', new Date(at.getTime() + hours(2)))

    const stillOut = async () => {
      const { rows } = await pool.query(
        `select 1 from person_opt_out where person_id = $1 and ended_at is null`,
        [james],
      )
      return rows.length === 1
    }
    expect(await stillOut()).toBe(true)

    await texting(james, 'START', new Date(at.getTime() + hours(3)))

    expect(await stillOut()).toBe(false)
    // The pause it never touched is still standing.
    expect(await pauseOn(ministry, relationship)).not.toBeNull()
  })
})
