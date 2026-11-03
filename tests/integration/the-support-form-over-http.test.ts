import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SUPPORT_SUBMISSIONS } from '~/domain/launch-terms'
import {
  addPersonWithAccount,
  ACCOUNT_PASSWORD,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * The support form on a built server (Exponential launch, ticket 25): the Help menu's
 * row, the page, and the route with a real session. A local server has no Turnstile
 * secret and no mail key, so nobody signed out gets past the human check here, which is
 * the promise, and a signed-in Admin's send fails and leaves the row for the tick.
 * What Turnstile's yes does is `tests/integration/the-support-form-routes.test.ts`.
 */

const BROWSER = 'Mozilla/5.0 (Macintosh) Chrome/130.0 Discipler-test'

const send = (fields: Record<string, string>, cookie = '', network?: string) =>
  fetch(`${baseUrl}/help/contact/send`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': BROWSER,
      ...(cookie ? { cookie } : {}),
      ...(network ? { 'x-forwarded-for': network } : {}),
    },
    body: new URLSearchParams(fields),
  })

describe.skipIf(skipUnlessAppIsRunning)('the support form', () => {
  let pool: pg.Pool
  let ministry: MinistryFixture
  let cookie: string

  const rowsOf = async (who: MinistryFixture) =>
    (
      await pool.query<Record<string, unknown>>(
        `select * from support_submission where ministry_id = $1 order by submitted_at, id`,
        [who.id],
      )
    ).rows

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    ministry = await createMinistryWithAdmin('Riverside Chapel', 'Grace Adeyemi')
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  describe('the Help menu', () => {
    /** The address of the menu's Contact support row, unescaped. */
    const contactLink = (html: string) => {
      const start = html.indexOf('aria-label="Help and feedback"')
      const menu = html.slice(start, html.indexOf('</details>', start))
      const href = /<a [^>]*href="([^"]+)"[^>]*>(?:(?!<\/a>).)*Contact support/.exec(menu)?.[1]
      if (!href) throw new Error('The Help menu has no Contact support row')
      return decodeURIComponent(href.replaceAll('&amp;', '&'))
    }

    it('names the page it was opened on, with no query string', async () => {
      const { html } = await getPage('/roster?q=Grace', cookie)

      expect(contactLink(html)).toBe('/help/contact?from=/roster')
    })

    it('names a person’s page with no person on it', async () => {
      const { html } = await getPage(`/roster/${ministry.adminPersonId}`, cookie)

      expect(contactLink(html)).toBe('/help/contact?from=/roster/{id}')
      const start = html.indexOf('aria-label="Help and feedback"')
      expect(html.slice(start, html.indexOf('</details>', start))).not.toContain(ministry.adminPersonId)
    })

    it('opens a page with the top nav, the form and no human check', async () => {
      const { html, response } = await getPage('/help/contact?from=/roster', cookie)

      expect(response.status).toBe(200)
      expect(html).toContain('class="top-nav"')
      expect(html).toContain('name="message"')
      expect(html).toContain('name="email"')
      expect(html).toContain('value="/roster"')
      expect(html).not.toContain('human-check')
    })

    it('throws away a page address that is not one of Discipler’s', async () => {
      const { html, response } = await getPage(`/help/contact?from=${encodeURIComponent('https://example.com/a')}`, cookie)

      expect(response.status).toBe(200)
      // The form carries no address at all. Next's own payload repeats the request's URL.
      expect(html).toContain('name="message"')
      expect(html).not.toContain('name="page"')
    })
  })

  describe('a signed-in Admin', () => {
    it('sends a bug report from the Roster with its address and browser, and no names', async () => {
      const response = await send(
        {
          kind: 'bug',
          message: 'The page spins.',
          email: 'pastor@example.org',
          page: `/roster/${ministry.adminPersonId}?q=Grace+Adeyemi`,
        },
        cookie,
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ sent: true })

      const [row] = await rowsOf(ministry)
      expect(row).toMatchObject({
        submitted_by: ministry.adminUserId,
        kind: 'bug',
        message: 'The page spins.',
        reply_to: 'pastor@example.org',
        page_address: '/roster/{id}',
        browser: BROWSER,
        // No mail key on a local server, so this is the tick's to send.
        emailed_at: null,
      })
      const kept = JSON.stringify(row)
      expect(kept).not.toContain('Grace')
      expect(kept).not.toContain('Adeyemi')
      expect(kept).not.toContain(ministry.adminPersonId)
    })

    it('keeps no address or browser on a request for help', async () => {
      const chapel = await createMinistryWithAdmin('The Chapel That Asks')
      const { cookie: theirs } = await signIn(chapel)

      await send({ kind: 'support', message: 'Help.', email: 'a@example.org', page: '/roster' }, theirs)

      expect((await rowsOf(chapel))[0]).toMatchObject({ page_address: null, browser: null })
    })

    it('takes the church from the session and not the form', async () => {
      const elsewhere = await createMinistryWithAdmin('The Chapel Somebody Named')
      const chapel = await createMinistryWithAdmin('The Chapel That Sent It')
      const { cookie: theirs } = await signIn(chapel)

      await send(
        { kind: 'support', message: 'Help.', email: 'a@example.org', ministryId: elsewhere.id, ministry_id: elsewhere.id },
        theirs,
      )

      expect(await rowsOf(chapel)).toHaveLength(1)
      expect(await rowsOf(elsewhere)).toHaveLength(0)
    })

    it('is limited to a few an hour', async () => {
      const chapel = await createMinistryWithAdmin('The Chapel That Writes')
      const { cookie: theirs } = await signIn(chapel)
      const one = { kind: 'feature', message: 'Please add this.', email: 'a@example.org' }

      for (let sent = 0; sent < SUPPORT_SUBMISSIONS.perAdminPerHour; sent += 1) {
        expect((await send(one, theirs)).status).toBe(200)
      }

      const refused = await send(one, theirs)
      expect(refused.status).toBe(429)
      expect(await refused.json()).toMatchObject({ refusal: 'support.too_many' })
      expect(await rowsOf(chapel)).toHaveLength(SUPPORT_SUBMISSIONS.perAdminPerHour)
    })

    it('is told what is wrong with what was typed, with nothing kept', async () => {
      const chapel = await createMinistryWithAdmin('The Chapel That Mistyped')
      const { cookie: theirs } = await signIn(chapel)

      const refused = await send({ kind: 'bug', message: 'Help.', email: 'not an address' }, theirs)

      expect(refused.status).toBe(422)
      expect(await refused.json()).toEqual({
        refusal: 'support.bad_email',
        message: 'Please check your email address, so we can write back.',
      })
      expect(await rowsOf(chapel)).toEqual([])
    })
  })

  describe('somebody not signed in', () => {
    const countSignedOut = async () =>
      (await pool.query<{ n: number }>(`select count(*)::int as n from signed_out_support_submission`)).rows[0]!.n

    it('is refused and nothing is kept, because no token has passed', async () => {
      const before = await countSignedOut()

      const refused = await send({ kind: 'support', message: 'Help.', email: 'a@example.org', token: 'made-up' })

      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ refusal: 'support.not_human' })
      expect(await countSignedOut()).toBe(before)
    })

    it('finds a way to reach a person on a deployment with no Turnstile key, and no form that cannot work', async () => {
      const { html, response } = await getPage('/help/contact', '')

      expect(response.status).toBe(200)
      expect(html).not.toContain('class="top-nav"')
      expect(html).not.toContain('name="message"')
      expect(html).toContain('mailto:support@trydiscipler.com')
    })

    it('finds the form from the Help center’s “Still stuck?” line', async () => {
      const { html } = await getPage('/help', '')

      expect(html).toMatch(/href="\/help\/contact"[^>]*>Send us a message<\/a>/)
      expect(html).toContain('mailto:support@trydiscipler.com')
    })
  })

  describe('a Leader', () => {
    it('counts as signed out: the Account menu, the human check, and no row with a church', async () => {
      const leader = await addPersonWithAccount(ministry, 'Paul Leader', 'leader')
      const { cookie: theirs } = await signInAs({ phone: leader.phone, password: ACCOUNT_PASSWORD })
      const before = (await rowsOf(ministry)).length

      const { html } = await getPage('/help/contact', theirs)
      expect(html).toContain('class="account"')
      expect(html).not.toContain('class="top-nav"')

      const refused = await send({ kind: 'support', message: 'Help.', email: 'a@example.org' }, theirs)
      expect(refused.status).toBe(403)
      expect(await rowsOf(ministry)).toHaveLength(before)
    })
  })
})
