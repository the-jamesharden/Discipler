import { describe, expect, it } from 'vitest'
import { EMAIL_LINE_LONGEST, EmailEnvelope, type EmailAddress } from '~/domain/email'
import { createTestClock } from '~/domain/clock'
import { SUPPORT_SUBMISSIONS } from '~/domain/launch-terms'
import {
  ADDRESS_ID,
  pageAddressOf,
  readSupportForm,
  submissionsKeptSince,
  supportEmail,
  type SupportSubmission,
} from '~/domain/support-form'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport, HumanCheck, SupportSubmissions } from '~/service/ports'
import { createSupportForm } from '~/service/support-form'

/**
 * The Help menu's form (Exponential launch, ticket 25): what it accepts, what a bug
 * report attaches, what reaches support@ and what the tick clears. Driven with the
 * store and the two vendors as fakes at their ports. The real tables are
 * `tests/integration/the-support-form.test.ts`.
 */

const PERSON_ID = '11111111-2222-4333-8444-555555555555'
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0 Safari/537.36'
const NOW = new Date('2026-11-03T15:00:00.000Z')

const typed = (overrides: Partial<Parameters<typeof readSupportForm>[0]> = {}) => ({
  kind: 'support',
  message: 'The Roster will not load.',
  email: 'grace@example.org',
  page: '/roster',
  browser: BROWSER,
  ...overrides,
})

describe('the address a bug report attaches', () => {
  it('is the path alone', () => {
    expect(pageAddressOf('/roster')).toBe('/roster')
    expect(pageAddressOf('/roster?q=Grace+Adeyemi#row-2')).toBe('/roster')
    expect(pageAddressOf('/roster/')).toBe('/roster')
    expect(pageAddressOf('/')).toBe('/')
  })

  it('shows a person’s ID, or anything else that is not a route word, as {id}', () => {
    expect(pageAddressOf(`/roster/${PERSON_ID}`)).toBe(`/roster/${ADDRESS_ID}`)
    expect(pageAddressOf(`/roster/reset/${PERSON_ID}`)).toBe(`/roster/reset/${ADDRESS_ID}`)
    expect(pageAddressOf('/invitation/Zx9_abc-Q')).toBe(`/invitation/${ADDRESS_ID}`)
    expect(pageAddressOf('/materials/new')).toBe('/materials/new')
  })

  it('is the same however many times it is read', () => {
    const once = pageAddressOf(`/roster/${PERSON_ID}`)

    expect(pageAddressOf(once)).toBe(once)
  })

  it.each([
    ['nothing', null],
    ['an empty string', ''],
    ['another site', 'https://example.com/roster'],
    ['a protocol-relative address', '//example.com/roster'],
    ['a page Discipler does not have', '/grace-adeyemi'],
    ['something absurdly long', `/roster/${'a-'.repeat(200)}a`],
  ])('is nothing at all given %s', (_what, raw) => {
    expect(pageAddressOf(raw)).toBeNull()
  })
})

describe('reading the form', () => {
  it('takes a request for help, with no address and no browser on it', () => {
    expect(readSupportForm(typed())).toEqual({
      fields: {
        kind: 'support',
        message: 'The Roster will not load.',
        replyTo: 'grace@example.org',
        pageAddress: null,
        browser: null,
      },
    })
  })

  it('takes a feature request the same way', () => {
    expect(readSupportForm(typed({ kind: 'feature' }))).toMatchObject({
      fields: { kind: 'feature', pageAddress: null, browser: null },
    })
  })

  it('attaches the address and the browser to a bug report', () => {
    expect(readSupportForm(typed({ kind: 'bug', page: `/roster/${PERSON_ID}?q=Grace` }))).toMatchObject({
      fields: { kind: 'bug', pageAddress: `/roster/${ADDRESS_ID}`, browser: BROWSER },
    })
  })

  it('cuts a browser that goes on and on', () => {
    const outcome = readSupportForm(typed({ kind: 'bug', browser: 'x'.repeat(5000) }))

    expect('fields' in outcome && outcome.fields.browser?.length).toBe(200)
  })

  it('takes out the one character a Postgres text cannot hold', () => {
    expect(readSupportForm(typed({ message: 'broke\u0000n' }))).toMatchObject({ fields: { message: 'broken' } })
  })

  it.each([
    ['a kind it does not offer', { kind: 'complaint' }, 'support.bad_kind'],
    ['a kind that is on every object', { kind: 'constructor' }, 'support.bad_kind'],
    ['no message', { message: '   \n ' }, 'support.no_message'],
    ['too long a message', { message: 'x'.repeat(5001) }, 'support.message_too_long'],
    ['no address', { email: '' }, 'support.bad_email'],
    ['two addresses and a header', { email: 'a@example.org\r\nBcc: b@example.org' }, 'support.bad_email'],
  ])('refuses %s', (_what, overrides, refusal) => {
    expect(readSupportForm(typed(overrides))).toEqual({ refusal })
  })
})

