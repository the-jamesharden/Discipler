import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { EmailEnvelope } from '~/domain/email'
import type { GrowthHistory, GrowthMembership, GrowthPause, GrowthRelationship } from '~/domain/growth'
import { fewestPeopleInActiveRelationships } from '~/domain/growth'
import { ministryId, type MinistryId } from '~/domain/ids'
import {
  closedMonthsToAsk,
  over200FollowUpFor,
  type ChurchPriceRecord,
} from '~/domain/over-200'
import type { BillingStanding } from '~/domain/billing'
import type { CalendarMonth } from '~/domain/week'
import { FIRST_PRICE_LOOKUP_KEYS, firstPriceIdsIn } from '~/platform/stripe/prices'
import { createEmailSender } from '~/service/email-sender'
import { watchOver200Churches } from '~/service/over-200-watch'
import type {
  EmailTransport,
  Over200Church,
  Over200FollowUp,
  Over200FollowUps,
} from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'

/**
 * A church on $97 that stays above 200 people for a whole calendar month causes one
 * email to support@ (Exponential launch, ticket 14). The rule is read here from
 * histories written by hand, and the watch is driven through the real sender with a
 * recording transport at the vendor's port, so what is checked is the email that
 * would have left.
 */

const at = (iso: string) => new Date(iso)
const month = (value: string) => value as CalendarMonth

const MONTHLY_97 = 'price_97_monthly'
const YEARLY_97 = 'price_97_yearly'
const MONTHLY_147 = 'price_147_monthly'
const FIRST_PRICES = [MONTHLY_97, YEARLY_97]

const LONG_AGO = at('2026-01-01T00:00:00Z')

/** One Group of `people` Disciples and no Leader, running from long ago unless told otherwise. */
const groupOf = (
  id: string,
  people: number,
  options: { acceptedAt?: Date | null; endedAt?: Date | null; startedAt?: Date; firstPerson?: number } = {},
): { relationship: GrowthRelationship; members: GrowthMembership[] } => {
  const startedAt = options.startedAt ?? LONG_AGO
  return {
    relationship: {
      id,
      name: id,
      createdAt: startedAt,
      acceptedAt: options.acceptedAt === undefined ? startedAt : options.acceptedAt,
      endedAt: options.endedAt ?? null,
    },
    members: Array.from({ length: people }, (_, index) => ({
      relationshipId: id,
      personId: `person-${(options.firstPerson ?? 0) + index}`,
      role: 'participant' as const,
      startedAt,
      endedAt: options.endedAt ?? null,
      acceptedAt: null,
    })),
  }
}

const historyOf = (
  groups: readonly ReturnType<typeof groupOf>[],
  extra: { members?: readonly GrowthMembership[]; pauses?: readonly GrowthPause[] } = {},
): GrowthHistory => ({
  openedAt: LONG_AGO,
  relationships: groups.map((group) => group.relationship),
  members: [...groups.flatMap((group) => group.members), ...(extra.members ?? [])],
  pauses: extra.pauses ?? [],
})

/** 201 people, one over the limit, in one Group that runs throughout. */
const stayingAbove = () => historyOf([groupOf('g', 201)])

const onTheFirstPriceSince = (when: Date): readonly ChurchPriceRecord[] => [
  { at: when, status: 'active', priceId: MONTHLY_97 },
]

const question = (overrides: Partial<Parameters<typeof over200FollowUpFor>[0]> = {}) =>
  over200FollowUpFor({
    month: month('2026-10'),
    timeZone: 'America/Chicago',
    history: stayingAbove(),
    prices: onTheFirstPriceSince(LONG_AGO),
    standing: 'active',
    firstPrices: FIRST_PRICES,
    ...overrides,
  })

