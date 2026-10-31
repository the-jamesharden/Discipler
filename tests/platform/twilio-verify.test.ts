import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PhoneCode } from '~/domain/phone-check'
import { phoneNumber } from '~/domain/roster'
import { createTwilioVerifier, PhoneVerifierFailed } from '~/platform/twilio/phone-verifier'

/**
 * The Twilio Verify boundary (Exponential launch, ticket 09), driven against a
 * stubbed `fetch` the way `twilio-transport.test.ts` drives the message transport.
 * There is no Twilio account in a test run: what is checked is the request
 * Discipler makes and what it makes of each answer.
 */

const settings = { accountSid: 'AC-test-sid', authToken: 'super-secret-token', serviceSid: 'VA-test-service' }
const verifier = createTwilioVerifier(() => settings)
const phone = phoneNumber('+13185550142')
const code = '482913' as PhoneCode

const respondWith = (status: number, payload: unknown = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

const requestOf = (fetched: ReturnType<typeof respondWith>) => {
  const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
  return { url, init, body: new URLSearchParams(init.body as URLSearchParams) }
}

afterEach(() => vi.restoreAllMocks())

describe('asking Twilio Verify to text a code', () => {
  it('starts an SMS verification on the Discipler service', async () => {
    const fetched = respondWith(201, { sid: 'VE123', status: 'pending' })

    expect(await verifier.sendCode(phone)).toEqual({ sent: 'VE123' })

    const { url, init, body } = requestOf(fetched)
    expect(url).toBe('https://verify.twilio.com/v2/Services/VA-test-service/Verifications')
    expect(init.method).toBe('POST')
    expect(body.get('To')).toBe('+13185550142')
    expect(body.get('Channel')).toBe('sms')
  })

  it('authenticates as the account rather than putting the token in the URL', async () => {
    const fetched = respondWith(201, { sid: 'VE123' })

    await verifier.sendCode(phone)

    const { url, init } = requestOf(fetched)
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('AC-test-sid:super-secret-token').toString('base64')}`,
    )
    expect(url).not.toContain('super-secret-token')
  })

  it('reads a refusal of the number’s country as the service’s permissions', async () => {
    respondWith(403, { code: 60605, message: 'Verification delivery attempt blocked' })

    expect(await verifier.sendCode(phone)).toEqual({ refused: 'outside_permitted_countries' })
  })

  it('reads a landline or an invalid number as undeliverable', async () => {
    respondWith(400, { code: 60205, message: 'SMS is not supported by landline phone number' })
    expect(await verifier.sendCode(phone)).toEqual({ refused: 'undeliverable' })

    vi.restoreAllMocks()
    respondWith(400, { code: 60200, message: 'Invalid parameter `To`' })
    expect(await verifier.sendCode(phone)).toEqual({ refused: 'undeliverable' })
  })

  it('raises anything else with Twilio’s own reason', async () => {
    respondWith(429, { code: 60203, message: 'Max send attempts reached' })

    await expect(verifier.sendCode(phone)).rejects.toMatchObject({
      name: 'PhoneVerifierFailed',
      status: 429,
      code: 60203,
    })
  })

  it('keeps the status when the answer is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>502</html>', { status: 502 }))

    const error = (await verifier.sendCode(phone).catch((thrown: unknown) => thrown)) as PhoneVerifierFailed
    expect(error).toBeInstanceOf(PhoneVerifierFailed)
    expect(error.status).toBe(502)
    expect(error.code).toBeNull()
  })
})

describe('asking Twilio Verify to judge a code', () => {
  it('checks the code against the verification it was sent under', async () => {
    const fetched = respondWith(200, { status: 'approved', valid: true })

    expect(await verifier.checkCode('VE123', code)).toBe('approved')

    const { url, body } = requestOf(fetched)
    expect(url).toBe('https://verify.twilio.com/v2/Services/VA-test-service/VerificationCheck')
    expect(body.get('VerificationSid')).toBe('VE123')
    expect(body.get('Code')).toBe('482913')
  })

  it('reads a pending answer as a wrong code', async () => {
    respondWith(200, { status: 'pending', valid: false })

    expect(await verifier.checkCode('VE123', code)).toBe('wrong')
  })

  it('reads not found as a verification Twilio no longer holds', async () => {
    respondWith(404, { code: 20404, message: 'The requested resource was not found' })

    expect(await verifier.checkCode('VE123', code)).toBe('gone')
  })

  it('reads Twilio’s own check limit as the tries used up', async () => {
    respondWith(429, { code: 60202, message: 'Max check attempts reached' })

    expect(await verifier.checkCode('VE123', code)).toBe('tries_used_up')
  })

  it('raises anything else', async () => {
    respondWith(500, { message: 'Internal error' })

    await expect(verifier.checkCode('VE123', code)).rejects.toThrow(PhoneVerifierFailed)
  })
})

describe('canceling a verification', () => {
  it('sets its status to canceled', async () => {
    const fetched = respondWith(200, { sid: 'VE123', status: 'canceled' })

    await verifier.cancel('VE123')

    const { url, body } = requestOf(fetched)
    expect(url).toBe('https://verify.twilio.com/v2/Services/VA-test-service/Verifications/VE123')
    expect(body.get('Status')).toBe('canceled')
  })

  it('takes one already gone as canceled', async () => {
    respondWith(404, { code: 20404 })

    await expect(verifier.cancel('VE123')).resolves.toBeUndefined()
  })
})
