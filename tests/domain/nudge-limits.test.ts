import { describe, expect, it } from 'vitest'
import { createTestClock, days, hours, minutes } from '~/domain/clock'
import { ministryId, outboundMessageId, personId } from '~/domain/ids'
import {
  nudgeHistoryWindow,
  nudgeRefusedBy,
  PILOT_NUDGE_LIMITS,
} from '~/domain/nudge-limits'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type {
  ContactDetails,
  MessageTransport,
  OutboundQueue,
  QueuedMessage,
  WithholdingReason,
} from '~/service/ports'

/**
 * The rule and the sending layer that enforces it, both driven without a database
 * and without a button. Ticket 11b puts Nudge on the follow-up item; the ceiling is
 * not waiting on it, which is the point of the seam between the two halves.
 */

const UTC = 'UTC'
/** Six hours behind UTC year-round, so a UTC day and a Ministry day disagree. */
const CHICAGO = 'America/Chicago'

const at = (iso: string): Date => new Date(iso)

describe('The nudge ceilings', () => {
  it('refuses a second nudge inside twelve hours', () => {
    const sent = [at('2026-03-02T09:00:00Z')]

    expect(
      nudgeRefusedBy(sent, at('2026-03-02T20:59:00Z'), UTC, PILOT_NUDGE_LIMITS),
    ).toBe('nudge_within_cooldown')
    expect(nudgeRefusedBy(sent, at('2026-03-02T21:00:00Z'), UTC, PILOT_NUDGE_LIMITS)).toBeNull()
  })

  /**
   * At the pilot values the daily cap cannot bind on its own: a twelve-hour
   * cooldown already allows at most two sends in a twenty-four hour day, and the
   * third is always on the next Ministry day. The cap is still enforced -- these
   * are starting values to be tuned from pilot data, and a cooldown tuned down is
   * exactly what leaves the day as the ceiling that holds. So the day is proven
   * with the cooldown out of the way rather than left unproven.
   */
  const DAY_BINDS = { ...PILOT_NUDGE_LIMITS, cooldown: 0 }

  it('refuses a third nudge on the same day', () => {
    const sent = [at('2026-03-02T08:00:00Z'), at('2026-03-02T20:00:00Z')]

    expect(nudgeRefusedBy(sent, at('2026-03-02T22:00:00Z'), UTC, DAY_BINDS)).toBe(
      'nudge_daily_cap_reached',
    )
    // The next Ministry day starts the count again.
    expect(nudgeRefusedBy(sent, at('2026-03-03T00:30:00Z'), UTC, DAY_BINDS)).toBeNull()
  })

  it('lets the day roll over without letting the week', () => {
    const sent = [
      at('2026-03-02T08:00:00Z'),
      at('2026-03-02T20:00:00Z'),
      at('2026-03-03T08:30:00Z'),
      at('2026-03-03T20:30:00Z'),
    ]

    // A new day, and the daily cap is clear -- but four have gone out since Monday.
    expect(nudgeRefusedBy(sent, at('2026-03-04T09:00:00Z'), UTC, PILOT_NUDGE_LIMITS)).toBe(
      'nudge_weekly_cap_reached',
    )

    // The following ISO week opens on Monday 9 March and the count starts again.
    expect(
      nudgeRefusedBy(sent, at('2026-03-09T09:00:00Z'), UTC, PILOT_NUDGE_LIMITS),
    ).toBeNull()
  })

  it('counts a day the Ministry would recognise, not a UTC one', () => {
    // 03:00 UTC on Tuesday is still 21:00 Monday in Chicago. Both of these are the
    // Ministry's Monday, so the second one is that Monday's second nudge.
    const sent = [at('2026-03-02T14:00:00Z'), at('2026-03-03T03:00:00Z')]

    // 04:00 UTC is 22:00 Monday locally: the Ministry's day is full.
    expect(nudgeRefusedBy(sent, at('2026-03-03T04:00:00Z'), CHICAGO, DAY_BINDS)).toBe(
      'nudge_daily_cap_reached',
    )

    // Read as UTC the same history shows one nudge on Monday and one on Tuesday,
    // and would let a third through on a day the Ministry considers full.
    expect(nudgeRefusedBy(sent, at('2026-03-03T04:00:00Z'), UTC, DAY_BINDS)).toBeNull()
  })

  it('starts the week where the check-in counters start it', () => {
    // Sunday 8 March closes an ISO week; Monday 9 March opens the next one.
    const sent = [
      at('2026-03-04T09:00:00Z'),
      at('2026-03-05T09:00:00Z'),
      at('2026-03-06T09:00:00Z'),
      at('2026-03-08T09:00:00Z'),
    ]

    expect(nudgeRefusedBy(sent, at('2026-03-08T22:00:00Z'), UTC, PILOT_NUDGE_LIMITS)).toBe(
      'nudge_weekly_cap_reached',
    )
    // A rolling seven days would still refuse here. The ISO week does not, and that
    // is the whole reason the cap and the check-in week share one function.
    expect(
      nudgeRefusedBy(sent, at('2026-03-09T22:00:00Z'), UTC, PILOT_NUDGE_LIMITS),
    ).toBeNull()
  })

  it('permits the first nudge a Person has ever been sent', () => {
    expect(nudgeRefusedBy([], at('2026-03-02T09:00:00Z'), UTC, PILOT_NUDGE_LIMITS)).toBeNull()
  })

  it('looks back far enough to see the whole of the week in progress', () => {
    // The window has to cover an ISO week that opened seven days ago, whatever the
    // cooldown is; a longer cooldown widens it rather than being read too short.
    expect(nudgeHistoryWindow(PILOT_NUDGE_LIMITS)).toBeGreaterThanOrEqual(days(8))
    expect(nudgeHistoryWindow({ ...PILOT_NUDGE_LIMITS, cooldown: days(30) })).toBe(days(30))
  })
})

