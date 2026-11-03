import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, minutes } from '~/domain/clock'
import {
  checkInNotBefore,
  holdFrom,
  SEND_PASS_EVERY_MINUTES,
  type DailyCapHold,
} from '~/domain/daily-cap'
import { EmailEnvelope } from '~/domain/email'
import { ministryId, outboundMessageId, personId, type MinistryId } from '~/domain/ids'
import { createTwilioTransport } from '~/platform/twilio/message-transport'
import { createDailyCap } from '~/service/daily-cap'
import { createEmailSender } from '~/service/email-sender'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { DailyCapHolds, EmailTransport, OutboundQueue, QueuedMessage } from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'

/**
 * Discipler under Twilio's daily limit (Exponential launch, ticket 07). Driven from
 * the vendor's own answer inward: `fetch` says 30023 to the real Twilio transport,
 * and the real drain, cap and alert take it from there, with the email stopping at a
 * recording `EmailTransport` because a local send throws without a Resend key.
 *
 * Tuesday 2026-11-10 is the Pacific day the cap is reached in. Midnight Pacific that
 * night is 08:00 UTC on the 11th, which is 03:00 in New York and 00:00 in Los Angeles.
 */
const newYork = ministryId('00000000-0000-4000-8000-000000000001')
const losAngeles = ministryId('00000000-0000-4000-8000-000000000002')
const ZONES = { [newYork]: 'America/New_York', [losAngeles]: 'America/Los_Angeles' } as Record<string, string>

const CAP_REACHED_AT = new Date('2026-11-11T01:00:00Z') // 5pm Pacific on the 10th
const MIDNIGHT_PACIFIC = new Date('2026-11-11T08:00:00Z')

let numbered = 0

const aMessage = (toPhone: string, enqueuedAt: Date): QueuedMessage => {
  numbered++
  const suffix = String(numbered).padStart(12, '0')
  return {
    id: outboundMessageId(`00000000-0000-4000-8000-${suffix}`),
    personId: personId(`00000000-0000-4000-9000-${suffix}`),
    toPhone,
    body: `Riverside Chapel via Discipler: message ${numbered}`,
    kind: 'no_reply',
    disclosesPersonId: null,
    enqueuedAt,
  }
}

/** The one table the cap writes, held in memory with the database's first-row-wins. */
const inMemoryHolds = () => {
  const rows = new Map<string, DailyCapHold>()
  const holds: DailyCapHolds = {
    latest: async (at) =>
      [...rows.values()]
        .filter((row) => row.reachedAt.getTime() <= at.getTime())
        .sort((a, b) => b.reachedAt.getTime() - a.reachedAt.getTime())[0] ?? null,
    record: async (hold) => {
      if (!rows.has(hold.day)) rows.set(hold.day, { ...hold, alertedAt: null })
    },
    recordAlerted: async (day, at) => {
      const row = rows.get(day)
      if (row) rows.set(day, { ...row, alertedAt: row.alertedAt ?? at })
    },
  }
  return { rows, holds }
}

/** Twilio as `fetch` sees it: takes a text, until `refuseWith` says otherwise. */
const twilio = () => {
  const accepted: { from: string; to: string; body: string }[] = []
  const state = {
    accepted,
    refuseWith: null as { status: number; code: number } | null,
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (state.refuseWith) {
      return new Response(
        JSON.stringify({ code: state.refuseWith.code, message: 'Twilio says no' }),
        { status: state.refuseWith.status },
      )
    }
    const form = new URLSearchParams(init?.body as URLSearchParams)
    accepted.push({ from: form.get('From')!, to: form.get('To')!, body: form.get('Body')! })
    return new Response(JSON.stringify({ sid: 'SM123', status: 'queued', error_code: null }), {
      status: 201,
    })
  })
  return state
}

