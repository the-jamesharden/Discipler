import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AvailabilitySlot } from '~/domain/intake'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'
import { offersToMentor } from '../support/pair-popup'

/**
 * Other on the Intake goal (Pastor feedback 2026-10, ticket 06), driven the way a
 * congregant and then an Admin meet it: the last option on the wizard's goal
 * question with its box, the refusal of Other left empty, the words offered back on
 * a reopened form, the person page that shows them, the Roster row that does not,
 * and the Suggested Pairs reason that quotes them.
 */
describe.skipIf(skipUnlessAppIsRunning)('Other on the Intake goal, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Other Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  const ANSWERED = {
    side: 'mentee',
    ageBand: '25-34',
    gender: 'female',
    experience: 'first_time',
    oneToTwo: 'open_to_one_to_two',
  }

  const lastStep = async () => {
    const query = new URLSearchParams({ step: '6', ...ANSWERED })
    query.append('availability', 'monday:12')
    const response = await fetch(`${baseUrl}/intake/${ministry.id}/discipleship?${query}`, {
      redirect: 'manual',
    })
    return response.text()
  }

  const submit = async (fields: Record<string, string>) => {
    const body = new URLSearchParams({
      ...ANSWERED,
      via: 'link',
      smsConsent: 'yes',
      contactSharing: 'granted',
      ...fields,
    })
    body.append('availability', 'monday:12')
    const response = await fetch(`${baseUrl}/intake/${ministry.id}/discipleship/submit`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  const personNamed = async (fullName: string): Promise<string> => {
    const { rows } = await pool.query(
      `select id from person where ministry_id = $1 and full_name = $2`,
      [ministry.id, fullName],
    )
    return rows[0].id as string
  }

  /** The text as the page carries it, whichever way the renderer escaped the quotes. */
  const quoted = (text: string) => new RegExp(text.replace(/"/g, '(?:"|&quot;)'))

  it('ends the goal question with Other, after every one of the Ministry’s options, and a box for it', async () => {
    const html = await lastStep()
    const { rows } = await pool.query<{ id: string }>(
      `select id from discipleship_goal where ministry_id = $1 order by position`,
      [ministry.id],
    )

    const radios = [...html.matchAll(/name="goalId" value="([^"]+)"/g)].map((match) => match[1])
    expect(radios).toEqual([...rows.map((row) => row.id), 'other'])
    expect(html).toContain('>Other</label>')
    expect(html).toContain('name="goalOther"')
    expect(html).toContain('In a few words, what are you hoping for?')
  })

  it('refuses Other with the box empty, back on the last step with the reason, and writes nothing', async () => {
    const { response, location } = await submit({
      fullName: 'Lena Moss',
      phone: '555 812 0601',
      goalId: 'other',
      goalOther: '  ',
    })

    expect(response.status).toBe(303)
    // The one problem, and nothing else: the rest of the form was answered.
    expect(new URL(location).searchParams.get('refused')).toBe('intake.goal_other_missing')
    expect(location).toContain('step=6')

    const html = await fetch(new URL(location, baseUrl), { redirect: 'manual' }).then((page) => page.text())
    expect(html).toContain('You chose Other. Please write in a few words what you are hoping for.')

    const { rows } = await pool.query(
      `select count(*)::int as n from person where ministry_id = $1 and full_name = 'Lena Moss'`,
      [ministry.id],
    )
    expect(rows[0].n).toBe(0)
  })

  it('records Other with the words typed, and offers them back on a reopened form', async () => {
    const { location } = await submit({
      fullName: 'Maya Ortiz',
      phone: '555 812 0602',
      goalId: 'other',
      goalOther: 'Grief',
    })
    expect(location).toContain('/discipleship/done')

    const person = await personNamed('Maya Ortiz')
    const token = crypto.randomUUID()
    await pool.query(
      `insert into intake_link (ministry_id, person_id, token, created_at, expires_at)
       values ($1, $2, $3, now(), now() + interval '14 days')`,
      [ministry.id, person, token],
    )

    const html = await fetch(`${baseUrl}/intake/reopen/${token}`, { redirect: 'manual' }).then((page) =>
      page.text(),
    )
    expect(html).toMatch(/<input[^>]*value="other"[^>]*checked=""|<input[^>]*checked=""[^>]*value="other"/)
    expect(html).toMatch(/<input[^>]*name="goalOther"[^>]*value="Grief"/)
  })

  it('shows the words on the person page and never on the Roster row', async () => {
    const person = await personNamed('Maya Ortiz')

    const page = await getPage(`/roster/${person}`, cookie)
    expect(page.response.status).toBe(200)
    expect(page.html).toContain('Hoping for')
    expect(page.html).toMatch(quoted('Other: "Grief"'))

    const roster = await getPage('/roster', cookie)
    expect(roster.response.status).toBe(200)
    expect(roster.html).toContain('Maya Ortiz')
    expect(roster.html).not.toContain('Grief')
  })

  it('tells the Admin editing the goals that Other follows them, and offers no control over it', async () => {
    const { response, html } = await getPage('/intake-forms', cookie)
    expect(response.status).toBe(200)
    // Said of the mentor and mentee form alone since ticket 11: the groups form never asks it.
    expect(html).toContain('After them comes <em>Other</em>, always, with a box for')
    // Not one of the options: nothing on the card renames, moves or removes it.
    expect(html).not.toMatch(/value="other"/)
  })

  it('quotes two equal texts in the Suggested Pairs reason', async () => {
    const FOUR: AvailabilitySlot[] = [
      { day: 'tuesday', hour: '18' },
      { day: 'tuesday', hour: '19' },
      { day: 'friday', hour: '18' },
      { day: 'friday', hour: '19' },
    ]
    const other = await createMinistryWithAdmin('Other Suggestion Chapel')
    const grace = await addPerson(other, 'Grace Lee', { answers: { availability: FOUR, goalOther: 'Grief' } })
    await offersToMentor(pool, other, grace)
    await addPerson(other, 'Ana Ruiz', { answers: { availability: FOUR, goalOther: 'grief' } })

    const { response, html } = await getPage('/suggested-pairs', (await signIn(other)).cookie)
    expect(response.status).toBe(200)
    expect(html).toMatch(quoted('Four shared time slots. You both wrote "grief".'))
  })
})
