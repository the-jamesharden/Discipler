import { describe, expect, it } from 'vitest'
import { days, weeks } from '~/domain/clock'
import {
  NOT_MEETING_WEEKS_BEFORE_STALLED,
  UNANSWERED_WEEKS_BEFORE_STALLED,
  deriveRelationshipState,
  type RaisedConcern,
  type RelationshipHistory,
  type RelationshipState,
  type RelationshipWeek,
} from '~/domain/relationship-state'
import { isoWeekOf } from '~/domain/week'

/**
 * State derivation is a pure function of one relationship's history and one
 * instant. Nothing below touches a database, a clock or a screen -- which is the
 * point: *two weeks of silence* and *three weeks of not meeting* are the two rules
 * the whole Care Needed view rests on, and both are provable in milliseconds.
 */

const timeZone = 'America/Chicago'

/** A Monday. Every week below is this one plus a whole number of weeks. */
const OPENED = new Date('2026-08-31T14:00:00Z')

const at = (week: number): Date => new Date(OPENED.getTime() + weeks(week))

const met = (week: number): RelationshipWeek => ({
  openedAt: at(week),
  closedAt: at(week),
  outcome: 'met',
  answeredAt: at(week),
})

const didNotMeet = (week: number): RelationshipWeek => ({
  openedAt: at(week),
  closedAt: at(week),
  outcome: 'did_not_meet',
  answeredAt: at(week),
})

/** Covered by a sequence that has since ended, with no reply: a settled silence. */
const unanswered = (week: number): RelationshipWeek => ({
  openedAt: at(week),
  closedAt: at(week + 1),
  outcome: 'unanswered',
  answeredAt: null,
})

/**
 * Covered by the sequence that is still running. No reply *yet* -- which is not
 * the same fact as no reply, and must not be counted as one.
 */
const inFlight = (week: number): RelationshipWeek => ({
  openedAt: at(week),
  closedAt: null,
  outcome: 'unanswered',
  answeredAt: null,
})

const concern = (week: number, resolvedAt: Date | null = null): RaisedConcern => ({
  raisedAt: at(week),
  resolvedAt,
})

const history = (over: Partial<RelationshipHistory> = {}): RelationshipHistory => ({
  acceptedAt: OPENED,
  endedAt: null,
  pausedAt: null,
  timeZone,
  weeks: [],
  concerns: [],
  ...over,
})

/**
 * The state matrix. One row per way a relationship can read, driven through the
 * same function, so a rule added for one state has to say what it does to the
 * others.
 */
describe('the state matrix', () => {
  const rows: readonly {
    readonly name: string
    readonly history: RelationshipHistory
    readonly now: Date
    readonly state: RelationshipState
  }[] = [
    {
      name: 'created and not yet accepted',
      history: history({ acceptedAt: null }),
      now: at(0),
      state: 'awaiting_leader_acceptance',
    },
    {
      name: 'accepted, with nothing else recorded yet',
      history: history(),
      now: at(0),
      state: 'healthy',
    },
    {
      name: 'meeting every week',
      history: history({ weeks: [met(1), met(2), met(3)] }),
      now: at(3),
      state: 'healthy',
    },
    {
      name: 'two consecutive weeks with no reply',
      history: history({ weeks: [met(1), unanswered(2), unanswered(3)] }),
      now: at(3),
      state: 'stalled',
    },
    {
      name: 'three consecutive weeks reported as no meeting',
      history: history({ weeks: [didNotMeet(1), didNotMeet(2), didNotMeet(3)] }),
      now: at(3),
      state: 'stalled',
    },
    {
      name: 'a Concern raised this week',
      history: history({ weeks: [met(3)], concerns: [concern(3)] }),
      now: at(3),
      state: 'needs_care',
    },
    {
      name: 'paused, whatever the history says',
      history: history({
        pausedAt: at(3),
        weeks: [unanswered(1), unanswered(2), unanswered(3)],
      }),
      now: at(3),
      state: 'paused',
    },
    {
      name: 'ended, whatever the history says',
      history: history({
        endedAt: at(3),
        weeks: [unanswered(1), unanswered(2), unanswered(3)],
        concerns: [concern(3)],
      }),
      now: at(3),
      state: 'ended',
    },
    {
      // Ended is terminal, and a Pause standing on it changes nothing. Ending is
      // the decision a Pause exists to defer, and a Ministry that has made it does
      // not have to resume a relationship for a moment in order to finish it.
      name: 'ended while it was paused',
      history: history({
        endedAt: at(3),
        pausedAt: at(2),
        weeks: [unanswered(1)],
      }),
      now: at(3),
      state: 'ended',
    },
  ]

  for (const row of rows) {
    it(`reads ${row.state} when ${row.name}`, () => {
      expect(deriveRelationshipState(row.history, row.now).state).toBe(row.state)
    })
  }

  /**
   * The assertion the settled comment on ticket 10 asks for, rather than a
   * precedence rule. The two cannot both hold: `Needs Care` needs a Concern raised
   * this week, which needs a `1` and then a `C` -- and that reply establishes the
   * meeting happened and the week was answered, which clears both Stalled
   * conditions. A precedence rule would be dead code that goes silently wrong the
   * day something else can raise a Concern; this fails loudly instead.
   */
  it('never reads Stalled without saying which condition fired', () => {
    for (const row of rows) {
      const derived = deriveRelationshipState(row.history, row.now)
      if (derived.state === 'stalled') expect(derived.reasons).not.toEqual([])
    }
  })

  it('refuses a history in which Stalled and Needs Care both hold', () => {
    // Unreachable today, and constructed by hand here for that reason: a Concern
    // needs a `1` then a `C`, and that `1` both answers the week and says a
    // meeting happened. The day something else can raise a Concern -- a
    // Participant check-in, an Admin raising one by hand -- this throws rather
    // than quietly picking a winner.
    expect(() =>
      deriveRelationshipState(
        history({ weeks: [unanswered(2), unanswered(3)], concerns: [concern(3)] }),
        at(3),
      ),
    ).toThrow(/Stalled and Needs Care/)
  })
})