const world = () => {
  const vendor = twilio()
  const { rows, holds } = inMemoryHolds()
  const emails: EmailEnvelope[] = []
  const email = { refuses: false }
  const emailTransport: EmailTransport = {
    async deliver(envelope) {
      if (email.refuses) throw new Error('Resend is down')
      emails.push(envelope)
    },
  }
  const dailyCap = createDailyCap({
    holds,
    alerts: createEmailSupportAlerts(createEmailSender(emailTransport)),
  })
  const clock = createTestClock(CAP_REACHED_AT)

  const sent = new Set<string>()
  const released: string[] = []
  const queued = new Map<MinistryId, QueuedMessage[]>()

  const queue: OutboundQueue = {
    whileDraining: (_, drain) => drain(),
    due: async (church) => ({
      messages: (queued.get(church) ?? []).filter((one) => !sent.has(one.id)),
      closedWithoutAccess: 0,
      accessUnread: false,
    }),
    timeZoneOf: async (church) => ZONES[church]!,
    sendingNumberFor: async () => '+13185316138',
    mayReceive: async () => null,
    contactToShare: async () => null,
    claim: async () => 'claimed',
    release: async (_, id) => {
      released.push(id)
    },
    markSent: async (_, id) => {
      sent.add(id)
    },
    withhold: async () => undefined,
  }
  const transport = createTwilioTransport(() => ({ accountSid: 'AC-test-sid', authToken: 'secret' }))

  return {
    vendor,
    rows,
    emails,
    email,
    clock,
    released,
    enqueue: (church: MinistryId, ...phones: string[]) => {
      const messages = phones.map((phone) => aMessage(phone, clock.now()))
      queued.set(church, [...(queued.get(church) ?? []), ...messages])
      return messages
    },
    drain: (church: MinistryId) =>
      dispatchQueue({ queue, transport, clock, ministryId: church, dailyCap }),
  }
}

/** Takes the first `count` texts, then answers everything else with 30023. */
const capAfter = (it_: ReturnType<typeof world>, count: number) => {
  vi.mocked(globalThis.fetch).mockImplementation(async (_url, init) => {
    if (it_.vendor.accepted.length >= count) {
      return new Response(JSON.stringify({ code: 30023, message: 'Daily cap reached' }), {
        status: 400,
      })
    }
    const form = new URLSearchParams(init?.body as URLSearchParams)
    it_.vendor.accepted.push({
      from: form.get('From')!,
      to: form.get('To')!,
      body: form.get('Body')!,
    })
    return new Response(JSON.stringify({ sid: 'SM123', status: 'queued' }), { status: 201 })
  })
}

const openUp = (it_: ReturnType<typeof world>) => {
  vi.mocked(globalThis.fetch).mockImplementation(async (_url, init) => {
    const form = new URLSearchParams(init?.body as URLSearchParams)
    it_.vendor.accepted.push({
      from: form.get('From')!,
      to: form.get('To')!,
      body: form.get('Body')!,
    })
    return new Response(JSON.stringify({ sid: 'SM123', status: 'queued' }), { status: 201 })
  })
}

afterEach(() => vi.restoreAllMocks())

describe('When Twilio answers 30023', () => {
  it('holds that text and the rest of the queue, without calling them failed', async () => {
    const it_ = world()
    const [first, second] = it_.enqueue(newYork, '+15553330001', '+15553330002', '+15553330003')
    capAfter(it_, 1)

    const outcome = await it_.drain(newYork)

    expect(it_.vendor.accepted.map(({ to }) => to)).toEqual([first!.toPhone])
    // The refused one gives its number back, and nothing is tried after it.
    expect(it_.released).toEqual([second!.id])
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2)
    expect(outcome).toEqual({
      sent: 1,
      withheld: 0,
      held: 0,
      failed: 0,
      awaitingANumber: 0,
      waitingOnTheCap: 2,
      closedWithoutAccess: 0,
      accessUnread: false,
    })
  })

  it('stops every church for the rest of the Pacific day, because the limit is the brand’s', async () => {
    const it_ = world()
    it_.enqueue(newYork, '+15553330001')
    capAfter(it_, 0)
    await it_.drain(newYork)
    const asked = vi.mocked(globalThis.fetch).mock.calls.length

    it_.enqueue(losAngeles, '+15553330002', '+15553330003')
    const outcome = await it_.drain(losAngeles)

    // Twilio is not even asked: one refused text a day is all this costs.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(asked)
    expect(outcome.waitingOnTheCap).toBe(2)
    expect(outcome.sent).toBe(0)
  })

  it('holds a text queued during the hold as well, up to the last moment of the day', async () => {
    const it_ = world()
    it_.enqueue(newYork, '+15553330001')
    capAfter(it_, 0)
    await it_.drain(newYork)

    it_.clock.advanceTo(new Date(MIDNIGHT_PACIFIC.getTime() - 1))
    it_.enqueue(newYork, '+15553330002')
    const outcome = await it_.drain(newYork)

    expect(outcome.waitingOnTheCap).toBe(2)
    expect(outcome.sent).toBe(0)
  })

  it('treats any other refusal as it always did: that text fails and the rest go', async () => {
    const it_ = world()
    it_.enqueue(newYork, '+15553330001')
    it_.vendor.refuseWith = { status: 400, code: 21610 }

    const outcome = await it_.drain(newYork)

    expect(outcome.failed).toBe(1)
    expect(outcome.waitingOnTheCap).toBe(0)
    expect(it_.rows.size).toBe(0)
    expect(it_.emails).toEqual([])
  })

  it('also holds when Twilio takes the request but says 30023 on the message it made', async () => {
    const it_ = world()
    it_.enqueue(newYork, '+15553330001')
    vi.mocked(globalThis.fetch).mockImplementation(
      async () =>
        new Response(JSON.stringify({ sid: 'SM1', status: 'failed', error_code: 30023 }), {
          status: 201,
        }),
    )

    const outcome = await it_.drain(newYork)

    expect(outcome.sent).toBe(0)
    expect(outcome.waitingOnTheCap).toBe(1)
    expect(it_.rows.size).toBe(1)
  })
})

