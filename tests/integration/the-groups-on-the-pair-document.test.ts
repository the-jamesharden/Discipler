import type { SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { systemClock } from '~/domain/clock'
import { personId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createSupabaseRosterReader, rosterPageFrom } from '~/platform/supabase/roster-reader'
import { createCommandService } from '~/service/command-service'
import {
  addMembership,
  addPerson,
  addPersonWithAccount,
  adminAsPerson,
  createMinistryWithAdmin,
  localSupabase,
  openMaterialHistory,
  pairOneToOne,
  pauseRelationship,
  serviceRoleClient,
  signInAs,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Manual pairing, ticket 08. The groups an Admin could put somebody into, on the
 * document the Pair screen already reads: every open relationship with two or
 * more Disciples, whatever it was formed as, and nothing about anybody else's
 * Ministry. Nothing on any screen changes.
 */

/**
 * The reader's client is the one a Next.js request would hand it, which a test
 * cannot supply. It is handed a real signed-in client instead, so the reader can
 * be driven whole and what it asks the database for can be counted.
 */
const session = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('~/platform/supabase/server-client', () => ({
  createSupabaseServerClient: async () => session.client,
}))

const asDocument = (data: unknown) => data as Record<string, unknown>
const asRows = (data: unknown) => data as Record<string, unknown>[]

type Gender = 'female' | 'male'

interface GroupFixture {
  readonly id: string
  readonly leader: string
  readonly disciples: readonly string[]
}

/**
 * A group as it stands after formation: one leader, its Disciples, and what was
 * said about it when it was formed. Written to the tables directly, as every
 * relationship fixture here is. The declaration is immutable after the insert, so
 * it cannot go through `createRelationship` and an update.
 */
const formGroup = async (
  ministry: MinistryFixture,
  label: string,
  options: {
    readonly name: string | null
    readonly declaredGender: Gender | null
    /** One per Disciple, which is also how many there are. */
    readonly disciples: readonly Gender[]
    readonly leaderGender?: Gender
    readonly accepted?: boolean
  },
): Promise<GroupFixture> => {
  const acceptedAt = options.accepted === false ? null : new Date()
  const { data, error } = await serviceRoleClient()
    .from('relationship')
    .insert({
      ministry_id: ministry.id,
      kind: 'group',
      name: options.name,
      declared_gender: options.declaredGender,
      accepted_at: acceptedAt?.toISOString() ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not form the group ${label}: ${error.message}`)
  if (acceptedAt) await openMaterialHistory(ministry, data.id, acceptedAt)

  // A leader of their own each time: `leader_one_open_group` lets nobody lead two.
  const leaderGender = options.leaderGender ?? options.declaredGender ?? 'female'
  const leader = await addPerson(ministry, `${label} Leader`, { answers: { gender: leaderGender } })
  await addMembership({ ministry, relationshipId: data.id, kind: 'group', personId: leader, role: 'leader' })

  const disciples: string[] = []
  for (const [index, gender] of options.disciples.entries()) {
    const disciple = await addPerson(ministry, `${label} Disciple ${index + 1}`, { answers: { gender } })
    await addMembership({ ministry, relationshipId: data.id, kind: 'group', personId: disciple, role: 'participant' })
    disciples.push(disciple)
  }

  return { id: data.id, leader, disciples }
}

describe('the groups on the Pair document', () => {
  let ministry: MinistryFixture
  let other: MinistryFixture
  let bystander: AccountFixture
  let pool: pg.Pool

  let running: GroupFixture
  let paused: GroupFixture
  let awaiting: GroupFixture
  let oneToTwo: GroupFixture
  let unnamed: GroupFixture
  let mixed: GroupFixture
  let ended: GroupFixture
  let cancelled: GroupFixture
  let downToOne: GroupFixture
  let oneToOne: string
  let theirs: GroupFixture

  // Nothing here is decided against a date, so the real clock: a pinned one beside
  // fixtures stamped with the real one is a date bomb.
  const clock = systemClock

  /** Through the one function that ends a relationship, so its memberships close with it. */
  const end = async (group: GroupFixture, expectsAccepted: boolean) => {
    const { rows } = await pool.query<{ refusal: string | null }>(
      `select app.end_relationship($1, now(), null, $2, 'discontinued', $3) as refusal`,
      [group.id, expectsAccepted ? 'They stopped meeting.' : 'cancelled', expectsAccepted],
    )
    if (rows[0]?.refusal) throw new Error(`Could not end the group: ${rows[0].refusal}`)
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Gathering Chapel')
    other = await createMinistryWithAdmin('The Chapel Across The Road')
    bystander = await addPersonWithAccount(ministry, 'Lena Leader', 'leader')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    running = await formGroup(ministry, 'Thursday', {
      name: 'Thursday Table',
      declaredGender: 'male',
      disciples: ['male', 'male', 'male'],
    })

    paused = await formGroup(ministry, 'Paused', {
      name: 'Paused Circle',
      declaredGender: 'female',
      disciples: ['female', 'female'],
    })
    await pauseRelationship(ministry, paused.id)

    awaiting = await formGroup(ministry, 'Awaiting', {
      name: 'Awaiting Its Leader',
      declaredGender: 'female',
      disciples: ['female', 'female'],
      accepted: false,
    })

    // A 1:2 pair is a group for every rule, and is listed like one.
    oneToTwo = await formGroup(ministry, 'Pair Of Two', {
      name: 'Claire’s Two',
      declaredGender: 'female',
      disciples: ['female', 'female'],
    })

    // Formed before groups had names, and never named since. Declares nothing.
    unnamed = await formGroup(ministry, 'Unnamed', {
      name: null,
      declaredGender: null,
      disciples: ['male', 'male'],
      leaderGender: 'male',
    })

    mixed = await formGroup(ministry, 'Mixed', {
      name: 'Mixed Company',
      declaredGender: null,
      disciples: ['female', 'male'],
    })

    ended = await formGroup(ministry, 'Ended', {
      name: 'Ended Last Spring',
      declaredGender: 'male',
      disciples: ['male', 'male', 'male'],
    })
    await end(ended, true)

    cancelled = await formGroup(ministry, 'Cancelled', {
      name: 'Never Started',
      declaredGender: 'male',
      disciples: ['male', 'male'],
      accepted: false,
    })
    await end(cancelled, false)

    // Formed as a group of two, and one of them has since left. Still a group by
    // `kind`, and one Disciple by count.
    downToOne = await formGroup(ministry, 'Dwindled', {
      name: 'Down To One',
      declaredGender: 'female',
      disciples: ['female'],
    })
    const left = await addPerson(ministry, 'Dwindled Departed', { answers: { gender: 'female' } })
    await addMembership({
      ministry,
      relationshipId: downToOne.id,
      kind: 'group',
      personId: left,
      role: 'participant',
      startedAt: new Date(Date.now() - 60_000),
      endedAt: new Date(),
    })

    const mentor = await addPerson(ministry, 'Solo Mentor', { answers: { gender: 'female' } })
    const mentee = await addPerson(ministry, 'Solo Mentee', { answers: { gender: 'female' } })
    oneToOne = await pairOneToOne(ministry, mentor, mentee)

    theirs = await formGroup(other, 'Across The Road', {
      name: 'Somebody Else’s Group',
      declaredGender: 'male',
      disciples: ['male', 'male'],
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  const pairDocument = async (of: MinistryFixture = ministry) =>
    asDocument((await (await signInAs(of)).rpc('pair_page')).data)

  const groupsOn = (doc: Record<string, unknown>) => asRows(doc.groups)
  const groupOn = (doc: Record<string, unknown>, group: GroupFixture) =>
    groupsOn(doc).find((row) => row.id === group.id)

  it('lists every open relationship with two or more Disciples, a 1:2 pair included', async () => {
    const ids = groupsOn(await pairDocument()).map((row) => row.id)

    // Exactly these, so nothing else the Ministry holds rides along.
    expect([...ids].sort()).toEqual([running, paused, awaiting, oneToTwo, unnamed, mixed].map((g) => g.id).sort())
    expect(ids).not.toContain(oneToOne)
  })

  it('lists a running group, a paused one and one still awaiting its leader', async () => {
    const doc = await pairDocument()

    // Each row of the document says so itself, and says nothing while it runs.
    expect(groupOn(doc, running)).toHaveProperty('state', null)
    expect(groupOn(doc, paused)).toHaveProperty('state', 'paused')
    expect(groupOn(doc, awaiting)).toHaveProperty('state', 'awaiting_leader_acceptance')

    // *Paused* is decided against the Pauses the same document carries for every
    // other surface, so a group row and the Overview cannot disagree.
    const pauses = asRows(asDocument(doc.history).pauses).map((row) => row.relationship_id)
    expect(pauses).toContain(paused.id)
    expect(pauses).not.toContain(running.id)
  })

  it('lists neither an ended group nor a cancelled one', async () => {
    const doc = await pairDocument()
    expect(groupOn(doc, ended)).toBeUndefined()
    expect(groupOn(doc, cancelled)).toBeUndefined()
  })

  it('carries each group’s id, name, leaders, count of Disciples, declaration and everybody in it', async () => {
    const doc = await pairDocument()

    expect(groupOn(doc, running)).toEqual({
      id: running.id,
      name: 'Thursday Table',
      declared_gender: 'male',
      state: null,
      disciple_count: 3,
      leaders: [{ id: running.leader, full_name: 'Thursday Leader' }],
      // Either role, by person id, so the popup can leave out a group somebody is
      // already in without a second read.
      member_ids: [running.leader, ...running.disciples].sort(),
    })

    expect(groupOn(doc, oneToTwo)).toMatchObject({ name: 'Claire’s Two', disciple_count: 2 })
  })

  it('says mixed as a declaration of nothing, distinct from a value and never left out', async () => {
    const doc = await pairDocument()

    expect(groupOn(doc, mixed)).toHaveProperty('declared_gender', null)
    expect(groupOn(doc, paused)).toHaveProperty('declared_gender', 'female')
    expect(groupOn(doc, running)).toHaveProperty('declared_gender', 'male')
  })

  it('carries no name for a group nobody has named, and guesses none', async () => {
    const doc = await pairDocument()
    expect(groupOn(doc, unnamed)).toHaveProperty('name', null)

    const page = rosterPageFrom(doc, clock, 'pair')
    expect(page.groups.find((group) => group.relationshipId === unnamed.id)?.name).toBeNull()
  })

  it('counts open participant memberships, never the kind the relationship was formed as', async () => {
    const doc = await pairDocument()

    // A group by `kind`, and down to one Disciple: not somewhere to put anybody.
    const { rows } = await pool.query<{ kind: string }>(`select kind from relationship where id = $1`, [
      downToOne.id,
    ])
    expect(rows[0]?.kind).toBe('group')
    expect(groupOn(doc, downToOne)).toBeUndefined()

    // And the count follows the memberships. Somebody leaves the group of three,
    // and it reads two; the leader is never counted among the Disciples.
    const counted = await formGroup(ministry, 'Counted', {
      name: 'Counted Twice',
      declaredGender: 'male',
      disciples: ['male', 'male', 'male'],
    })
    expect(groupOn(await pairDocument(), counted)?.disciple_count).toBe(3)

    await pool.query(
      `update relationship_member set ended_at = now() where relationship_id = $1 and person_id = $2`,
      [counted.id, counted.disciples[0]],
    )
    const after = groupOn(await pairDocument(), counted)
    expect(after?.disciple_count).toBe(2)
    expect(after?.member_ids).toEqual([counted.leader, counted.disciples[1], counted.disciples[2]].sort())

    await pool.query(
      `update relationship_member set ended_at = now() where relationship_id = $1 and person_id = $2`,
      [counted.id, counted.disciples[1]],
    )
    expect(groupOn(await pairDocument(), counted)).toBeUndefined()
  })

  it('reads the same order twice: by name, the unnamed last', async () => {
    const names = (doc: Record<string, unknown>) => groupsOn(doc).map((row) => row.name)
    const first = names(await pairDocument())

    expect(first).toEqual([...first.filter((name) => name !== null).sort(), null])
    expect(names(await pairDocument())).toEqual(first)
  })

  it('never shows one Ministry another’s groups', async () => {
    expect(groupOn(await pairDocument(), theirs)).toBeUndefined()

    const across = await pairDocument(other)
    expect(groupsOn(across).map((row) => row.id)).toEqual([theirs.id])
    expect(groupOn(across, theirs)).toMatchObject({
      leaders: [{ id: theirs.leader, full_name: 'Across The Road Leader' }],
      member_ids: [theirs.leader, ...theirs.disciples].sort(),
    })
  })

  it('reaches nobody but an Admin of the Ministry', async () => {
    // A Leader of the same Ministry is told they administer nothing, and handed
    // no groups; the rest of the document is withheld the same way.
    const doc = asDocument((await (await signInWith(bystander)).rpc('pair_page')).data)
    expect(doc.session).toBe('not-an-admin')
    expect(doc).not.toHaveProperty('groups')

    // The helper is not a second way in: nothing but a signed-in session may call
    // it, and it is an invoker, so that session's own policies choose the rows.
    const { rows } = await pool.query<{ role: string; may: boolean }>(`
      select r.role, has_function_privilege(r.role, 'app.pair_groups(uuid, jsonb)', 'execute') as may
        from unnest(array['authenticated', 'anon', 'service_role', 'public']) as r(role)
    `)
    expect(rows).toEqual([
      { role: 'authenticated', may: true },
      { role: 'anon', may: false },
      { role: 'service_role', may: false },
      { role: 'public', may: false },
    ])
    const { rows: definer } = await pool.query<{ prosecdef: boolean }>(
      `select prosecdef from pg_proc where oid = 'app.pair_groups(uuid, jsonb)'::regprocedure`,
    )
    expect(definer[0]?.prosecdef).toBe(false)
  })

  it('hands the helper’s caller no group their own session could not already see', async () => {
    // Called directly, as a signed-in session, with whichever Ministry it likes.
    const groupsFor = async (userId: string, target: MinistryFixture): Promise<unknown[]> => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role authenticated')
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: userId, role: 'authenticated' }),
        ])
        const { rows } = await client.query<{ groups: unknown[] }>(
          `select app.pair_groups($1, '[]'::jsonb) as groups`,
          [target.id],
        )
        return rows[0]!.groups
      } finally {
        await client.query('rollback')
        client.release()
      }
    }

    // A Leader who leads none of them, asking about their own Ministry and about
    // the one across the road; and an Admin asking about a Ministry that is not theirs.
    expect(await groupsFor(bystander.userId, ministry)).toEqual([])
    expect(await groupsFor(bystander.userId, other)).toEqual([])
    expect(await groupsFor(adminAsPerson(ministry).userId, other)).toEqual([])

    // The same call as the Admin of the Ministry it names is the list itself, so
    // the three empty answers above are the policies and not a helper that is broken.
    const own = (await groupsFor(adminAsPerson(ministry).userId, ministry)) as Record<string, unknown>[]
    expect(own.map((row) => row.id)).toContain(running.id)
  })

  it('leaves the Roster’s own document as it was', async () => {
    const admin = await signInAs(ministry)
    const roster = asDocument((await admin.rpc('roster_page')).data)
    const person = asDocument((await admin.rpc('person_page')).data)

    expect(roster).not.toHaveProperty('groups')
    expect(person).toEqual(roster)

    // The Pair document is the Roster's with its own keys beside it, and the
    // groups are one of those keys rather than a change to anything shared.
    const { suggest_gender_match: _setting, materials: _materials, groups: _groups, ...rest } = await pairDocument()
    expect(rest).toEqual(roster)

    for (const surface of ['roster', 'person'] as const) {
      const page = rosterPageFrom(asDocument((await admin.rpc(`${surface}_page`)).data), clock, surface)
      expect(page.groups, surface).toEqual([])
    }
  })

  it('derives every group from the one document, with its state when it is not running', async () => {
    // `rosterPageFrom` is handed a document and no client: whatever it says about
    // the groups came in the page's one read, and no request stands beside it.
    const page = rosterPageFrom(await pairDocument(), clock, 'pair')
    const derived = (group: GroupFixture) => page.groups.find((each) => each.relationshipId === group.id)

    expect(derived(running)).toEqual({
      relationshipId: running.id,
      name: 'Thursday Table',
      leaders: [{ personId: running.leader, fullName: 'Thursday Leader' }],
      discipleCount: 3,
      declaredGender: 'male',
      state: null,
      memberIds: [running.leader, ...running.disciples].sort(),
    })

    expect(derived(paused)?.state).toBe('paused')
    expect(derived(awaiting)?.state).toBe('awaiting_leader_acceptance')
    expect(derived(oneToTwo)?.state).toBeNull()
    expect(derived(mixed)?.declaredGender).toBeNull()
    expect(derived(paused)?.declaredGender).toBe('female')

    expect(derived(ended)).toBeUndefined()
    expect(derived(cancelled)).toBeUndefined()
    expect(derived(downToOne)).toBeUndefined()
  })

  it('lists a 1:2 pair formed the way an Admin forms one', async () => {
    // Through the command, so that it is the domain and not this fixture that
    // makes one leader and two Disciples a group with a name and a declaration.
    const store = createPostgresEffectStore(localSupabase().databaseUrl)
    const ids: IdSource = { next: () => crypto.randomUUID() }
    const service = createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })
    try {
      const claire = await addPerson(ministry, 'Claire Martinez', { answers: { gender: 'female' } })
      const first = await addPerson(ministry, 'Dana Whitlock', { answers: { gender: 'female' } })
      const second = await addPerson(ministry, 'Esther Yoon', { answers: { gender: 'female' } })

      await service.execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [personId(claire)],
        participantIds: [personId(first), personId(second)],
        name: 'Claire Martinez’s pair',
        declaredGender: 'female',
      })

      const formed = groupsOn(await pairDocument()).find((row) => row.name === 'Claire Martinez’s pair')
      expect(formed).toMatchObject({
        declared_gender: 'female',
        // Formed and not yet accepted: listed all the same.
        state: 'awaiting_leader_acceptance',
        disciple_count: 2,
        leaders: [{ id: claire, full_name: 'Claire Martinez' }],
        member_ids: [claire, first, second].sort(),
      })

      const { rows } = await pool.query<{ kind: string }>(`select kind from relationship where id = $1`, [
        formed?.id,
      ])
      expect(rows[0]?.kind).toBe('group')
    } finally {
      await store.close()
    }
  })

  it('goes on reading a group as paused after its Pause has run its weeks', async () => {
    // Expiry resumes nothing: a Pause stands until somebody resumes it, here as on
    // every other surface, and when it ran out is decided elsewhere against a clock.
    const lapsed = await formGroup(ministry, 'Lapsed', {
      name: 'Lapsed Pause',
      declaredGender: 'female',
      disciples: ['female', 'female'],
    })
    await pauseRelationship(ministry, lapsed.id, 1, new Date('2026-01-05T09:00:00Z'))

    const doc = await pairDocument()
    expect(groupOn(doc, lapsed)).toHaveProperty('state', 'paused')
    const page = rosterPageFrom(doc, clock, 'pair')
    expect(page.groups.find((group) => group.relationshipId === lapsed.id)?.state).toBe('paused')
  })

  it('carries every leader a group has, in the order the document gave them', async () => {
    // One open leader a relationship is all the database allows today
    // (`relationship_one_open_leader`), so a second cannot be seeded. The shape is
    // a list because the spec has decided a group can have several, and the reader
    // must not be what quietly keeps the first.
    const doc = await pairDocument()
    const [first, ...rest] = groupsOn(doc)
    const coLed = {
      ...first,
      leaders: [
        { id: running.leader, full_name: 'Thursday Leader' },
        { id: paused.leader, full_name: 'Paused Leader' },
      ],
    }

    const page = rosterPageFrom({ ...doc, groups: [coLed, ...rest] }, clock, 'pair')
    expect(page.groups[0]?.leaders).toEqual([
      { personId: running.leader, fullName: 'Thursday Leader' },
      { personId: paused.leader, fullName: 'Paused Leader' },
    ])
  })

  it('reads the Pair page, groups and all, in one request to the database', async () => {
    const calls: string[] = []
    const real = await signInAs(ministry)
    session.client = new Proxy(real, {
      get(target, key) {
        if (key === 'rpc') {
          return (name: string, ...rest: unknown[]) => {
            calls.push(`rpc ${name}`)
            return (target.rpc as (...args: unknown[]) => unknown)(name, ...rest)
          }
        }
        if (key === 'from') {
          return (table: string) => {
            calls.push(`from ${table}`)
            return target.from(table)
          }
        }
        const value = Reflect.get(target, key, target) as unknown
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
      },
    }) as SupabaseClient

    const answer = await createSupabaseRosterReader(clock).readRosterPage('pair')

    expect(answer.status).toBe('admin')
    if (answer.status !== 'admin') return
    expect(answer.page.groups.map((group) => group.relationshipId)).toContain(running.id)
    // The groups came in the page's own read, and nothing was asked beside it.
    expect(calls).toEqual(['rpc pair_page'])
  })

  it('reads a group that is both unaccepted and paused as awaiting its leader', async () => {
    // The order `deriveRelationshipState` settles the two in.
    const both = await formGroup(ministry, 'Both', {
      name: 'Waiting And Paused',
      declaredGender: 'female',
      disciples: ['female', 'female'],
      accepted: false,
    })
    await pauseRelationship(ministry, both.id)

    const doc = await pairDocument()
    expect(groupOn(doc, both)).toHaveProperty('state', 'awaiting_leader_acceptance')
    const page = rosterPageFrom(doc, clock, 'pair')
    expect(page.groups.find((group) => group.relationshipId === both.id)?.state).toBe(
      'awaiting_leader_acceptance',
    )
  })

  it('refuses a document whose groups are missing or say less than the popup needs', async () => {
    const doc = await pairDocument()

    // The Pair page's own document arriving without the key is the function and
    // the reader having drifted apart, and is not read as *no groups*.
    const { groups: _groups, ...without } = doc
    expect(() => rosterPageFrom(without, clock, 'pair')).toThrow(/groups/i)

    const [first, ...rest] = groupsOn(doc)
    const drifted = (row: Record<string, unknown>) => ({ ...doc, groups: [row, ...rest] })
    const lacking = (key: string) => {
      const { [key]: _dropped, ...row } = first!
      return drifted(row)
    }

    // A missing declaration must not read as mixed, nor a missing state as
    // running, nor a missing name as *nobody named it*.
    expect(() => rosterPageFrom(lacking('declared_gender'), clock, 'pair')).toThrow(/declared gender/i)
    expect(() => rosterPageFrom(lacking('state'), clock, 'pair')).toThrow(/state/i)
    expect(() => rosterPageFrom(drifted({ ...first, state: 'ended' }), clock, 'pair')).toThrow(/state/i)
    expect(() => rosterPageFrom(lacking('name'), clock, 'pair')).toThrow(/name/i)
    expect(() => rosterPageFrom(lacking('disciple_count'), clock, 'pair')).toThrow(/count of Disciples/i)
    expect(() => rosterPageFrom(lacking('member_ids'), clock, 'pair')).toThrow(/who is in it/i)
    expect(() => rosterPageFrom(lacking('leaders'), clock, 'pair')).toThrow(/leaders/i)

    expect(() => rosterPageFrom(drifted({ ...first, declared_gender: 'unknown' }), clock, 'pair')).toThrow(
      /declared gender/i,
    )
    expect(() => rosterPageFrom(drifted({ ...first, disciple_count: 1 }), clock, 'pair')).toThrow(
      /count of Disciples/i,
    )
    expect(() =>
      rosterPageFrom(drifted({ ...first, leaders: [{ id: running.leader }] }), clock, 'pair'),
    ).toThrow(/leader/i)
  })
})