describe('two weeks of silence', () => {
  it('is not stalled after one unanswered week', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [met(1), unanswered(2)] }),
      at(2),
    )

    expect(derived.state).toBe('healthy')
    expect(derived.reasons).toEqual([])
  })

  it('reports the silence in days since the last thing the Leader said', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [met(1), unanswered(2), unanswered(3)] }),
      new Date(at(3).getTime() + days(2)),
    )

    expect(derived.state).toBe('stalled')
    // Sixteen days: a fortnight from the week they last answered, plus the two
    // days into the third week the Admin is looking at it.
    expect(derived.reasons).toEqual([{ kind: 'gone_silent', days: 16 }])
  })

  it('counts from the first week it asked when the Leader has never answered', () => {
    // Not from acceptance, which can precede the first check-in by months: a
    // Leader who agreed in March on a Ministry whose cadence started in September
    // would otherwise be reported as two hundred days silent after exactly two
    // unanswered weeks. Discipler can only count from when it started asking.
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(2)] }),
      at(2),
    )

    expect(derived.reasons).toEqual([{ kind: 'gone_silent', days: 7 }])
  })

  it('does not report a silence longer than it has been asking', () => {
    const acceptedLongBefore = history({
      acceptedAt: new Date(OPENED.getTime() - days(200)),
      weeks: [unanswered(1), unanswered(2)],
    })

    expect(deriveRelationshipState(acceptedLongBefore, at(2)).reasons).toEqual([
      { kind: 'gone_silent', days: 7 },
    ])
  })

  it('clears on an answered check-in', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(2), met(3)] }),
      at(3),
    )

    expect(derived.state).toBe('healthy')
    expect(derived.reasons).toEqual([])
  })

  it('does not count the week whose conversation is still running', () => {
    // The moment the second week's sequence opens there are two covered weeks and
    // one settled silence. Counting the open one would report two weeks of silence
    // seven days in, which is the threshold the ticket says not to tighten.
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), inFlight(2)] }),
      at(2),
    )

    expect(derived.state).toBe('healthy')
    expect(derived.reasons).toEqual([])
  })

  it('reaches two weeks once the second conversation has ended', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(2), inFlight(3)] }),
      at(3),
    )

    expect(derived.state).toBe('stalled')
    // Fourteen days, not seven: two whole weeks went by unanswered before this
    // reached an Admin.
    expect(derived.reasons).toEqual([{ kind: 'gone_silent', days: 14 }])
  })

  it('still counts a week the Leader answered while its conversation runs', () => {
    // Determined by the answer rather than by the closing. The Leader has spoken
    // and nothing later in the week unsays it.
    const answeredButOpen: RelationshipWeek = {
      openedAt: at(2),
      closedAt: null,
      outcome: 'met',
      answeredAt: at(2),
    }

    expect(
      deriveRelationshipState(history({ weeks: [unanswered(1), answeredButOpen] }), at(2)).state,
    ).toBe('healthy')
  })

  it('takes two weeks and no fewer', () => {
    expect(UNANSWERED_WEEKS_BEFORE_STALLED).toBe(2)
  })
})