describe('Resuming after midnight Pacific', () => {
  /** The cap reached at 5pm Pacific with two texts held, in the church named. */
  const heldInto = async (it_: ReturnType<typeof world>, church: MinistryId) => {
    it_.enqueue(church, '+15553330001', '+15553330002', '+15553330003')
    capAfter(it_, 1)
    await it_.drain(church)
    openUp(it_)
  }

  it('sends the held texts once it is past midnight Pacific and morning at the church', async () => {
    const it_ = world()
    await heldInto(it_, newYork)

    // 8:00am in New York, on a clock that has not been near a real one.
    it_.clock.advanceTo(new Date('2026-11-11T13:00:00Z'))
    const outcome = await it_.drain(newYork)

    expect(outcome.sent).toBe(2)
    expect(outcome.waitingOnTheCap).toBe(0)
    expect(it_.vendor.accepted.map(({ to }) => to)).toEqual([
      '+15553330001',
      '+15553330002',
      '+15553330003',
    ])
  })

  it('never sends a held text twice, however many passes run across the hold', async () => {
    const it_ = world()
    await heldInto(it_, newYork)

    for (const at of [
      '2026-11-11T02:00:00Z',
      '2026-11-11T07:59:59Z',
      '2026-11-11T08:00:00Z', // midnight Pacific, 3am in New York
      '2026-11-11T12:00:00Z',
      '2026-11-11T13:00:00Z', // the morning
      '2026-11-11T14:00:00Z',
      '2026-11-11T15:00:00Z',
    ]) {
      it_.clock.advanceTo(new Date(at))
      await it_.drain(newYork)
    }

    const bodies = it_.vendor.accepted.map(({ body }) => body)
    expect(bodies).toHaveLength(3)
    expect(new Set(bodies).size).toBe(3)
  })

  it('names the same shared number as Twilio’s From when it resumes', async () => {
    const it_ = world()
    await heldInto(it_, newYork)

    it_.clock.advanceTo(new Date('2026-11-11T13:00:00Z'))
    await it_.drain(newYork)

    expect(new Set(it_.vendor.accepted.map(({ from }) => from))).toEqual(new Set(['+13185316138']))
  })

  it('does not text a held queue at 3am: midnight Pacific is not morning in New York', async () => {
    const it_ = world()
    await heldInto(it_, newYork)

    it_.clock.advanceTo(MIDNIGHT_PACIFIC)
    const outcome = await it_.drain(newYork)

    expect(outcome.sent).toBe(0)
    expect(outcome.waitingOnTheCap).toBe(2)
  })

  it('waits for the morning in Los Angeles too, whose midnight this is', async () => {
    const it_ = world()
    await heldInto(it_, losAngeles)

    it_.clock.advanceTo(MIDNIGHT_PACIFIC)
    expect((await it_.drain(losAngeles)).sent).toBe(0)

    it_.clock.advanceTo(new Date('2026-11-11T16:00:00Z')) // 8am in Los Angeles
    expect((await it_.drain(losAngeles)).sent).toBe(2)
  })

  it('answers a reply at night once the limit has reset: only what was held waits', async () => {
    const it_ = world()
    await heldInto(it_, newYork)

    it_.clock.advanceTo(new Date(MIDNIGHT_PACIFIC.getTime() + minutes(5)))
    const [reply] = it_.enqueue(newYork, '+15553330009')
    const outcome = await it_.drain(newYork)

    expect(outcome.sent).toBe(1)
    expect(outcome.waitingOnTheCap).toBe(2)
    expect(it_.vendor.accepted.at(-1)?.to).toBe(reply!.toPhone)
  })
})

