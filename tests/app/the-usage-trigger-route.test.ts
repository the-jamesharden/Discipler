import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmailEnvelope } from '~/domain/email'
import { twilioSignature } from '~/platform/twilio/inbound-signature'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport, SupportAlerts } from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'

/**
 * The signed route Twilio's Usage Trigger posts to (Exponential launch, ticket 08),
 * through the handler itself with only the vendor's port replaced. Nothing can
 * receive an email in a test, so `tests/integration/the-usage-trigger-over-http`
 * proves the door on a running server and this proves what is behind it.
 */
const { container } = vi.hoisted(() => ({
  container: { alerts: undefined as unknown },
}))

vi.mock('~/service/container', () => ({
  getSupportAlerts: (): SupportAlerts => container.alerts as SupportAlerts,
}))

const { POST } = await import('../../app/sms/usage-trigger/route')

const TOKEN = 'the-auth-token'
const URL_CALLED = 'https://app.trydiscipler.com/sms/usage-trigger'

const fired = {
  AccountSid: 'AC00000000000000000000000000000000',
  UsageTriggerSid: 'UT00000000000000000000000000000000',
  DateFired: 'Mon, 09 Nov 2026 15:00:00 +0000',
  Recurring: 'daily',
  UsageCategory: 'totalprice',
  TriggerBy: 'price',
  TriggerValue: '250',
  CurrentValue: '253.10',
  UsageRecordUri: '/2010-04-01/Accounts/AC00000000000000000000000000000000/Usage/Records/Today.json',
  IdempotencyToken: 'AC00000000000000000000000000000000-FIRES-UT00000000000000000000000000000000-2026-11-09',
}

const post = (body: BodyInit, signature?: string) =>
  POST(
    new NextRequest(URL_CALLED, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(signature === undefined ? {} : { 'x-twilio-signature': signature }),
      },
      body,
    }),
  )

const form = (parameters: Record<string, string>) => new URLSearchParams(parameters).toString()
const signedBy = (token: string, parameters: Record<string, string>) =>
  twilioSignature(token, URL_CALLED, parameters)

describe('the Usage Trigger route', () => {
  const delivered: EmailEnvelope[] = []
  let failing: Error | null = null

  beforeEach(() => {
    delivered.length = 0
    failing = null
    vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN)
    const transport: EmailTransport = {
      async deliver(envelope) {
        if (failing) throw failing
        delivered.push(envelope)
      },
    }
    container.alerts = createEmailSupportAlerts(createEmailSender(transport))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('emails support@ when Twilio signed the request', async () => {
    const response = await post(form(fired), signedBy(TOKEN, fired))

    expect(response.status).toBe(200)
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      kind: 'twilioSpendPassed',
      to: ['support@trydiscipler.com'],
    })
    expect(delivered[0]?.text).toContain('$253.10')
    expect(delivered[0]?.text).toContain('$250.00')
  })

  it('carries no account id, in the email or in the key Resend keeps', async () => {
    await post(form(fired), signedBy(TOKEN, fired))

    expect(JSON.stringify(delivered[0])).not.toContain('AC0000')
    expect(delivered[0]?.text).not.toContain('AC0000')
    expect(delivered[0]?.idempotencyKey).not.toContain('AC0000')
  })

  it('refuses a request with no signature, and sends nothing', async () => {
    const response = await post(form(fired))

    expect(response.status).toBe(403)
    expect(delivered).toEqual([])
  })

  it('refuses a signature made with the wrong secret', async () => {
    const response = await post(form(fired), signedBy('not-the-token', fired))

    expect(response.status).toBe(403)
    expect(delivered).toEqual([])
  })

  it('refuses a signed request whose amount was changed afterwards', async () => {
    const response = await post(form({ ...fired, CurrentValue: '9999' }), signedBy(TOKEN, fired))

    expect(response.status).toBe(403)
    expect(delivered).toEqual([])
  })

  it('refuses a body that is not a form rather than failing on it', async () => {
    const response = await POST(
      new NextRequest(URL_CALLED, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-twilio-signature': 'anything' },
        body: '{"CurrentValue":"9999"}',
      }),
    )

    expect(response.status).toBe(403)
    expect(delivered).toEqual([])
  })

  it('is a closed door when no secret is configured', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')

    const response = await post(form(fired), signedBy(TOKEN, fired))

    expect(response.status).toBe(403)
    expect(delivered).toEqual([])
  })

  it('answers 500 when the email does not go, because Twilio retries a 5xx', async () => {
    failing = new Error('Resend is down')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await post(form(fired), signedBy(TOKEN, fired))

    expect(response.status).toBe(500)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('gives a retry of one firing the same key and words, and the next firing a new key', async () => {
    await post(form(fired), signedBy(TOKEN, fired))
    await post(form(fired), signedBy(TOKEN, fired))
    const tomorrow = {
      ...fired,
      IdempotencyToken: 'AC00000000000000000000000000000000-FIRES-UT00000000000000000000000000000000-2026-11-10',
    }
    await post(form(tomorrow), signedBy(TOKEN, tomorrow))

    const [first, retry, next] = delivered
    expect(retry?.idempotencyKey).toBe(first?.idempotencyKey)
    expect(retry?.text).toBe(first?.text)
    expect(next?.idempotencyKey).not.toBe(first?.idempotencyKey)
  })

  it('still tells support@ when Twilio leaves out what it measured', async () => {
    const bare = { UsageTriggerSid: fired.UsageTriggerSid }

    const response = await post(form(bare), signedBy(TOKEN, bare))

    expect(response.status).toBe(200)
    expect(delivered).toHaveLength(1)
    expect(delivered[0]?.text).toContain('Twilio did not say')
  })

  it('takes out anything shaped like a phone number', async () => {
    const shaped = { ...fired, UsageCategory: '+15551230000' }

    await post(form(shaped), signedBy(TOKEN, shaped))

    expect(delivered[0]?.text).not.toContain('5551230000')
    expect(delivered[0]?.text).toContain('[phone number removed]')
  })
})
