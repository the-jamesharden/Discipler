import { beforeAll, describe, expect, it } from 'vitest'
import { FAILED_SIGN_INS_ALLOWED } from '~/domain/sign-in-limit'
import {
  aNetwork,
  baseUrl,
  getPage,
  signInAs,
  skipUnlessAppIsRunning,
} from '../support/app'
import {
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The sign-in guessing limit, through the product's own front door (Exponential
 * launch, ticket 13; Q34).
 *
 * Before it, nothing held a guesser back: on this machine Supabase Auth applies no
 * per-address limit to password sign-ins at all, and on Vercel the limit it does
 * apply counts the function's address, which every sign-in shares. Each test names
 * the networks it comes from, as Vercel would in `x-forwarded-for`.
 */

/**
 * Each test signs in a dozen times or more, and every one is a bcrypt comparison
 * at Supabase Auth behind an HTTP round trip, so the default five seconds is a
 * test of the machine's load rather than of the limit.
 */
const MANY_SIGN_INS_MS = 30_000

describe.skipIf(skipUnlessAppIsRunning)('the sign-in guessing limit', { timeout: MANY_SIGN_INS_MS }, () => {
  let ministry: MinistryFixture

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Guessing Limit Chapel')
  })

  const errorOf = (response: Response) =>
    new URL(response.headers.get('location') ?? '', baseUrl).searchParams.get('error')

  const wrongTenTimes = async (phone: string, network: () => string) => {
    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
      const { response } = await signInAs({ phone, password: `not-the-password-${i}` }, network())
      expect(errorOf(response)).toBe('no-such-account')
    }
  }

  it('refuses the eleventh try on an account before Supabase is asked, even with the right password', async () => {
    const leader = await addPersonWithAccount(ministry, 'Ada Guessed', 'leader')
    const network = aNetwork()
    await wrongTenTimes(leader.phone, () => network)

    // The right password, and still refused: the only way that happens is that
    // Supabase Auth was never asked.
    const { response, cookie } = await signInAs(
      { phone: leader.phone, password: leader.password },
      network,
    )

    expect(errorOf(response)).toBe('too-many-attempts')
    expect(cookie).toBe('')
  })

  it('holds the account back from every network, not only the guessing one', async () => {
    const leader = await addPersonWithAccount(ministry, 'Ben Spread', 'leader')
    await wrongTenTimes(leader.phone, aNetwork)

    const { response } = await signInAs({ phone: leader.phone, password: leader.password })

    expect(errorOf(response)).toBe('too-many-attempts')
  })

  it('holds a network back across accounts, and leaves everybody else alone', async () => {
    const network = aNetwork()
    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
      const { response } = await signInAs(
        { phone: aTestPhoneNumber(), password: 'not-the-password' },
        network,
      )
      expect(errorOf(response)).toBe('no-such-account')
    }

    const fromThere = await signInAs(
      { phone: ministry.adminPhone, password: ministry.adminPassword },
      network,
    )
    expect(errorOf(fromThere.response)).toBe('too-many-attempts')

    const fromElsewhere = await signInAs({
      phone: ministry.adminPhone,
      password: ministry.adminPassword,
    })
    expect(fromElsewhere.cookie).not.toBe('')
  })

  it('counts a number typed two ways as one account', async () => {
    const leader = await addPersonWithAccount(ministry, 'Cara Typed', 'leader')
    const asTyped = leader.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    expect(asTyped).not.toBe(leader.phone)

    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
      await signInAs({ phone: i % 2 ? asTyped : leader.phone, password: 'not-the-password' })
    }

    const { response } = await signInAs({ phone: asTyped, password: leader.password })
    expect(errorOf(response)).toBe('too-many-attempts')
  })

  it('says the same thing whether or not anybody holds the number', async () => {
    const leader = await addPersonWithAccount(ministry, 'Dan Held', 'leader')
    const nobody = aTestPhoneNumber()
    await wrongTenTimes(leader.phone, aNetwork)
    await wrongTenTimes(nobody, aNetwork)

    const held = await signInAs({ phone: leader.phone, password: 'one-more-guess' })
    const unheld = await signInAs({ phone: nobody, password: 'one-more-guess' })

    expect(held.response.headers.get('location')).toBe(unheld.response.headers.get('location'))

    const { html } = await getPage(`/login?error=${errorOf(held.response)}`, '')
    expect(html).toContain('Too many tries. Wait 15 minutes, then try again.')
    expect(html).not.toContain(leader.phone)
  })

  it('never counts a right password, however many times it is typed', async () => {
    const network = aNetwork()
    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED + 2; i++) {
      const { cookie } = await signInAs(
        { phone: ministry.adminPhone, password: ministry.adminPassword },
        network,
      )
      expect(cookie).not.toBe('')
    }
  })

  it('holds the change-your-password form to the same limit', async () => {
    const leader = await addPersonWithAccount(ministry, 'Eve Changes', 'leader')
    const { cookie } = await signInAs({ phone: leader.phone, password: leader.password })

    const change = async (currentPassword: string) => {
      const response = await fetch(`${baseUrl}/account/change`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': aNetwork(),
        },
        body: new URLSearchParams({
          currentPassword,
          newPassword: 'harbinger-lantern-copper-fern',
          newPasswordAgain: 'harbinger-lantern-copper-fern',
        }),
      })
      return new URL(response.headers.get('location') ?? '', baseUrl).searchParams.get('error')
    }

    for (let i = 0; i < FAILED_SIGN_INS_ALLOWED; i++) {
      expect(await change(`not-their-password-${i}`)).toBe('account.current_password_wrong')
    }

    // The right current password, refused: the platform was not asked.
    expect(await change(leader.password)).toBe('account.too_many_attempts')

    const { html } = await getPage('/account?error=account.too_many_attempts', cookie)
    expect(html).toContain('Too many tries. Wait 15 minutes, then try again.')
  })
})
