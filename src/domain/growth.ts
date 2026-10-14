import { A_GROUP, cardShapeOf } from './relationships'
import {
  calendarMonthOf,
  isoWeekOf,
  monthAfter,
  monthOpensAt,
  monthsApart,
  weekAfter,
  weekOpensAt,
  weeksApart,
} from './week'

/**
 * The growth chart on Overview (Pastor feedback, ticket 05): how many people
 * were being discipled at the end of each of the last twelve weeks, or of every
 * month since the Ministry opened, and how many are now.
 *
 * Every point is read off the stored history -- when each relationship was
 * accepted and ended, when each person joined and left it, and every Pause and
 * Resume -- and never off what stands today. A relationship ended or paused last
 * month counts as it stood last month, and a point once drawn says the same
 * thing next week as it did this week.
 *
 * Counted, at an instant: the Disciples of every relationship that had been
 * accepted, had not ended and was not paused, each person once. Never the people
 * discipling them, unless they are themselves discipled somewhere else; never a
 * relationship nobody had accepted yet, which nobody is being discipled in; and
 * never a paused one, which the Active Relationships tile leaves out on the same
 * reading.
 */

/** What the chart counts: everybody being discipled, or those in pairs, or those in Groups. */
export type GrowthMeasure = 'total' | 'mentorship' | 'groups'

/** Along the bottom: the last twelve weeks, or every month since the Ministry opened. */
export type GrowthScale = 'weeks' | 'months'

export interface GrowthChoice {
  readonly measure: GrowthMeasure
  readonly scale: GrowthScale
}

/** The choice Overview opens on, and the one an address that says nothing means. */
export const OPENING_CHOICE: GrowthChoice = { measure: 'total', scale: 'weeks' }

export const GROWTH_MEASURES: readonly GrowthMeasure[] = ['total', 'mentorship', 'groups']
export const GROWTH_SCALES: readonly GrowthScale[] = ['weeks', 'months']

/** How many weeks the weeks view spans, this one included. */
export const WEEKS_ON_THE_CHART = 12

/**
 * The fewest months the months view spans. A Ministry three months old draws its
 * three at the right of a year, as a young Ministry's weeks sit at the right of
 * its twelve, rather than stretching two points into a line across the card.
 */
export const FEWEST_MONTHS_ACROSS = 12

export interface GrowthRelationship {
  readonly id: string
  /** A Group has one; a one-to-one and a 1:2 pair have none. */
  readonly name: string | null
  readonly createdAt: Date
  readonly acceptedAt: Date | null
  readonly endedAt: Date | null
}

/** One person's time in one relationship, ended or not. */
export interface GrowthMembership {
  readonly relationshipId: string
  readonly personId: string
  readonly role: 'leader' | 'participant'
  readonly startedAt: Date
  readonly endedAt: Date | null
  /** A Leader's own acceptance; who leads a running relationship is read from it. */
  readonly acceptedAt: Date | null
}

/** A Pause or a Resume, as history recorded it. */
export interface GrowthPause {
  readonly relationshipId: string
  readonly kind: 'paused' | 'resumed'
  readonly at: Date
}

export interface GrowthHistory {
  /** When the Ministry was opened here. */
  readonly openedAt: Date
  readonly relationships: readonly GrowthRelationship[]
  readonly members: readonly GrowthMembership[]
  /** In the order they were recorded; read here in the order they happened. */
  readonly pauses: readonly GrowthPause[]
}

export interface GrowthPoint {
  /** When the week or month it stands for opens, in the Ministry Timezone: what it is labelled by. */
  readonly opensAt: Date
  /** The instant it was counted at: the end of its week or month, or now for the last. */
  readonly countedAt: Date
  readonly count: number
}

export interface GrowthSeries {
  /** Oldest first, the last one now. Never empty: there is always now. */
  readonly points: readonly GrowthPoint[]
  /**
   * How many weeks or months the chart spans. The points are its last ones; the
   * slots before them are weeks or months before the Ministry opened, drawn as
   * nothing rather than as nobody.
   */
  readonly slots: number
}

/**
 * Whether a span that began at `from` and ends at `until`, or has not ended,
 * covers this instant. Half-open: something that ended at the instant is over.
 */
const covers = (from: Date, until: Date | null, instant: Date): boolean =>
  from.getTime() <= instant.getTime() && (until === null || until.getTime() > instant.getTime())

/**
 * The history arranged once for many instants: each relationship with its
 * memberships and its Pauses in the order they happened. `sort` is stable, so
 * two Pause events at the same instant keep the order history recorded them in.
 */
