import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Group form exits, ticket 02, driven the way a congregant does it: answer the
 * group form's first two screens, find "I meant to sign up for mentorship" under
 * step three's actions, follow it, and finish the discipleship wizard it opens
 * with the age band, gender and availability already answered. Over HTTP against
 * the running app, because the switch is a link between two public pages and
 * *nothing is written by following it* is a claim about the round trip.
 *
 * Every screen is moved on the way a browser moves it: the fields the page drew,
 * hidden and checked, sent to the form's own action, with only what the visitor
 * picks on that screen added.
 */

interface Input {
  readonly name: string
  readonly value: string
  readonly type: string | null
  readonly checked: boolean
}

/** Every input on a page, whichever order its attributes are drawn in. */
const inputsOf = (html: string): Input[] =>
  [...html.matchAll(/<input\b[^>]*>/g)].flatMap(([tag]) => {
    const attribute = (name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null
    const name = attribute('name')
    const value = attribute('value')
    if (name === null || value === null) return []
    return [{ name, value: value.replace(/&amp;/g, '&'), type: attribute('type'), checked: /\bchecked=""/.test(tag) }]
  })

/** The radios and checkboxes a page draws already checked. */
const checkedOn = (html: string): [string, string][] =>
  inputsOf(html)
    .filter((input) => (input.type === 'radio' || input.type === 'checkbox') && input.checked)
    .map((input) => [input.name, input.value])

/** The fields a browser would send from a page's one form: hidden, and whatever is checked. */
const fieldsOf = (html: string): [string, string][] => [
  ...inputsOf(html)
    .filter((input) => input.type === 'hidden')
    .map((input): [string, string] => [input.name, input.value]),
  ...checkedOn(html),
]

/** Where a page's form of this method goes, whichever order its attributes are drawn in. */
const actionOf = (html: string, method: 'get' | 'post'): string | null => {
  const form = [...html.matchAll(/<form\b[^>]*>/g)].map(([tag]) => tag).find((tag) => tag.includes(`method="${method}"`))
  return form?.match(/\baction="([^"]+)"/)?.[1] ?? null
}

/** The address the switch's link points at, as a browser would follow it. */
const switchIn = (html: string): string | null => {
  const note = html.match(/<p class="card-note">Looking for one-to-one discipleship instead\? <a href="([^"]+)">I meant to sign up for mentorship<\/a><\/p>/)
  return note ? note[1]!.replace(/&amp;/g, '&') : null
}