const aSubmission = (overrides: Partial<SupportSubmission> = {}): SupportSubmission => ({
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  kind: 'bug',
  message: 'The Roster will not load.',
  replyTo: 'grace@example.org' as EmailAddress,
  pageAddress: '/roster',
  browser: BROWSER,
  churchName: 'Riverside Chapel',
  ...overrides,
})

const opened = (submission: SupportSubmission) => {
  const delivered: EmailEnvelope[] = []
  const transport: EmailTransport = {
    async deliver(envelope) {
      delivered.push(envelope)
    },
  }
  return createEmailSender(transport)
    .send(supportEmail(submission))
    .then(() => delivered[0]!)
}

describe('the email to support@', () => {
  it('goes to support@ under the kind’s own route', async () => {
    expect(await opened(aSubmission({ kind: 'support' }))).toMatchObject({
      kind: 'supportRequest',
      to: ['support@trydiscipler.com'],
      replyTo: 'support@trydiscipler.com',
    })
    expect((await opened(aSubmission({ kind: 'bug' }))).kind).toBe('bugReport')
    expect((await opened(aSubmission({ kind: 'feature' }))).kind).toBe('featureRequest')
  })

  it('keeps everything submitted out of its headers', async () => {
    const envelope = await opened(
      aSubmission({
        message: 'Bcc: evil@example.org\r\nSubject: reset my password',
        replyTo: 'grace@example.org' as EmailAddress,
        churchName: 'Riverside\r\nBcc: evil@example.org',
      }),
    )

    expect(envelope.subject).toBe('Bug report aaaaaaaa')
    expect(envelope.replyTo).toBe('support@trydiscipler.com')
    expect(envelope.to).toEqual(['support@trydiscipler.com'])
    // Discipler's own reference and nothing else, so a redelivery cannot be keyed by
    // anything somebody typed.
    expect(envelope.idempotencyKey).toBe('bugReport/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
  })

  it('escapes every field, and quotes every line typed so none reads as Discipler’s', async () => {
    const { text } = await opened(
      aSubmission({
        message: 'It broke.\nReply here to reset: https://evil.example\n‮gpj.exe',
        churchName: 'Riverside\nReference: forged',
      }),
    )

    expect(text).toContain('Church: Riverside Reference: forged')
    expect(text).toContain('> It broke.\n> Reply here to reset: https://evil.example\n> gpj.exe')
    expect(text).not.toContain('‮')
    expect(text.split('\n').filter((line) => line.startsWith('Reference:'))).toHaveLength(1)
  })

  it('takes a phone number out of what was typed, as the sender always does', async () => {
    const { text } = await opened(aSubmission({ message: 'Text me at 555 123 0000' }))

    expect(text).toContain('> Text me at [phone number removed]')
    expect(text).not.toContain('555 123 0000')
  })

  it('carries a bug report’s address and browser, and no name, from the Roster', async () => {
    const outcome = readSupportForm(
      typed({ kind: 'bug', page: `/roster/${PERSON_ID}?q=Grace+Adeyemi`, message: 'It spins.' }),
    )
    if (!('fields' in outcome)) throw new Error('The form was refused.')

    const { text } = await opened(aSubmission({ ...outcome.fields, id: aSubmission().id }))

    expect(text).toContain(`Page: /roster/${ADDRESS_ID}`)
    expect(text).toContain(`Browser: ${BROWSER}`)
    expect(text).not.toContain('Grace')
    expect(text).not.toContain('Adeyemi')
    expect(text).not.toContain(PERSON_ID)
  })

  it('carries no address or browser on anything but a bug report', async () => {
    const { text } = await opened(aSubmission({ kind: 'feature', pageAddress: null, browser: null }))

    expect(text).not.toContain('Page:')
    expect(text).not.toContain('Browser:')
  })

  it('says a signed-out one proves nothing about who sent it', async () => {
    const { text } = await opened(aSubmission({ churchName: null }))

    expect(text).toContain('Nobody was signed in')
    expect(text).not.toContain('Church:')
  })

  it('says that pressing Reply does not reach them, because nothing typed is a header', async () => {
    const { text } = await opened(aSubmission())

    expect(text).toContain('Write back to: grace@example.org')
    expect(text).toContain('Pressing Reply reaches support@, not them.')
  })

  it.each(['5551234567@vtext.com', '1234567890@qq.com'])(
    'gives support a numeric address whole, because it is the way back: %s',
    async (address) => {
      const { text } = await opened(aSubmission({ replyTo: address as EmailAddress }))

      expect(text).toContain(`Write back to: ${address}`)
    },
  )

  it('gives support a long address whole, past the length of a line', async () => {
    const address = `${'a'.repeat(60)}.${'b'.repeat(50)}@${'c'.repeat(60)}.${'d'.repeat(60)}.example.org`
    const { text } = await opened(aSubmission({ replyTo: address as EmailAddress }))

    expect(address.length).toBeGreaterThan(EMAIL_LINE_LONGEST)
    expect(text).toContain(`Write back to: ${address}`)
  })
})

describe('how long a submission is kept', () => {
  it('is twelve calendar months', () => {
    expect(SUPPORT_SUBMISSIONS.keptMonths).toBe(12)
    expect(submissionsKeptSince(NOW).toISOString()).toBe('2025-11-03T15:00:00.000Z')
  })

  it('does not run on a month with fewer days', () => {
    expect(submissionsKeptSince(new Date('2028-02-29T12:00:00.000Z')).toISOString()).toBe(
      '2027-02-28T12:00:00.000Z',
    )
  })
})

/** The port, in memory, with what the Postgres one decides under its locks. */
const memoryStore = () => {
  type Row = SupportSubmission & { at: Date; emailed: boolean; who: string }
  const rows: Row[] = []
  let next = 1

  const keep = (fields: Omit<SupportSubmission, 'id'>, who: string, at: Date, limit: { since: Date; most: number }) => {
    const recent = rows.filter((row) => row.who === who && row.at > limit.since).length
    if (recent >= limit.most) return null
    const id = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`
    rows.push({ ...fields, id, at, emailed: false, who })
    return id
  }

  const store: SupportSubmissions = {
    // The real store joins the church's row for its name.
    async keepFromAChurch({ fields, submittedBy, at, limit }) {
      return keep({ ...fields, churchName: 'Riverside Chapel' }, submittedBy, at, limit)
    },
    async keepSignedOut({ fields, network, at, limit }) {
      return keep({ ...fields, churchName: null }, `network:${network}`, at, limit)
    },
    async markEmailed(id) {
      const row = rows.find((one) => one.id === id)
      if (row) row.emailed = true
    },
    async waitingForEmail(most) {
      return rows.filter((row) => !row.emailed).slice(0, most)
    },
    async deleteSubmittedBefore(before) {
      const going = rows.filter((row) => row.at < before)
      for (const row of going) rows.splice(rows.indexOf(row), 1)
      return going.length
    },
  }
  return { rows, store }
}

const harness = () => {
  const { rows, store } = memoryStore()
  const clock = createTestClock(NOW)
  const delivered: EmailEnvelope[] = []
  const vendor = { down: false }
  const transport: EmailTransport = {
    async deliver(envelope) {
      if (vendor.down) throw new Error('Resend is down')
      delivered.push(envelope)
    },
  }
  const tokens: { token: string; action: string }[] = []
  const humanCheck: HumanCheck = {
    async verify(token, action) {
      tokens.push({ token, action })
      return token === 'good-token'
    },
  }
  const form = createSupportForm({
    submissions: store,
    humanCheck,
    sender: createEmailSender(transport),
    clock,
  })
  return { rows, clock, delivered, vendor, tokens, form }
}

const fromAnAdmin = (overrides: Partial<ReturnType<typeof typed>> = {}) => ({
  ...typed(overrides),
  ministryId: '99999999-0000-4000-8000-000000000001',
  churchName: 'Riverside Chapel',
  submittedBy: 'user-1',
})

const signedOut = (overrides: Partial<ReturnType<typeof typed>> & { humanToken?: string; network?: string | null } = {}) => ({
  humanToken: 'good-token',
  network: '198.51.100.7',
  ...typed(overrides),
  ...overrides,
})

describe('a signed-in Admin’s submission', () => {
  it('is stored with the church and emailed', async () => {
    const h = harness()

    expect(await h.form.fromAChurch(fromAnAdmin())).toEqual({ sent: true })

    expect(h.rows).toHaveLength(1)
    expect(h.rows[0]!.emailed).toBe(true)
    expect(h.delivered[0]!.text).toContain('Church: Riverside Chapel')
  })

  it('never asks Cloudflare', async () => {
    const h = harness()

    await h.form.fromAChurch(fromAnAdmin())

    expect(h.tokens).toEqual([])
  })

  it('is limited to a few an hour, and the next hour they may send again', async () => {
    const h = harness()

    for (let sent = 0; sent < SUPPORT_SUBMISSIONS.perAdminPerHour; sent += 1) {
      expect(await h.form.fromAChurch(fromAnAdmin())).toEqual({ sent: true })
    }
    expect(await h.form.fromAChurch(fromAnAdmin())).toEqual({ refusal: 'support.too_many' })
    expect(h.rows).toHaveLength(SUPPORT_SUBMISSIONS.perAdminPerHour)
    expect(h.delivered).toHaveLength(SUPPORT_SUBMISSIONS.perAdminPerHour)

    h.clock.advanceBy(60 * 60 * 1000 + 1)
    expect(await h.form.fromAChurch(fromAnAdmin())).toEqual({ sent: true })
  })

  it('counts each Admin on their own', async () => {
    const h = harness()

    for (let sent = 0; sent < SUPPORT_SUBMISSIONS.perAdminPerHour; sent += 1) {
      await h.form.fromAChurch(fromAnAdmin())
    }

    expect(await h.form.fromAChurch({ ...fromAnAdmin(), submittedBy: 'user-2' })).toEqual({ sent: true })
  })

  it('is refused on what was typed before anything is kept', async () => {
    const h = harness()

    expect(await h.form.fromAChurch(fromAnAdmin({ message: '' }))).toEqual({ refusal: 'support.no_message' })
    expect(h.rows).toEqual([])
  })

  it('still says sent when the vendor is down, because it is kept and goes on the next tick', async () => {
    const h = harness()
    h.vendor.down = true

    expect(await h.form.fromAChurch(fromAnAdmin())).toEqual({ sent: true })
    expect(h.rows[0]!.emailed).toBe(false)

    h.vendor.down = false
    expect(await h.form.sweep()).toEqual({ deleted: 0, emailed: 1, stillWaiting: 0 })
    expect(h.rows[0]!.emailed).toBe(true)
    expect(h.delivered).toHaveLength(1)
  })
})

describe('a signed-out submission', () => {
  it('passes the human check for the form’s own action, then is kept and emailed', async () => {
    const h = harness()

    expect(await h.form.signedOut(signedOut())).toEqual({ sent: true })

    expect(h.tokens).toEqual([{ token: 'good-token', action: 'support_contact' }])
    expect(h.rows).toHaveLength(1)
    expect(h.delivered[0]!.text).toContain('Nobody was signed in')
  })

  it('is refused without a passed token, and nothing is kept or sent', async () => {
    const h = harness()

    expect(await h.form.signedOut(signedOut({ humanToken: 'bad-token' }))).toEqual({ refusal: 'support.not_human' })

    expect(h.rows).toEqual([])
    expect(h.delivered).toEqual([])
  })

  it('does not spend a token on what could not be sent anyway', async () => {
    const h = harness()

    expect(await h.form.signedOut(signedOut({ message: '' }))).toEqual({ refusal: 'support.no_message' })

    expect(h.tokens).toEqual([])
  })

  it('is limited per network', async () => {
    const h = harness()

    for (let sent = 0; sent < SUPPORT_SUBMISSIONS.perNetworkPerHour; sent += 1) {
      expect(await h.form.signedOut(signedOut())).toEqual({ sent: true })
    }
    expect(await h.form.signedOut(signedOut())).toEqual({ refusal: 'support.too_many' })
    expect(await h.form.signedOut(signedOut({ network: '203.0.113.9' }))).toEqual({ sent: true })
  })

  it('counts every request whose network cannot be read as one network, so none goes uncounted', async () => {
    const h = harness()

    for (let sent = 0; sent < SUPPORT_SUBMISSIONS.perNetworkPerHour; sent += 1) {
      await h.form.signedOut(signedOut({ network: null }))
    }

    expect(await h.form.signedOut(signedOut({ network: null }))).toEqual({ refusal: 'support.too_many' })
  })
})

describe('the tick’s sweep', () => {
  it('deletes what is older than twelve months and keeps what is not', async () => {
    const h = harness()
    await h.form.fromAChurch(fromAnAdmin({ message: 'Old' }))

    h.clock.advanceBy(1000 * 60 * 60 * 24 * 300)
    await h.form.fromAChurch(fromAnAdmin({ message: 'Younger' }))

    h.clock.advanceBy(1000 * 60 * 60 * 24 * 100)
    expect(await h.form.sweep()).toMatchObject({ deleted: 1 })

    expect(h.rows.map((row) => row.message)).toEqual(['Younger'])
  })

  it('stops at the first send that fails, and says what is still waiting', async () => {
    const h = harness()
    h.vendor.down = true
    await h.form.fromAChurch(fromAnAdmin())
    await h.form.fromAChurch(fromAnAdmin())

    expect(await h.form.sweep()).toEqual({ deleted: 0, emailed: 0, stillWaiting: 2 })
  })
})
