import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CHURCH_HAS_NO_ACCESS_TO_TEXTING } from '../../app/texting-gate-copy'
import { personId } from '~/domain/ids'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  aTestPhoneNumber,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * An Admin's press at a church with no subscription, through the real routes
 * (Exponential launch, ticket 05): the page says why, in the Admin's own words, and
 * nothing was queued. And a text that was already on the queue when a route drained is
 * closed by that drain, which is the gate on the running app.
 */
describe.skipIf(skipUnlessAppIsRunning)('the texting gate, over HTTP', () => {
  let church: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let leader: string
  let disciple: string

  const post = (path: string, fields: string[][]) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(fields),
    })

  const pageSays = async (response: Response, words: string) => {
    expect(response.status).toBe(303)
    const location = response.headers.get('location') ?? ''
    const { html } = await getPage(location.startsWith('http') ? new URL(location).pathname + new URL(location).search : location, cookie)
    // The apostrophes and the like are escaped in a page; this sentence has none.
    expect(html).toContain(words)
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    church = await createMinistryWithAdmin('A Church With No Subscription', undefined, { billedOutsideStripe: false })
    cookie = (await signIn(church)).cookie
    leader = await addPerson(church, 'Would Lead', { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
    disciple = await addPerson(church, 'Would Follow', { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
    await completeIntake(church, personId(leader))
    await completeIntake(church, personId(disciple))
  })

  afterAll(async () => {
    await pool.end()
  })

  it('refuses a pairing back onto the popup, and forms nothing', async () => {
    const response = await post('/roster/pair/create', [
      ['pair', leader],
      ['leaderId', leader],
      ['participantId', disciple],
    ])

    expect(response.headers.get('location')).toContain('error=relationship.church_has_no_access')
    await pageSays(response, CHURCH_HAS_NO_ACCESS_TO_TEXTING)
    const { rows } = await pool.query(`select 1 from relationship where ministry_id = $1`, [church.id])
    expect(rows).toEqual([])
  })

  it('refuses sending an invitation again, onto the person’s page', async () => {
    // Formed by hand while it could, as a church that had access did.
    await pool.query(`update ministry_billing set billed_outside_stripe = true where ministry_id = $1`, [church.id])
    const formed = await post('/roster/pair/create', [
      ['pair', leader],
      ['leaderId', leader],
      ['participantId', disciple],
    ])
    expect(formed.status).toBe(303)
    await pool.query(`update ministry_billing set billed_outside_stripe = false where ministry_id = $1`, [church.id])
    const { rows } = await pool.query<{ id: string }>(`select id from relationship where ministry_id = $1`, [church.id])

    const before = await pool.query(`select count(*)::int as count from outbound_message where ministry_id = $1`, [church.id])
    const response = await post('/roster/reinvite', [
      ['relationshipId', rows[0]!.id],
      ['personId', leader],
    ])

    expect(response.headers.get('location')).toContain('noAccess=1')
    await pageSays(response, CHURCH_HAS_NO_ACCESS_TO_TEXTING)
    const after = await pool.query(`select count(*)::int as count from outbound_message where ministry_id = $1`, [church.id])
    expect(after.rows[0].count).toBe(before.rows[0].count)
  })
})
