import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asEmailAddress } from '~/domain/email'
import { PASSWORD_RESET_LINK_MINUTES } from '~/domain/launch-terms'
import { FAILED_SIGN_INS_ALLOWED } from '~/domain/sign-in-limit'
import {
  createPostgresPasswordResetLinks,
  type PostgresPasswordResetLinks,
} from '~/platform/supabase/password-reset-links'
import { baseUrl, getPage, signInAs, skipUnlessAppIsRunning } from '../support/app'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'
import { aNetworkAddress, anAddress } from '../support/sign-up-scenarios'

/**
 * "Forgot your password?" on a built server (Exponential launch, ticket 22). A local
 * server has no Turnstile secret, so nobody gets past the human check here, which is the
 * promise; a link is made through the same port the route uses, into the same table the
 * server reads. What Turnstile's yes does is `forgot-password.test.ts`.
 */

/** Each press is a bcrypt hash at Supabase Auth behind an HTTP round trip. */
const MANY_SIGN_INS_MS = 30_000

const NEW_PASSWORD = 'harbinger lantern copper fern'

describe.skipIf(skipUnlessAppIsRunning)('forgetting a password', { timeout: MANY_SIGN_INS_MS }, () => {
  let pool: pg.Pool
  let ministry: MinistryFixture
  let links: PostgresPasswordResetLinks
  const made: string[] = []

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    ministry = await createMinistryWithAdmin('Forgot Password Over Http')
    links = createPostgresPasswordResetLinks(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    for (const id of made) await serviceRoleClient().auth.admin.deleteUser(id).catch(() => undefined)
    await links.close()
    await pool.end()
  })

  const anAdmin = async () => {
    const admin = await addPersonWithAccount(ministry, `Forgetful ${randomUUID().slice(0, 6)}`, 'admin')
    made.push(admin.userId)
    const email = anAddress()
    const { error } = await serviceRoleClient().auth.admin.updateUserById(admin.userId, { email, email_confirm: true })
    if (error) throw error
    return { ...admin, email }
  }

  const aLink = async (email: string, at = new Date()) => {
    const link = await links.ask({ email: asEmailAddress(email)!, network: aNetworkAddress(), at })
    if (!link) throw new Error('No link was made.')
    return link.token
  }

  const save = (token: string, password: string) =>
    fetch(`${baseUrl}/login/forgot/${token}/save`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password }),
    })

  const goesTo = (response: Response) => {
    const location = new URL(response.headers.get('location') ?? '', baseUrl)
    return `${location.pathname}${location.search}`
  }

  const open = async (token: string) => {
    const { response, html } = await getPage(`/login/forgot/${token}`, '')
    expect(response.status).toBe(200)
    return html
  }

  const FORM_IS_THERE = 'Save new password'
  const LINK_IS_DEAD = 'This link has run out or has already been used.'

  describe('the way there', () => {
    // This server runs with sign-up shut, as production does. The link with it open is
    // in `tests/app/the-forgot-password-pages.test.ts`.
    it('is not offered on the sign-in page while sign-up is shut, and needs no session', async () => {
      const login = await getPage('/login', '')
      expect(login.html).not.toContain('Forgot your password?')

      const { response, html } = await getPage('/login/forgot', '')
      expect(response.status).toBe(200)
      expect(html).toContain('<title>Reset your password</title>')
      expect(html).toContain('Send me the link')
    })

    it('stops at Cloudflare, with no secret here, before anything is counted', async () => {
      const admin = await anAdmin()

      const response = await fetch(`${baseUrl}/login/forgot/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': aNetworkAddress() },
        body: new URLSearchParams({ email: admin.email, humanToken: 'anything' }),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ refusal: 'forgot.not_human' })
      const { rows } = await pool.query(`select 1 from password_reset_link where user_id = $1`, [admin.userId])
      expect(rows).toEqual([])
    })
  })

  describe('the link', () => {
    it('survives being opened twice, is spent by the press, and does not work again', async () => {
      const admin = await anAdmin()
      const token = await aLink(admin.email)

      expect(await open(token)).toContain(FORM_IS_THERE)
      expect(await open(token)).toContain('<title>Choose a new password</title>')

      const saved = await save(token, NEW_PASSWORD)
      expect(saved.status).toBe(303)
      expect(goesTo(saved)).toBe('/login?notice=password-changed')
      expect(saved.headers.getSetCookie()).toEqual([])

      const notice = await getPage(goesTo(saved), '')
      expect(notice.html).toContain('Your password has changed. Sign in with the new one.')

      const dead = await open(token)
      expect(dead).toContain(LINK_IS_DEAD)
      expect(dead).toContain('<title>This link has run out</title>')
      expect(dead).toContain('href="/login/forgot"')
      expect(goesTo(await save(token, `${NEW_PASSWORD} again`))).toBe(`/login/forgot/${token}`)
    })

    it('signs in by email and by phone with the new password, not the old, and ends the old session', async () => {
      const admin = await anAdmin()
      const { cookie } = await signInAs({ phone: admin.phone, password: admin.password })
      expect((await getPage('/overview', cookie)).response.status).toBe(200)

      await save(await aLink(admin.email), NEW_PASSWORD)

      const ended = await getPage('/overview', cookie)
      expect(ended.response.status).toBe(307)
      expect(ended.response.headers.get('location')).toContain('/login')

      const old = await signInAs({ login: admin.email, password: admin.password })
      expect(new URL(old.response.headers.get('location')!).searchParams.get('error')).toBe('no-such-account')

      for (const login of [admin.email, admin.phone]) {
        const signedIn = await signInAs({ login, password: NEW_PASSWORD })
        expect(new URL(signedIn.response.headers.get('location')!).pathname).toBe('/')
      }
    })

    it('runs out on time', async () => {
      const admin = await anAdmin()
      const longAgo = new Date(Date.now() - PASSWORD_RESET_LINK_MINUTES * 60_000 - 1000)
      const token = await aLink(admin.email, longAgo)

      expect(await open(token)).toContain(LINK_IS_DEAD)
      expect(goesTo(await save(token, NEW_PASSWORD))).toBe(`/login/forgot/${token}`)
      expect((await signInAs({ phone: admin.phone, password: admin.password })).cookie).not.toBe('')
    })

    it('stops working when a newer one is made', async () => {
      const admin = await anAdmin()
      const older = await aLink(admin.email)
      const newer = await aLink(admin.email)

      expect(await open(older)).toContain(LINK_IS_DEAD)
      expect(await open(newer)).toContain(FORM_IS_THERE)
    })

    it('refuses a common password on the page, and stays live', async () => {
      const admin = await anAdmin()
      const token = await aLink(admin.email)

      const refused = await save(token, 'password123')
      expect(goesTo(refused)).toBe(`/login/forgot/${token}?error=account.password_too_common`)

      const { html } = await getPage(goesTo(refused), '')
      expect(html).toContain('That password is one of the most common, so it is easy to guess. Choose another.')
      expect(html).toContain(FORM_IS_THERE)

      expect(goesTo(await save(token, NEW_PASSWORD))).toBe('/login?notice=password-changed')
    })

    it('reads something that was never a link as a dead one', async () => {
      expect(await open('a'.repeat(43))).toContain(LINK_IS_DEAD)
      expect(await open('not-a-token')).toContain(LINK_IS_DEAD)
    })
  })

  describe('somebody who locked themselves out by guessing', () => {
    it('gets straight back in after a reset', async () => {
      const admin = await anAdmin()
      for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
        await signInAs({ login: admin.email, password: `not-the-password-${i}` })
      }
      const held = await signInAs({ login: admin.email, password: admin.password })
      expect(new URL(held.response.headers.get('location')!).searchParams.get('error')).toBe('too-many-attempts')

      await save(await aLink(admin.email), NEW_PASSWORD)

      const back = await signInAs({ login: admin.email, password: NEW_PASSWORD })
      expect(new URL(back.response.headers.get('location')!).pathname).toBe('/')
    })
  })
})
