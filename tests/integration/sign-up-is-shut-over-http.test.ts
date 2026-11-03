import { describe, expect, it } from 'vitest'
import { baseUrl, skipUnlessAppIsRunning } from '../support/app'

/**
 * A built server, started as production is today with `SIGN_UP_OPEN` unset, lets nobody
 * near sign-up (Exponential launch, tickets 11, 15 and 16; spec Q30). The privacy policy
 * and terms are not published yet, so nothing here may be able to send an email, and no
 * page may show a person that sign-up exists.
 */
describe.skipIf(skipUnlessAppIsRunning)('sign-up on a built server with the switch off', () => {
  it.each(['human-check', 'send-code', 'resend-code', 'confirm-code'])('answers 404 at %s', async (route) => {
    const response = await fetch(`${baseUrl}/signup/${route}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: 'a-token',
        email: 'pastor@grace.example',
        phone: '+12055550100',
        code: '123456',
      }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie().filter((cookie) => cookie.includes('signup'))).toEqual([])
  })

  it.each(['/signup', '/signup?code=EXPO26', '/signup?again=1', '/signup/email', '/signup/code', '/signup/account'])(
    'answers 404 at the page %s, and the page says nothing about sign-up',
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
      const html = await response.text()

      expect(response.status).toBe(404)
      expect(response.headers.getSetCookie().filter((cookie) => cookie.includes('signup'))).toEqual([])
      for (const giveaway of ['Create an account', 'Start your free trial', 'challenges.cloudflare.com', 'Email me a code']) {
        expect(html).not.toContain(giveaway)
      }
    },
  )
})
