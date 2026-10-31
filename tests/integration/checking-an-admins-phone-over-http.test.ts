import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'
import { baseUrl, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The two routes the test check-in's card calls to check an Admin's own phone
 * (Exponential launch, ticket 09), over HTTP for what is theirs: the session they
 * read, the JSON they answer, and the refusals Discipler makes before Twilio is
 * asked. A running server has no Twilio to stand in for, so nothing here reaches
 * a send; that is `checking-an-admins-phone.test.ts`, with Twilio scripted.
 */

describe.skipIf(skipUnlessAppIsRunning)('checking an Admin’s own phone over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    ;({ cookie } = await signIn(ministry))
  })

  afterAll(async () => {
    await pool.end()
  })

  const post = (path: string, session: string, body: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: session, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })

  it('answers a signed-out visitor with no code sent', async () => {
    const response = await post('/account/phone/send-code', '')

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ refusal: 'phone_check.signed_out' })
  })

  it('refuses something that is not six digits before anything is checked', async () => {
    const response = await post('/account/phone/confirm-code', cookie, { code: '1234' })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      refusal: 'phone_check.malformed_code',
      message: 'Please enter the 6-digit code from the text.',
    })
  })

  it('refuses a code when none was sent', async () => {
    const response = await post('/account/phone/confirm-code', cookie, { code: '123456' })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ refusal: 'phone_check.no_code' })
  })

  it('refuses to text a code to a phone outside the US', async () => {
    // The Admin's Roster row, which is where the phone is read from; the sign-in
    // credential is the account's and stays as it was.
    await pool.query(`update person set phone = '+14165550100' where id = $1`, [ministry.adminPersonId])

    const response = await post('/account/phone/send-code', cookie)

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ refusal: 'phone_check.not_us' })
    const { rows } = await pool.query(`select 1 from phone_check where user_id = $1`, [ministry.adminUserId])
    expect(rows).toEqual([])
  })
})
