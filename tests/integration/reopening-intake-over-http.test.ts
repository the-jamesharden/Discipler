import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A Person correcting their own details, driven the way they do it: open the link
 * somebody sent, change what has moved on, press Submit. Over HTTP against the
 * running app, because this is a surface used by somebody who will never have an
 * account, and no unit test can tell you whether they could reach it.
 */
describe.skipIf(skipUnlessAppIsRunning)('a Person reopening their own Intake', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const goalId = async (): Promise<string> => {
    const { rows } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    return rows[0].id as string
  }

  /**
   * Issued straight into the table rather than through the Admin's screen. What is
   * under test here is the Person's side of the link; the Admin's side is proved on
   * their own surface, in `the-roster-row-over-http`.
   */
  const linkFor = async (person: string): Promise<string> => {
    const token = crypto.randomUUID()
    await pool.query(
      `insert into intake_link (ministry_id, person_id, token, created_at, expires_at)
       values ($1, $2, $3, now(), now() + interval '14 days')`,
      [ministry.id, person, token],
    )
    return token
  }

  const submit = async (token: string, fields: Record<string, string>, slots: string[]) => {
    const body = new URLSearchParams(fields)
    for (const slot of slots) body.append('availability', slot)

    const response = await fetch(`${baseUrl}/intake/reopen/${token}/submit`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  it('serves the form with their answers already in it, and no account anywhere', async () => {
    const phone = aNumber()
    const person = await addPerson(ministry, 'Ada Bello', { phone })
    const token = await linkFor(person)

    const response = await fetch(`${baseUrl}/intake/reopen/${token}`, { redirect: 'manual' })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Riverside Chapel')
    expect(html).toContain(`value="${phone}"`)
    expect(html).toContain('Ada Bello')
    // The slot they chose comes back ticked, which is what makes this a correction
    // rather than filling the whole form in again.
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="monday:midday"/)
  })

  it('takes a corrected number without filing a second Person', async () => {
    const person = await addPerson(ministry, 'Femi Balogun', { phone: aNumber() })
    const token = await linkFor(person)
    const corrected = aNumber()

    const { response, location } = await submit(
      token,
      {
        fullName: 'Femi Balogun',
        phone: corrected,
        email: '',
        ageBand: '35-44',
        gender: 'male',
        goalId: await goalId(),
        smsConsent: 'yes',
        contactSharing: 'granted',
      },
      ['thursday:evening'],
    )

    expect(response.status).toBe(303)
    expect(location).toContain('/done')

    const { rows } = await pool.query<{ id: string; phone: string }>(
      `select id, phone from person where ministry_id = $1 and full_name = 'Femi Balogun'`,
      [ministry.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.phone).toBe(corrected)
  })

  it('refuses a submission with SMS consent unticked, and the page names STOP', async () => {
    const person = await addPerson(ministry, 'Grace Miller', { phone: aNumber() })
    const token = await linkFor(person)

    const { location } = await submit(
      token,
      {
        fullName: 'Grace Miller',
        phone: aNumber(),
        email: '',
        ageBand: '25-34',
        gender: 'female',
        goalId: await goalId(),
        contactSharing: 'granted',
      },
      ['monday:midday'],
    )

    expect(location).toContain('refused=intake.sms_consent_required')

    const html = await fetch(location, { redirect: 'manual' }).then((r) => r.text())

    // The form grants consent and never withdraws it, so the refusal names the route
    // that does. A dead end here is a Person who wanted out and was shown a form.
    expect(html).toContain('reply STOP to any message from us')
  })

  it('tells the holder of an expired link to ask for a new one', async () => {
    const person = await addPerson(ministry, 'Hana Ito', { phone: aNumber() })
    const token = await linkFor(person)
    await pool.query(
      `update intake_link
          set created_at = now() - interval '60 days',
              expires_at = now() - interval '46 days'
        where token = $1`,
      [token],
    )

    const html = await fetch(`${baseUrl}/intake/reopen/${token}`, { redirect: 'manual' }).then(
      (response) => response.text(),
    )

    expect(html).toContain('This link has expired')
    // And it does not serve a form nothing will accept.
    expect(html).not.toContain('name="smsConsent"')
  })

  it('is a 404 for a token that names nobody, not an expired-link page', async () => {
    const response = await fetch(`${baseUrl}/intake/reopen/${crypto.randomUUID()}`, {
      redirect: 'manual',
    })
    expect(response.status).toBe(404)
  })
})
