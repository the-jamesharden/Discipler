import { describe, expect, it } from 'vitest'
import { twilioSignature } from '~/platform/twilio/inbound-signature'
import { baseUrl, skipUnlessAppIsRunning, twilioAuthToken } from '../support/app'

/**
 * The signed route Twilio's Usage Trigger posts to (Exponential launch, ticket 08),
 * on a running server, because the proof that a forgery is refused is worth most
 * where the proxy headers and the real middleware are in front of it.
 *
 * What a genuine request does behind the door is in
 * `tests/app/the-usage-trigger-route.test.ts`: a local server has no Resend key.
 */
describe.skipIf(skipUnlessAppIsRunning)('the Usage Trigger route, over HTTP', () => {
  const url = `${baseUrl}/sms/usage-trigger`
  const fired = {
    UsageTriggerSid: 'UT00000000000000000000000000000000',
    UsageCategory: 'totalprice',
    TriggerBy: 'price',
    Recurring: 'daily',
    TriggerValue: '250',
    CurrentValue: '253.10',
  }

  const post = (parameters: Record<string, string>, signature?: string) =>
    fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(signature === undefined ? {} : { 'x-twilio-signature': signature }),
      },
      body: new URLSearchParams(parameters),
    })

  it('refuses a forged request with no signature', async () => {
    expect((await post(fired)).status).toBe(403)
  })

  it('refuses a request signed with the wrong secret', async () => {
    const forged = twilioSignature('not-the-token', url, fired)

    expect((await post(fired, forged)).status).toBe(403)
  })

  it('refuses a request changed after it was signed', async () => {
    if (!twilioAuthToken) throw new Error('TWILIO_AUTH_TOKEN is not set, so this cannot be exercised')
    const signed = twilioSignature(twilioAuthToken, url, fired)

    expect((await post({ ...fired, CurrentValue: '9999' }, signed)).status).toBe(403)
  })

  it('lets a request Twilio signed past the door', async () => {
    if (!twilioAuthToken) throw new Error('TWILIO_AUTH_TOKEN is not set, so this cannot be exercised')
    const signed = twilioSignature(twilioAuthToken, url, fired)

    // 500, not 200: past the door, and a local server has no Resend key to send with.
    expect((await post(fired, signed)).status).toBe(500)
  })
})
