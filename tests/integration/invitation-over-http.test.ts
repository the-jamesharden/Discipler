import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import { baseUrl, signInAs, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  addPerson,
  completeIntake,
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

  // Numbers come from `local-supabase.ts` and nowhere else. Acceptance creates an
  // auth account against one, and the database keeps it after the suite ends, so a
  // number that only avoids collisions within a run is not enough.
  const roster = async (fullName: string) =>
    personId(await addPerson(ministry, fullName, { phone: aTestPhoneNumber() }))

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
      // Named, because a group is called something. Dropped by the boundary for a
      // one-to-one, so it costs a pair nothing.
      name: 'The Tuesday Group',
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

  it('lets a Leader who already has an account accept a second relationship', async () => {
    const david = await roster('David Leads Twice')
    const first = await roster('First Disciple')
    const second = await roster('Second Disciple')

    await pair([david], [first])
    const accepted = await post(`/invitation/${await tokenFor(david)}/accept`, {
      fullName: 'David Leads Twice',
      password: 'a-long-enough-password',
    })
    expect(accepted.location).toContain('done=accepted')

    // Leading many one-to-ones is deliberately uncapped, so this is the ordinary
    // second pairing and not an edge case.
    await pair([david], [second])
    const token = await tokenFor(david)

    // No password field: there is one account per Person, and asking them to
    // choose a second one would be asking for something that cannot be used.
    const { html } = await open(token)
    expect(html).toContain('Second Disciple')
    expect(html).not.toContain('name="password"')
    expect(html).toContain('the password you already set')

    const { location } = await post(`/invitation/${token}/accept`, {
      fullName: 'David Leads Twice',
    })
    expect(location).toContain('done=accepted')

    const { rows } = await pool.query(
      `select count(*)::int as activated from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = $1 and m.role = 'leader' and r.accepted_at is not null`,
      [david],
    )
    expect(rows[0].activated).toBe(2)
  })

  it('lets a Leader sign back in with the number the flow displayed', async () => {
    // The end of the arc ticket 06 started: acceptance sets a password against a
    // number it showed and never asked for, and this is the proof that the number
    // shown is the one the front door takes. Without it, a Leader could complete
    // acceptance and hold an account no form will let them reach.
    const david = await roster('David Returns')
    const emily = await roster('Emily Returns')
    await pair([david], [emily])
    const token = await tokenFor(david)

    const { rows: onFile } = await pool.query<{ phone: string }>(
      `select phone from person where id = $1`,
      [david],
    )

    const { html } = await open(token)
    const shown = html.match(/\+1\d{7,14}/)?.[0]
    // The number on the page is his, not merely the first number on the page.
    expect(shown).toBe(onFile[0]?.phone)

    await post(`/invitation/${token}/accept`, {
      fullName: 'David Returns',
      password: 'a-long-enough-password',
    })

    const { response } = await signInAs({
      phone: shown!,
      password: 'a-long-enough-password',
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).not.toContain('/login')
  })

  it('reuses an Admin’s account when they accept, rather than minting a second', async () => {
    /**
     * The invariant in `docs/adr/0009-one-account-per-human.md`, proved through the
     * flow rather than through a fixture. It holds because provisioning already
     * linked the Admin's login to their Person row, so acceptance finds `user_id`
     * set and creates nothing -- exactly the path a Leader accepting a second
     * relationship takes.
     */
    const admin = ministry.adminPersonId
    await completeIntake(ministry, admin)
    const disciple = await roster('Someone The Admin Leads')

    await pair([personId(admin)], [disciple])
    const token = await tokenFor(personId(admin))

    // No password field, for the same reason a returning Leader sees none: there
    // is one account per human and they already hold it.
    const { html } = await open(token)
    expect(html).not.toContain('name="password"')
    expect(html).toContain('the password you already set')

    const { location } = await post(`/invitation/${token}/accept`, {
      fullName: ministry.adminName,
    })
    expect(location).toContain('done=accepted')

    // One login, still theirs.
    const { rows: accounts } = await pool.query<{ count: number }>(
      `select count(*)::int as count from auth.users where phone = $1`,
      [ministry.adminPhone.replace('+', '')],
    )
    expect(accounts[0]?.count).toBe(1)

    const { rows: person } = await pool.query<{ user_id: string }>(
      `select user_id from person where id = $1`,
      [admin],
    )
    expect(person[0]?.user_id).toBe(ministry.adminUserId)

    // One membership, and it still says `admin`. The insert acceptance makes is
    // `on conflict (ministry_id, user_id) do nothing`, and it only misses when the
    // user_id is new -- which is what a second account would have made it.
    const { rows: membership } = await pool.query<{ tier: string }>(
      `select tier from ministry_member where ministry_id = $1 and user_id = $2`,
      [ministry.id, ministry.adminUserId],
    )
    expect(membership).toEqual([{ tier: 'admin' }])

    // And the password they were provisioned with is still the one that works, so
    // nothing quietly reset it on the way through.
    const { response } = await signInAs({
      phone: ministry.adminPhone,
      password: ministry.adminPassword,
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).not.toContain('/login')
  })

  it('does not tell a Leader they have an account because the URL said so', async () => {
    const david = await roster('David Forwarded')
    const emily = await roster('Emily Forwarded')
    await pair([david], [emily])

    // A forwarded or bookmarked URL carrying the parameter must not suppress the
    // form and claim an account that was never created.
    const response = await fetch(
      `${baseUrl}/invitation/${await tokenFor(david)}?done=accepted`,
      { redirect: 'manual' },
    )
    const html = await response.text()

    expect(html).not.toContain('You’re all set')
    expect(html).toContain('name="password"')
  })

  /**
   * Skipped, and deliberately not deleted. Only a Leader is ever sent a link --
   * `docs/adr/0011-only-a-leader-is-sent-a-link.md` -- so nothing mints the token
   * this asks for and the test cannot run. What it covers still exists: the
   * reader scopes a Participant's reveal to their Leaders and hides the other
   * Participants, and `app/invitation/[token]/page.tsx` still renders that branch.
   *
   * Whether that surface goes with the decline affordance is the open decision.
   * Deleting this test would take the only description of the branch with it, so
   * it waits here instead.
   */
  it.skip('shows a Participant their Leaders, never the other Participants', async () => {
    const david = await roster('David Group Lead')
    const emily = await roster('Emily Sees')
    const anna = await roster('Anna Hidden')
    await pair([david], [emily, anna])

    await post(`/invitation/${await tokenFor(david)}/accept`, {
      fullName: 'David Group Lead',
      password: 'a-long-enough-password',
    })

    const { html } = await open(await tokenFor(emily))

    // A Participant's membership grants them no sight of anyone, the other
    // Participants included -- the rule the policies state, on a page that reads
    // on the trusted connection and is not policed by them.
    expect(html).toContain('David Group Lead')
    expect(html).not.toContain('Anna Hidden')
  })

  it('tells a token nothing answers to apart from one that is real', async () => {
    const response = await fetch(`${baseUrl}/invitation/${crypto.randomUUID()}`, {
      redirect: 'manual',
    })

    expect(response.status).toBe(404)
  })
})