describe('three weeks of not meeting', () => {
  it('is not stalled after two', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [didNotMeet(1), didNotMeet(2)] }),
      at(2),
    )

    expect(derived.state).toBe('healthy')
  })

  it('reports the run in weeks, never in days', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [met(0), didNotMeet(1), didNotMeet(2), didNotMeet(3)] }),
      at(3),
    )

    expect(derived.state).toBe('stalled')
    expect(derived.reasons).toEqual([{ kind: 'not_meeting', weeks: 3 }])
  })

  it('keeps counting past the threshold', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [didNotMeet(1), didNotMeet(2), didNotMeet(3), didNotMeet(4)] }),
      at(4),
    )

    expect(derived.reasons).toEqual([{ kind: 'not_meeting', weeks: 4 }])
  })

  it('clears on a week they met', () => {
    const derived = deriveRelationshipState(
      history({
        weeks: [didNotMeet(1), didNotMeet(2), didNotMeet(3), met(4)],
      }),
      at(4),
    )

    expect(derived.state).toBe('healthy')
  })

  it('takes three weeks and no fewer', () => {
    expect(NOT_MEETING_WEEKS_BEFORE_STALLED).toBe(3)
  })
})

/**
 * The two reasons carry different units and are never interchangeable. An Admin
 * about to phone somebody has to know whether they are calling about silence or
 * about scheduling before they pick up.
 */
describe('the two reasons and their units', () => {
  it('gives silence a day count and no week count', () => {
    const [reason] = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(2)] }),
      at(2),
    ).reasons

    expect(reason?.kind).toBe('gone_silent')
    expect(reason).not.toHaveProperty('weeks')
  })

  it('gives not-meeting a week count and no day count', () => {
    const [reason] = deriveRelationshipState(
      history({ weeks: [didNotMeet(1), didNotMeet(2), didNotMeet(3)] }),
      at(3),
    ).reasons

    expect(reason?.kind).toBe('not_meeting')
    expect(reason).not.toHaveProperty('days')
  })
})

describe('a Concern', () => {
  it('sets Needs Care the week it is raised', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [met(3)], concerns: [concern(3)] }),
      at(3),
    )

    expect(derived.state).toBe('needs_care')
    expect(derived.openConcerns).toBe(1)
  })

  it('returns to Healthy the following week while the badge persists', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [met(3), met(4)], concerns: [concern(3)] }),
      at(4),
    )

    expect(derived.state).toBe('healthy')
    expect(derived.openConcerns).toBe(1)
  })

  it('does not clear itself on an answered check-in, the way Stalled does', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [met(3), met(4), met(5)], concerns: [concern(3)] }),
      at(5),
    )

    expect(derived.openConcerns).toBe(1)
  })

  it('leaves the badge behind once an Admin resolves it', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [met(3)], concerns: [concern(3, at(3))] }),
      at(4),
    )

    expect(derived.openConcerns).toBe(0)
  })

  it('shows a count when there is more than one outstanding', () => {
    const derived = deriveRelationshipState(
      history({
        weeks: [met(1), met(2), met(3)],
        concerns: [concern(1), concern(2), concern(3, at(3))],
      }),
      at(4),
    )

    expect(derived.openConcerns).toBe(2)
  })

  it('stands beside a Stalled relationship weeks later', () => {
    const derived = deriveRelationshipState(
      history({
        weeks: [met(1), unanswered(2), unanswered(3)],
        concerns: [concern(1)],
      }),
      at(3),
    )

    expect(derived.state).toBe('stalled')
    expect(derived.openConcerns).toBe(1)
  })
})

/**
 * Both counters are anchored to the ISO week in the Ministry timezone, never to
 * the interval since the last prompt. Moving the check-in day or hour moves when
 * a Leader is asked; it must not move which week an answer landed in.
 * See docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md.
 */
describe('the ISO week anchor', () => {
  it('counts two prompts falling in one ISO week as one week', () => {
    // A cadence edit from late Sunday to early Monday puts two prompts inside
    // seven days. The ISO week is what keeps that from reading as two.
    const monday = at(1)
    const friday = new Date(at(1).getTime() + days(4))

    const derived = deriveRelationshipState(
      history({
        weeks: [
          { openedAt: monday, closedAt: at(1), outcome: 'unanswered', answeredAt: null },
          { openedAt: friday, closedAt: at(1), outcome: 'unanswered', answeredAt: null },
        ],
      }),
      friday,
    )

    expect(isoWeekOf(monday, timeZone)).toBe(isoWeekOf(friday, timeZone))
    expect(derived.state).toBe('healthy')
  })

  it('lets an answer settle a week another prompt in it went unanswered', () => {
    // Two prompts inside one ISO week, one of them answered. A cadence edit is
    // what puts them there, and the week is answered.
    const laterInTheSameWeek = new Date(at(2).getTime() + days(3))

    const derived = deriveRelationshipState(
      history({
        weeks: [
          unanswered(1),
          unanswered(2),
          { openedAt: laterInTheSameWeek, closedAt: laterInTheSameWeek, outcome: 'met', answeredAt: laterInTheSameWeek },
        ],
      }),
      laterInTheSameWeek,
    )

    expect(isoWeekOf(at(2), timeZone)).toBe(isoWeekOf(laterInTheSameWeek, timeZone))
    expect(derived.state).toBe('healthy')
  })

  it('does not change a recorded week when the cadence hour moves', () => {
    const eightAm = new Date('2026-09-07T13:00:00Z')
    const ninePm = new Date('2026-09-11T02:00:00Z')

    expect(isoWeekOf(eightAm, timeZone)).toBe(isoWeekOf(ninePm, timeZone))
  })

  it('reads weeks in order however they arrive', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(3), met(1), unanswered(2)] }),
      at(3),
    )

    expect(derived.state).toBe('stalled')
    expect(derived.reasons).toEqual([{ kind: 'gone_silent', days: 14 }])
  })
})

