import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { aTestPhoneNumber, createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'

/**
 * Removing a question (Pastor feedback, ticket 13), the way an Admin meets it:
 * the open row ends in *Remove question…*, which asks once more in place, saying
 * what stops working and how many people's answers go; only the second button
 * removes. Then the wizard no longer asks it, Suggested Pairs and the settings
 * say what they are doing without, and *Add a question* offers it back.
 */

/** Text as a reader sees it: tags and React's comment markers gone, entities read. */
const clean = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

describe.skipIf(skipUnlessAppIsRunning)('removing a question, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Removal Over HTTP Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

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

  const page = async (path: string) => clean((await getPage(path, cookie)).html)
  const landing = (location: string) => new URL(location).pathname + new URL(location).search

  const submitTheWizard = async (fields: Record<string, string>, availability: string[]) => {
    const body = new URLSearchParams({
      via: 'link',
      fullName: 'Ana Ortiz',
      phone: aTestPhoneNumber(),
      smsConsent: 'yes',
      contactSharing: 'granted',
      goalId: 'other',
      goalOther: 'Prayer',
      ...fields,
    })
    for (const slot of availability) body.append('availability', slot)
    return post(`/intake/${ministry.id}/discipleship/submit`, body, false)
  }

  it('ends an open row in Remove question…, except the name’s and the number’s', async () => {
    expect(await page('/intake-forms?form=discipleship&question=availability')).toContain('Remove question…')
    expect(await page('/intake-forms?form=discipleship&question=fullName')).not.toContain('Remove question…')
    expect(await page('/intake-forms?form=discipleship&question=phone')).not.toContain('Remove question…')
  })

  it('asks once more in place, saying what stops working and how many answers it deletes', async () => {
    const { location } = await submitTheWizard(
      { side: 'mentee', ageBand: '25-34', gender: 'female', experience: 'first_time' },
      ['monday:12'],
    )
    expect(location).toContain('/discipleship/done')

    const asking = await page('/intake-forms?form=discipleship&question=availability&removingQuestion=1')
    expect(asking).toContain(
      'Remove “When could you meet?” Suggested Pairs ranks people by the hours they share. Without this question it cannot suggest anybody: the tab will say so and you will pair everyone by hand. It also deletes the answers 1 person has already given. This cannot be undone.',
    )
    expect(asking).toContain('Remove it and its answer')
    expect(asking).toContain('Keep it')

    // Asking removed nothing.
    const { rows } = await pool.query(
      `select 1 from intake_availability where ministry_id = $1`,
      [ministry.id],
    )
    expect(rows.length).toBe(1)
  })

  it('says what each question the product reads stops doing, in the ticket’s words', async () => {
    const asking = (key: string) => page(`/intake-forms?form=discipleship&question=${key}&removingQuestion=1`)
    expect(await asking('gender')).toContain('Without this question they cannot be applied')
    expect(await asking('ageBand')).toContain('Without this question it cannot be applied')
    expect(await asking('goalId')).toContain('Without this question there is no goal tiebreaker')
    expect(await asking('side')).toContain('Remove the first-time question first.')
    expect(await asking('side')).not.toContain('Remove it')
    expect(await asking('email')).toContain(
      'The emails people gave are kept with their names and numbers, so no answers are deleted.',
    )
  })

  it('removes it on the second press, live at once, and its answers with it', async () => {
    const { location } = await post('/intake-forms/form/remove-question', {
      form: 'discipleship',
      key: 'availability',
      pageId: 'availability',
    })
    expect(location).toContain('formSaved=removed%3Aavailability')

    const editor = await page(landing(location))
    expect(editor).toContain('Removed, live now')
    expect(editor).not.toContain('When could you meet? Suggested Pairs uses this')

    const { rows } = await pool.query(`select 1 from intake_availability where ministry_id = $1`, [ministry.id])
    expect(rows).toEqual([])
    const { rows: events } = await pool.query(
      `select payload from ministry_event where ministry_id = $1 and type = 'intake_form.question_removed'`,
      [ministry.id],
    )
    expect(events).toEqual([{ payload: expect.objectContaining({ key: 'availability', answersLost: 1 }) }])
  })

  it('serves the wizard without it, and takes a submission that never saw it', async () => {
    const welcome = await fetch(`${baseUrl}/intake/${ministry.id}/discipleship`).then((response) => response.text())
    expect(clean(welcome)).toContain('Step 1 of 4')

    const { location } = await submitTheWizard(
      { side: 'mentor', ageBand: '35-44', gender: 'male', experience: 'done_before' },
      [],
    )
    expect(location).toContain('/discipleship/done')
    expect(location).not.toContain('hours=')
  })

  it('has Suggested Pairs say it cannot suggest anybody, and why', async () => {
    const suggested = await page('/suggested-pairs')
    expect(suggested).toContain(
      'The mentor and mentee form no longer asks when people are free, so Suggested Pairs cannot suggest anybody.',
    )
    expect(suggested).not.toContain('No suggestions right now.')
    expect(suggested).not.toContain('No Schedule Overlap')
  })

  it('has the settings say the gender rule cannot be applied once gender is removed', async () => {
    await post('/intake-forms/form/remove-question', { form: 'discipleship', key: 'gender', pageId: 'about-you' })
    expect(await page('/settings')).toContain(
      'Your mentor and mentee form no longer asks gender, so this rule cannot be applied to anybody who fills it in.',
    )
    expect(await page('/suggested-pairs')).not.toContain('no longer asks gender')
  })

  it('offers a removed question back from Add a question, with none of its old answers', async () => {
    const editor = await page('/intake-forms?form=discipleship')
    expect(editor).toContain('Add back: Gender')
    expect(editor).toContain('When could you meet?')

    const { location } = await post('/intake-forms/form/add-back', {
      form: 'discipleship',
      pageId: 'about-you',
      key: 'gender',
    })
    expect(location).toContain('formSaved=gender')
    expect(await page(landing(location))).toContain('Gender Pairing rules use this')

    const { rows } = await pool.query(
      `select gender from intake_submission where ministry_id = $1 and gender is not null`,
      [ministry.id],
    )
    expect(rows).toEqual([])
  })
})
