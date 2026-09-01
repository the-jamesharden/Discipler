import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The wizard driven the way a congregant does it: open the link, answer one screen,
 * press Continue, and only at the end press Submit.
 *
 * Over HTTP against the running app, because this is a surface used by somebody who
 * will never have an account -- and because *nothing is written until the last step*
 * is a claim about the whole round trip, not about a function.
 */
describe.skipIf(skipUnlessAppIsRunning)('the discipleship Intake wizard', () => {
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

  const wizard = (params: Record<string, string | string[]> = {}): string => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      for (const one of [value].flat()) query.append(key, one)
    }
    return `${baseUrl}/intake/${ministry.id}/discipleship?${query}`
  }

  const open = async (params: Record<string, string | string[]> = {}) => {
    const response = await fetch(wizard(params), { redirect: 'manual' })
    return { response, html: await response.text() }
  }

  const goalId = async (): Promise<string> => {
    const { rows } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    return rows[0].id as string
  }

  const submit = async (fields: Record<string, string>, slots: string[]) => {
    const body = new URLSearchParams(fields)
    for (const slot of slots) body.append('availability', slot)

    const response = await fetch(`${baseUrl}/intake/${ministry.id}/discipleship/submit`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  const countOf = async (table: string, fullName: string): Promise<number> => {
    const { rows } = await pool.query(
      `select count(*)::int as n from ${table} t join person p on p.id = t.person_id
        where t.ministry_id = $1 and p.full_name = $2`,
      [ministry.id, fullName],
    )
    return rows[0].n as number
  }

  it('opens on the side question, and asks nothing else on that screen', async () => {
    const { response, html } = await open()

    expect(response.status).toBe(200)
    expect(html).toContain('I’m joining as')
    expect(html).toContain('value="mentor"')
    expect(html).toContain('value="mentee"')
    // The rest of the form is not on this screen. Every later screen's wording
    // depends on the answer that has not been given yet.
    expect(html).not.toContain('name="ageBand"')
    expect(html).not.toContain('name="smsConsent"')
    expect(html).not.toContain('monday:midday')
  })

  it('will not open a later screen than the answers reach', async () => {
    const { html } = await open({ step: '5' })
    expect(html).toContain('I’m joining as')
    expect(html).not.toContain('name="smsConsent"')
  })

  it('asks both sides the same five things, wording the third one for the side', async () => {
    const answered = { ageBand: '35-44', gender: 'male', experience: 'first_time' }
    const aged = { ageBand: '35-44', gender: 'male' }

    // Age and gender, then the first-time question, then the grid, then everything
    // the single page already asks. Both sides are asked all five.
    const two = await open({ step: '2', side: 'mentor' })
    expect(two.html).toContain('name="ageBand"')
    expect(two.html).toContain('name="gender"')

    const mentee = await open({ step: '3', side: 'mentee', ...aged })
    expect(mentee.html).toContain('Have you been discipled by a mentor before?')
    expect(mentee.html).toContain('No, this is my first time')

    const mentor = await open({ step: '3', side: 'mentor', ...aged })
    expect(mentor.html).toContain('Have you mentored someone before?')
    expect(mentor.html).toContain('Yes, I’ve done this before')

    const four = await open({ step: '4', side: 'mentor', ...answered })
    expect(four.html).toContain('monday:early_morning')
    expect(four.html).toContain('sunday:evening')

    const five = await open({
      step: '5',
      side: 'mentor',
      ...answered,
      availability: ['wednesday:evening'],
    })
    expect(five.html).toContain('name="fullName"')
    expect(five.html).toContain('name="phone"')
    expect(five.html).toContain('name="goalId"')
    expect(five.html).toContain('name="smsConsent"')
    expect(five.html).toContain('value="declined"')
    // The earlier answers are still on the page, on their way to the one POST.
    expect(five.html).toContain('value="mentor"')
    expect(five.html).toContain('value="first_time"')
  })

  it('says why the grid would not move on, rather than silently redrawing it', async () => {
    const { html } = await open({
      step: '5',
      side: 'mentee',
      ageBand: '25-34',
      gender: 'female',
      experience: 'first_time',
    })

    // The one screen with no `required` field on it, because a checkbox set cannot
    // express *at least one of these*.
    expect(html).toContain('Please select at least one time that could work.')
    expect(html).toContain('monday:midday')
  })

  it('keeps the later answers when somebody goes back to correct an earlier one', async () => {
    // Back from the last screen to the age question, with everything still in hand.
    const { html } = await open({
      step: '2',
      side: 'mentor',
      ageBand: '35-44',
      gender: 'male',
      experience: 'done_before',
      availability: ['friday:evening'],
    })

    // The screen asks age and gender, so it does not carry them as hidden --
    // but the answers after it are still on their way to the one POST.
    expect(html).toContain('name="experience" value="done_before"')
    expect(html).toContain('name="availability" value="friday:evening"')
  })

  it('writes nothing at all until the last step submits', async () => {
    // Four screens' worth of answers, and then the browser is closed.
    await open({ step: '2', side: 'mentee' })
    await open({ step: '3', side: 'mentee', ageBand: '25-34', gender: 'female' })
    await open({
      step: '4',
      side: 'mentee',
      ageBand: '25-34',
      gender: 'female',
      experience: 'first_time',
    })

    const { rows } = await pool.query(
      `select count(*)::int as n from person where ministry_id = $1`,
      [ministry.id],
    )
    // Only the Admin their own Ministry was created with.
    expect(rows[0].n).toBe(1)
  })

  it('lands the Person on the Roster and records what they answered', async () => {
    const { response, location } = await submit(
      {
        via: 'qr',
        side: 'mentor',
        ageBand: '45-54',
        gender: 'male',
        experience: 'done_before',
        fullName: 'Solomon Adeyemi',
        phone: '555 812 0200',
        email: 'solomon@example.test',
        goalId: await goalId(),
        smsConsent: 'yes',
        contactSharing: 'granted',
      },
      ['tuesday:morning', 'saturday:midday'],
    )

    expect(response.status).toBe(303)
    expect(location).toContain('/discipleship/done')
    expect(location).toContain('side=mentor')

    const { rows } = await pool.query(
      `select participation_status(p) as status, p.eligible_to_lead from person p
        where p.ministry_id = $1 and p.full_name = 'Solomon Adeyemi'`,
      [ministry.id],
    )
    expect(rows[0].status).toBe('ready_to_pair')
    // The answer is a Roster signal and never the Admin's plan.
    expect(rows[0].eligible_to_lead).toBe(false)

    const { rows: consents } = await pool.query(
      `select c.source, c.intake_path, c.declared_side
         from consent_record c join person p on p.id = c.person_id
        where c.ministry_id = $1 and p.full_name = 'Solomon Adeyemi'`,
      [ministry.id],
    )
    expect(consents).toHaveLength(2)
    for (const row of consents) {
      expect(row.intake_path).toBe('discipleship')
      expect(row.declared_side).toBe('mentor')
      // Scanned off a poster, which `source` goes on answering by itself.
      expect(row.source).toBe('qr_code')
    }

    const { rows: submissions } = await pool.query(
      `select i.first_time from intake_submission i join person p on p.id = i.person_id
        where i.ministry_id = $1 and p.full_name = 'Solomon Adeyemi'`,
      [ministry.id],
    )
    expect(submissions[0].first_time).toBe(false)
  })

  it('says what happens next in the words of the side they declared', async () => {
    const mentee = await fetch(
      `${baseUrl}/intake/${ministry.id}/discipleship/done?side=mentee`,
      { redirect: 'manual' },
    ).then((response) => response.text())
    expect(mentee).toContain('You’re on the list')
    expect(mentee).toContain('a mentor for you')

    const mentor = await fetch(
      `${baseUrl}/intake/${ministry.id}/discipleship/done?side=mentor`,
      { redirect: 'manual' },
    ).then((response) => response.text())
    expect(mentor).toContain('someone for you to mentor')
  })

  it('sends an incomplete last step back with codes and the earlier answers, never a name', async () => {
    const { response, location } = await submit(
      {
        side: 'mentee',
        ageBand: '25-34',
        gender: 'female',
        experience: 'first_time',
        fullName: 'Nadia Farouk',
        phone: '555 812 0201',
        goalId: await goalId(),
        contactSharing: 'granted',
      },
      ['monday:midday'],
    )

    expect(response.status).toBe(303)
    expect(location).toContain('refused=')
    expect(location).toContain('intake.sms_consent_required')
    // The way back keeps the screens they already answered.
    expect(location).toContain('side=mentee')
    expect(location).toContain('availability=monday%3Amidday')
    // And carries nothing they typed on the screen that was refused.
    expect(location).not.toContain('Nadia')
    expect(location).not.toContain('0201')

    expect(await countOf('intake_submission', 'Nadia Farouk')).toBe(0)
    expect(await countOf('consent_record', 'Nadia Farouk')).toBe(0)
  })

  it('refuses a wizard submission that skipped the first screen', async () => {
    const { location } = await submit(
      {
        ageBand: '25-34',
        gender: 'female',
        fullName: 'Skipper Jones',
        phone: '555 812 0202',
        goalId: await goalId(),
        smsConsent: 'yes',
        contactSharing: 'granted',
      },
      ['monday:midday'],
    )

    expect(location).toContain('intake.side_unknown')
    expect(location).toContain('intake.first_time_unanswered')
    expect(await countOf('intake_submission', 'Skipper Jones')).toBe(0)
  })

  it('leaves the original Intake link exactly as it was', async () => {
    const response = await fetch(`${baseUrl}/intake/${ministry.id}`, { redirect: 'manual' })
    const html = await response.text()

    expect(response.status).toBe(200)
    // One page, nine questions, and no question about sides.
    expect(html).toContain('name="fullName"')
    expect(html).toContain('monday:early_morning')
    expect(html).toContain('name="smsConsent"')
    expect(html).not.toContain('name="side"')
    expect(html).not.toContain('name="experience"')
  })

  it('writes a null path through the original link, and backfills nothing', async () => {
    const body = new URLSearchParams({
      via: 'link',
      fullName: 'Hannah Reeves',
      phone: '555 812 0203',
      ageBand: '35-44',
      gender: 'female',
      goalId: await goalId(),
      smsConsent: 'yes',
      contactSharing: 'granted',
    })
    body.append('availability', 'wednesday:evening')

    const response = await fetch(`${baseUrl}/intake/${ministry.id}/submit`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    expect(response.status).toBe(303)

    const { rows } = await pool.query(
      `select c.intake_path, c.declared_side
         from consent_record c join person p on p.id = c.person_id
        where c.ministry_id = $1 and p.full_name = 'Hannah Reeves'`,
      [ministry.id],
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.intake_path).toBeNull()
      expect(row.declared_side).toBeNull()
    }
  })

  it('hands the Admin both links and both QR codes, each labelled', async () => {
    const { html } = await getPage('/roster', cookie)

    expect(html).toContain(`/intake/${ministry.id}/discipleship`)
    expect(html).toContain('The discipleship link')
    expect(html).toContain('/roster/discipleship-code.svg')
    // Both squares, so an Admin printing one knows which one they printed.
    expect(html).toContain('/roster/intake-code.svg')
    expect(html).toContain('discipleship-intake-qr-code.svg')
    expect(html).toContain('intake-qr-code.svg')

    const code = await fetch(`${baseUrl}/roster/discipleship-code.svg`, {
      headers: { cookie },
      redirect: 'manual',
    })
    expect(code.status).toBe(200)
    expect(code.headers.get('content-type')).toContain('image/svg+xml')
    expect(await code.text()).toContain('<svg')
  })

  it('shows the offer on the Roster row, beside the plan it is not', async () => {
    const { html } = await getPage('/roster', cookie)

    expect(html).toContain('Offered at Intake')
    expect(html).toContain('Offered to mentor')
    // The Admin's column is untouched by the Person's answer: the button on
    // Solomon's row still offers to mark him eligible.
    expect(html).toContain('No — mark eligible')
  })

  it('shows the pairing surface whether each candidate is new to this', async () => {
    const { html } = await getPage('/roster/pair', cookie)

    expect(html).toContain('Solomon Adeyemi')
    expect(html).toContain('Has done this before')
    // Nobody was asked on the original form, so nothing is claimed about them.
    expect(html).toContain('Hannah Reeves')
  })
})
