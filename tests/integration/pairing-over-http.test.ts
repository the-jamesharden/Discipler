import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The three pairing routes as an Admin drives them: press Pair on a Roster row, or
 * choose several people together, and get back a relationship that has started
 * nothing. Driven over HTTP because the ticket's remaining work *is* the surface --
 * the command underneath it has been done and tested since ticket 19's migration,
 * and no unit test can say whether an Admin can actually reach it.
 *
 * The suggestion route is the same POST with the same body; what it needs is a
 * suggestion to accept, which is ticket 04's.
 */

describe.skipIf(skipUnlessAppIsRunning)('an Admin pairing from the Roster', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  const pair = (leaderId: string, participantIds: string[]) =>
    pairLed([leaderId], participantIds)

  /**
   * `mixed` unless a test says otherwise, because a group has to declare what it is
   * and these tests are about the surface rather than about the declaration. A
   * one-to-one is asked nothing, so sending it is harmless there: the absolute match
   * between two people holds whatever is on the column.
   */
  const pairLed = async (
    leaderIds: string[],
    participantIds: string[],
    declaredGender: 'male' | 'female' | 'mixed' | null = 'mixed',
  ) => {
    const body = new URLSearchParams()
    for (const id of leaderIds) body.append('leaderId', id)
    for (const id of participantIds) body.append('participantId', id)
    if (declaredGender !== null) body.append('declaredGender', declaredGender)

    const response = await fetch(`${baseUrl}/roster/pair/create`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  const woman = (name: string) =>
    addPerson(ministry, name, { answers: { gender: 'female' } })

  const man = (name: string) => addPerson(ministry, name, { answers: { gender: 'male' } })

  it('offers a Pair action on the row of somebody waiting to be paired', async () => {
    const nora = await woman('Nora Blake')
    const { html } = await getPage('/roster', cookie)

    expect(html).toContain('Nora Blake')
    expect(html).toContain(`/roster/pair?with=${nora}`)
  })

  it('opens the pairing screen with that Person already chosen', async () => {
    const olivia = await woman('Olivia Cross')
    await woman('Paula Dunn')

    const { response, html } = await getPage(`/roster/pair?with=${olivia}`, cookie)

    expect(response.status).toBe(200)
    expect(html).toContain('Olivia Cross')
    expect(html).toContain('Paula Dunn')
    // Said on the form itself: an Admin who expects a text to go out and sees nothing
    // happen will create the relationship a second time.
    expect(html).toContain('does not start it')
  })

  it('pairs two people, and says the relationship is waiting on its leader', async () => {
    const rachel = await woman('Rachel Ellis')
    const sarah = await woman('Sarah Frost')

    const { response, location } = await pair(rachel, [sarah])

    expect(response.status).toBe(303)
    expect(location).toContain('/roster?paired=1')

    const { rows } = await pool.query(
      `select r.accepted_at, count(*) as members
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = any($1)
        group by r.id, r.accepted_at`,
      [[rachel, sarah]],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].accepted_at).toBeNull()
    expect(Number(rows[0].members)).toBe(2)

    // Nothing reaches a Participant before their Leader has agreed to lead them.
    // The Leader is invited here, which is the thing they are waiting for.
    const { rows: queued } = await pool.query(
      `select person_id from outbound_message where person_id = any($1)`,
      [[rachel, sarah]],
    )
    expect(queued.map((row) => row.person_id)).toEqual([rachel])

    // Said on the row now, derived from `relationship.accepted_at`, rather than
    // asserted by the banner the pairing redirects to. The banner describes what
    // just happened and stops being evidence of anything the moment the page is
    // reloaded; the row goes on saying it until the Leader actually agrees.
    const { html } = await getPage('/roster?paired=1', cookie)
    expect(html).toContain('Awaiting Leader Acceptance')
    expect(html).toContain('Its leader has been invited')
  })

  it('forms one relationship from several people selected together', async () => {
    const tara = await woman('Tara Gill')
    const una = await woman('Una Hart')
    const vera = await woman('Vera Iles')

    const { location } = await pair(tara, [una, vera])
    expect(location).toContain('/roster?paired=2')

    // One relationship holding three people, not two relationships. There is no
    // separate group entity and no group workflow -- this is the same POST.
    const { rows } = await pool.query(
      `select r.id, count(*) as members
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = any($1)
        group by r.id`,
      [[tara, una, vera]],
    )
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].members)).toBe(3)
  })

  it('shows everyone in a group on each of their Roster rows', async () => {
    const { html } = await getPage('/roster', cookie)

    // Tara leads Una and Vera. Una's row names both of the others, so group
    // membership is visible without opening a record.
    expect(html).toContain('Una Hart')
    expect(html).toMatch(/Tara Gill, Vera Iles|Vera Iles, Tara Gill/)
  })

  it('shows a refused pairing to the Admin rather than silently doing nothing', async () => {
    const leader = await man('Wes Jones')
    const participant = await woman('Xena Kerr')

    const { response, location } = await pair(leader, [participant])

    expect(response.status).toBe(303)
    expect(location).toContain('/roster/pair?error=relationship.gender_must_match')

    const { html } = await getPage(
      '/roster/pair?error=relationship.gender_must_match',
      cookie,
    )
    // The alert an Admin reads is the wording, looked up from the code. The code
    // itself survives in the framework's serialised props, which nobody reads, so
    // the assertion is scoped to what is actually rendered.
    const alert = html.match(/role="alert"[^>]*>([^<]*)</)?.[1] ?? ''
    expect(alert).toMatch(/same gender/i)
    expect(alert).not.toContain('gender_must_match')

    const { rows } = await pool.query(
      `select 1 from relationship_member where person_id = any($1)`,
      [[leader, participant]],
    )
    expect(rows).toEqual([])
  })

  it('hands a refused selection back intact, so one mistake costs one correction', async () => {
    const leader = await man('Aaron Vale')
    const first = await man('Brett Wynn')
    const second = await woman('Cora Xu')

    // A leader already leading a group, so the refusal is one a *group* can hit: the
    // mismatched gender this test used to rely on is no longer refused here.
    await pair(leader, [await man('Existing One'), await woman('Existing Two')])

    const { location } = await pair(leader, [first, second])
    expect(location).toContain('error=relationship.leader_already_leads_a_group')

    // The whole selection comes back, not just the error.
    expect(location).toContain(`leaderId=${leader}`)
    expect(location).toContain(`with=${first}`)
    expect(location).toContain(`with=${second}`)

    const { html } = await getPage(location.replace(/^[^?]*/, '/roster/pair'), cookie)

    // Checked and selected again, so the Admin corrects the one choice that was wrong.
    const checkedFor = (id: string) =>
      new RegExp(`value="${id}"[^>]*checked`).test(html) ||
      new RegExp(`checked[^>]*value="${id}"`).test(html)

    expect(checkedFor(first)).toBe(true)
    expect(checkedFor(second)).toBe(true)
    expect(checkedFor(leader)).toBe(true)
  })

  it('creates a mixed-gender group, and refuses the same two people as a one-to-one', async () => {
    // The pair of them in one test, because the rule is the difference between them
    // and a suite that asserted each alone would still pass if the kind were ignored.
    const man1 = await man('Dev Ahmed')
    const woman1 = await woman('Elena Brandt')
    const third = await woman('Farrah Cole')

    const asGroup = await pairLed([man1], [woman1, third])
    expect(asGroup.location).toContain('/roster?')

    const { location } = await pair(await man('Gus Deering'), [await woman('Hana Ellis')])
    expect(location).toContain('error=relationship.gender_must_match')
  })

  it('creates a group led by two people', async () => {
    const first = await woman('Isla Fenn')
    const second = await man('Jed Garrow')
    const participant = await woman('Kai Hollis')

    const { location } = await pairLed([first, second], [participant])
    expect(location).toContain('/roster?')

    const { rows } = await pool.query(
      `select count(*)::int as leaders from relationship_member
        where person_id = any($1) and role = 'leader' and ended_at is null`,
      [[first, second]],
    )
    expect(rows[0].leaders).toBe(2)
  })

  it('refuses a pairing with nobody leading, and says which thing to fix', async () => {
    // The leader field is a checkbox set now, which cannot say "at least one of
    // these", so an empty selection reaches the domain and comes back as a refusal.
    const { location } = await pairLed([], [await woman('Lena Ives')])
    expect(location).toContain('error=relationship.needs_a_leader')

    const { html } = await getPage(
      `/roster/pair?${new URLSearchParams({ error: 'relationship.needs_a_leader' })}`,
      cookie,
    )
    expect(html).toMatch(/who will lead/i)
  })

  it('offers a way into pairing that does not start from one Person', async () => {
    // Somebody already being discipled has no Pair action and may still lead, and
    // several people selected together start from nobody in particular.
    const { html } = await getPage('/roster', cookie)
    expect(html).toContain('href="/roster/pair"')
    expect(html).toContain('Form a relationship')
  })

  it('refuses a pairing with nobody to disciple, and says which thing to fix', async () => {
    const yara = await woman('Yara Lowe')

    const { location } = await pair(yara, [])
    expect(location).toContain('error=relationship.needs_a_participant')

    const { html } = await getPage(`/roster/pair?${new URLSearchParams({
      error: 'relationship.needs_a_participant',
    })}`, cookie)
    expect(html).toMatch(/at least one person/i)
  })

  it('offers no Pair action to somebody who has not completed Intake', async () => {
    const zach = await addPerson(ministry, 'Zach Moore', { intake: false })
    const { html } = await getPage('/roster', cookie)

    expect(html).toContain('Zach Moore')
    expect(html).not.toContain(`/roster/pair?with=${zach}`)
  })

  it('turns a signed-out pairing away without creating anything', async () => {
    const response = await fetch(`${baseUrl}/roster/pair/create`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ leaderId: crypto.randomUUID() }),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/roster')
  })

  it('asks what kind of group this is, with nothing answered for the Admin', async () => {
    const { html } = await getPage('/roster/pair', cookie)

    expect(html).toContain('what kind of group is it')
    // Three answers and no default. A preselected radio would answer a safeguarding
    // question on the Admin's behalf, which is the whole of what "ask outright" rules
    // out -- so no `declaredGender` input arrives checked.
    for (const value of ['male', 'female', 'mixed']) {
      expect(
        new RegExp(`name="declaredGender"[^>]*value="${value}"`).test(html),
        value,
      ).toBe(true)
    }
    expect(html).not.toMatch(/name="declaredGender"[^>]*checked/)
    expect(html).not.toMatch(/checked[^>]*name="declaredGender"/)
  })

  it('refuses a group nobody declared, rather than guessing at one', async () => {
    const first = await woman('Maeve Ionescu')
    const second = await woman('Nell Jarvis')
    const third = await woman('Orla Kean')

    const { location } = await pairLed([first], [second, third], null)
    expect(location).toContain('error=relationship.needs_a_gender_declaration')

    const { html } = await getPage(location.replace(/^[^?]*/, '/roster/pair'), cookie)
    const alert = html.match(/role="alert"[^>]*>([^<]*)</)?.[1] ?? ''
    expect(alert).toMatch(/men|women/i)
    expect(alert).not.toContain('needs_a_gender_declaration')

    const { rows } = await pool.query(
      `select 1 from relationship_member where person_id = any($1)`,
      [[first, second, third]],
    )
    expect(rows).toEqual([])
  })

  it('pairs two people with nothing declared, because a one-to-one is asked nothing', async () => {
    const leader = await woman('Prue Larkin')
    const participant = await woman('Quila Mbeki')

    const { location } = await pairLed([leader], [participant], null)
    expect(location).toContain('/roster?paired=1')
  })

  it('refuses a declared group that crosses its own declaration, and hands the answer back', async () => {
    const leader = await man('Rafe Nunn')
    const first = await man('Silas Ojo')
    const outsider = await woman('Tamsin Pace')

    const { response, location } = await pairLed([leader], [first, outsider], 'male')

    expect(response.status).toBe(303)
    expect(location).toContain('error=relationship.gender_does_not_match_the_declaration')
    // The declaration comes back with the selection, so the Admin corrects the one
    // person who was wrong rather than restating what the group is.
    expect(location).toContain('declaredGender=male')

    const { html } = await getPage(location.replace(/^[^?]*/, '/roster/pair'), cookie)
    const alert = html.match(/role="alert"[^>]*>([^<]*)</)?.[1] ?? ''
    expect(alert).toMatch(/declared/i)
    expect(alert).not.toContain('gender_does_not_match')
    expect(
      /name="declaredGender"[^>]*value="male"[^>]*checked/.test(html) ||
        /value="male"[^>]*checked[^>]*name="declaredGender"/.test(html) ||
        /name="declaredGender"[^>]*checked[^>]*value="male"/.test(html),
    ).toBe(true)

    const { rows } = await pool.query(
      `select 1 from relationship_member where person_id = any($1)`,
      [[leader, first, outsider]],
    )
    expect(rows).toEqual([])
  })

  it('forms a women’s group, and records what it was declared to be', async () => {
    const leader = await woman('Ursula Quist')
    const first = await woman('Vi Rahman')
    const second = await woman('Wilma Sato')

    const { location } = await pairLed([leader], [first, second], 'female')
    expect(location).toContain('/roster?paired=2')

    const { rows } = await pool.query(
      `select distinct r.declared_gender
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = any($1)`,
      [[leader, first, second]],
    )
    expect(rows).toEqual([{ declared_gender: 'female' }])
  })
})
