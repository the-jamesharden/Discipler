import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The Intake form editor (Pastor feedback, ticket 11), driven the way an Admin and
 * then a newcomer meet it: the wizard of a Ministry that never edited, which must
 * be exactly today's form; the editor on Intake forms; a question reworded, made
 * optional and moved, each live at once; somebody part-way through finishing the
 * version they opened; a preview that records nothing; and a thank-you on the
 * page after Submit.
 */

/** What a screen of the wizard says, in the order it says it. */
const screenOf = (html: string) => {
  const all = (pattern: RegExp) => [...html.matchAll(pattern)].map((match) => clean(match[1] ?? ''))
  return {
    sub: all(/<p class="sub">([\s\S]*?)<\/p>/g)[0] ?? null,
    progress: all(/<div class="progress-labels"><strong>([\s\S]*?)<\/strong><span>([\s\S]*?)<\/span>/g)[0] ?? null,
    percent: [...html.matchAll(/<div class="progress-labels"><strong>[\s\S]*?<\/strong><span>([\s\S]*?)<\/span>/g)].map(
      (match) => match[1],
    )[0],
    legends: all(/<legend[^>]*>([\s\S]*?)<\/legend>/g),
    labels: all(/<label class="label" for="[^"]*">([\s\S]*?)<\/label>/g),
    hints: all(/<p class="subtle">([\s\S]*?)<\/p>/g),
  }
}

/** Text as a reader sees it: tags and React's comment markers gone, entities read. */
const clean = (text: string) =>
  text
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()

