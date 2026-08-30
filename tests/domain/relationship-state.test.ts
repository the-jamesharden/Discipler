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
  week: isoWeekOf(at(week), timeZone),
  outcome: 'met',
  answeredAt: at(week),
})

const didNotMeet = (week: number): RelationshipWeek => ({
  week: isoWeekOf(at(week), timeZone),
  outcome: 'did_not_meet',
  answeredAt: at(week),
})

/** Covered by a sequence, no reply. The instant names the week and nothing else. */
const unanswered = (week: number): RelationshipWeek => ({
  week: isoWeekOf(at(week), timeZone),
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

  it('counts from acceptance when the Leader has never answered anything', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(2)] }),
      at(2),
    )

    expect(derived.reasons).toEqual([{ kind: 'gone_silent', days: 14 }])
  })

  it('clears on an answered check-in', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(2), met(3)] }),
      at(3),
    )

    expect(derived.state).toBe('healthy')
    expect(derived.reasons).toEqual([])
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
          { week: isoWeekOf(monday, timeZone), outcome: 'unanswered', answeredAt: null },
          { week: isoWeekOf(friday, timeZone), outcome: 'unanswered', answeredAt: null },
        ],
      }),
      friday,
    )

    expect(isoWeekOf(monday, timeZone)).toBe(isoWeekOf(friday, timeZone))
    expect(derived.state).toBe('healthy')
  })

  it('lets an answer settle a week another prompt in it went unanswered', () => {
    const week = isoWeekOf(at(2), timeZone)

    const derived = deriveRelationshipState(
      history({
        weeks: [
          unanswered(1),
          { week, outcome: 'unanswered', answeredAt: null },
          { week, outcome: 'met', answeredAt: at(2) },
        ],
      }),
      at(2),
    )

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
 * covers them, so no relationship-week exists to be unanswered. They are skipped
 * rather than counted, and they do not break a run either -- an absent week is
 * evidence of nothing in both directions.
 */
describe('weeks that are absent rather than unanswered', () => {
  it('does not stall a relationship that was never covered by a sequence', () => {
    const derived = deriveRelationshipState(history({ weeks: [] }), at(6))

    expect(derived.state).toBe('healthy')
    expect(derived.reasons).toEqual([])
  })

  it('joins the runs either side of the gap rather than restarting the count', () => {
    const derived = deriveRelationshipState(
      history({ weeks: [unanswered(1), unanswered(5)] }),
      at(5),
    )

    expect(derived.state).toBe('stalled')
  })
})