describe('Telling support@', () => {
  it('emails support@ the first time, saying which day', async () => {
    const it_ = world()
    it_.enqueue(newYork, '+15553330001')
    capAfter(it_, 0)

    await it_.drain(newYork)

    expect(it_.emails).toHaveLength(1)
    expect(EmailEnvelope.isEnvelope(it_.emails[0])).toBe(true)
    expect(it_.emails[0]).toMatchObject({
      to: ['support@trydiscipler.com'],
      idempotencyKey: 'dailyCapReached/daily-cap:2026-11-10',
    })
    expect(it_.emails[0]!.text).toContain('2026-11-10')
    expect(it_.emails[0]!.text).toContain('30023')
  })

  it('sends one email a day however many sends and churches hit the cap', async () => {
    const it_ = world()
    it_.enqueue(newYork, '+15553330001', '+15553330002')
    capAfter(it_, 0)

    await it_.drain(newYork)
    it_.enqueue(losAngeles, '+15553330003')
    await it_.drain(losAngeles)
    it_.clock.advanceBy(minutes(60))
    await it_.drain(newYork)
    it_.clock.advanceBy(minutes(60))
    await it_.drain(losAngeles)

    expect(it_.emails).toHaveLength(1)
  })

  it('emails again on the next Pacific day the cap is reached', async () => {
    const it_ = world()
    it_.enqueue(newYork, '+15553330001')
    capAfter(it_, 0)
    await it_.drain(newYork)

    // The next afternoon, when the queue is drained and the limit is reached again.
    it_.clock.advanceTo(new Date('2026-11-12T01:00:00Z'))
    await it_.drain(newYork)

    expect(it_.emails.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'dailyCapReached/daily-cap:2026-11-10',
      'dailyCapReached/daily-cap:2026-11-11',
    ])
  })

  it('still holds when the email cannot go, and tells support@ on the next pass', async () => {
    const it_ = world()
    it_.enqueue(newYork, '+15553330001')
    capAfter(it_, 0)
    it_.email.refuses = true
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const outcome = await it_.drain(newYork)

    expect(outcome.waitingOnTheCap).toBe(1)
    expect(it_.emails).toEqual([])

    it_.email.refuses = false
    it_.clock.advanceBy(minutes(60))
    await it_.drain(newYork)
    await it_.drain(losAngeles)

    expect(it_.emails).toHaveLength(1)
    quiet.mockRestore()
  })
})

describe('The Pacific day', () => {
  it('names the day the limit is counted in, not UTC’s', () => {
    expect(holdFrom(CAP_REACHED_AT)).toEqual({
      day: '2026-11-10',
      reachedAt: CAP_REACHED_AT,
      heldUntil: MIDNIGHT_PACIFIC,
    })
  })

  it('finds midnight across the clocks going back', () => {
    // Saturday evening, PDT: the midnight that opens the day the clocks change.
    expect(holdFrom(new Date('2026-11-01T03:00:00Z')).heldUntil).toEqual(
      new Date('2026-11-01T07:00:00Z'),
    )
    // That Sunday, which is 25 hours long: its end is in PST.
    expect(holdFrom(new Date('2026-11-01T20:00:00Z')).heldUntil).toEqual(
      new Date('2026-11-02T08:00:00Z'),
    )
  })

  it('finds midnight across the clocks going forward', () => {
    expect(holdFrom(new Date('2027-03-14T20:00:00Z')).heldUntil).toEqual(
      new Date('2027-03-15T07:00:00Z'),
    )
  })
})

describe('Spreading check-ins across the hour', () => {
  const at = new Date('2026-11-09T15:00:00Z')

  it('leaves every check-in to go on the pass that made it while the pass is hourly', () => {
    for (const index of [0, 1, 59]) {
      expect(checkInNotBefore({ index, count: 60, now: at, passEveryMinutes: 60 })).toBeNull()
    }
  })

  it('gives each check-in its own moment in the hour once passes are more frequent', () => {
    const slots = [0, 1, 2, 3].map((index) =>
      checkInNotBefore({ index, count: 4, now: at, passEveryMinutes: 5 }),
    )

    expect(slots).toEqual([
      new Date('2026-11-09T15:00:00Z'),
      new Date('2026-11-09T15:15:00Z'),
      new Date('2026-11-09T15:30:00Z'),
      new Date('2026-11-09T15:45:00Z'),
    ])
  })

  it('keeps the last of any number of check-ins inside the hour', () => {
    const last = checkInNotBefore({ index: 999, count: 1000, now: at, passEveryMinutes: 5 })

    expect(last!.getTime()).toBeLessThan(at.getTime() + minutes(60))
  })

  it('keeps the send pass constant and the cron in vercel.json saying the same thing', () => {
    const { crons } = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    const schedule = crons.find(({ path }) => path === '/cron/tick')?.schedule
    const everyMinutes = schedule === '0 * * * *' ? 60 : Number(/^\*\/(\d+) /.exec(schedule ?? '')?.[1])

    // A not-before on an hourly pass is a text an hour late, so the two change together.
    expect(SEND_PASS_EVERY_MINUTES).toBe(everyMinutes)
  })
})