describe.skipIf(skipUnlessAppIsRunning)('I meant to sign up for mentorship, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let numbered = 0

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Grace Fellowship')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
    await formGroup(ministry, {
      name: `Saturday breakfast ${++numbered}`,
      declaredGender: null,
      leader: { name: `Leader ${++numbered}`, phone: aTestPhoneNumber(), gender: 'male' },
      disciples: [{ name: `Disciple ${++numbered}`, phone: aTestPhoneNumber(), gender: 'male' }],
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  const open = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
    return { response, html: await response.text() }
  }

  /** Continue on a wizard screen: the page's own GET form, with what this screen picks. */
  const continueFrom = async (path: string, html: string, picked: [string, string][] = []) => {
    const action = actionOf(html, 'get')
    if (!action) throw new Error(`No step form on ${path}`)
    const query = new URLSearchParams([
      ...fieldsOf(html).filter(([name]) => !picked.some(([chosen]) => chosen === name)),
      ...picked,
    ])
    const next = `${action}?${query}`
    return { path: next, ...(await open(next)) }
  }

  /** What has been written for this Ministry: people, submissions and history. */
  const written = async () => {
    const { rows } = await pool.query<{ people: number; submissions: number; events: number }>(
      `select (select count(*)::int from person where ministry_id = $1) as people,
              (select count(*)::int from intake_submission where ministry_id = $1) as submissions,
              (select count(*)::int from ministry_event where ministry_id = $1) as events`,
      [ministry.id],
    )
    return rows[0]!
  }

  const groupForm = () => `/intake/${ministry.id}`
  let stepThree: { path: string; html: string }

  it('draws the line under step three’s actions, and on no other screen of either form', async () => {
    const one = await open(groupForm())
    expect(switchIn(one.html)).toBeNull()
    const two = await continueFrom(groupForm(), one.html, [['ageBand', '25-34'], ['gender', 'male']])
    expect(two.html).toContain('name="availability"')
    expect(switchIn(two.html)).toBeNull()
    stepThree = await continueFrom(two.path, two.html, [['availability', 'tuesday:18'], ['availability', 'thursday:18']])
    expect(stepThree.html).toContain('name="groupId"')

    expect(switchIn(stepThree.html)).not.toBeNull()
    // Drawn once. (The words are in the page's flight data too, which is not drawn.)
    expect(stepThree.html.match(/>I meant to sign up for mentorship<\/a>/g)).toHaveLength(1)
    // Under the actions, outside the form: following it submits nothing.
    expect(stepThree.html).toMatch(/<div class="form-actions">.*?<\/div><\/form><p class="card-note">Looking for/s)

    const four = await continueFrom(stepThree.path, stepThree.html, [['groupId', 'none']])
    expect(four.html).toContain('name="fullName"')
    expect(switchIn(four.html)).toBeNull()
    expect(four.html).not.toContain('I meant to sign up for mentorship')
  })

  it('links to the discipleship wizard with the answers already given, built as its own query', async () => {
    const link = new URL(switchIn(stepThree.html)!, baseUrl)
    expect(link.pathname).toBe(`/intake/${ministry.id}/discipleship`)
    expect([...link.searchParams]).toEqual([
      ['step', '1'],
      ['v', '0'],
      ['ageBand', '25-34'],
      ['gender', 'male'],
      ['availability', 'tuesday:18'],
      ['availability', 'thursday:18'],
    ])
  })

  it('carries how they reached the form, as every step does', async () => {
    const one = await open(`${groupForm()}?via=qr`)
    const two = await continueFrom(groupForm(), one.html, [['ageBand', '25-34'], ['gender', 'male']])
    const three = await continueFrom(two.path, two.html, [['availability', 'tuesday:18']])
    expect(new URL(switchIn(three.html)!, baseUrl).searchParams.get('via')).toBe('qr')
  })

  it('opens on the mentor-or-mentee question, writes nothing, and adds no way back', async () => {
    const before = await written()
    const landed = await open(switchIn(stepThree.html)!)
    expect(landed.response.status).toBe(200)
    expect(landed.html).toContain('I’m joining as')
    expect(landed.html).toContain('value="mentor"')
    expect(landed.html).toContain('Step 1 of 5')
    expect(fieldsOf(landed.html)).toEqual(
      expect.arrayContaining([
        ['ageBand', '25-34'],
        ['gender', 'male'],
        ['availability', 'tuesday:18'],
        ['availability', 'thursday:18'],
      ]),
    )
    expect(landed.html).not.toContain('I meant to sign up for mentorship')
    expect(landed.html).not.toContain(`href="/intake/${ministry.id}?`)
    expect(await written()).toEqual(before)
  })

  it('shows the carried answers filled, moves past them on Continue, and finishes as the side they declared', async () => {
    const landed = { path: switchIn(stepThree.html)!, ...(await open(switchIn(stepThree.html)!)) }

    const ageAndGender = await continueFrom(landed.path, landed.html, [['side', 'mentor']])
    expect(ageAndGender.html).toContain('Step 2 of 5')
    expect(checkedOn(ageAndGender.html)).toEqual([['ageBand', '25-34'], ['gender', 'male']])

    const firstTime = await continueFrom(ageAndGender.path, ageAndGender.html)
    expect(firstTime.html).toContain('Step 3 of 5')
    expect(firstTime.html).toContain('Have you mentored someone before?')
    // Back from here is the age and gender screen with them still filled.
    const back = firstTime.html.match(/<a class="btn sec" href="([^"]+)">Back<\/a>/)?.[1]?.replace(/&amp;/g, '&')
    const again = await open(back!)
    expect(checkedOn(again.html)).toEqual([['ageBand', '25-34'], ['gender', 'male']])

    const availability = await continueFrom(firstTime.path, firstTime.html, [['experience', 'first_time']])
    expect(availability.html).toContain('Step 4 of 5')
    expect(checkedOn(availability.html)).toEqual([['availability', 'tuesday:18'], ['availability', 'thursday:18']])

    const last = await continueFrom(availability.path, availability.html)
    expect(last.html).toContain('Step 5 of 5')
    expect(last.html).toContain('name="fullName"')

    const { rows: goals } = await pool.query<{ id: string }>(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    const fullName = `Jonah Fields ${++numbered}`
    const action = actionOf(last.html, 'post')
    const response = await fetch(`${baseUrl}${action}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams([
        ...fieldsOf(last.html).filter(([name]) => name !== 'contactSharing'),
        ['goalId', goals[0]!.id],
        ['fullName', fullName],
        ['phone', aTestPhoneNumber()],
        ['smsConsent', 'yes'],
        ['contactSharing', 'granted'],
      ]),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/discipleship/done')
    expect(response.headers.get('location')).toContain('side=mentor')

    const { rows } = await pool.query<{ id: string; path: string; side: string }>(
      `select p.id, c.intake_path as path, c.declared_side as side
         from person p join consent_record c on c.person_id = p.id
        where p.ministry_id = $1 and p.full_name = $2`,
      [ministry.id, fullName],
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row).toMatchObject({ path: 'discipleship', side: 'mentor' })

    const roster = await getPage(`/roster/${rows[0]!.id}`, cookie)
    expect(roster.html).toContain(fullName)
    expect(roster.html).toContain('Offered to mentor')

    const { rows: slots } = await pool.query<{ slot: string }>(
      `select a.day || ':' || a.hour as slot from intake_availability a
         join intake_submission i on i.id = a.intake_submission_id
        where i.person_id = $1
        order by a.day, a.hour`,
      [rows[0]!.id],
    )
    expect(slots.map((row) => row.slot)).toEqual(['tuesday:18', 'thursday:18'])
  })

  it('carries nothing the mentor and mentee form no longer asks, so its submission is not refused', async () => {
    const removed = await fetch(`${baseUrl}/intake-forms/form/remove-question`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ form: 'discipleship', key: 'ageBand', pageId: 'about-you' }),
    })
    expect(removed.headers.get('location')).toContain('formSaved=removed%3Aabout-you')

    const one = await open(groupForm())
    const two = await continueFrom(groupForm(), one.html, [['ageBand', '35-44'], ['gender', 'female']])
    const three = await continueFrom(two.path, two.html, [['availability', 'monday:12']])
    const link = new URL(switchIn(three.html)!, baseUrl)
    expect(link.searchParams.has('ageBand')).toBe(false)
    expect(link.searchParams.get('gender')).toBe('female')
    expect(link.searchParams.get('v')).toBe('1')
  })
})
