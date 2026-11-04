import { describe, expect, it } from 'vitest'
import { baseUrl, skipUnlessAppIsRunning } from '../support/app'

/**
 * A built server, started as production is today with `SIGN_UP_OPEN` unset, lets nobody
 * near sign-up (Exponential launch, tickets 11, 15 and 16; spec Q30). The privacy policy
 * and terms are not published yet, so nothing here may be able to send an email, and no
 * page may show a person that sign-up exists.
 */
describe.skipIf(skipUnlessAppIsRunning)('sign-up on a built server with the switch off', () => {
  it('is not offered on the sign-in page, which would be offering a 404', async () => {
    const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).not.toContain('Create an account')
    expect(html).not.toContain('new to Discipler?')
    expect(html).not.toContain('href="/signup"')
  })

  it.each(['human-check', 'send-code', 'resend-code', 'confirm-code', 'payment/open'])('answers 404 at %s', async (route) => {
    const response = await fetch(`${baseUrl}/signup/${route}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: 'a-token',
        email: 'pastor@grace.example',
        phone: '+12055550100',
        code: '123456',
        cycle: 'month',
      }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie().filter((cookie) => cookie.includes('signup'))).toEqual([])
  })

  it.each(['/signup', '/signup?code=EXPO26', '/signup?again=1', '/signup/email', '/signup/code', '/signup/account', '/signup/payment', '/signup/payment?redirect_status=succeeded'])(
    'answers 404 at the page %s, and the page says nothing about sign-up',
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
      const html = await response.text()

      expect(response.status).toBe(404)
      expect(response.headers.getSetCookie().filter((cookie) => cookie.includes('signup'))).toEqual([])
      for (const giveaway of [
        'Create an account',
        'Start your free trial',
        'Check your email',
        'Set up your account',
        'challenges.cloudflare.com',
        'Email me a code',
        'Add a card or bank account',
        'js.stripe.com',
      ]) {
        expect(html).not.toContain(giveaway)
      }
    },
  )

  it('answers 404 at the small read the payment step asks', async () => {
    const response = await fetch(`${baseUrl}/signup/payment/access`, { redirect: 'manual' })

    expect(response.status).toBe(404)
  })

  // Not behind the switch, because an email already sent has promised it. A link that is
  // not signed is still nothing at all, and says nothing about sign-up.
  it.each(['/signup/reminders-off', '/signup/reminders-off?t=nonsense'])('answers 404 at %s', async (path) => {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })

    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('send me reminders')
  })

  it('stops nothing for a token that is not signed', async () => {
    const response = await fetch(`${baseUrl}/signup/reminders-off/stop`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ t: `${crypto.randomUUID()}.${'0'.repeat(64)}` }),
    })

    expect(response.status).toBe(404)
  })
})
