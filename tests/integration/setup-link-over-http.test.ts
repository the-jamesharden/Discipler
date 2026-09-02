import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createSupabaseMinistrySetup,
  type SupabaseMinistrySetup,
} from '~/platform/supabase/ministry-setup'
import { baseUrl, getPage, signInAs, skipUnlessAppIsRunning } from '../support/app'
import { aTestPhoneNumber, localSupabase, publishSupabaseCredentials } from '../support/local-supabase'

/**
 * The Ministry Setup Link driven the way a pastor does it: open the link, read
 * which church and which number, type a name and a password, then sign in. Over
 * HTTP against the running app, because this surface is reached by somebody with
 * no account, no session and no Ministry, and nothing else can say whether they
 * could get to it.
 */
describe.skipIf(skipUnlessAppIsRunning)('a pastor opening their Ministry Setup Link', () => {
  let setup: SupabaseMinistrySetup
  let pool: pg.Pool

  beforeAll(() => {
    publishSupabaseCredentials()
    setup = createSupabaseMinistrySetup(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await setup.close()
    await pool.end()
  })

  const aLink = (name: string) =>
    setup.issue({ ministryName: name, sendingNumber: aTestPhoneNumber(), adminPhone: aTestPhoneNumber() })

  const open = async (token: string) => {
    const response = await fetch(`${baseUrl}/setup/${token}`, { redirect: 'manual' })
    return { response, html: await response.text() }
  }

  const post = async (token: string, body: Record<string, string>) => {
    const response = await fetch(`${baseUrl}/setup/${token}/open`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  it('names the church and the number before it asks for anything, with no session', async () => {
    const link = await aLink('Anthem Church')

    const { response, html } = await open(link.token)

    expect(response.status).toBe(200)
    expect(html).toContain('Set up Discipler for Anthem Church')
    expect(html).toContain(link.adminPhone)
    // Nowhere to type a number: a forwarded link cannot open a Ministry on a
    // stranger's phone.
    expect(html).not.toContain('name="phone"')
    expect(html.indexOf(link.adminPhone)).toBeLessThan(html.indexOf('name="password"'))
  })

  it('is a 404 for a token that names nothing, and says nothing about any church', async () => {
    const { response, html } = await open(crypto.randomUUID())
    expect(response.status).toBe(404)
    expect(html).not.toContain('Set up Discipler for')
  })

  it('opens the Ministry on a name and a password, and the Admin can sign in with them', async () => {
    const link = await aLink('Riverside Chapel')

    const { response, location } = await post(link.token, {
      fullName: 'Grace Adeyemi',
      password: 'a-long-enough-password',
    })
    expect(response.status).toBe(303)
    expect(location).toContain(`/setup/${link.token}?done=opened`)

    // Told in the present tense, with the way in.
    const done = await fetch(`${baseUrl}${new URL(location).pathname}${new URL(location).search}`)
    const html = await done.text()
    expect(html).toContain('Riverside Chapel is set up')
    expect(html).toContain('href="/login"')

    // And the credential works: the phone from the link, the password they chose.
    const signedIn = await signInAs({ phone: link.adminPhone, password: 'a-long-enough-password' })
    expect(signedIn.response.status).toBe(303)
    const { html: roster } = await getPage('/roster', signedIn.cookie)
    expect(roster).toContain('Grace Adeyemi')
  })

  it('answers a spent link by sending its holder to sign in', async () => {
    const link = await aLink('Spent Chapel')
    await post(link.token, { fullName: 'First', password: 'a-long-enough-password' })

    // Not an error: the Ministry exists, and the page says so with the way in.
    const { html } = await open(link.token)
    expect(html).toContain('Spent Chapel is already set up')
    expect(html).toContain('href="/login"')
    expect(html).not.toContain('name="password"')

    const { location } = await post(link.token, { fullName: 'Second', password: 'another-long-password' })
    expect(location).toContain('error=setup.already_used')
  })

  it('refuses a short password on the page, and the link stays live', async () => {
    const link = await aLink('Shortpass Chapel')

    const { location } = await post(link.token, { fullName: 'Too Short', password: 'short' })
    expect(location).toContain('error=account.password_too_short')

    // Where the redirect sends them: the same link, with the reason on it.
    const { html } = await open(`${link.token}${new URL(location).search}`)
    expect(html).toContain('at least 8 characters')
    expect(html).toContain('name="password"')
  })

  it('reflects nothing typed into the query string back into the page', async () => {
    const link = await aLink('Careful Chapel')
    const { response, html } = await open(`${link.token}?error=__proto__`)
    expect(response.status).toBe(200)

    // What a person sees. Next's own payload at the foot of the document carries
    // the URL it rendered, query string included, and that is the framework
    // naming the route rather than the page rendering the code.
    const page = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    expect(page).toContain('isn’t one we recognise')
    expect(page).not.toContain('__proto__')
  })
})
