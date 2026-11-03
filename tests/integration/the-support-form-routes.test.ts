import { NextRequest } from 'next/server'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { SUPPORT_SUBMISSIONS } from '~/domain/launch-terms'
import { createPostgresSupportSubmissions, type PostgresSupportSubmissions } from '~/platform/supabase/support-submissions'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport } from '~/service/ports'
import { createSupportForm, type SupportForm } from '~/service/support-form'
import { POST as send } from '../../app/help/contact/send/route'
import { localSupabase } from '../support/local-supabase'

/**
 * The signed-out door of the route, in process, with the real tables behind it and
 * Cloudflare and Resend as fakes at their ports (Exponential launch, ticket 25). In
 * process because a built server has neither fake to reach for and must not call
 * either vendor; what a built server does is `the-support-form-over-http.test.ts`.
 */

let form: SupportForm

vi.mock('~/service/container', () => ({ getSupportForm: () => form }))
vi.mock('~/platform/supabase/current-admin', () => ({ currentAdmin: async () => null }))

const GOOD_TOKEN = 'a-token-cloudflare-passed'

const anAddress = () =>
  `198.51.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`

const post = (fields: Record<string, string>, network: string) =>
  new NextRequest('http://127.0.0.1:3346/help/contact/send', {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'Chrome/130.0',
      'x-forwarded-for': network,
    },
  })

describe('the support form’s route, for somebody not signed in', () => {
  let pool: pg.Pool
  let store: PostgresSupportSubmissions
  const delivered: { kind: string; subject: string; replyTo: string; text: string }[] = []
  const asked: { token: string; action: string }[] = []

  const transport: EmailTransport = {
    async deliver(envelope) {
      delivered.push({ kind: envelope.kind, subject: envelope.subject, replyTo: envelope.replyTo, text: envelope.text })
    },
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    store = createPostgresSupportSubmissions(localSupabase().databaseUrl)
    form = createSupportForm({
      submissions: store,
      humanCheck: {
        async verify(token, action) {
          asked.push({ token, action })
          return token === GOOD_TOKEN
        },
      },
      sender: createEmailSender(transport),
      clock: createTestClock(new Date()),
    })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  beforeEach(() => {
    delivered.length = 0
    asked.length = 0
  })

  const aMessage = (overrides: Record<string, string> = {}) => ({
    kind: 'bug',
    message: 'The help page will not open.\nBcc: evil@example.org',
    email: 'pastor@example.org',
    page: '/help?q=Grace',
    token: GOOD_TOKEN,
    ...overrides,
  })

  it('keeps it operator-only and emails it, with nothing typed in a header', async () => {
    const response = await send(post(aMessage(), anAddress()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: true })
    expect(asked).toEqual([{ token: GOOD_TOKEN, action: 'support_contact' }])

    const { rows } = await pool.query<{ id: string; reply_to: string; page_address: string; browser: string; emailed_at: Date | null }>(
      `select * from signed_out_support_submission where message like 'The help page will not open.%' order by submitted_at desc limit 1`,
    )
    expect(rows[0]).toMatchObject({ reply_to: 'pastor@example.org', page_address: '/help', browser: 'Chrome/130.0' })
    expect(rows[0]!.emailed_at).not.toBeNull()

    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      kind: 'bugReport',
      subject: `Bug report ${rows[0]!.id.slice(0, 8)}`,
      replyTo: 'support@trydiscipler.com',
    })
    expect(delivered[0]!.text).toContain('> Bcc: evil@example.org')
    expect(delivered[0]!.text).toContain('Nobody was signed in')
  })

  it('is refused without a token that passed, and nothing is kept or sent', async () => {
    const network = anAddress()
    const message = `Not kept ${crypto.randomUUID()}`

    const response = await send(post(aMessage({ token: 'made-up', message }), network))

    expect(response.status).toBe(403)
    expect(delivered).toEqual([])
    const { rows } = await pool.query(`select 1 from signed_out_support_submission where message = $1`, [message])
    expect(rows).toEqual([])
  })

  it('is limited per network, and a different network may still send', async () => {
    const network = anAddress()
    for (let sent = 0; sent < SUPPORT_SUBMISSIONS.perNetworkPerHour; sent += 1) {
      expect((await send(post(aMessage(), network))).status).toBe(200)
    }

    const refused = await send(post(aMessage(), network))
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ refusal: 'support.too_many' })

    expect((await send(post(aMessage(), anAddress()))).status).toBe(200)
  })

  it('answers a form it cannot read with a refusal and not a fault', async () => {
    const response = await send(
      new NextRequest('http://127.0.0.1:3346/help/contact/send', {
        method: 'POST',
        body: 'not a form',
        headers: { 'content-type': 'text/plain' },
      }),
    )

    expect(response.status).toBe(422)
    expect(asked).toEqual([])
  })
})