const arrange = (history: GrowthHistory) =>
  history.relationships.map((relationship) => ({
    relationship,
    members: history.members.filter((member) => member.relationshipId === relationship.id),
    pauses: history.pauses
      .filter((pause) => pause.relationshipId === relationship.id)
      .sort((a, b) => a.at.getTime() - b.at.getTime()),
  }))

type Arranged = ReturnType<typeof arrange>

/** Whether the last Pause or Resume at or before the instant was a Pause. */
const pausedAt = (pauses: readonly GrowthPause[], instant: Date): boolean => {
  let paused = false
  for (const pause of pauses) {
    if (pause.at.getTime() > instant.getTime()) break
    paused = pause.kind === 'paused'
  }
  return paused
}

const countAt = (arranged: Arranged, measure: GrowthMeasure, instant: Date): number => {
  const counted = new Set<string>()

  for (const { relationship, members, pauses } of arranged) {
    const { acceptedAt, endedAt } = relationship
    if (acceptedAt === null || !covers(acceptedAt, endedAt, instant)) continue
    if (pausedAt(pauses, instant)) continue

    const present = members.filter((member) => covers(member.startedAt, member.endedAt, instant))
    const disciples = present.filter((member) => member.role === 'participant')
    if (disciples.length === 0) continue

    // A pair or a Group as the Overview would have called it then: by its name
    // and who was in it, never by its kind (ADR-0004). A Leader counts as
    // leading once they had accepted, as `countsAsLeading` reads it.
    const leaders = present.filter(
      (member) =>
        member.role === 'leader' && member.acceptedAt !== null && member.acceptedAt.getTime() <= instant.getTime(),
    )
    const isAGroup = cardShapeOf(relationship.name, leaders.length, disciples.length) === A_GROUP
    if (measure === 'mentorship' && isAGroup) continue
    if (measure === 'groups' && !isAGroup) continue

    for (const disciple of disciples) counted.add(disciple.personId)
  }

  return counted.size
}

/** How many people were being discipled at an instant, on one measure, each person once. */
export const discipledAt = (history: GrowthHistory, measure: GrowthMeasure, instant: Date): number =>
  countAt(arrange(history), measure, instant)

/**
 * When the Ministry opened, for the chart: when it was opened here, or its first
 * relationship if that is earlier, which a history brought in from before can be.
 */
const openingOf = (history: GrowthHistory): Date =>
  history.relationships.reduce(
    (earliest, relationship) => (relationship.createdAt < earliest ? relationship.createdAt : earliest),
    history.openedAt,
  )

/** The instant just before another: the last moment of the week or month that ends there. */
const justBefore = (instant: Date): Date => new Date(instant.getTime() - 1)

/**
 * The chart's points, oldest first. Each earlier week or month is counted at its
 * last instant in the Ministry Timezone, and the last point is now, so the line
 * ends on the live count. A week or month before the Ministry opened is not a
 * point: nobody was counted then because there was nothing here to count, and a
 * zero would draw a beginning as growth.
 */
export const growthSeries = (
  history: GrowthHistory,
  choice: GrowthChoice,
  timeZone: string,
  now: Date,
): GrowthSeries => {
  const arranged = arrange(history)
  const opening = openingOf(history)
  const point = (opensAt: Date, countedAt: Date): GrowthPoint => ({
    opensAt,
    countedAt,
    count: countAt(arranged, choice.measure, countedAt),
  })

  if (choice.scale === 'weeks') {
    const thisWeek = isoWeekOf(now, timeZone)
    const openingWeek = isoWeekOf(opening, timeZone)
    const points: GrowthPoint[] = []
    for (let back = WEEKS_ON_THE_CHART - 1; back >= 0; back -= 1) {
      const week = weekAfter(thisWeek, -back)
      if (back > 0 && weeksApart(openingWeek, week) < 0) continue
      const countedAt = back === 0 ? now : justBefore(weekOpensAt(weekAfter(week, 1), timeZone))
      points.push(point(weekOpensAt(week, timeZone), countedAt))
    }
    return { points, slots: WEEKS_ON_THE_CHART }
  }

  const thisMonth = calendarMonthOf(now, timeZone)
  const openingMonth = calendarMonthOf(opening, timeZone)
  const points: GrowthPoint[] = []
  for (let back = Math.max(monthsApart(openingMonth, thisMonth), 0); back >= 0; back -= 1) {
    const month = monthAfter(thisMonth, -back)
    const countedAt = back === 0 ? now : justBefore(monthOpensAt(monthAfter(month, 1), timeZone))
    points.push(point(monthOpensAt(month, timeZone), countedAt))
  }
  return { points, slots: Math.max(points.length, FEWEST_MONTHS_ACROSS) }
}