describe.skipIf(skipUnlessAppIsRunning)('the Intake form editor, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Editor Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
    // The groups form shows its questions only to somebody with a group to join.
    await formGroup(ministry, {
      name: 'Thursday Group',
      declaredGender: null,
      leader: { name: 'Lead Person', gender: 'female' },
      disciples: [],
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  const wizard = async (query: Record<string, string | string[]>, path = 'discipleship') => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      for (const each of [value].flat()) params.append(key, each)
    }
    const response = await fetch(`${baseUrl}/intake/${ministry.id}${path ? `/${path}` : ''}?${params}`, {
      redirect: 'manual',
    })
    return response.text()
  }

  const post = async (path: string, body: Record<string, string> | URLSearchParams, withCookie = true) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...(withCookie ? { cookie } : {}),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body instanceof URLSearchParams ? body : new URLSearchParams(body),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  const MENTEE = { side: 'mentee', ageBand: '25-34', gender: 'female', experience: 'first_time' }

  it('serves a Ministry that never edited exactly today’s mentor and mentee form', async () => {
    expect(screenOf(await wizard({}))).toEqual({
      sub: 'Welcome — let’s get you connected.',
      progress: 'Step 1 of 5',
      percent: '20%',
      legends: ['I’m joining as…'],
      labels: [],
      hints: [],
    })
    expect(screenOf(await wizard({ step: '2', side: 'mentee' }))).toEqual({
      sub: 'Tell us a little about yourself.',
      progress: 'Step 2 of 5',
      percent: '40%',
      legends: ['Age range', 'Gender'],
      labels: [],
      hints: [],
    })
    expect(screenOf(await wizard({ step: '3', side: 'mentee', ageBand: '25-34', gender: 'female' }))).toMatchObject({
      sub: 'A bit about your experience.',
      legends: ['Have you been discipled by a mentor before?'],
      hints: ['This helps us match you thoughtfully.'],
    })
    expect(screenOf(await wizard({ step: '3', side: 'mentor', ageBand: '25-34', gender: 'female' })).legends).toEqual([
      'Have you mentored someone before?',
    ])
    expect(screenOf(await wizard({ step: '4', ...MENTEE }))).toMatchObject({
      sub: 'When are you generally available to meet?',
      legends: ['When could you meet?'],
      hints: ['Select every hour that could work — not just your best one.'],
    })
    // The last step, which used to read 80%.
    expect(screenOf(await wizard({ step: '5', ...MENTEE, availability: 'monday:12' }))).toEqual({
      sub: 'Nearly there — how we reach you, and what you are hoping for.',
      progress: 'Step 5 of 5',
      percent: '100%',
      legends: ['What are you hoping for?', 'Agreements'],
      labels: ['In a few words, what are you hoping for?', 'Your name', 'Mobile number', 'Email (optional)'],
      hints: ['Choose the one that fits best.'],
    })
  })

  it('serves a Ministry that never edited exactly today’s groups form', async () => {
    expect(screenOf(await wizard({}, ''))).toMatchObject({
      sub: 'Tell us a little about yourself.',
      progress: 'Step 1 of 4',
      legends: ['Age range', 'Gender'],
    })
    expect(screenOf(await wizard({ step: '2', ageBand: '25-34', gender: 'female' }, ''))).toMatchObject({
      sub: 'When are you generally available to meet?',
      legends: ['When could you meet?'],
    })
    expect(
      screenOf(await wizard({ step: '3', ageBand: '25-34', gender: 'female', availability: 'monday:12' }, '')),
    ).toMatchObject({ sub: 'Which group would you like to join?', legends: ['Which group would you like to join?'] })
    expect(
      screenOf(
        await wizard({ step: '4', ageBand: '25-34', gender: 'female', availability: 'monday:12', groupId: 'none' }, ''),
      ),
    ).toEqual({
      sub: 'Nearly there — how we reach you.',
      progress: 'Step 4 of 4',
      percent: '100%',
      legends: ['Agreements'],
      labels: ['Your name', 'Mobile number', 'Email (optional)'],
      hints: [],
    })
  })

  it('shows each form’s editor, with its pages, its questions and what uses them', async () => {
    const { html } = await getPage('/intake-forms', cookie)
    expect(html).toContain('Mentor and mentee form')
    expect(html).toContain(`/join/${ministry.shortName}?preview=1`)
    expect(html).toContain('Page 1 · Welcome — let’s get you connected.')
    expect(html).toContain('Page 5 · Nearly there — how we reach you, and what you are hoping for.')
    expect(html).toContain('Pairing rules use this')
    expect(html).toContain('The age rule uses this')
    expect(html).toContain('Suggested Pairs uses this')
    expect(html).toContain('Always asked')
    expect(html).toContain('One choice + Other')
    // The goals card says which form asks it, which is one of them.
    expect(html).toContain('The mentor and mentee form asks <em>What are you hoping for?</em>')
    expect(html).not.toContain('Both forms end by asking')

    const { html: groups } = await getPage('/intake-forms?form=group', cookie)
    expect(groups).toContain('Groups form')
    expect(groups).toContain(`/join/${ministry.shortName}/groups?preview=1`)
    expect(groups).toContain('Page 3 · Which group would you like to join?')
    expect(groups).toContain('One choice from your groups')
  })

  it('opens a question in place, and saves it live at once', async () => {
    const { html: open } = await getPage('/intake-forms?form=discipleship&question=gender', cookie)
    expect(open).toContain('action="/intake-forms/form/question"')
    expect(open).toContain('Hint under it')

    const { location } = await post('/intake-forms/form/question', {
      form: 'discipleship',
      key: 'gender',
      wording: 'Are you a man or a woman?',
      hint: 'We pair men with men and women with women.',
      required: 'yes',
    })
    expect(new URL(location).searchParams.get('formSaved')).toBe('gender')

    const { html } = await getPage(new URL(location).pathname + new URL(location).search, cookie)
    expect(html).toContain('Saved, live now')
    expect(html).toContain('Are you a man or a woman?')

    expect(screenOf(await wizard({ step: '2', side: 'mentee' }))).toMatchObject({
      legends: ['Age range', 'Are you a man or a woman?'],
      hints: ['We pair men with men and women with women.'],
    })

    const { rows } = await pool.query(
      `select count(*)::int as n from ministry_event where ministry_id = $1 and type = 'intake_form.question_edited'`,
      [ministry.id],
    )
    expect(rows[0].n).toBe(1)
  })

  it('refuses what Discipler keeps fixed, and says why', async () => {
    const { location } = await post('/intake-forms/form/question', {
      form: 'discipleship',
      key: 'phone',
      wording: 'Mobile number',
      hint: '',
    })
    expect(new URL(location).searchParams.get('formError')).toBe('intake_form.always_required')

    const layout = new URLSearchParams({ form: 'discipleship' })
    const pages: [string, string[]][] = [
      ['welcome', ['side', 'fullName']],
      ['about-you', ['ageBand', 'gender']],
      ['experience', ['experience']],
      ['availability', ['availability']],
      ['last', ['goalId', 'phone', 'email']],
    ]
    for (const [page, keys] of pages) {
      layout.append('layout', `page:${page}`)
      for (const key of keys) layout.append('layout', `question:${key}`)
    }
    const refused = await post('/intake-forms/form/arrange', layout)
    const { html } = await getPage(new URL(refused.location).pathname + new URL(refused.location).search, cookie)
    expect(html).toContain('stay on the last page')
  })

  it('finishes the version somebody opened, while a newcomer gets the form as it stands', async () => {
    // Somebody opens the form now and is part-way through it.
    const first = await wizard({})
    const opened = first.match(/name="v" value="(\d+)"/)?.[1]
    expect(opened).toBeDefined()

    // The Admin moves the gender up beside the side.
    const layout = new URLSearchParams({ form: 'discipleship' })
    const pages: [string, string[]][] = [
      ['welcome', ['side', 'gender']],
      ['about-you', ['ageBand']],
      ['experience', ['experience']],
      ['availability', ['availability']],
      ['last', ['goalId', 'fullName', 'phone', 'email']],
    ]
    for (const [page, keys] of pages) {
      layout.append('layout', `page:${page}`)
      for (const key of keys) layout.append('layout', `question:${key}`)
    }
    const { location } = await post('/intake-forms/form/arrange', layout)
    expect(new URL(location).searchParams.get('formError')).toBeNull()

    // A newcomer is asked the gender on the first page.
    expect(screenOf(await wizard({})).legends).toEqual(['I’m joining as…', 'Are you a man or a woman?'])
    // Somebody part-way through still meets it on the second, as when they opened.
    expect(screenOf(await wizard({ step: '2', side: 'mentee', v: opened! })).legends).toEqual([
      'Age range',
      'Are you a man or a woman?',
    ])
  })

  it('previews the form as a newcomer sees it, and records nothing', async () => {
    const first = await wizard({ preview: '1' })
    expect(first).toContain('Preview. This is the form as a newcomer sees it.')
    expect(first).toContain('name="preview" value="1"')

    const body = new URLSearchParams({
      ...MENTEE,
      via: 'link',
      preview: '1',
      fullName: 'Preview Person',
      phone: '555 999 0101',
      smsConsent: 'yes',
      contactSharing: 'granted',
      goalId: 'other',
      goalOther: 'grief',
    })
    body.append('availability', 'monday:12')
    const { location } = await post(`/intake/${ministry.id}/discipleship/submit`, body, false)
    expect(location).toContain('/discipleship/done')
    expect(location).toContain('preview=1')

    const done = await fetch(new URL(location, baseUrl)).then((page) => page.text())
    expect(done).toContain('Preview. This is the form as a newcomer sees it.')

    const { rows } = await pool.query(
      `select count(*)::int as n from person where ministry_id = $1 and full_name = 'Preview Person'`,
      [ministry.id],
    )
    expect(rows[0].n).toBe(0)
  })

  it('takes a submission without a question the Admin made optional, and says the thank-you after', async () => {
    await post('/intake-forms/form/question', {
      form: 'discipleship',
      key: 'goalId',
      wording: 'What are you hoping for?',
      hint: 'Choose the one that fits best.',
    })
    await post('/intake-forms/form/text', {
      form: 'discipleship',
      which: 'thank_you',
      text: 'Pastor Dan will be in touch this week.',
    })

    const last = screenOf(await wizard({ step: '5', side: 'mentee', ageBand: '25-34', gender: 'female', experience: 'first_time', availability: 'monday:12' }))
    expect(last.legends[0]).toBe('What are you hoping for? (optional)')

    const body = new URLSearchParams({
      ...MENTEE,
      via: 'link',
      fullName: 'Optional Goal',
      phone: '555 999 0102',
      smsConsent: 'yes',
      contactSharing: 'granted',
    })
    body.append('availability', 'monday:12')
    const { location } = await post(`/intake/${ministry.id}/discipleship/submit`, body, false)
    expect(location).toContain('/discipleship/done')

    const done = await fetch(new URL(location, baseUrl)).then((page) => page.text())
    expect(done).toContain('Pastor Dan will be in touch this week.')

    const { rows } = await pool.query<{ form_version: number; discipleship_goal_id: string | null }>(
      `select i.form_version, i.discipleship_goal_id from intake_submission i
         join person p on p.id = i.person_id
        where p.ministry_id = $1 and p.full_name = 'Optional Goal'`,
      [ministry.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.discipleship_goal_id).toBeNull()
    expect(rows[0]!.form_version).toBeGreaterThan(0)
  })

  it('adds a page before the last, and renames one', async () => {
    const { location } = await post('/intake-forms/form/add-page', { form: 'group', name: 'A little more' })
    expect(new URL(location).searchParams.get('formSaved')).toBe('page')

    await post('/intake-forms/form/rename-page', { form: 'group', pageId: 'about-you', name: 'About you' })

    const { html } = await getPage('/intake-forms?form=group', cookie)
    expect(html).toContain('Page 1 · About you')
    expect(html).toContain('Page 4 · A little more')
    expect(html).toContain('Page 5 · Nearly there — how we reach you.')

    // The empty page is skipped, and the renamed one says its new name.
    expect(screenOf(await wizard({}, ''))).toMatchObject({ sub: 'About you', progress: 'Step 1 of 4' })
  })
})