/**
 * Paused and Awaiting Leader Acceptance weeks are genuinely absent: no sequence
 * covers them, so no relationship-week exists to be unanswered. They are not
 * counted -- and they are not stepped over either, because *consecutive* means
 * consecutive in the calendar.
 */
describe('what a Pause masks, and what resurfaces after it', () => {
  /**
   * The property the whole of ticket 12 rests on: `Paused` **masks** the derived
   * state rather than replacing the history behind it. The same history, twice,
   * with nothing between the two but whether a Pause stands.
   */
  const stalledHistory = { weeks: [met(1), unanswered(2), unanswered(3)] }

  it('reports Paused while one stands, over a history that says Stalled', () => {
    expect(deriveRelationshipState(history({ ...stalledHistory, pausedAt: at(3) }), at(3)))
      .toMatchObject({ state: 'paused', reasons: [] })
  })

  it('is Stalled again the moment the Pause is lifted, with its reason intact', () => {
    // **Resume must not set Healthy.** Nothing about a resume touches the weeks,
    // so the same history that read Stalled before the pause reads Stalled after
    // it -- which is the difference between masking a care signal and erasing one.
    expect(deriveRelationshipState(history(stalledHistory), at(3))).toMatchObject({
      state: 'stalled',
      reasons: [{ kind: 'gone_silent' }],
    })
  })

  it('clears only on an answered check-in, and not on the resume itself', () => {
    // A week the Leader answered ends the run. That -- and nothing an Admin
    // clicks -- is what makes it Healthy again.
    expect(
      deriveRelationshipState(
        history({ weeks: [...stalledHistory.weeks, met(4)] }),
        at(4),
      ),
    ).toMatchObject({ state: 'healthy', reasons: [] })
  })

  it('accrues no silence across the weeks a Pause covered', () => {
    // A paused relationship is covered by no sequence, so it produces no week at
    // all -- and a gap ends a run. A fortnight of silence either side of a summer
    // away is not four consecutive silent weeks.
    expect(
      deriveRelationshipState(
        history({ weeks: [unanswered(1), unanswered(2), unanswered(14), unanswered(15)] }),
        at(15),
      ),
    ).toMatchObject({ state: 'stalled' })

    expect(
      deriveRelationshipState(history({ weeks: [unanswered(2), unanswered(14)] }), at(14)),
    ).toMatchObject({ state: 'healthy' })
  })

  it('keeps Concerns standing beside it, paused or not', () => {
    // A Concern is a badge, not a state. Pausing does not resolve one.
    const paused = deriveRelationshipState(
      history({ pausedAt: at(3), concerns: [concern(1)] }),
      at(3),
    )

    expect(paused).toMatchObject({ state: 'paused', openConcerns: 1 })
  })
})

describe('weeks that are absent rather than unanswered', () => {
  it('does not stall a relationship that was never covered by a sequence', () => {
    const derived = deriveRelationshipState(history({ weeks: [] }), at(6))

    expect(derived.state).toBe('healthy')
    expect(derived.reasons).toEqual([])
  })

  it('does not weld the weeks either side of a gap into one run', () => {
    // Silent in week one, nothing covering weeks two to four, silent again in
    // week five. Two entries, and not two consecutive weeks: welding them would
    // accrue silence across a Pause the product promises accrues none.
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(5)] }),
      at(5),
    )

    expect(derived.state).toBe('healthy')
  })

  it('stalls once the weeks either side of a gap are themselves consecutive', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(5), unanswered(6)] }),
      at(6),
    )

    expect(derived.state).toBe('stalled')
  })

  it('does not weld a not-meeting run across a gap either', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [didNotMeet(1), didNotMeet(2), didNotMeet(6)] }),
      at(6),
    )

    expect(derived.state).toBe('healthy')
  })
})
