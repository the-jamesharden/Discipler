import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPage, signIn, signUpOpenUrl, skipUnlessAppIsRunning } from '../support/app'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Who `/` sends back to the payment step (Exponential launch, ticket 18), which `/`,
 * `/signup/payment` and Billing each now answer in the page's one read (ADR-0023).
 */
describe.skipIf(skipUnlessAppIsRunning)('the payment step', () => {
  let pool: pg.Pool
  let signedUp: MinistryFixture
  let provisioned: MinistryFixture

  const chose = (church: MinistryFixture) =>
    pool.query(`insert into church_signup (ministry_id, billing_cycle) values ($1, 'year')`, [church.id])

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    // The church self sign-up makes. A fixture church is billed outside Stripe otherwise.
    signedUp = await createMinistryWithAdmin('Signed Itself Up', undefined, { billedOutsideStripe: false })
    provisioned = await createMinistryWithAdmin('Set Up By Hand')
    await chose(signedUp)
  })

  afterAll(async () => {
    await pool.end()
  })

  const read = async (church: MinistryFixture, page: string) => {
    const client = await signInAs(church)
    const { data, error } = await client.rpc(page)
    if (error) throw new Error(error.message)
    return data as { session: string; church_signup: Record<string, unknown> | null }
  }

  describe.each(['home_page', 'payment_step_page', 'billing_page', 'restart_page'])('%s', (page) => {
    it('holds what the church chose', async () => {
      const { church_signup: signup } = await read(signedUp, page)

      expect(signup).toMatchObject({ billing_cycle: 'year', began: false, reminders_off: false })
      expect(signup?.timezone).toEqual(expect.any(String))
    })

    it('holds null for a church that did not sign itself up', async () => {
      const doc = await read(provisioned, page)

      expect(doc.session).toBe('admin')
      expect(doc).toHaveProperty('church_signup', null)
    })
  })

  it('tells a Leader nothing about it', async () => {
    const leader = await addPersonWithAccount(signedUp, 'Sam Leader', 'leader')
    const client = await signInWith(leader)

    const { data } = await client.rpc('home_page')

    expect(data).toMatchObject({ session: 'not-an-admin' })
    expect(data).not.toHaveProperty('church_signup')
  })

  const landsOn = async (church: MinistryFixture) => {
    const { cookie } = await signIn(church)
    const { response } = await getPage('/', cookie, signUpOpenUrl)
    return new URL(response.headers.get('location') ?? '', signUpOpenUrl).pathname
  }

  it('is where `/` sends the Admin who left at it, once sign-up is open', async () => {
    expect(await landsOn(signedUp)).toBe('/signup/payment')
    expect(await landsOn(provisioned)).toBe('/overview')
  })
})
