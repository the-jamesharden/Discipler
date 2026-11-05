import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addMembership,
  addPerson,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  openMaterialHistory,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * What a church's billing state does to its pages (Exponential launch, ticket 33), through
 * the built app. The server here has no Stripe, as Preview and a developer's machine have
 * none, so what comes from Stripe is held to saying so, and everything that comes from the
 * webhook's record is what an Admin would really see.
 */
const unique = () => crypto.randomUUID().replaceAll('-', '')

const unescaped = (html: string) =>
  html.replaceAll('&#x27;', "'").replaceAll('&amp;', '&').replaceAll('&#39;', "'")

describe.skipIf(skipUnlessAppIsRunning)('the billing states, over HTTP', { timeout: 60_000 }, () => {
  let pool: pg.Pool

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  /** A church as the webhook would have left it. */
  const aChurchThatIs = async (status: string, name: string): Promise<MinistryFixture & { cookie: string }> => {
    const church = await createMinistryWithAdmin(`${name} ${unique().slice(0, 6)}`, undefined, { billedOutsideStripe: false })
    const customerId = `cus_${unique()}`
    await pool.query(
      `insert into ministry_billing (ministry_id, stripe_customer_id, livemode)
       values ($1, $2, false)
       on conflict (ministry_id) do update set stripe_customer_id = excluded.stripe_customer_id, livemode = false`,
      [church.id, customerId],
    )
    await pool.query(
      `insert into billing_event (ministry_id, stripe_event_id, stripe_event_type, stripe_event_at, recorded_at,
                                  livemode, stripe_customer_id, stripe_subscription_id, subscription_status)
       values ($1, $2, 'customer.subscription.updated', now(), now(), false, $3, $4, $5)`,
      [church.id, `evt_${unique()}`, customerId, `sub_${unique()}`, status],
    )
    return { ...church, cookie: (await signIn(church)).cookie }
  }

  const post = (path: string, cookie: string, fields: string[][] = [], referer?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
        ...(referer ? { referer } : {}),
      },
      body: new URLSearchParams(fields),
    })

  const read = async (path: string, cookie: string) => {
    const { response, html } = await getPage(path, cookie)
    return { response, html: unescaped(html) }
  }

  const THE_TABS_AND_PAGES = ['/overview', '/check-ins', '/suggested-pairs', '/follow-up', '/materials', '/roster', '/settings', '/intake-forms']

  describe('a church whose payment failed', () => {
    it('carries the banner on every page, and goes on working', async () => {
      const church = await aChurchThatIs('past_due', 'Past Due')

      for (const path of THE_TABS_AND_PAGES) {
        const { response, html } = await read(path, church.cookie)
        expect(response.status, path).toBe(200)
        expect(html, path).toContain("Your last payment didn't go through.")
        expect(html, path).toContain('Discipler keeps running while Stripe tries again.')
        expect(html, path).toContain('Update payment method')
        expect(html, path).not.toContain('read-only')
      }

      const saved = await post('/settings/save', church.cookie, [])
      expect(saved.headers.get('location') ?? '').toContain('/settings')
    })
  })

  describe('a church whose subscription ended', () => {
    it('reads every page under the banner, with no setup bar', async () => {
      const church = await aChurchThatIs('canceled', 'Ended')

      for (const path of THE_TABS_AND_PAGES) {
        const { response, html } = await read(path, church.cookie)
        expect(response.status, path).toBe(200)
        expect(html, path).toContain('Your subscription has ended.')
        expect(html, path).toContain('Check-ins have stopped and these pages are read-only. Everything is still here.')
        expect(html, path).toContain('href="/settings/billing/restart"')
        expect(html, path).toContain('main class="read-only"')
        expect(html, path).not.toContain('class="setup')
      }
    })

    it('changes nothing when pressed, and goes back to the page with the banner', async () => {
      const church = await aChurchThatIs('canceled', 'Ended Pressing')

      const response = await post(
        '/settings/save',
        church.cookie,
        [['name', 'A Name Nobody Chose']],
        `${baseUrl}/settings`,
      )

      expect(response.status).toBe(303)
      expect(new URL(response.headers.get('location')!, baseUrl).pathname).toBe('/settings')
      const { rows } = await pool.query<{ name: string }>(`select name from ministry where id = $1`, [church.id])
      expect(rows[0]?.name).toBe(church.name)
    })

    it('never sends a refused press to another site', async () => {
      const church = await aChurchThatIs('canceled', 'Ended Referer')

      const response = await post('/settings/save', church.cookie, [], 'https://elsewhere.example/phish')

      expect(new URL(response.headers.get('location')!, baseUrl).pathname).toBe('/overview')
      expect(response.headers.get('location')).not.toContain('elsewhere')
    })

    it('still lets an Admin sign out', async () => {
      const church = await aChurchThatIs('canceled', 'Ended Leaving')

      const response = await post('/auth/sign-out', church.cookie)

      expect(new URL(response.headers.get('location') ?? '/', baseUrl).pathname).toBe('/login')
    })

    it('offers the way back from Billing and the restart page, and the card stays pressable', async () => {
      const church = await aChurchThatIs('canceled', 'Ended Restarting')

      const settings = await read('/settings', church.cookie)
      expect(settings.html).toContain('bill-card')
      expect(settings.html).toContain('Open billing')

      const billing = await read('/settings/billing', church.cookie)
      expect(billing.response.status).toBe(200)
      expect(billing.html).toContain("'s plan with Discipler. Any Admin can change it.")
      expect(billing.html).not.toContain('main class="read-only"')

      const restart = await read('/settings/billing/restart', church.cookie)
      expect(restart.response.status).toBe(200)
      expect(restart.html).toContain('Restart Discipler')
      expect(restart.html).toContain('Your people, relationships and history are all still here.')
      expect(restart.html).toContain('How would you like to pay?')
      expect(restart.html.replaceAll('<!-- -->', '')).toContain('$931.20 a year')
      expect(restart.html).toContain('$1,164')
      expect(restart.html).toContain("You'll be charged today. You can change or cancel any time in Settings, Billing.")
    })

    it('leaves the links people were already sent working, keeps what they send, and texts nobody', async () => {
      const church = await aChurchThatIs('canceled', 'Ended Intake')

      // One group for the link to offer, as `completing-intake-over-http` has it.
      const leader = await addPerson(church, 'Ruth Adeyemi', { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
      const acceptedAt = new Date('2026-03-02T09:00:00Z')
      const { rows: groups } = await pool.query<{ id: string }>(
        `insert into relationship (ministry_id, kind, accepted_at, name, declared_gender)
         values ($1, 'group', $2, 'Tuesday Group', 'female') returning id`,
        [church.id, acceptedAt],
      )
      const groupId = groups[0]!.id
      await openMaterialHistory(church, groupId, acceptedAt)
      await addMembership({ ministry: church, relationshipId: groupId, kind: 'group', personId: leader, role: 'leader' })

      const form = await fetch(`${baseUrl}/intake/${church.id}`, { redirect: 'manual' })
      expect(form.status).toBe(200)

      const body = new URLSearchParams({
        fullName: 'Hannah Reeves',
        phone: aTestPhoneNumber(),
        email: 'hannah@example.test',
        ageBand: '35-44',
        gender: 'female',
        groupId,
        smsConsent: 'yes',
        contactSharing: 'granted',
        via: 'qr',
      })
      body.append('availability', 'wednesday:18')
      const submitted = await fetch(`${baseUrl}/intake/${church.id}/submit`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      })
      expect(submitted.status).toBe(303)
      expect(submitted.headers.get('location')).toContain('/done')

      const kept = await pool.query(`select 1 from person where ministry_id = $1 and full_name = 'Hannah Reeves'`, [church.id])
      expect(kept.rows).toHaveLength(1)
      const texted = await pool.query(
        `select 1 from outbound_message where ministry_id = $1 and sent_at is not null`,
        [church.id],
      )
      expect(texted.rows).toEqual([])
    })
  })

  describe('a church billed outside Stripe', () => {
    it('sees no card, no page and no banner', async () => {
      const church = await createMinistryWithAdmin(`By Hand ${unique().slice(0, 6)}`)
      const { cookie } = await signIn(church)

      const settings = await read('/settings', cookie)
      expect(settings.response.status).toBe(200)
      expect(settings.html).not.toContain('bill-card')
      expect(settings.html).not.toContain('Open billing')
      expect(settings.html).not.toContain('bill-banner')

      const page = await read('/settings/billing', cookie)
      expect(page.response.status).toBe(307)
      expect(page.response.headers.get('location')).toContain('/settings')

      const restart = await read('/settings/billing/restart', cookie)
      expect(restart.response.status).toBe(307)
    })

    it('opens nothing at Stripe', async () => {
      const church = await createMinistryWithAdmin(`By Hand Pressing ${unique().slice(0, 6)}`)
      const { cookie } = await signIn(church)

      const response = await post('/settings/billing/open', cookie, [['step', 'cancel']])

      expect(new URL(response.headers.get('location')!, baseUrl).pathname).toBe('/settings')
    })
  })

  describe('a church on a live subscription', () => {
    it('sees the Billing card first in Settings, and no banner', async () => {
      const church = await aChurchThatIs('active', 'Paying')

      const { html } = await read('/settings', church.cookie)
      expect(html).not.toContain('bill-banner')
      expect(html.indexOf('bill-card')).toBeGreaterThan(-1)
      expect(html.indexOf('bill-card')).toBeLessThan(html.indexOf('id="ministry"'))
      expect(html).toContain('href="/settings/billing"')
    })

    it('has nothing to restart', async () => {
      const church = await aChurchThatIs('active', 'Paying Restart')

      const { response } = await read('/settings/billing/restart', church.cookie)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/settings/billing')
    })

    it('says so on Billing when Stripe cannot be reached, and on the press too', async () => {
      const church = await aChurchThatIs('active', 'Paying No Stripe')

      const { response, html } = await read('/settings/billing', church.cookie)
      expect(response.status).toBe(200)
      expect(html).toContain("We couldn't load your plan from Stripe just now.")

      const pressed = await post('/settings/billing/open', church.cookie, [['step', 'update']])
      expect(pressed.headers.get('location')).toContain('stripe=unreachable')
    })
  })

  it('sends somebody signed out to sign in', async () => {
    const page = await fetch(`${baseUrl}/settings/billing`, { redirect: 'manual' })
    expect(page.headers.get('location')).toContain('/login')

    const pressed = await post('/settings/billing/open', '', [['step', 'update']])
    expect(pressed.headers.get('location')).toContain('/login')
  })

  it('answers the waiting page with whether the church has access and nothing more', async () => {
    const ended = await aChurchThatIs('canceled', 'Ended Asking')
    const paying = await aChurchThatIs('active', 'Paying Asking')

    const answer = async (cookie: string) =>
      (await fetch(`${baseUrl}/settings/billing/access`, { headers: { cookie } })).json()

    expect(await answer(ended.cookie)).toEqual({ hasAccess: false })
    expect(await answer(paying.cookie)).toEqual({ hasAccess: true })
    expect(await answer('')).toEqual({ hasAccess: false })
  })
})
