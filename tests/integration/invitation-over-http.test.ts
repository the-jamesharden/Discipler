import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import { baseUrl, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The Invitation Link driven the way a Leader does it: open the text, look at who
 * they have been matched with, set a name and a password. Over HTTP against the
 * running app, because this surface is reached by somebody with no account and no
 * session at all, and no unit test can tell you whether they could get to it.
 */
describe.skipIf(skipUnlessAppIsRunning)('a Leader opening their Invitation Link', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

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

  const pair = async (leaderIds: PersonId[], participantIds: PersonId[]) => {
    const service = createCommandService({
      clock: createTestClock(new Date()),
      ids: { next: () => crypto.randomUUID() },
      store,
      appBaseUrl: baseUrl,
    })
    await service.execute({
      type: 'relationship.create',
      ministryId: ministry.id,
      leaderIds,
      participantIds,
    })
  }

  const tokenFor = async (person: PersonId) => {
    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and consumed_at is null`,
      [person],
    )
    if (!rows[0]) throw new Error('no live invitation was issued')
    return rows[0].token
  }

  const open = async (token: string) => {
    const response = await fetch(`${baseUrl}/invitation/${token}`, { redirect: 'manual' })
    return { response, html: await response.text() }
  }

  const post = async (path: string, body: Record<string, string> = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  it('reveals the match before it asks for anything, with no session', async () => {
    const david = await roster('David Opens')
    const emily = await roster('Emily Opens')
    await pair([david], [emily])

    const { response, html } = await open(await tokenFor(david))

    expect(response.status).toBe(200)
    // Who, and for which Ministry, above the form.
    expect(html).toContain('Emily Opens')
    expect(html).toContain('Riverside Chapel')
    expect(html).toContain('invitation, not an assignment')
    expect(html.indexOf('Emily Opens')).toBeLessThan(html.indexOf('name="password"'))
  })

  it('displays the number and refuses it as input', async () => {
    const david = await roster('David Displays')
    const emily = await roster('Emily Displays')
    await pair([david], [emily])

    const { rows } = await pool.query<{ phone: string }>(
      `select phone from person where id = $1`,
      [david],
    )
    const { html } = await open(await tokenFor(david))

    // Displayed, so a Leader cannot mistype their way out of their own check-ins.
    expect(html).toContain(rows[0]?.phone)
    // And nowhere to type one, so a forwarded link cannot re-point an account.
    expect(html).not.toContain('name="phone"')
    expect(html).toContain('name="fullName"')
  })

  it('survives being opened and abandoned: resolving does not consume', async () => {
    const david = await roster('David Abandons')
    const emily = await roster('Emily Abandons')
    await pair([david], [emily])
    const token = await tokenFor(david)

    await open(token)
    await open(token)
    const { response } = await open(token)

    expect(response.status).toBe(200)
    const { rows } = await pool.query(`select consumed_at from invitation where token = $1`, [
      token,
    ])
    expect(rows[0].consumed_at).toBeNull()
  })

  it('accepts on a name and a password, and consumes the link doing it', async () => {
    const david = await roster('David Accepts')
    const emily = await roster('Emily Accepts')
    await pair([david], [emily])
    const token = await tokenFor(david)

    const { response, location } = await post(`/invitation/${token}/accept`, {
      fullName: 'Dave Accepts',
      password: 'a-long-enough-password',
    })

    expect(response.status).toBe(303)
    expect(location).toContain('done=accepted')

    const { rows } = await pool.query(
      `select p.full_name, p.user_id, r.accepted_at, i.consumed_at
         from invitation i
         join person p on p.id = i.person_id
         join relationship r on r.id = i.relationship_id
        where i.token = $1`,
      [token],
    )

    expect(rows[0].full_name).toBe('Dave Accepts')
    expect(rows[0].user_id).not.toBeNull()
    expect(rows[0].accepted_at).not.toBeNull()
    expect(rows[0].consumed_at).not.toBeNull()
  })

  it('refuses a password too short to be worth having, and creates nothing', async () => {
    const david = await roster('David Shortpass')
    const emily = await roster('Emily Shortpass')
    await pair([david], [emily])
    const token = await tokenFor(david)

    const { location } = await post(`/invitation/${token}/accept`, {
      fullName: 'David Shortpass',
      password: 'short',
    })

    expect(location).toContain('error=account.password_too_short')

    const { rows } = await pool.query(
      `select consumed_at, (select user_id from person where id = $2) as user_id
         from invitation where token = $1`,
      [token, david],
    )
    expect(rows[0].consumed_at).toBeNull()
    expect(rows[0].user_id).toBeNull()
  })

  it('raises an item on "not my number" and changes nothing at all', async () => {
    const david = await roster('David Disputes')
    const emily = await roster('Emily Disputes')
    await pair([david], [emily])
    const token = await tokenFor(david)
    const { rows: before } = await pool.query<{ phone: string }>(
      `select phone from person where id = $1`,
      [david],
    )

    const { location } = await post(`/invitation/${token}/dispute`)
    expect(location).toContain('done=disputed')

    const { rows } = await pool.query(
      `select f.kind, i.consumed_at, p.phone
         from invitation i
         join person p on p.id = i.person_id
         join follow_up_item f
           on f.person_id = i.person_id and f.relationship_id = i.relationship_id
        where i.token = $1 and f.resolved_at is null`,
      [token],
    )

    expect(rows[0].kind).toBe('invitation_number_disputed')
    // The number stands and the link is not spent.
    expect(rows[0].phone).toBe(before[0]?.phone)
    expect(rows[0].consumed_at).toBeNull()
  })

  it('gives a Participant a link that declines rather than one that accepts', async () => {
    const david = await roster('David Declined')
    const emily = await roster('Emily Declined')
    await pair([david], [emily])

    await post(`/invitation/${await tokenFor(david)}/accept`, {
      fullName: 'David Declined',
      password: 'a-long-enough-password',
    })

    const token = await tokenFor(emily)
    const { html } = await open(token)

    // A Participant is told about the match, not asked to ratify it.
    expect(html).toContain('David Declined')
    expect(html).not.toContain('name="password"')
    expect(html).toContain('isn’t the right match')

    const { location } = await post(`/invitation/${token}/decline`)
    expect(location).toContain('done=declined')

    const { rows } = await pool.query(
      `select kind from follow_up_item where person_id = $1 and resolved_at is null`,
      [emily],
    )
    expect(rows[0].kind).toBe('match_declined')
  })

  it('tells a token nothing answers to apart from one that is real', async () => {
    const response = await fetch(`${baseUrl}/invitation/${crypto.randomUUID()}`, {
      redirect: 'manual',
    })

    expect(response.status).toBe(404)
  })
})
