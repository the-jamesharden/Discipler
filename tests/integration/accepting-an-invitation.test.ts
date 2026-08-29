import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { InvitationRefused } from '~/domain/errors'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'
import { createCommandService } from '~/service/command-service'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The whole of activation, against the real database: the link a Leader is texted
 * on pairing, the acceptance that spends it, and the Starter Message that only
 * then reaches anybody.
 */

describe('accepting an Invitation Link', () => {
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

  // Unique across runs, not merely within one: acceptance creates an auth
  // account against the number, and the database keeps it after the suite ends.
  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`
  const roster = async (fullName: string) =>
    personId(await addPerson(ministry, fullName, { phone: aNumber() }))

  const pair = (leaderIds: PersonId[], participantIds: PersonId[]) =>
    service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds,
      participantIds,
    })

  const tokenFor = async (person: PersonId) => {
    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and consumed_at is null`,
      [person],
    )
    const token = rows[0]?.token
    if (!token) throw new Error('no live invitation was issued')
    return invitationToken(token)
  }

  /** A real auth account, because `person.user_id` is a foreign key onto one. */
  const anAccount = async () => {
    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      email: `leader-${crypto.randomUUID()}@example.test`,
      password: 'a-long-enough-password',
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    return data.user.id
  }

  const messagesTo = async (person: PersonId) => {
    const { rows } = await pool.query<{ body: string; discloses_person_id: string | null }>(
      `select body, discloses_person_id from outbound_message
        where person_id = $1 order by enqueued_at`,
      [person],
    )
    return rows
  }

  it('texts each Leader a link on creation, and consumes it only on acceptance', async () => {
    const david = await roster('David Accept')
    const emily = await roster('Emily Accept')
    await pair([david], [emily])

    const token = await tokenFor(david)
    const invited = await messagesTo(david)

    // Resolving does not consume: the link survives being opened and abandoned.
    expect(invited[0]?.body).toContain(`https://discipler.test/invitation/${token}`)
    expect(invited[0]?.discloses_person_id).toBeNull()

    await service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token,
      fullName: 'Dave Accept',
      userId: await anAccount(),
    })

    const { rows } = await pool.query<{ consumed_at: Date | null }>(
      `select consumed_at from invitation where token = $1`,
      [token],
    )
    expect(rows[0]?.consumed_at).toEqual(at)
  })

  it('activates the relationship, links the account, and stores the name as given', async () => {
    const david = await roster('David Named')
    const emily = await roster('Emily Named')
    const { effects } = await pair([david], [emily])
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

    const userId = await anAccount()
    await service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token: await tokenFor(david),
      fullName: 'Dave Named',
      userId,
    })

    const { rows } = await pool.query(
      `select r.accepted_at,
              m.accepted_at as member_accepted_at,
              p.full_name,
              p.user_id,
              mm.tier
         from relationship r
         join relationship_member m
           on m.relationship_id = r.id and m.person_id = $2
         join person p on p.id = m.person_id
         join ministry_member mm on mm.user_id = p.user_id and mm.ministry_id = r.ministry_id
        where r.id = $1`,
      [created.relationship.id, david],
    )

    expect(rows[0]).toMatchObject({
      accepted_at: at,
      member_accepted_at: at,
      // A spelling difference from Intake is not an error and raises nothing.
      full_name: 'Dave Named',
      user_id: userId,
      tier: 'leader',
    })
  })

  it('releases the Starter Message to everyone, and no number to the Leader', async () => {
    const david = await roster('David Starter')
    const emily = await roster('Emily Starter')
    await pair([david], [emily])

    await service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token: await tokenFor(david),
      fullName: 'David Starter',
      userId: await anAccount(),
    })

    const toLeader = await messagesTo(david)
    const toParticipant = await messagesTo(emily)

    // Two to the Leader: the invitation, then the Starter Message. Neither offers
    // to disclose anybody -- no message to a Leader contains a phone number.
    expect(toLeader).toHaveLength(2)
    expect(toLeader.every((row) => row.discloses_person_id === null)).toBe(true)
    expect(toLeader[1]?.body).toContain('Emily Starter')

    // One to the Participant, their first word of any of it, offering to disclose
    // the Leader -- and resolved at send time against contact-sharing consent.
    expect(toParticipant).toHaveLength(1)
    expect(toParticipant[0]?.discloses_person_id).toBe(david)
  })

  it('holds a group closed until every Leader has agreed', async () => {
    const david = await roster('David Group')
    const sarah = await roster('Sarah Group')
    const emily = await roster('Emily Group')
    const { effects } = await pair([david, sarah], [emily])
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

    const activated = async () => {
      const { rows } = await pool.query<{ accepted_at: Date | null }>(
        `select accepted_at from relationship where id = $1`,
        [created.relationship.id],
      )
      return rows[0]?.accepted_at
    }

    await service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token: await tokenFor(david),
      fullName: 'David Group',
      userId: await anAccount(),
    })

    // Nobody co-leads something they did not agree to, and nothing reaches the
    // Participant while one Leader is still to answer.
    expect(await activated()).toBeNull()
    expect(await messagesTo(emily)).toHaveLength(0)

    await service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token: await tokenFor(sarah),
      fullName: 'Sarah Group',
      userId: await anAccount(),
    })

    expect(await activated()).toEqual(at)
    expect(await messagesTo(emily)).toHaveLength(2)
  })

  it('activates once when two co-leaders accept at the same moment', async () => {
    const david = await roster('David Races')
    const sarah = await roster('Sarah Races')
    const emily = await roster('Emily Races')
    const { effects } = await pair([david, sarah], [emily])
    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('nothing was created')

    const tokens = [await tokenFor(david), await tokenFor(sarah)]
    const accounts = [await anAccount(), await anAccount()]

    /**
     * Both transactions are held open until both have begun, so the overlap is
     * the one the lock exists for rather than whichever interleaving the event
     * loop happened to produce. Without the lock both then read the other's
     * `accepted_at` as still null under READ COMMITTED, both decide they are not
     * the last to agree, and the relationship stays Awaiting Leader Acceptance
     * with both tokens spent and no way back.
     */
    const bothInside = (() => {
      let arrived = 0
      let open = () => {}
      const gate = new Promise<void>((resolve) => {
        open = resolve
      })
      return async () => {
        if (++arrived === 2) open()
        await gate
      }
    })()

    const racing = createCommandService({
      clock,
      ids,
      appBaseUrl: 'https://discipler.test',
      store: {
        transact: (forMinistry, work) =>
          store.transact(forMinistry, async (unit) => {
            await bothInside()
            return work(unit)
          }),
      },
    })

    await Promise.all(
      tokens.map((token, index) =>
        racing.execute({
          type: 'relationship.accept',
          ministryId: ministry.id,
          token,
          fullName: 'Racing Leader',
          userId: accounts[index] as string,
        }),
      ),
    )

    const { rows } = await pool.query<{ accepted_at: Date | null }>(
      `select accepted_at from relationship where id = $1`,
      [created.relationship.id],
    )
    expect(rows[0]?.accepted_at).toEqual(at)

    // And exactly one Starter Message per Leader, not two rounds of them.
    expect(await messagesTo(emily)).toHaveLength(2)
  })

  it('refuses a token that account creation has already spent', async () => {
    const david = await roster('David Twice')
    const emily = await roster('Emily Twice')
    await pair([david], [emily])
    const token = await tokenFor(david)

    await service().execute({
      type: 'relationship.accept',
      ministryId: ministry.id,
      token,
      fullName: 'David Twice',
      userId: await anAccount(),
    })

    await expect(
      service().execute({
        type: 'relationship.accept',
        ministryId: ministry.id,
        token,
        fullName: 'David Twice',
        userId: await anAccount(),
      }),
    ).rejects.toThrow(new InvitationRefused('invitation.already_used'))
  })

  it('refuses a token nothing answers to', async () => {
    await expect(
      service().execute({
        type: 'relationship.accept',
        ministryId: ministry.id,
        token: invitationToken('nothing-answers-to-this'),
        fullName: 'Nobody',
        userId: await anAccount(),
      }),
    ).rejects.toThrow(new InvitationRefused('invitation.not_found'))
  })
})

