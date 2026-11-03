import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTwilioBalanceReader, TwilioBalanceNotRead } from '~/platform/twilio/account-balance'

/**
 * Reading the balance, against a stubbed `fetch` (Exponential launch, ticket 08).
 * Every answer that is not a balance in dollars is a refusal to say, never a number:
 * zero from a bad answer would be a false alarm, and a high one would hide a real one.
 */

const credentials = { accountSid: 'AC-test-sid', authToken: 'super-secret-token' }
const reader = createTwilioBalanceReader(() => credentials)

const respondWith = (status: number, payload: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

afterEach(() => vi.restoreAllMocks())

describe('reading the Twilio balance', () => {
  it('asks the account for its balance with the account’s own credentials', async () => {
    const fetched = respondWith(200, {
      account_sid: 'AC-test-sid',
      balance: '70.00',
      currency: 'USD',
    })

    expect(await reader.readCents()).toBe(7000)

    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC-test-sid/Balance.json')
    expect(init.method ?? 'GET').toBe('GET')
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('AC-test-sid:super-secret-token').toString('base64')}`,
    )
  })

  it('gives up on an answer that never comes, so the tick is not held up', async () => {
    const fetched = respondWith(200, { balance: '70.00', currency: 'USD' })

    await reader.readCents()

    const [, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('reads a negative balance as the emergency it is', async () => {
    respondWith(200, { balance: '-1.50', currency: 'USD' })

    expect(await reader.readCents()).toBe(-150)
  })

  it.each([
    ['a refusal', 401, { message: 'Authenticate' }],
    ['a failure', 503, {}],
    ['no balance in the answer', 200, { currency: 'USD' }],
    ['a balance that is not a number', 200, { balance: 'unknown', currency: 'USD' }],
    ['an empty balance', 200, { balance: '', currency: 'USD' }],
    ['a null balance', 200, { balance: null, currency: 'USD' }],
    ['another currency', 200, { balance: '70.00', currency: 'CAD' }],
    ['no currency', 200, { balance: '70.00' }],
  ])('refuses to give a number for %s', async (_what, status, payload) => {
    respondWith(status, payload)

    await expect(reader.readCents()).rejects.toBeInstanceOf(TwilioBalanceNotRead)
  })

  it('refuses to give a number for an error page that is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 200 }))

    await expect(reader.readCents()).rejects.toBeInstanceOf(TwilioBalanceNotRead)
  })

  it('does not put the auth token in anything it throws', async () => {
    respondWith(401, { message: 'Authenticate' })

    const error = await reader.readCents().catch((thrown: unknown) => thrown as Error)
    expect(String((error as Error).message)).not.toContain('super-secret-token')
  })
})
