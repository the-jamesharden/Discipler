import { beforeAll, describe, expect, it } from 'vitest'
import { SECURITY_HEADERS } from '~/platform/security-headers'
import { baseUrl, signIn, skipUnlessAppIsRunning } from '../support/app'
import { createMinistryWithAdmin, type MinistryFixture } from '../support/local-supabase'
import { file, phoneNumbers } from '../support/roster'

/**
 * The headers on what a browser really receives (Exponential launch, ticket 37), against
 * the built server, because `next.config.ts` and `middleware.ts` only say what they mean
 * to send. A page whose scripts carry no nonce still returns 200, and is simply dead in a
 * browser, so that is asked of each page here. What a real browser then did with all of it
 * is in the ticket's Comments.
 */
describe.skipIf(skipUnlessAppIsRunning)('the security headers, over HTTP', () => {
  let ministry: MinistryFixture
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Headers Chapel')
    ;({ cookie } = await signIn(ministry))
  })

  const get = (path: string, withCookie?: string) =>
    fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: withCookie ? { cookie: withCookie } : {} })

  const policyOf = (response: Response): string => response.headers.get('content-security-policy') ?? ''
  const nonceOf = (response: Response): string | undefined => /'nonce-([^']+)'/.exec(policyOf(response))?.[1]

  const expectEveryHeader = (response: Response) => {
    for (const { key, value } of SECURITY_HEADERS) expect(response.headers.get(key), key).toBe(value)
    expect(policyOf(response)).toContain("frame-ancestors 'none'")
    expect(policyOf(response)).toContain('https://challenges.cloudflare.com')
  }

  /** Every `<script>` in the page: what would not run under this response's policy. */
  const scriptsThatWouldNotRun = (html: string, nonce: string | undefined): readonly string[] =>
    [...html.matchAll(/<script\b([^>]*)>/g)]
      .map((match) => match[1] ?? '')
      .filter((attributes) => {
        const external = /\bsrc="\//.test(attributes)
        return !external && !attributes.includes(`nonce="${nonce}"`)
      })

  it.each(['/login', '/login/forgot', '/help', '/help/getting-started', '/signup', '/no-such-page-at-all'])(
    '%s carries them all, and every script in it would run',
    async (path) => {
      const response = await get(path)
      expectEveryHeader(response)

      const html = await response.text()
      expect(html).toContain('<script')
      expect(scriptsThatWouldNotRun(html, nonceOf(response))).toEqual([])
    },
  )

  it.each(['/overview', '/roster', '/settings', '/intake-forms'])(
    '%s, signed in, carries them all, and every script in it would run',
    async (path) => {
      const response = await get(path, cookie)
      expect(response.status).toBe(200)
      expectEveryHeader(response)
      expect(scriptsThatWouldNotRun(await response.text(), nonceOf(response))).toEqual([])
    },
  )

  it('a public Intake form carries them too', async () => {
    const response = await get(`/intake/${ministry.id}`)
    expectEveryHeader(response)
    expect(scriptsThatWouldNotRun(await response.text(), nonceOf(response))).toEqual([])
  })

  // A 404 here, because sign-up is shut on this server. The redirect itself was followed in
  // a browser with sign-up open (the ticket's Comments), and it leaves through the same exit.
  it('a referral link carries them', async () => {
    expectEveryHeader(await get('/r/SOMECODE'))
  })

  it('a file from `public/` carries the plain headers', async () => {
    const response = await get('/discipler.css')
    expect(response.status).toBe(200)
    for (const { key, value } of SECURITY_HEADERS) expect(response.headers.get(key), key).toBe(value)
  })

  it('a script moved out of a page is served, as a script', async () => {
    for (const path of ['/scripts/goal-drag.js', '/scripts/form-editor-drag.js']) {
      const response = await get(path)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type'), path).toContain('javascript')
    }
  })

  it('gives each response a nonce of its own', async () => {
    expect(nonceOf(await get('/login'))).not.toBe(nonceOf(await get('/login')))
  })

  it('does not take a nonce from the request', async () => {
    const response = await fetch(`${baseUrl}/login`, {
      headers: { 'content-security-policy': "script-src 'nonce-chosenbyastranger'" },
    })
    expect(policyOf(response)).not.toContain('chosenbyastranger')
    expect(await response.text()).not.toContain('chosenbyastranger')
  })

  it('the Stripe webhook is a door on this server, for the signature to refuse', async () => {
    const response = await fetch(`${baseUrl}/stripe/webhook`, { method: 'POST', body: '{}' })
    expect(response.status).toBe(400)
  })

  describe('importing past a new church’s limit', () => {
    const number = phoneNumbers()

    it('comes back to the Roster with the plain sentence, in the dialog, and nothing added', async () => {
      const church = await createMinistryWithAdmin('Too Many, Too Soon')
      const { cookie: theirs } = await signIn(church)
      const rows = Array.from({ length: 301 }, (_, index) => `Person ${index},${number()}`)

      const response = await fetch(`${baseUrl}/roster/import`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie: theirs, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ mode: 'people_only', rows: file('Name,Phone', ...rows) }),
      })

      expect(response.status).toBe(303)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('error=new_church_limit')

      const roster = await (await get(`/roster?${location.split('?')[1]}`, theirs)).text()
      expect(roster).toContain('A new church can have up to 300 people on its Roster for its first 30 days')
      expect(roster).not.toContain('Person 0')
    })
  })
})
