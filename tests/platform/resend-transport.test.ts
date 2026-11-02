import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  emailBody,
  EmailEnvelope,
  emailSubject,
  openEnvelope,
  UnescapedEmailField,
} from '~/domain/email'
import { resendCredentials } from '~/platform/resend/credentials'
import { createResendTransport, EmailNotDelivered } from '~/platform/resend/email-transport'

/**
 * The email vendor's boundary, driven against a stubbed `fetch` (Exponential
 * launch, ticket 10). There is no Resend account in a test run and there must
 * never be one: what is proved is the request Discipler makes and what it does
 * with each answer.
 */

const credentials = { apiKey: 're_test_key', sendingDomain: 'notify.trydiscipler.com' }
const transport = createResendTransport(() => credentials)

const envelope = openEnvelope({
  kind: 'deliverabilityCheck',
  subject: emailSubject`Discipler can send email`,
  body: emailBody`If you can read this, SPF, DKIM and DMARC let it through.`,
  once: 'check-1',
})

const respondWith = (status: number, payload: unknown = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

const sent = (fetched: ReturnType<typeof respondWith>) => {
  const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('handing an email to Resend', () => {
  it('sends plain text from notify.trydiscipler.com, with replies to support@', async () => {
    const fetched = respondWith(200, { id: 'email-1' })

    await transport.deliver(envelope)

    const { url, body } = sent(fetched)
    expect(url).toBe('https://api.resend.com/emails')
    expect(body).toEqual({
      from: 'Discipler <hello@notify.trydiscipler.com>',
      to: ['support@trydiscipler.com'],
      reply_to: 'support@trydiscipler.com',
      subject: 'Discipler can send email',
      text: 'If you can read this, SPF, DKIM and DMARC let it through.',
    })
    // Plain text only: there is no HTML part for a field to be read into.
    expect(body).not.toHaveProperty('html')
  })

  it('keys every message, so a retry within a day does not send it twice', async () => {
    const fetched = respondWith(200, { id: 'email-1' })

    await transport.deliver(envelope)

    expect(sent(fetched).headers['idempotency-key']).toBe('deliverabilityCheck/check-1')
  })

  it('authenticates with the key in a header and nowhere else', async () => {
    const fetched = respondWith(200, { id: 'email-1' })

    await transport.deliver(envelope)

    const { url, headers, body } = sent(fetched)
    expect(headers.authorization).toBe('Bearer re_test_key')
    expect(url).not.toContain('re_test_key')
    expect(JSON.stringify(body)).not.toContain('re_test_key')
  })

  it('refuses anything the domain did not open', async () => {
    const fetched = respondWith(200)
    const loose = { ...envelope } as unknown as EmailEnvelope

    await expect(transport.deliver(loose)).rejects.toThrow(UnescapedEmailField)
    expect(fetched).not.toHaveBeenCalled()
  })

  it('raises the vendor’s own reason rather than a shrug', async () => {
    respondWith(403, {
      statusCode: 403,
      name: 'validation_error',
      message: 'The notify.trydiscipler.com domain is not verified.',
    })

    await expect(transport.deliver(envelope)).rejects.toMatchObject({
      status: 403,
      name: 'EmailNotDelivered',
      reason: 'validation_error',
      message: 'The notify.trydiscipler.com domain is not verified.',
    })
  })

  it('keeps the status when the vendor answers with something that is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    )

    const error = (await transport
      .deliver(envelope)
      .catch((thrown: unknown) => thrown)) as EmailNotDelivered

    expect(error).toBeInstanceOf(EmailNotDelivered)
    expect(error.status).toBe(502)
    expect(error.reason).toBeNull()
  })

  it('never reports a refusal as a send', async () => {
    respondWith(500)
    await expect(transport.deliver(envelope)).rejects.toThrow(EmailNotDelivered)
  })

  it('sends nothing at all without its credentials', async () => {
    const fetched = respondWith(200)
    const unconfigured = createResendTransport(() => {
      throw new Error('RESEND_API_KEY is not set.')
    })

    await expect(unconfigured.deliver(envelope)).rejects.toThrow('RESEND_API_KEY')
    expect(fetched).not.toHaveBeenCalled()
  })
})

describe('handing an email to Resend on staging', () => {
  it('sends every email to the one staging address, whoever it was for', async () => {
    const fetched = respondWith(200, { id: 'email-1' })
    const staging = createResendTransport(() => ({
      ...credentials,
      stagingRecipient: 'staging-inbox@trydiscipler.com',
    }))

    await staging.deliver(envelope)

    expect(sent(fetched).body.to).toEqual(['staging-inbox@trydiscipler.com'])
  })
})

describe('the credentials', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('come from the deployment’s environment', () => {
    vi.stubEnv('RESEND_API_KEY', 're_live_key')
    vi.stubEnv('RESEND_EMAIL_DOMAIN', 'Notify.TryDiscipler.com')

    expect(resendCredentials()).toEqual({
      apiKey: 're_live_key',
      sendingDomain: 'notify.trydiscipler.com',
    })
  })

  it('refuse to send without a key, as Preview and a developer’s machine have none', () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('RESEND_EMAIL_DOMAIN', 'notify.trydiscipler.com')

    expect(() => resendCredentials()).toThrow('RESEND_API_KEY is not set')
  })

  it('refuse a sending domain that is not one, since it becomes the From address', () => {
    vi.stubEnv('RESEND_API_KEY', 're_live_key')
    vi.stubEnv('RESEND_EMAIL_DOMAIN', 'notify.trydiscipler.com>\r\nBcc: x@y.example')

    expect(() => resendCredentials()).toThrow('RESEND_EMAIL_DOMAIN is not a domain')
  })

  it('on staging, name the one address every email goes to', () => {
    vi.stubEnv('DISCIPLER_ENVIRONMENT', 'staging')
    vi.stubEnv('RESEND_API_KEY', 're_staging_key')
    vi.stubEnv('RESEND_EMAIL_DOMAIN', 'notify.trydiscipler.com')
    vi.stubEnv('STAGING_EMAIL_RECIPIENT', 'Staging-Inbox@TryDiscipler.com')

    expect(resendCredentials()).toEqual({
      apiKey: 're_staging_key',
      sendingDomain: 'notify.trydiscipler.com',
      stagingRecipient: 'staging-inbox@trydiscipler.com',
    })
  })

  it('on staging, refuse to send without that address, so no real Admin is emailed', () => {
    vi.stubEnv('DISCIPLER_ENVIRONMENT', 'staging')
    vi.stubEnv('RESEND_API_KEY', 're_staging_key')
    vi.stubEnv('RESEND_EMAIL_DOMAIN', 'notify.trydiscipler.com')
    vi.stubEnv('STAGING_EMAIL_RECIPIENT', '')

    expect(() => resendCredentials()).toThrow('STAGING_EMAIL_RECIPIENT is not set')
  })

  it('on staging, refuse an address that is not one', () => {
    vi.stubEnv('DISCIPLER_ENVIRONMENT', 'staging')
    vi.stubEnv('RESEND_API_KEY', 're_staging_key')
    vi.stubEnv('RESEND_EMAIL_DOMAIN', 'notify.trydiscipler.com')
    vi.stubEnv('STAGING_EMAIL_RECIPIENT', 'nobody')

    expect(() => resendCredentials()).toThrow('STAGING_EMAIL_RECIPIENT is not an email address')
  })

  it('ignore the staging address everywhere but staging', () => {
    vi.stubEnv('DISCIPLER_ENVIRONMENT', '')
    vi.stubEnv('RESEND_API_KEY', 're_live_key')
    vi.stubEnv('RESEND_EMAIL_DOMAIN', 'notify.trydiscipler.com')
    vi.stubEnv('STAGING_EMAIL_RECIPIENT', 'staging-inbox@trydiscipler.com')

    expect(resendCredentials().stagingRecipient).toBeUndefined()
  })
})
