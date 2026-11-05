import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs, signUpOpenUrl, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Refer page and "Get a new link" (Exponential launch, ticket 32) on a real server,
 * as an Admin reaches them from the header.
 */

const SEPARATE = /<!-- -->/g

describe.skipIf(skipUnlessAppIsRunning)('the Refer page', () => {
  let pool: pg.Pool
  let ministry: MinistryFixture
  let cookie: string

  const liveCode = async () => {
    const { rows } = await pool.query<{ code: string }>(
      `select code from referral_code where ministry_id = $1 and retired_at is null`,
      [ministry.id],
    )
    return rows[0]!.code
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    ministry = await createMinistryWithAdmin('Riverside Chapel', 'Grace Adeyemi')
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  it('is what the header\'s button opens, in the mock-up\'s words and order, with the church\'s link', async () => {
    const { html: overview } = await getPage('/overview', cookie, signUpOpenUrl)
    expect(overview).toContain('href="/refer"')

    const { response, html } = await getPage('/refer', cookie, signUpOpenUrl)
    expect(response.status).toBe(200)

    const words = html.replace(SEPARATE, '')
    const order = [
      'Know a church that would love Discipler? Share your link.',
      'Give a month free.',
      'Get a month free.',
      'Their first paid month is free, and after their first paid bill, you get a month free too.',
      'Send your link to another church, by text or email.',
      'They sign up, get 30 days free, then their first paid month free.',
      '30 days after their first paid bill, a month free is taken off your next bill.',
      'Your link',
      'Copy puts a short note and your link on your clipboard, ready to paste into a text or email.',
      'Get a new link',
      'Your month free waits 30 days after their first payment, and is taken back if that payment is refunded. It shows on Billing when it is applied.',
    ]
    const main = words.slice(words.indexOf('<main'))
    const where = order.map((line) => main.indexOf(line))
    expect(where.every((at) => at !== -1), JSON.stringify(where)).toBe(true)
    expect(where).toEqual([...where].sort((a, b) => a - b))

    expect(main).toContain(`/r/${await liveCode()}`)
    expect(main).not.toContain('<textarea')
    // Off the tab bar, so no tab is marked as the one it is on.
    expect(words.slice(0, words.indexOf('<main'))).not.toContain('aria-current="page"')
  })

  it('replaces the link at once for the page\'s script, and the old one stops being live', async () => {
    const old = await liveCode()

    const response = await fetch(`${signUpOpenUrl}/refer/new-link`, {
      method: 'POST',
      headers: { cookie, accept: 'application/json' },
    })

    expect(response.status).toBe(200)
    const made = await liveCode()
    expect(made).not.toBe(old)
    expect(((await response.json()) as { link: string }).link).toMatch(new RegExp(`/r/${made}$`))
    expect((await getPage('/refer', cookie, signUpOpenUrl)).html).toContain(`/r/${made}`)
  })

  it('works as a plain form with no script', async () => {
    const old = await liveCode()

    const response = await fetch(`${signUpOpenUrl}/refer/new-link`, {
      method: 'POST',
      headers: { cookie },
      redirect: 'manual',
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toMatch(/\/refer$/)
    expect(await liveCode()).not.toBe(old)
  })

  it('sends somebody signed out to sign in, and changes nothing', async () => {
    const before = await liveCode()

    const page = await fetch(`${signUpOpenUrl}/refer`, { redirect: 'manual' })
    const posted = await fetch(`${signUpOpenUrl}/refer/new-link`, {
      method: 'POST',
      headers: { accept: 'application/json' },
    })

    expect(page.headers.get('location') ?? '').toContain('/login')
    expect(posted.status).toBe(403)
    expect(await liveCode()).toBe(before)
  })

  it('offers a Leader nothing, and lets a Leader change nothing', async () => {
    const leader = await addPersonWithAccount(ministry, 'Sam Leader', 'leader')
    const session = await signInAs(leader)
    const before = await liveCode()

    const { html } = await getPage('/refer', session.cookie, signUpOpenUrl)
    const posted = await fetch(`${signUpOpenUrl}/refer/new-link`, {
      method: 'POST',
      headers: { cookie: session.cookie, accept: 'application/json' },
    })

    expect(html).toContain('not an Admin')
    expect(html).not.toContain('/r/')
    expect(posted.status).toBe(403)
    expect(await liveCode()).toBe(before)
  })

  it('opens sign-up from its link', async () => {
    const response = await fetch(`${signUpOpenUrl}/r/${await liveCode()}`, { redirect: 'manual' })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/signup')
  })

  describe('while sign-up is shut, as it is on production until launch', () => {
    it('offers nobody a link that would answer 404', async () => {
      const code = await liveCode()

      const { html: overview } = await getPage('/overview', cookie)
      expect(overview).toContain('/settings')
      expect(overview).not.toContain('href="/refer"')

      expect((await getPage('/refer', cookie)).response.status).toBe(404)
      expect((await fetch(`${baseUrl}/r/${code}`, { redirect: 'manual' })).status).toBe(404)
    })

    it('makes no new link', async () => {
      const before = await liveCode()

      const response = await fetch(`${baseUrl}/refer/new-link`, {
        method: 'POST',
        headers: { cookie, accept: 'application/json' },
      })

      expect(response.status).toBe(404)
      expect(await liveCode()).toBe(before)
    })
  })
})