describe('who counts as a person in an active relationship', () => {
  const instant = at('2026-10-15T12:00:00Z')
  const counted = (history: GrowthHistory) =>
    fewestPeopleInActiveRelationships(history, instant, new Date(instant.getTime() + 1))

  it('counts Disciplers and Disciples together, each person once', () => {
    const history = historyOf(
      [groupOf('a', 2), groupOf('b', 2, { firstPerson: 1 })],
      {
        members: [
          { relationshipId: 'a', personId: 'discipler', role: 'leader', startedAt: LONG_AGO, endedAt: null, acceptedAt: LONG_AGO },
          { relationshipId: 'b', personId: 'discipler', role: 'leader', startedAt: LONG_AGO, endedAt: null, acceptedAt: LONG_AGO },
          // Discipling in one and discipled in the other is still one person.
          { relationshipId: 'b', personId: 'person-0', role: 'leader', startedAt: LONG_AGO, endedAt: null, acceptedAt: LONG_AGO },
        ],
      },
    )

    expect(counted(history)).toBe(4)
  })

  it('leaves out a Discipler who has not accepted yet', () => {
    const history = historyOf([groupOf('a', 1)], {
      members: [{ relationshipId: 'a', personId: 'invited', role: 'leader', startedAt: LONG_AGO, endedAt: null, acceptedAt: null }],
    })

    expect(counted(history)).toBe(1)
  })

  it('leaves out a relationship nobody accepted, one that ended and one that is paused', () => {
    const history = historyOf(
      [
        groupOf('never-accepted', 3, { acceptedAt: null }),
        groupOf('ended', 3, { firstPerson: 10, endedAt: at('2026-10-01T00:00:00Z') }),
        groupOf('paused', 3, { firstPerson: 20 }),
        groupOf('running', 2, { firstPerson: 30 }),
      ],
      { pauses: [{ relationshipId: 'paused', kind: 'paused', at: at('2026-10-02T00:00:00Z') }] },
    )

    expect(counted(history)).toBe(2)
  })

  it('counts a relationship again once it has been resumed', () => {
    const history = historyOf([groupOf('a', 3)], {
      pauses: [
        { relationshipId: 'a', kind: 'paused', at: at('2026-10-02T00:00:00Z') },
        { relationshipId: 'a', kind: 'resumed', at: at('2026-10-10T00:00:00Z') },
      ],
    })

    expect(counted(history)).toBe(3)
  })
})

describe('the fewest people across a span', () => {
  it('finds a dip that opened and closed inside the span, however short', () => {
    const pauses: GrowthPause[] = [
      { relationshipId: 'small', kind: 'paused', at: at('2026-10-12T15:00:00Z') },
      { relationshipId: 'small', kind: 'resumed', at: at('2026-10-12T15:01:00Z') },
    ]
    const history = historyOf([groupOf('big', 201), groupOf('small', 5, { firstPerson: 1000 })], { pauses })

    expect(
      fewestPeopleInActiveRelationships(history, at('2026-10-01T00:00:00Z'), at('2026-11-01T00:00:00Z')),
    ).toBe(201)
  })

  it('takes one moved at a single instant as no dip at all', () => {
    const moved = at('2026-10-12T15:00:00Z')
    const history = historyOf([
      groupOf('stays', 200),
      groupOf('from', 1, { firstPerson: 500, endedAt: moved }),
      groupOf('to', 1, { firstPerson: 500, startedAt: moved }),
    ])

    expect(
      fewestPeopleInActiveRelationships(history, at('2026-10-01T00:00:00Z'), at('2026-11-01T00:00:00Z')),
    ).toBe(201)
  })

  it('does not count what happens at the instant the span closes', () => {
    const closes = at('2026-11-01T00:00:00Z')
    const history = historyOf([groupOf('a', 201, { endedAt: closes })])

    expect(fewestPeopleInActiveRelationships(history, at('2026-10-01T00:00:00Z'), closes)).toBe(201)
  })
})

describe('above 200 for a whole calendar month', () => {
  it('asks for a follow-up from a church above 200 throughout', () => {
    expect(question()).toEqual({ month: '2026-10', fewestPeople: 201 })
  })

  it('asks for none from a church that dips under 200 in the month', () => {
    const history = historyOf([
      groupOf('stays', 190),
      groupOf('leaves', 20, { firstPerson: 500, endedAt: at('2026-10-14T12:00:00Z') }),
      groupOf('arrives', 20, { firstPerson: 900, startedAt: at('2026-10-16T12:00:00Z') }),
    ])

    expect(question({ history })).toBeNull()
  })

  it('asks for none from a church at exactly 200, which is not above it', () => {
    expect(question({ history: historyOf([groupOf('g', 200)]) })).toBeNull()
  })

  it('asks for none from a church that touched 200 for a minute', () => {
    const history = historyOf([groupOf('big', 200), groupOf('small', 5, { firstPerson: 1000 })], {
      pauses: [
        { relationshipId: 'small', kind: 'paused', at: at('2026-10-12T15:00:00Z') },
        { relationshipId: 'small', kind: 'resumed', at: at('2026-10-12T15:01:00Z') },
      ],
    })

    expect(question({ history })).toBeNull()
  })

  it('reports the lowest the church reached', () => {
    const history = historyOf([
      groupOf('stays', 210),
      groupOf('arrives', 40, { firstPerson: 500, startedAt: at('2026-10-16T12:00:00Z') }),
    ])

    expect(question({ history })).toEqual({ month: '2026-10', fewestPeople: 210 })
  })
})

