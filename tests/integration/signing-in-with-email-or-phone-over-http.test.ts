import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FAILED_SIGN_INS_ALLOWED } from '~/domain/sign-in-limit'
import { aNetwork, baseUrl, cookiesFrom, getPage, signInAs, skipUnlessAppIsRunning } from '../support/app'
import {
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * One box, "Email or phone", through the product's own front door (Exponential launch,
 * ticket 21; ADR-0030). Everybody in production today signs in by phone, so most of
 * what is here is that nothing they do has changed, and the rest is that the email
 * door opens only for an account that holds the address, and shares one guessing limit
 * with the phone.
 *
 * Setup Link Admins and Invitation Link Leaders signing in are in their own suites,
 * `setup-link-over-http.test.ts` and `invitation-over-http.test.ts`, through the same
 * form field. Each test here names its networks, as Vercel would.
 */

/** Each try is a bcrypt comparison at Supabase Auth behind an HTTP round trip. */
const MANY_SIGN_INS_MS = 30_000

const anAddress = () => `pastor.${randomUUID().slice(0, 8)}@grace.example`

describe.skipIf(skipUnlessAppIsRunning)('signing in with email or phone', { timeout: MANY_SIGN_INS_MS }, () => {
  let ministry: MinistryFixture
  const made: string[] = []

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Email Or Phone Chapel')
  })

  afterAll(async () => {
    for (const id of made) await serviceRoleClient().auth.admin.deleteUser(id).catch(() => undefined)
  })

  /**
   * An Admin in the shape sign-up leaves one: an Admin's account holding their phone
   * and a confirmed address in lower case, which `setting-up-your-account.test.ts`
   * proves of the real opening.
   */
  const anAdminWithAnEmail = async () => {
    const admin = await addPersonWithAccount(ministry, `Signed Up ${randomUUID().slice(0, 6)}`, 'admin', {
      phone: aTestPhoneNumber(),
    })
    const email = anAddress()
    const { error } = await serviceRoleClient().auth.admin.updateUserById(admin.userId, {
      email,
      email_confirm: true,
    })
    if (error) throw error
    return { ...admin, email }
  }

  const errorOf = (response: Response) =>
    new URL(response.headers.get('location') ?? '', baseUrl).searchParams.get('error')

  const reachesTheOverview = async (cookie: string) => {
    const { response } = await getPage('/', cookie)
    expect(response.headers.get('location')).toContain('/overview')
    const overview = await getPage('/overview', cookie)
    expect(overview.response.status).toBe(200)
  }

  const wrongTenTimes = async (login: string) => {
    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
      const { response } = await signInAs({ login, password: `not-the-password-${i}` })
      expect(errorOf(response)).toBe('no-such-account')
    }
  }

  describe('an Admin who signed up with an email', () => {
    it('signs in with their email, and reaches their Overview', async () => {
      const admin = await anAdminWithAnEmail()
      const { response, cookie } = await signInAs({ login: admin.email, password: admin.password })

      expect(errorOf(response)).toBeNull()
      expect(response.status).toBe(303)
      expect(new URL(response.headers.get('location')!).pathname).toBe('/')
      await reachesTheOverview(cookie)
    })

    it('signs in with it in any capitals, and with spaces round it', async () => {
      const admin = await anAdminWithAnEmail()

      for (const login of [admin.email.toUpperCase(), `  ${admin.email}  `]) {
        const { response, cookie } = await signInAs({ login, password: admin.password })
        expect(errorOf(response)).toBeNull()
        expect(cookie).not.toBe('')
      }
    })

    it('signs in separately with their phone, however it is typed', async () => {
      const admin = await anAdminWithAnEmail()
      const typed = admin.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
      expect(typed).not.toBe(admin.phone)

      for (const login of [admin.phone, typed]) {
        const { response, cookie } = await signInAs({ login, password: admin.password })
        expect(errorOf(response)).toBeNull()
        await reachesTheOverview(cookie)
      }
    })

    it('can change their password, and the new one works through both', async () => {
      const admin = await anAdminWithAnEmail()
      const { cookie } = await signInAs({ login: admin.email, password: admin.password })
      const fresh = 'harbinger-lantern-copper-fern'

      const changed = await fetch(`${baseUrl}/account/change`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': aNetwork(),
        },
        body: new URLSearchParams({
          currentPassword: admin.password,
          newPassword: fresh,
          newPasswordAgain: fresh,
        }),
      })
      expect(changed.headers.get('location')).toContain('/login?notice=password-changed')

      // The session it held ended with the old password, as every change does.
      const { response: held } = await getPage('/overview', cookie)
      expect(held.status).toBe(307)

      for (const login of [admin.email, admin.phone]) {
        const old = await signInAs({ login, password: admin.password })
        expect(errorOf(old.response)).toBe('no-such-account')

        const { response } = await signInAs({ login, password: fresh })
        expect(errorOf(response)).toBeNull()
      }
    })
  })

  describe('somebody with no email', () => {
    it('is a Leader, and signs in by phone as before', async () => {
      const leader = await addPersonWithAccount(ministry, 'Lena Phone', 'leader', { phone: aTestPhoneNumber() })
      const { response, cookie } = await signInAs({ phone: leader.phone, password: leader.password })

      expect(errorOf(response)).toBeNull()
      expect((await getPage('/relationships', cookie)).response.status).toBe(200)
    })

    it('is an Admin, and signs in by phone as before', async () => {
      const { response, cookie } = await signInAs({
        phone: ministry.adminPhone,
        password: ministry.adminPassword,
      })

      expect(errorOf(response)).toBeNull()
      await reachesTheOverview(cookie)
    })

    it('is not let in by an address on their Person, which proves nothing', async () => {
      // An address given at Intake is a contact detail a pastor reads. It is not on
      // the account, so it opens nothing.
      const email = anAddress()
      const leader = await addPersonWithAccount(ministry, 'Ola Intake', 'leader', { phone: aTestPhoneNumber() })
      const { error } = await serviceRoleClient().from('person').update({ email }).eq('id', leader.personId)
      if (error) throw error

      const { response, cookie } = await signInAs({ login: email, password: leader.password })

      expect(errorOf(response)).toBe('no-such-account')
      expect(cookie).toBe('')
    })
  })

  it('lets in an account holding an address and no phone, and it can change its password', async () => {
    // The shape of an account minted by hand, before accounts held phones. Nothing
    // makes one now, and before ADR-0030 the door kept one out. It is here so that
    // nothing on the way in assumes a phone.
    const email = anAddress()
    const password = 'a-long-enough-password'
    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    made.push(data.user.id)

    const { response, cookie } = await signInAs({ login: email, password })
    expect(errorOf(response)).toBeNull()
    expect(cookie).not.toBe('')

    const fresh = 'harbinger-lantern-copper-fern'
    const changed = await fetch(`${baseUrl}/account/change`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': aNetwork() },
      body: new URLSearchParams({ currentPassword: password, newPassword: fresh, newPasswordAgain: fresh }),
    })
    expect(changed.headers.get('location')).toContain('/login?notice=password-changed')
  })

  describe('what a wrong entry is told', () => {
    it('is one code for an unknown email, an unknown phone and a wrong password by either', async () => {
      const admin = await anAdminWithAnEmail()
      const tries = [
        { login: anAddress(), password: admin.password },
        { login: aTestPhoneNumber(), password: admin.password },
        { login: admin.email, password: 'not-the-password' },
        { login: admin.phone, password: 'not-the-password' },
      ]

      for (const attempt of tries) {
        const { response, cookie } = await signInAs(attempt)
        expect(response.status).toBe(303)
        expect(errorOf(response)).toBe('no-such-account')
        expect(cookie).toBe('')
        expect(decodeURIComponent(response.headers.get('location')!)).not.toContain(attempt.login)
      }

      const page = await fetch(`${baseUrl}/login?error=no-such-account`)
      expect(await page.text()).toContain('That email or phone and password did not match.')
    })

    it.each(['pastor@', '@', '@grace', 'a b@c', 'a@b@c', 'x'.repeat(5000) + '@grace.example', 'a\0b@grace.example'])(
      'is that same code for something with an @ that is no address: %#',
      async (login) => {
        const { response, cookie } = await signInAs({ login, password: 'not-the-password' })

        expect(response.status).toBe(303)
        expect(errorOf(response)).toBe('no-such-account')
        expect(cookie).toBe('')
      },
    )

    it('is its own sentence for a typo with no @, which says nothing about any account', async () => {
      const { response } = await signInAs({ login: 'not a number', password: 'not-the-password' })
      expect(errorOf(response)).toBe('unreadable-phone')

      const page = await fetch(`${baseUrl}/login?error=unreadable-phone`)
      expect(await page.text()).toContain('That does not look like an email or a phone number. Include the area code.')
    })

    it('asks for both when either is missing', async () => {
      for (const attempt of [
        { login: '', password: 'a-password' },
        { login: '   ', password: 'a-password' },
        { login: 'pastor@grace.example', password: '' },
      ]) {
        const { response } = await signInAs(attempt)
        expect(errorOf(response)).toBe('missing-credentials')
      }

      const page = await fetch(`${baseUrl}/login?error=missing-credentials`)
      expect(await page.text()).toContain('Enter your email or phone and your password.')
    })

    it('asks again of a page loaded before the field was renamed, which holds its old name', async () => {
      // A tab left open across the deploy. Its one press lands on the new form.
      const response = await fetch(`${baseUrl}/auth/sign-in`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': aNetwork() },
        body: new URLSearchParams({ phone: ministry.adminPhone, password: ministry.adminPassword }),
      })

      expect(errorOf(response)).toBe('missing-credentials')
    })
  })

  describe('the one guessing limit', () => {
    it('holds back the phone after ten wrong passwords by email', async () => {
      const admin = await anAdminWithAnEmail()
      await wrongTenTimes(admin.email)

      const { response, cookie } = await signInAs({ phone: admin.phone, password: admin.password })
      expect(errorOf(response)).toBe('too-many-attempts')
      expect(cookie).toBe('')
    })

    it('holds back the email after ten wrong passwords by phone', async () => {
      const admin = await anAdminWithAnEmail()
      await wrongTenTimes(admin.phone)

      const { response, cookie } = await signInAs({ login: admin.email, password: admin.password })
      expect(errorOf(response)).toBe('too-many-attempts')
      expect(cookie).toBe('')
    })

    it('counts the two together, in any capitals', async () => {
      const admin = await anAdminWithAnEmail()
      for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
        const login = i % 2 === 0 ? admin.email.toUpperCase() : admin.phone
        const { response } = await signInAs({ login, password: `not-the-password-${i}` })
        expect(errorOf(response)).toBe('no-such-account')
      }

      const { response } = await signInAs({ login: admin.email, password: admin.password })
      expect(errorOf(response)).toBe('too-many-attempts')
    })

    it('holds back an email nobody holds in the same way', async () => {
      const email = anAddress()
      await wrongTenTimes(email)

      const { response } = await signInAs({ login: email, password: 'not-the-password' })
      expect(errorOf(response)).toBe('too-many-attempts')
    })

    it('holds a network back, whichever kind of entry it tries, and only that network', async () => {
      const network = aNetwork()
      for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
        const login = i % 2 === 0 ? anAddress() : aTestPhoneNumber()
        const { response } = await signInAs({ login, password: 'not-the-password' }, network)
        expect(errorOf(response)).toBe('no-such-account')
      }

      const admin = await anAdminWithAnEmail()
      const fromThere = await signInAs({ login: admin.email, password: admin.password }, network)
      expect(errorOf(fromThere.response)).toBe('too-many-attempts')

      const fromElsewhere = await signInAs({ login: admin.email, password: admin.password })
      expect(errorOf(fromElsewhere.response)).toBeNull()
    })

    it('does not count a right password as a failure', async () => {
      const admin = await anAdminWithAnEmail()
      for (let i = 0; i < FAILED_SIGN_INS_ALLOWED + 1; i++) {
        const { response } = await signInAs({ login: admin.email, password: admin.password })
        expect(errorOf(response)).toBeNull()
      }
    })
  })

  describe('the form a browser posts', () => {
    it('works with no JavaScript: the page names the route and the fields the route reads', async () => {
      const admin = await anAdminWithAnEmail()
      const page = await (await fetch(`${baseUrl}/login`)).text()

      expect(page).toContain('action="/auth/sign-in"')
      expect(page).toContain('method="post"')
      expect(page).toContain('name="login"')
      expect(page).toContain('name="password"')
      expect(page).not.toContain('name="phone"')

      const response = await fetch(`${baseUrl}/auth/sign-in`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': aNetwork() },
        body: `login=${encodeURIComponent(admin.email)}&password=${encodeURIComponent(admin.password)}`,
      })
      expect(response.status).toBe(303)
      expect(errorOf(response)).toBeNull()
      expect(cookiesFrom(response)).not.toBe('')
    })
  })
})
