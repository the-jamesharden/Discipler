import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTwilioTransport,
  MessageNotDelivered,
} from '~/platform/twilio/message-transport'

/**
 * The vendor boundary, driven against a stubbed `fetch`. There is no Twilio account
 * in a test run and there must never be one: what this file is for is the shape of
 * the request Discipler makes and what it does with each answer, both of which are
 * ours and neither of which needs a network.
 */

const credentials = { accountSid: 'AC-test-sid', authToken: 'super-secret-token' }
const transport = createTwilioTransport(() => credentials)

const respondWith = (status: number, payload: unknown = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

afterEach(() => vi.restoreAllMocks())

describe('handing a message to the delivery vendor', () => {
  it('posts the Ministry’s own number as the sender', async () => {
    const fetched = respondWith(201, { sid: 'SM123' })

    await transport.deliver('+15550000001', '+15551230000', 'Riverside Chapel: hello')

    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC-test-sid/Messages.json',
    )

    const body = new URLSearchParams(init.body as URLSearchParams)
    // The sender is whatever the caller passed, never anything this module holds. A
    // transport that knew a number would make sending identity a property of the
    // deployment rather than of the Ministry.
    expect(body.get('From')).toBe('+15550000001')
    expect(body.get('To')).toBe('+15551230000')
    expect(body.get('Body')).toBe('Riverside Chapel: hello')
  })

  it('authenticates as the account rather than putting the token in the URL', async () => {
    const fetched = respondWith(201)

    await transport.deliver('+15550000001', '+15551230000', 'anything')

    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>

    expect(headers.authorization).toBe(
      `Basic ${Buffer.from('AC-test-sid:super-secret-token').toString('base64')}`,
    )
    // A secret in a query string is a secret in every access log between here and
    // the vendor.
    expect(url).not.toContain('super-secret-token')
  })

  it('raises the vendor’s own reason rather than a shrug', async () => {
    respondWith(400, { code: 21211, message: "The 'To' number is not a valid phone number." })

    await expect(
      transport.deliver('+15550000001', 'not-a-number', 'anything'),
    ).rejects.toMatchObject({ status: 400, code: 21211 })
  })

  it('separates a refusal that will always refuse from one worth retrying', async () => {
    respondWith(400, { code: 21610, message: 'unsubscribed recipient' })
    const permanent = (await transport
      .deliver('+15550000001', '+15551230000', 'x')
      .catch((error: unknown) => error)) as MessageNotDelivered
    expect(permanent.isPermanent).toBe(true)

    vi.restoreAllMocks()
    respondWith(503, { message: 'service unavailable' })
    const transient = (await transport
      .deliver('+15550000001', '+15551230000', 'x')
      .catch((error: unknown) => error)) as MessageNotDelivered
    expect(transient.isPermanent).toBe(false)
  })

  it('keeps the status when the vendor answers with something that is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    )

    // The status is the real information, and a failed parse must not replace it
    // with a parser error that says nothing about the message that did not send.
    const error = (await transport
      .deliver('+15550000001', '+15551230000', 'x')
      .catch((thrown: unknown) => thrown)) as MessageNotDelivered

    expect(error).toBeInstanceOf(MessageNotDelivered)
    expect(error.status).toBe(502)
    expect(error.code).toBeNull()
  })

  it('never reports a refusal as a send', async () => {
    respondWith(500)
    await expect(transport.deliver('+1', '+2', 'x')).rejects.toThrow(MessageNotDelivered)
  })
})