describe('a month is the church\'s own', () => {
  // On 2026-11-01 at 03:00 UTC it is still 31 October in America, and already
  // November in Tokyo.
  const dipEndsTheNight = () =>
    historyOf([
      groupOf('stays', 200),
      groupOf('leaves', 10, { firstPerson: 500, endedAt: at('2026-11-01T03:00:00Z') }),
      groupOf('arrives', 10, { firstPerson: 900, startedAt: at('2026-11-01T04:30:00Z') }),
    ])

  it('counts a dip late on the 31st against October in New York', () => {
    expect(question({ timeZone: 'America/New_York', history: dipEndsTheNight() })).toBeNull()
  })

  it('counts the same dip against November in Tokyo, leaving October whole', () => {
    expect(question({ timeZone: 'Asia/Tokyo', history: dipEndsTheNight() })).toEqual({
      month: '2026-10',
      fewestPeople: 210,
    })
  })

  it('does not close a month until it has closed at the church', () => {
    // New York's October closes at 04:00 UTC, Los Angeles's at 07:00 UTC.
    const when = at('2026-11-01T05:00:00Z')

    expect(closedMonthsToAsk(when, 'America/New_York')).toContain('2026-10')
    expect(closedMonthsToAsk(when, 'America/Los_Angeles')).not.toContain('2026-10')
  })

  it('takes the 25-hour day of a clock change in its stride', () => {
    // 1 November 2026 is the day the clocks go back in New York: the month that
    // opens that midnight and the month after it are both read on the wall.
    const history = historyOf([
      groupOf('stays', 200),
      groupOf('arrives', 1, { firstPerson: 500, startedAt: at('2026-11-01T04:00:00Z') }),
    ])

    expect(question({ month: month('2026-11'), timeZone: 'America/New_York', history })).toEqual({
      month: '2026-11',
      fewestPeople: 201,
    })
    // Arriving a second after the month opened leaves its first second at 200.
    const late = historyOf([
      groupOf('stays', 200),
      groupOf('arrives', 1, { firstPerson: 500, startedAt: at('2026-11-01T04:00:01Z') }),
    ])
    expect(question({ month: month('2026-11'), timeZone: 'America/New_York', history: late })).toBeNull()
  })
})

describe('a church that signed up mid-month', () => {
  const signedUp = at('2026-11-15T18:00:00Z')
  const history = () => historyOf([groupOf('g', 300, { startedAt: signedUp })])
  const prices = onTheFirstPriceSince(signedUp)

  it('gets no follow-up for the month it signed up in, however many it brought', () => {
    expect(question({ month: month('2026-11'), history: history(), prices })).toBeNull()
  })

  it('is answered first for its first whole calendar month', () => {
    expect(question({ month: month('2026-12'), history: history(), prices })).toEqual({
      month: '2026-12',
      fewestPeople: 300,
    })
  })

  it('is not credited with a history brought in from before it subscribed', () => {
    expect(question({ month: month('2026-10'), history: stayingAbove(), prices })).toBeNull()
  })
})