describe('the two things a token raises instead of changing', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-03-02T09:00:00Z')
  const service = () =>
    createCommandService({
      clock: createTestClock(at),
      ids: { next: () => crypto.randomUUID() },
      store,
      appBaseUrl: 'https://discipler.test',
    })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Northside Fellowship')
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

  const tokenFor = async (person: PersonId) => {
    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and consumed_at is null`,
      [person],
    )
    return invitationToken(rows[0]?.token ?? '')
  }

  const openItems = async () => {
    const { rows } = await pool.query<{ kind: string; person_id: string }>(
      `select kind, person_id from follow_up_item
        where ministry_id = $1 and resolved_at is null`,
      [ministry.id],
    )
    return rows
  }

  it('lets the command role enrol a Leader and refuses it anything wider', async () => {
    // Acceptance is the only act in Discipler that creates a `ministry_member`
    // row without an Admin, so the privilege it was given is checked here rather
    // than trusted to the one call site that uses it.
    const asCommand = async (sql: string, params: unknown[]) => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [
          ministry.id,
        ])
        await client.query(sql, params)
        return null
      } catch (error) {
        return (error as Error).message
      } finally {
        await client.query('rollback')
        client.release()
      }
    }

    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      email: `tier-${crypto.randomUUID()}@example.test`,
      password: 'a-long-enough-password',
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    const userId = data.user.id

    // A Leader, in the Ministry it declared: permitted.
    expect(
      await asCommand(
        `insert into ministry_member (ministry_id, user_id, tier) values ($1, $2, 'leader')`,
        [ministry.id, userId],
      ),
    ).toBeNull()

    // An Admin: refused. The tier is written into the policy, not into the caller.
    expect(
      await asCommand(
        `insert into ministry_member (ministry_id, user_id, tier) values ($1, $2, 'admin')`,
        [ministry.id, userId],
      ),
    ).toMatch(/row-level security/i)

    // And no way to promote somebody who is already enrolled.
    expect(
      await asCommand(`update ministry_member set tier = 'admin' where ministry_id = $1`, [
        ministry.id,
      ]),
    ).toMatch(/permission denied/i)
  })

  it('raises one item however many times the Leader taps "not my number"', async () => {
    const david = await roster('David Disputes')
    const emily = await roster('Emily Disputes')
    const { rows: before } = await pool.query<{ phone: string }>(
      `select phone from person where id = $1`,
      [david],
    )
    await service().execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds: [david],
      participantIds: [emily],
    })

    const token = await tokenFor(david)
    const dispute = () =>
      service().execute({ type: 'invitation.dispute_number', ministryId: ministry.id, token })

    await dispute()
    await dispute()
    await dispute()

    expect(await openItems()).toEqual([
      { kind: 'invitation_number_disputed', person_id: david },
    ])

    // It changes nothing else: the number stands, and the link is not spent.
    const { rows } = await pool.query<{ phone: string; consumed_at: Date | null }>(
      `select p.phone, i.consumed_at from person p
         join invitation i on i.person_id = p.id
        where p.id = $1`,
      [david],
    )
    expect(rows[0]?.phone).toBe(before[0]?.phone)
    expect(rows[0]?.consumed_at).toBeNull()
  })
})
