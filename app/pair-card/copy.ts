import type { Satisfaction } from '~/domain/check-in'
import { daysSince } from '~/domain/clock'
import type { Gender } from '~/domain/intake'
import type { CareReason } from '~/domain/relationship-state'
import type { PairShape } from '~/domain/relationships'
import { calendarDayOf } from '~/domain/week'
import { dayMonth } from '../materials/copy'

/**
 * Everything the pair card says in words (Pastor feedback, ticket 07). The card
 * is shared: the Overview opens it, and Check-Ins and Follow-Up will (tickets 09
 * and 10), so its words live beside it and not on any one tab.
 *
 * Every date is said in the Ministry's own zone: a check-in answered at nine on
 * a Monday evening in New York was answered on the Monday, wherever the server
 * stood.
 */

/** What the Admin screens call each side of a pair. */
export const ROLE: Record<'leader' | 'participant', string> = {
  leader: 'Discipler',
  participant: 'Disciple',
}

export const SHAPE: Record<PairShape, string> = {
  one_to_one: 'One to one',
  one_to_two: '1:2 pair',
}

export const CLOSE = 'Close'

/** *Mon 12 Oct*. */
export const weekdayDayMonth = (instant: Date, timeZone: string): string =>
  `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant)} ${dayMonth(instant, timeZone)}`

/** *6:41pm*. */
export const clockTime = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(instant)
    .replace(/\s/g, '')
    .toLowerCase()

/** How long ago, in the unit a person would use: *today*, *3 days ago*, *5 weeks ago*. */
export const ago = (instant: Date, now: Date): string => {
  const days = daysSince(instant, now)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 63) return `${Math.floor(days / 7)} weeks ago`
  const months = Math.floor(days / 30)
  return months === 1 ? 'a month ago' : `${months} months ago`
}

/** *One to one · paired 7 Sep, 5 weeks ago*, the line over the names. */
export const kindLine = (shape: PairShape, pairedAt: Date, now: Date, timeZone: string): string =>
  `${SHAPE[shape]} · paired ${dayMonth(pairedAt, timeZone)}, ${ago(pairedAt, now)}`

/**
 * The gender a Group declared, as its card's head says it (Pastor feedback,
 * ticket 08). Declaring none is mixed, as it is on the column.
 */
export const GROUP_GENDER: Record<Gender, string> = {
  female: 'women',
  male: 'men',
}
export const MIXED = 'mixed'

/** *Group · women · formed 7 Sep, 5 weeks ago*, the line over a Group's name. */
export const groupLine = (declared: Gender | null, formedAt: Date, now: Date, timeZone: string): string =>
  `Group · ${declared ? GROUP_GENDER[declared] : MIXED} · formed ${dayMonth(formedAt, timeZone)}, ${ago(formedAt, now)}`

/** *Disciples · 3*, over a Group's rows. */
export const disciplesLabel = (count: number): string => `Disciples · ${count}`

/** *Rachel Adams and Emily Davis*; *Claire Lee, Ana Ruiz and Beth Shaw*. */
export const pairTitle = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? 'Nobody yet')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** When something happened, near enough to read at a glance: *today*, *yesterday*, *on Mon 12 Oct*. */
export const onWhichDay = (instant: Date, now: Date, timeZone: string): string => {
  const day = calendarDayOf(instant, timeZone)
  if (day === calendarDayOf(now, timeZone)) return 'today'
  if (day === calendarDayOf(new Date(now.getTime() - 86_400_000), timeZone)) return 'yesterday'
  return `on ${weekdayDayMonth(instant, timeZone)}`
}

/** *at 6:41pm* today, *on Sat 10 Oct at 3:12pm* any other day. */
export const atWhichTime = (instant: Date, now: Date, timeZone: string): string => {
  const day = onWhichDay(instant, now, timeZone)
  return `${day === 'today' ? '' : `${day} `}at ${clockTime(instant, timeZone)}`
}

// ---------------------------------------------------------------------------
// The band
// ---------------------------------------------------------------------------

/** *Concern · raised by Rachel Adams today*. */
export const concernLabel = (raisedBy: string | null, raisedAt: Date, now: Date, timeZone: string): string =>
  `Concern · raised ${raisedBy ? `by ${raisedBy} ` : ''}${onWhichDay(raisedAt, now, timeZone)}`