describe('only a church on the $97 price', () => {
  const opens = at('2026-10-01T05:00:00Z')

  it('counts the yearly bill of the same price', () => {
    expect(question({ prices: [{ at: LONG_AGO, status: 'active', priceId: YEARLY_97 }] })).not.toBeNull()
  })

  it('counts a free trial and a payment Stripe is still retrying', () => {
    expect(question({ prices: [{ at: LONG_AGO, status: 'trialing', priceId: MONTHLY_97 }] })).not.toBeNull()
    expect(question({ prices: [{ at: LONG_AGO, status: 'past_due', priceId: MONTHLY_97 }] })).not.toBeNull()
  })

  it('leaves out a church on $147', () => {
    expect(question({ prices: [{ at: LONG_AGO, status: 'active', priceId: MONTHLY_147 }] })).toBeNull()
  })

  it('leaves out a church with no Subscription on record, as one billed outside Stripe has', () => {
    expect(question({ prices: [] })).toBeNull()
  })

  it('leaves out a church billed outside Stripe, whatever its history says', () => {
    expect(question({ standing: 'outside_stripe' })).toBeNull()
  })

  it('leaves out a church whose Subscription has not finished starting', () => {
    expect(question({ standing: 'incomplete' })).toBeNull()
  })

  it('leaves out a church that ended', () => {
    expect(
      question({
        prices: [
          { at: LONG_AGO, status: 'active', priceId: MONTHLY_97 },
          { at: at('2026-11-02T00:00:00Z'), status: 'canceled', priceId: MONTHLY_97 },
        ],
      }),
    ).toBeNull()
  })

  it('leaves out a church moved to $147 before it could be answered', () => {
    expect(
      question({
        prices: [
          { at: LONG_AGO, status: 'active', priceId: MONTHLY_97 },
          { at: at('2026-11-01T02:00:00Z'), status: 'active', priceId: MONTHLY_147 },
        ],
      }),
    ).toBeNull()
  })

  it('leaves out a church that came to $97 partway through the month', () => {
    expect(
      question({
        prices: [
          { at: LONG_AGO, status: 'active', priceId: MONTHLY_147 },
          { at: at('2026-10-20T00:00:00Z'), status: 'active', priceId: MONTHLY_97 },
        ],
      }),
    ).toBeNull()
  })

  it('leaves out a church whose Subscription lapsed and restarted inside the month', () => {
    expect(
      question({
        prices: [
          { at: LONG_AGO, status: 'active', priceId: MONTHLY_97 },
          { at: at('2026-10-10T00:00:00Z'), status: 'canceled', priceId: MONTHLY_97 },
          { at: at('2026-10-12T00:00:00Z'), status: 'active', priceId: MONTHLY_97 },
        ],
      }),
    ).toBeNull()
  })

  it('takes a record at the instant the month opens as being on it from the start', () => {
    expect(question({ prices: onTheFirstPriceSince(opens) })).not.toBeNull()
  })
})

describe('which prices are the first price', () => {
  const stripeKnowing = (...keys: readonly string[]) => ({
    prices: {
      list: async () => ({ data: keys.map((key) => ({ id: `id_of_${key}`, lookup_key: key })) }),
    },
  })
  const [monthly, yearly] = FIRST_PRICE_LOOKUP_KEYS

  it('asks Stripe by lookup key, in whichever account this is', async () => {
    expect(await firstPriceIdsIn(stripeKnowing(yearly, monthly))).toEqual([`id_of_${monthly}`, `id_of_${yearly}`])
  })

  it('needs both, so a yearly church cannot be missed quietly', async () => {
    expect(await firstPriceIdsIn(stripeKnowing(monthly))).toBeNull()
    expect(await firstPriceIdsIn(stripeKnowing())).toBeNull()
  })
})

// --------------------------------------------------------------------------------
// The watch: one email per church per month, whatever fails
// --------------------------------------------------------------------------------

const RIVERSIDE = ministryId('00000000-0000-4000-8000-000000000001')
const NORTHGATE = ministryId('00000000-0000-4000-8000-000000000002')

interface WorldChurch {
  readonly id: MinistryId
  readonly name: string
  readonly timeZone: string
  history: GrowthHistory
  prices: readonly ChurchPriceRecord[]
  standing: BillingStanding
}

const world = (now: string, churches: readonly WorldChurch[]) => {
  const clock = createTestClock(at(now))
  const delivered: EmailEnvelope[] = []
  /** Every key the vendor was handed, sent or not. */
  const attempted: string[] = []
  const faults: { sending: Error | null; recording: Error | null; reading: MinistryId | null } = {
    sending: null,
    recording: null,
    reading: null,
  }

  const transport: EmailTransport = {
    async deliver(envelope) {
      attempted.push(envelope.idempotencyKey)
      if (faults.sending) throw faults.sending
      delivered.push(envelope)
    },
  }

  const rows: (Over200FollowUp & { toldAt: Date | null })[] = []
  const follow: Over200FollowUps = {
    async churchesToAsk() {
      return churches.map(
        (church): Over200Church => ({
          id: church.id,
          name: church.name,
          timeZone: church.timeZone,
          customerId: `cus_${church.name.replace(/\s/g, '')}`,
          followedUp: rows.filter((row) => row.church === church.id).map((row) => row.month),
        }),
      )
    },
    async recordsOf(id) {
      if (faults.reading === id) throw new Error('Could not read this church')
      const church = churches.find((one) => one.id === id)!
      return { history: church.history, prices: church.prices, standing: church.standing }
    },
    async record(followUp) {
      if (rows.some((row) => row.church === followUp.church && row.month === followUp.month)) return
      rows.push({ ...followUp, toldAt: null })
    },
    async unsent() {
      return rows.filter((row) => row.toldAt === null)
    },
    async recordTold(church, told, when) {
      if (faults.recording) throw faults.recording
      const row = rows.find((one) => one.church === church && one.month === told)!
      row.toldAt = when
    },
  }

  const alerts = createEmailSupportAlerts(createEmailSender(transport))
  const pass = () =>
    watchOver200Churches({ followUps: follow, alerts, clock, firstPrices: FIRST_PRICES })

  return { clock, delivered, attempted, faults, rows, pass }
}

