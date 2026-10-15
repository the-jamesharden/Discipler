import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { createMinistryWithAdmin, localSupabase, pairOneToOne, type MinistryFixture } from '../support/local-supabase'

/**
 * Custom questions (Pastor feedback 2026-10, ticket 12), driven the way an Admin
 * and then a newcomer meet them: *Add a question* at the foot of each page box,
 * the new question worded in place and live on save, the wizard asking it with the
 * control for its kind and refusing a required one left empty, the answers on the
 * person page and the pair card and never on the Roster row, and the reopened
 * page with them filled in.
 */

/** Text as a reader sees it: tags and React's comment markers gone, entities read. */
const clean = (text: string) =>
  text
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()

/** The card's own markup, short of the scripts after it, which carry the whole page's data again. */
const cardIn = (html: string): string => {
  const start = html.indexOf('data-testid="pair-card"')
  if (start < 0) return ''
  const end = html.indexOf('<script', start)
  return html.slice(start, end < 0 ? undefined : end)
}

/** A page's markup without the scripts that carry its data again. */
const markupOf = (html: string): string => html.replace(/<script[\s\S]*?<\/script>/g, '')

/** Every form control of one name, each as its attributes, whatever order React wrote them in. */
const controls = (html: string, name: string): Record<string, string>[] =>
  [...html.matchAll(/<(input|textarea)\b([^>]*)>/g)]
    .map((match): Record<string, string> => ({
      tag: match[1]!,
      ...Object.fromEntries([...match[2]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((pair) => [pair[1]!, pair[2]!])),
    }))
    .filter((control) => control.name === name)

describe.skipIf(skipUnlessAppIsRunning)('custom questions, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  const keys: Record<string, string> = {}

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Own Questions Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  const post = async (path: string, body: URLSearchParams, withCookie = true) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { ...(withCookie ? { cookie } : {}), 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  const params = (entries: Record<string, string | readonly string[]>) => {
    const body = new URLSearchParams()
    for (const [key, value] of Object.entries(entries)) for (const each of [value].flat()) body.append(key, each)
    return body
  }

  const addQuestion = (fields: Record<string, string>) =>
    post('/intake-forms/form/add-question', params({ form: 'discipleship', hint: '', ...fields }))

  /** The latest stored version's own questions, by wording. */
  const ownQuestions = async () => {
    const { rows } = await pool.query<{ definition: { pages: { questions: Record<string, unknown>[] }[] } }>(
      `select definition from intake_form_version
        where ministry_id = $1 and form = 'discipleship' order by version desc limit 1`,
      [ministry.id],
    )
    return (rows[0]?.definition.pages ?? [])
      .flatMap((page) => page.questions)
      .filter((question) => String(question.key).startsWith('custom:')) as {
      key: string
      wording: string
      choices: { id: string; wording: string }[]
    }[]
  }

  it('ends every page box with Add a question, offering text only on the last page', async () => {
    const { html } = await getPage('/intake-forms', cookie)
    const adds = [...html.matchAll(/<div class="fe-add">([\s\S]*?)<\/div>/g)].map((match) =>
      [...(match[1] ?? '').matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((link) => link[1]),
    )
    expect(adds).toHaveLength(6)
    for (const page of adds.slice(0, 5)) expect(page).toEqual(['One choice', 'Several choices', 'Yes / no'])
    expect(adds[5]).toEqual(['Short text', 'Long text', 'One choice', 'Several choices', 'Yes / no'])
    expect(html).toContain('Short and long text are asked on the last page.')
  })

  it('opens a new question in place to be worded, with its choices for a choice kind', async () => {
    const { html } = await getPage('/intake-forms?form=discipleship&adding=several_choices&addTo=last', cookie)
    const row = html.slice(html.indexOf('id="new-question"'))
    expect(row).toContain('action="/intake-forms/form/add-question"')
    expect(clean(row)).toContain('Your question')
    expect(row).toContain('name="choices"')
    expect(clean(row)).toContain('Choices, one to a line')
  })

  it('adds each kind live, marked Your question, and refuses one choice with nothing to choose from', async () => {
    const refused = await addQuestion({ pageId: 'last', kind: 'one_choice', wording: 'Which service?', choices: 'Only one' })
    expect(new URL(refused.location).searchParams.get('formError')).toBe('intake_form.needs_two_choices')
    // Back open, with what was typed put back.
    const back = await getPage(new URL(refused.location).pathname + new URL(refused.location).search, cookie)
    expect(back.html).toContain('A choice question needs at least two choices.')
    expect(back.html).toMatch(/<textarea[^>]*id="fe-new-wording"[^>]*>Which service\?<\/textarea>/)

    const member = await addQuestion({ pageId: 'about-you', kind: 'yes_no', wording: 'Are you a member here?', required: 'yes' })
    expect(member.location).toMatch(/formSaved=custom%3A/)
    await addQuestion({ pageId: 'last', kind: 'one_choice', wording: 'Which service?', choices: '9am\n11am', required: 'yes' })
    await addQuestion({ pageId: 'last', kind: 'several_choices', wording: 'Where could you help?', choices: 'Music\nKids\nWelcome' })
    await addQuestion({ pageId: 'last', kind: 'short_text', wording: 'Your church before this one?' })
    await addQuestion({ pageId: 'last', kind: 'long_text', wording: 'Anything else you would like us to know?' })

    for (const question of await ownQuestions()) keys[question.wording] = question.key
    expect(Object.keys(keys)).toEqual([
      'Are you a member here?',
      'Which service?',
      'Where could you help?',
      'Your church before this one?',
      'Anything else you would like us to know?',
    ])

    const { html } = await getPage('/intake-forms', cookie)
    const row = html.slice(html.indexOf(`data-key="${keys['Anything else you would like us to know?']}"`))
    expect(clean(row.slice(0, row.indexOf('</li>')))).toMatch(/Your question\s*Long text\s*Optional/)
  })

  it('edits a choice in place, keeping the choice its answers point at', async () => {
    const [service] = (await ownQuestions()).filter((question) => question.wording === 'Which service?')
    const { location } = await post(
      '/intake-forms/form/question',
      params({
        form: 'discipleship',
        key: service!.key,
        wording: 'Which service?',
        hint: '',
        required: 'yes',
        [`choice:${service!.choices[0]!.id}`]: '9:00',
        [`choice:${service!.choices[1]!.id}`]: '11am',
        moreChoices: 'Evening',
      }),
    )
    expect(location).toContain(`formSaved=${encodeURIComponent(service!.key)}`)
    const [after] = (await ownQuestions()).filter((question) => question.wording === 'Which service?')
    expect(after!.choices.map((choice) => choice.wording)).toEqual(['9:00', '11am', 'Evening'])
    expect(after!.choices[0]!.id).toBe(service!.choices[0]!.id)
  })

  const ANSWERED = {
    side: 'mentee',
    ageBand: '25-34',
    gender: 'female',
    experience: 'first_time',
    oneToTwo: 'open_to_one_to_two',
  }

  it('asks each with the control for its kind, carrying a choice between screens', async () => {
    const member = keys['Are you a member here?']!
    const second = await fetch(`${baseUrl}/intake/${ministry.id}/discipleship?${params({ step: '2', side: 'mentee' })}`, {
      redirect: 'manual',
    }).then((page) => page.text())
    expect(controls(second, member).map((control) => [control.type, control.value, 'required' in control])).toEqual([
      ['radio', 'yes', true],
      ['radio', 'no', true],
    ])
    expect(clean(second)).toContain('Are you a member here?')

    const last = await fetch(
      `${baseUrl}/intake/${ministry.id}/discipleship?${params({ step: '6', ...ANSWERED, [member]: 'yes', availability: 'monday:12' })}`,
      { redirect: 'manual' },
    ).then((page) => page.text())
    // Carried from page 2 as a hidden input, as the built-in answers are.
    expect(controls(last, member)).toEqual([{ tag: 'input', type: 'hidden', name: member, value: 'yes' }])
    const service = controls(last, keys['Which service?']!)
    expect(service.map((control) => [control.type, 'required' in control])).toEqual([
      ['radio', true],
      ['radio', true],
      ['radio', true],
    ])
    // Ticks cannot say *at least one of these*, so several choices carries no `required`.
    expect(controls(last, keys['Where could you help?']!).map((control) => control.type)).toEqual([
      'checkbox',
      'checkbox',
      'checkbox',
    ])
    expect(controls(last, keys['Your church before this one?']!)).toEqual([
      expect.objectContaining({ tag: 'input', type: 'text', maxLength: '200' }),
    ])
    expect(controls(last, keys['Anything else you would like us to know?']!)).toEqual([
      expect.objectContaining({ tag: 'textarea', maxLength: '4000' }),
    ])
    expect(clean(last)).toContain('Anything else you would like us to know? (optional)')
  })

  const submit = async (fields: Record<string, string | readonly string[]>) => {
    const { response, location } = await post(
      `/intake/${ministry.id}/discipleship/submit`,
      params({
        ...ANSWERED,
        via: 'link',
        smsConsent: 'yes',
        contactSharing: 'granted',
        availability: 'monday:12',
        goalId: 'other',
        goalOther: 'Prayer',
        ...fields,
      }),
      false,
    )
    return { response, location }
  }

  it('refuses a required one left empty, back on the last step with the reason, and writes nothing', async () => {
    const { location } = await submit({
      fullName: 'Lena Moss',
      phone: '555 812 0701',
      [keys['Are you a member here?']!]: 'yes',
    })
    expect(new URL(location).searchParams.get('refused')).toBe('intake.question_unanswered')
    const html = await fetch(new URL(location, baseUrl), { redirect: 'manual' }).then((page) => page.text())
    expect(html).toContain('Please answer every question that is not marked optional.')
    const { rows } = await pool.query(`select 1 from person where ministry_id = $1 and full_name = 'Lena Moss'`, [ministry.id])
    expect(rows).toHaveLength(0)
  })

  let ana: string
  let ben: string

  it('records the answers, and shows them on the person page and never on the Roster row', async () => {
    const [service] = (await ownQuestions()).filter((question) => question.wording === 'Which service?')
    const [help] = (await ownQuestions()).filter((question) => question.wording === 'Where could you help?')
    const { location } = await submit({
      fullName: 'Ana Ortiz',
      phone: '555 812 0702',
      [keys['Are you a member here?']!]: 'yes',
      [keys['Which service?']!]: service!.choices[2]!.id,
      [keys['Where could you help?']!]: [help!.choices[2]!.id, help!.choices[0]!.id],
      [keys['Your church before this one?']!]: 'Grace Fellowship',
      [keys['Anything else you would like us to know?']!]: 'Pray for my mum.\nShe is unwell.',
    })
    expect(location).toContain('/discipleship/done')
    ana = (await pool.query(`select id from person where ministry_id = $1 and full_name = 'Ana Ortiz'`, [ministry.id]))
      .rows[0].id

    const person = clean(markupOf((await getPage(`/roster/${ana}`, cookie)).html))
    expect(person).toContain('Are you a member here?Yes')
    expect(person).toContain('Which service?Evening')
    expect(person).toContain('Where could you help?Music, Welcome')
    expect(person).toContain('Your church before this one?Grace Fellowship')
    expect(person).toContain('Anything else you would like us to know?Pray for my mum.\nShe is unwell.')

    const roster = markupOf((await getPage('/roster', cookie)).html)
    expect(roster).toContain('Ana Ortiz')
    expect(roster).not.toContain('Grace Fellowship')
    expect(roster).not.toContain('Are you a member here?')
  })

  it('shows them on the pair card, under the person they belong to', async () => {
    const { location } = await submit({
      fullName: 'Ben Cole',
      phone: '555 812 0703',
      side: 'mentor',
      [keys['Are you a member here?']!]: 'no',
      [keys['Which service?']!]: (await ownQuestions()).find((question) => question.wording === 'Which service?')!.choices[0]!.id,
    })
    expect(location).toContain('/discipleship/done')
    ben = (await pool.query(`select id from person where ministry_id = $1 and full_name = 'Ben Cole'`, [ministry.id]))
      .rows[0].id
    const relationship = await pairOneToOne(ministry, ben, ana)

    const card = cardIn((await getPage(`/overview?card=${relationship}`, cookie)).html)
    const people = card.split('class="pc-person"').slice(1).map(clean)
    const benSide = people.find((side) => side.includes('Ben Cole'))!
    const anaSide = people.find((side) => side.includes('Ana Ortiz'))!
    expect(benSide).toContain('Are you a member here?No')
    expect(benSide).toContain('Which service?9:00')
    expect(benSide).not.toContain('Grace Fellowship')
    expect(anaSide).toContain('Your church before this one?Grace Fellowship')
    expect(anaSide).toContain('Where could you help?Music, Welcome')
  })

  it('fills them in on the reopened page', async () => {
    const token = crypto.randomUUID()
    await pool.query(
      `insert into intake_link (ministry_id, person_id, token, created_at, expires_at)
       values ($1, $2, $3, now(), now() + interval '14 days')`,
      [ministry.id, ana, token],
    )
    const html = await fetch(`${baseUrl}/intake/reopen/${token}`, { redirect: 'manual' }).then((page) => page.text())
    const member = keys['Are you a member here?']!
    expect(controls(html, member).filter((control) => 'checked' in control).map((control) => control.value)).toEqual(['yes'])
    expect(controls(html, keys['Your church before this one?']!)[0]!.value).toBe('Grace Fellowship')
    expect(html).toMatch(/>Pray for my mum.\nShe is unwell.<\/textarea>/)

    // Sent again with the long answer shortened, it is the answer on the person page.
    const body = new URLSearchParams()
    for (const question of ['Are you a member here?', 'Which service?', 'Where could you help?']) {
      for (const control of controls(html, keys[question]!)) {
        if ('checked' in control) body.append(control.name!, control.value!)
      }
    }
    body.append(keys['Your church before this one?']!, 'Grace Fellowship')
    body.append(keys['Anything else you would like us to know?']!, 'Pray for my mum.')
    for (const [key, value] of Object.entries({
      via: 'link',
      v: /name="v" value="(\d+)"/.exec(html)![1]!,
      fullName: 'Ana Ortiz',
      phone: '555 812 0702',
      ageBand: '25-34',
      gender: 'female',
      availability: 'monday:12',
      goalId: 'other',
      goalOther: 'Prayer',
      smsConsent: 'yes',
      contactSharing: 'granted',
    })) {
      body.append(key, value)
    }
    const { location } = await post(`/intake/reopen/${token}/submit`, body, false)
    expect(location).toContain(`/intake/reopen/${token}/done`)
    const person = clean(markupOf((await getPage(`/roster/${ana}`, cookie)).html))
    expect(person).toContain('Which service?Evening')
    expect(person).toContain('Anything else you would like us to know?Pray for my mum.')
    expect(person).not.toContain('She is unwell.')
  })
})