/** What stands in for the words once somebody resolved the Concern between the page and the card. */
export const WORDS_CLEARED = 'Resolved since, and its words cleared.'

export const RESOLVE_AND_CLEAR = 'Resolve and clear this text'

/**
 * The line under the band: who read the Concern and when. The reading this card
 * just recorded first, and the latest by anybody else where there was one, so an
 * Admin sees at once whether somebody has already picked up the phone. The whole
 * list is Follow-Up's to show (ticket 10).
 */
export const readingLine = (
  now: { readonly by: string | null; readonly at: Date },
  before: { readonly by: string | null; readonly at: Date } | null,
  clock: Date,
  timeZone: string,
): string => {
  const who = (name: string | null) => name ?? 'an Admin'
  const earlier = before ? `, and before that by ${who(before.by)} ${atWhichTime(before.at, clock, timeZone)}` : ''
  return `Read by ${who(now.by)} ${atWhichTime(now.at, clock, timeZone)}${earlier}. Resolving clears the words for good.`
}

/** The label over a stall, naming the condition that fired. */
export const stallLabel = (reason: CareReason): string =>
  reason.kind === 'gone_silent' ? 'Stalled · gone silent' : 'Stalled · not meeting'

/**
 * The stall in the unit its condition reports (`docs/product-rules.md`,
 * *Stalled Reports a Duration Matched to Its Reason*): days since anybody was in
 * contact for a silence, weeks running for a pair that answers and does not
 * meet. Split so the figure can be drawn in bold.
 */
export const stallSentence = (
  reason: CareReason,
  leader: string,
): { readonly before: string; readonly figure: string; readonly after: string } =>
  reason.kind === 'gone_silent'
    ? {
        before: `${leader} has stopped answering check-ins: `,
        figure: `${reason.days} ${reason.days === 1 ? 'day' : 'days'} since last contact`,
        after: '.',
      }
    : {
        before: `${leader} answers, and has said they did not meet `,
        figure: `${reason.weeks} ${reason.weeks === 1 ? 'week' : 'weeks'} running`,
        after: '.',
      }

export const PAUSE_EXPIRED = 'Pause expired'

// ---------------------------------------------------------------------------
// The people and the facts
// ---------------------------------------------------------------------------

export const AGE = 'Age'
export const HOPING_FOR = 'Hoping for'

const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? fullName

export const textThem = (fullName: string): string => `Text ${firstName(fullName)}`
export const callThem = (fullName: string): string => `Call ${fullName}`
/** On a Disciple's opened row, where their number is already on the row itself. */
export const callFirst = (fullName: string): string => `Call ${firstName(fullName)}`

export const LAST_CHECK_IN = 'Last check-in'
export const MATERIAL = 'Material'
export const NO_CHECK_IN_YET = 'None answered yet'
export const NO_MATERIAL_YET = 'No material yet'

/**
 * Each stored answer as the letter it carries now and its word (Pastor
 * feedback, ticket 03). Stored as words, so a concern given when C meant
 * concern still reads *D concern*: the letter is today's, the meaning is the
 * one recorded. The letter and its word are held together, so a narrow card
 * never leaves the letter alone at the end of a line. A fifth answer is a fifth
 * key, and the build fails until it is worded.
 */
export const SATISFACTION: Record<Satisfaction, string> = {
  outstanding: 'A\u00a0outstanding',
  good: 'B\u00a0good',
  okay: 'C\u00a0okay',
  concern: 'D\u00a0concern',
}

/** *Mon 12 Oct · Met · B good*. Never the words of a Concern. */
export const checkInLine = (
  answer: { readonly answeredAt: Date; readonly met: boolean | null; readonly satisfaction: Satisfaction | null },
  timeZone: string,
): string =>
  [
    weekdayDayMonth(answer.answeredAt, timeZone),
    answer.met === null ? null : answer.met ? 'Met' : 'Did not meet',
    answer.satisfaction ? SATISFACTION[answer.satisfaction] : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

/** *The Master Plan of Evangelism, since 14 Sep*. */
export const materialLine = (material: { readonly title: string | null; readonly since: Date } | null, timeZone: string): string =>
  material?.title ? `${material.title}, since ${dayMonth(material.since, timeZone)}` : NO_MATERIAL_YET

export const END_RELATIONSHIP = 'End relationship…'
