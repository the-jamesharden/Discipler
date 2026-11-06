import { days } from './clock'
import { NEW_CHURCH_LIMITS } from './launch-terms'

/**
 * The limits on a new church's first weeks (Exponential launch, ticket 37; Q57 and Q81),
 * which keep somebody who signs up to send a burst from reaching far before anybody knows.
 * A real church that is simply large writes to support@, who lift them.
 *
 * Nothing about where a church stands is kept. Whether it is new, how many are on its
 * Roster and how many texts it sent are read off its history each time, so a church leaves
 * its first weeks without anything having to happen.
 */

export type NewChurchLimit = 'roster' | 'texts'

/** A church opened after this is still in its first weeks. */
export const newChurchesOpenedSince = (now: Date): Date =>
  new Date(now.getTime() - days(NEW_CHURCH_LIMITS.firstDays))

/** A week here is the last seven days and not the church's calendar week, so a burst cannot straddle two. */
export const textWeekSince = (now: Date): Date => new Date(now.getTime() - days(7))

/** How many more people a new church's Roster may take. */
export const rosterRoomWith = (people: number): number =>
  Math.max(0, NEW_CHURCH_LIMITS.peopleOnTheRoster - people)

/** How many more texts a new church may send in this week. */
export const textRoomWith = (textsThisWeek: number): number =>
  Math.max(0, NEW_CHURCH_LIMITS.textsPerWeek - textsThisWeek)

/** The limits a church stands at or past. Reaching a limit is hitting it. */
export const limitsHitBy = ({
  people,
  textsThisWeek,
}: {
  readonly people: number
  readonly textsThisWeek: number
}): readonly NewChurchLimit[] => [
  ...(rosterRoomWith(people) === 0 ? (['roster'] as const) : []),
  ...(textRoomWith(textsThisWeek) === 0 ? (['texts'] as const) : []),
]