const riverside = (overrides: Partial<WorldChurch> = {}): WorldChurch => ({
  id: RIVERSIDE,
  name: 'Riverside Chapel',
  timeZone: 'America/Chicago',
  history: stayingAbove(),
  prices: onTheFirstPriceSince(LONG_AGO),
  standing: 'active',
  ...overrides,
})

const HOUR = 60 * 60 * 1000

/** Limits the fixture to the months since the church first went on $97, as a real one has. */
const FROM_SEPTEMBER = onTheFirstPriceSince(at('2026-09-01T00:00:00Z'))

describe('the watch, on every hourly pass', () => {
  it('sends one email for a month and none on the passes after it', async () => {
    const { delivered, pass, clock } = world('2026-11-01T06:00:00Z', [riverside({ prices: FROM_SEPTEMBER })])

    expect(await pass()).toEqual({ told: 2, failed: 0 })
    clock.advanceBy(HOUR)
    expect(await pass()).toEqual({ told: 0, failed: 0 })
    clock.advanceBy(HOUR * 24 * 3)
    expect(await pass()).toEqual({ told: 0, failed: 0 })

    // September and October, each once, each read from the history.
    expect(delivered.map((email) => email.subject)).toEqual([
      'Riverside Chapel stayed above 200 people through September 2026',
      'Riverside Chapel stayed above 200 people through October 2026',
    ])
  })

  it('sends one more the next month, under its own key', async () => {
    const { delivered, pass, clock } = world('2026-11-01T06:00:00Z', [
      riverside({ prices: onTheFirstPriceSince(at('2026-10-01T00:00:00Z')) }),
    ])

    await pass()
    clock.advanceBy(HOUR * 24 * 30)
    await pass()

    expect(delivered.map((email) => email.idempotencyKey)).toEqual([
      `over200FollowUp/over-200:${RIVERSIDE}:2026-10`,
      `over200FollowUp/over-200:${RIVERSIDE}:2026-11`,
    ])
  })

  it('sends nothing before the month has closed at the church', async () => {
    const church = riverside({
      timeZone: 'America/Los_Angeles',
      prices: onTheFirstPriceSince(at('2026-10-01T00:00:00Z')),
    })
    const { delivered, pass, clock } = world('2026-11-01T06:30:00Z', [church])

    await pass()
    expect(delivered).toHaveLength(0)

    clock.advanceBy(HOUR)
    await pass()
    expect(delivered).toHaveLength(1)
  })

  it('sends none for a church that dipped', async () => {
    const dipped = historyOf([
      groupOf('stays', 190),
      groupOf('leaves', 20, { firstPerson: 500, endedAt: at('2026-10-14T12:00:00Z') }),
      groupOf('arrives', 20, { firstPerson: 900, startedAt: at('2026-10-16T12:00:00Z') }),
    ])
    const { delivered, pass, rows } = world('2026-11-01T06:00:00Z', [
      riverside({ history: dipped, prices: onTheFirstPriceSince(at('2026-10-01T00:00:00Z')) }),
    ])

    expect(await pass()).toEqual({ told: 0, failed: 0 })
    expect(delivered).toHaveLength(0)
    expect(rows).toHaveLength(0)
  })

  it('still answers a month when the passes that should have answered it never ran', async () => {
    // Nothing ran through the whole of November: October is still answered in December.
    const { delivered, pass } = world('2026-12-01T07:00:00Z', [
      riverside({ prices: onTheFirstPriceSince(at('2026-10-01T00:00:00Z')) }),
    ])

    await pass()

    expect(delivered.map((email) => email.subject)).toEqual([
      'Riverside Chapel stayed above 200 people through October 2026',
      'Riverside Chapel stayed above 200 people through November 2026',
    ])
  })

  it('tries again on the next pass after the email fails, and then sends it once', async () => {
    const { delivered, attempted, pass, clock, faults } = world('2026-11-01T06:00:00Z', [
      riverside({ prices: onTheFirstPriceSince(at('2026-10-01T00:00:00Z')) }),
    ])

    faults.sending = new Error('Resend is down')
    expect(await pass()).toEqual({ told: 0, failed: 1 })
    expect(delivered).toHaveLength(0)

    clock.advanceBy(HOUR)
    expect(await pass()).toEqual({ told: 0, failed: 1 })

    faults.sending = null
    clock.advanceBy(HOUR)
    expect(await pass()).toEqual({ told: 1, failed: 0 })
    clock.advanceBy(HOUR)
    expect(await pass()).toEqual({ told: 0, failed: 0 })

    expect(delivered).toHaveLength(1)
    expect(new Set(attempted).size).toBe(1)
  })

  it('goes on trying an email that kept failing past the month after it', async () => {
    const { delivered, pass, clock, faults } = world('2026-11-01T06:00:00Z', [
      riverside({ prices: onTheFirstPriceSince(at('2026-10-01T00:00:00Z')) }),
    ])

    faults.sending = new Error('Resend is down')
    await pass()
    // Past where the watch would look back to ask the question again.
    clock.advanceBy(HOUR * 24 * 100)
    faults.sending = null
    await pass()

    expect(delivered.map((email) => email.subject)).toContain(
      'Riverside Chapel stayed above 200 people through October 2026',
    )
    expect(delivered.filter((email) => email.subject.includes('October'))).toHaveLength(1)
  })

  it('sends a retry word for word under the same key when the email went but was not recorded', async () => {
    const church = riverside({ prices: onTheFirstPriceSince(at('2026-10-01T00:00:00Z')) })
    const { delivered, pass, clock, faults } = world('2026-11-01T06:00:00Z', [church])

    faults.recording = new Error('The database went away')
    expect(await pass()).toEqual({ told: 0, failed: 1 })

    // Whatever has moved since, the retry is what the first attempt said.
    church.history = historyOf([groupOf('g', 500)])
    faults.recording = null
    clock.advanceBy(HOUR)
    expect(await pass()).toEqual({ told: 1, failed: 0 })

    // The recording transport here keeps both; Resend drops the second by its key.
    expect(delivered).toHaveLength(2)
    expect(delivered[1]).toEqual(delivered[0])

    clock.advanceBy(HOUR)
    expect(await pass()).toEqual({ told: 0, failed: 0 })
    expect(delivered).toHaveLength(2)
  })

  it('does not let one church stop another', async () => {
    const from = onTheFirstPriceSince(at('2026-10-01T00:00:00Z'))
    const { delivered, pass, faults } = world('2026-11-01T06:00:00Z', [
      riverside({ prices: from }),
      riverside({ id: NORTHGATE, name: 'Northgate Fellowship', prices: from }),
    ])

    faults.reading = RIVERSIDE
    expect(await pass()).toEqual({ told: 1, failed: 1 })

    expect(delivered.map((email) => email.subject)).toEqual([
      'Northgate Fellowship stayed above 200 people through October 2026',
    ])
  })

  it('tells support@ and carries nothing about the congregation', async () => {
    const history = historyOf([groupOf('Thursday Table', 203)], {
      members: [
        {
          relationshipId: 'Thursday Table',
          personId: 'Ana Ruiz',
          role: 'leader',
          startedAt: LONG_AGO,
          endedAt: null,
          acceptedAt: LONG_AGO,
        },
      ],
    })
    const { delivered, pass } = world('2026-11-01T06:00:00Z', [
      riverside({ history, prices: onTheFirstPriceSince(at('2026-10-01T00:00:00Z')) }),
    ])

    await pass()

    expect(delivered).toHaveLength(1)
    const email = delivered[0]!
    expect(email.kind).toBe('over200FollowUp')
    expect(email.to).toEqual(['support@trydiscipler.com'])
    expect(email.text).toContain('204')
    expect(email.text).toContain('cus_RiversideChapel')
    expect(email.text).not.toContain('Ana Ruiz')
    expect(email.text).not.toContain('Thursday Table')
    expect(email.text).not.toContain('person-')
  })
})