describe('The sending layer enforces the ceilings, not the button', () => {
  const ministry = ministryId('11111111-1111-4111-8111-111111111111')
  const recipient = personId('22222222-2222-4222-8222-222222222222')

  /**
   * A queue in memory that behaves the way the Postgres one does: `nudgesSentTo`
   * answers about nudges that were *sent*, so a withheld one leaves no trace in
   * anybody's budget.
   */
  const queueOf = (
    pending: readonly QueuedMessage[],
    timeZone = UTC,
  ) => {
    const sentAt: Date[] = []
    const withheld: { id: string; reason: WithholdingReason }[] = []
    let remaining = [...pending]

    const queue: OutboundQueue = {
      async due() {
        const next = remaining
        remaining = []
        return next
      },
      async mayReceive(): Promise<WithholdingReason | null> {
        return null
      },
      async timeZoneOf() {
        return timeZone
      },
      async nudgesSentTo(_ministry, _person, since) {
        return sentAt.filter((instant) => instant >= since)
      },
      async contactToShare(): Promise<ContactDetails | null> {
        return null
      },
      async markSent(_ministry, _id, when) {
        sentAt.push(when)
      },
      async withhold(_ministry, id, reason) {
        withheld.push({ id, reason })
      },
    }

    return {
      queue,
      withheld,
      sentAt,
      /** Queues one more nudge, the way another click would. */
      enqueue: (message: QueuedMessage) => {
        remaining = [...remaining, message]
      },
    }
  }

  const nudge = (n: number): QueuedMessage => ({
    id: outboundMessageId(`33333333-3333-4333-8333-${String(n).padStart(12, '0')}`),
    personId: recipient,
    toPhone: '+15555550123',
    body: 'A quick check in from Riverside Chapel.',
    disclosesPersonId: null,
    kind: 'nudge',
  })

  const delivered: string[] = []
  const transport: MessageTransport = {
    async deliver(_to, body) {
      delivered.push(body)
    },
  }

  it('sends one message for twenty clicks', async () => {
    delivered.length = 0
    const clock = createTestClock(at('2026-03-02T09:00:00Z'))
    const twentyClicks = Array.from({ length: 20 }, (_, n) => nudge(n))
    const { queue, withheld } = queueOf(twentyClicks)

    const outcome = await dispatchQueue({ queue, transport, clock, ministryId: ministry })

    expect(outcome).toEqual({ sent: 1, withheld: 19 })
    expect(delivered).toHaveLength(1)
    // And the nineteen say which ceiling refused them rather than vanishing.
    expect(new Set(withheld.map((row) => row.reason))).toEqual(
      new Set(['nudge_within_cooldown']),
    )
  })

  it('releases the next nudge only once the cooldown has run', async () => {
    delivered.length = 0
    const clock = createTestClock(at('2026-03-02T09:00:00Z'))
    const drain = queueOf([nudge(1)])

    await dispatchQueue({ queue: drain.queue, transport, clock, ministryId: ministry })
    expect(delivered).toHaveLength(1)

    clock.advanceBy(hours(12) - minutes(1))
    drain.enqueue(nudge(2))
    await dispatchQueue({ queue: drain.queue, transport, clock, ministryId: ministry })
    expect(delivered).toHaveLength(1)

    clock.advanceBy(minutes(1))
    drain.enqueue(nudge(3))
    await dispatchQueue({ queue: drain.queue, transport, clock, ministryId: ministry })
    expect(delivered).toHaveLength(2)
  })

  it('stops at four in a week however patiently an Admin waits', async () => {
    delivered.length = 0
    const clock = createTestClock(at('2026-03-02T08:00:00Z'))
    const drain = queueOf([nudge(1)])

    // Twelve hours and a minute apart, so the cooldown never binds and the run
    // stops for the reason the week says rather than for the reason the clock does.
    await dispatchQueue({ queue: drain.queue, transport, clock, ministryId: ministry })
    for (let n = 2; n <= 8; n++) {
      clock.advanceBy(hours(12) + minutes(1))
      drain.enqueue(nudge(n))
      await dispatchQueue({ queue: drain.queue, transport, clock, ministryId: ministry })
    }

    // Eight attempts across Monday to Thursday of one ISO week. Four go out; the
    // rest are refused by the week, never by the day, because a twelve-hour
    // cooldown already allows at most two in a Ministry day.
    expect(delivered).toHaveLength(4)
    expect(drain.withheld.map((row) => row.reason)).toEqual([
      'nudge_weekly_cap_reached',
      'nudge_weekly_cap_reached',
      'nudge_weekly_cap_reached',
      'nudge_weekly_cap_reached',
    ])
  })

  it('does not meter the Check-In Rhythm', async () => {
    delivered.length = 0
    const clock = createTestClock(at('2026-03-02T09:00:00Z'))
    const rhythm = Array.from({ length: 20 }, (_, n) => ({
      ...nudge(n),
      body: 'Did you meet with Marcus this week?',
      kind: 'other' as const,
    }))
    const { queue, withheld } = queueOf(rhythm)

    const outcome = await dispatchQueue({ queue, transport, clock, ministryId: ministry })

    expect(outcome).toEqual({ sent: 20, withheld: 0 })
    expect(withheld).toEqual([])
  })

  it('spends no budget on a nudge that was withheld', async () => {
    delivered.length = 0
    const clock = createTestClock(at('2026-03-02T09:00:00Z'))
    const drain = queueOf([nudge(1), nudge(2), nudge(3)])

    await dispatchQueue({ queue: drain.queue, transport, clock, ministryId: ministry })
    expect(delivered).toHaveLength(1)
    expect(drain.withheld).toHaveLength(2)

    // Two were refused. Had either counted, this Person's day would be full and the
    // nudge after the cooldown would be refused too -- which is the shape ticket 20
    // depends on when it holds a message rather than sending it.
    clock.advanceBy(hours(12) + minutes(1))
    drain.enqueue(nudge(4))
    await dispatchQueue({ queue: drain.queue, transport, clock, ministryId: ministry })
    expect(delivered).toHaveLength(2)
  })

  it('takes the limits as configuration', async () => {
    delivered.length = 0
    const clock = createTestClock(at('2026-03-02T09:00:00Z'))
    const drain = queueOf([nudge(1), nudge(2)])

    // Nothing about the rule changes when the numbers do, which is what "the limits
    // are configuration" has to mean if tuning them from pilot data is to be an edit.
    await dispatchQueue({
      queue: drain.queue,
      transport,
      clock,
      ministryId: ministry,
      nudgeLimits: { cooldown: 0, perDay: 2, perWeek: 4 },
    })

    expect(delivered).toHaveLength(2)
    expect(drain.withheld).toEqual([])
  })
})
