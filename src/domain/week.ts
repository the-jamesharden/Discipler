import type { Branded } from './branded'

/**
 * What a week is, what a month is, and when a week comes due -- all three
 * resolved against the Ministry's own timezone rather than against UTC or against
 * whatever clock the server happens to keep.
 *
 * A week is the **ISO week**, defined independently of the check-in hour. The
 * alternative reading -- *seven days since the last prompt* -- is what makes a
 * cadence edit produce one week carrying two prompts and one carrying none, which
 * would corrupt the consecutive-unanswered and consecutive-not-meeting counters
 * silently rather than visibly. See
 * `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.
 *
 * There is no date library here on purpose. Everything below is `Intl`, which
 * carries the IANA zone database the platform already ships, plus calendar
 * arithmetic on UTC instants that stand in for civil dates.
 */

/**
 * An ISO week, as `2026-W35`. The year travels with the number because it is the
 * *ISO* year and not the calendar one: `2026-W53` runs into January 2027, and a
 * bare week number would make it collide with `2027-W01` every few years.
 */
export type IsoWeek = Branded<string, 'IsoWeek'>

/**
 * The one way to make an `IsoWeek` from a string, and the only place the format
 * is parsed. It validates rather than casting because the arithmetic downstream
 * cannot: `Number('')` is `0`, which is an integer, so a check for integers
 * accepts `-W35` and hands `Date.UTC` a year of zero -- which it reads as 1900.
 */
export const isoWeek = (value: string): IsoWeek => {
  const match = /^(\d{4})-W(\d{2})$/.exec(value)
  const isoYear = Number(match?.[1])
  const week = Number(match?.[2])
  // 53 because a long ISO year has one; 0 and 54 name no week in any year.
  if (!match || week < 1 || week > 53) {
    throw new Error(`'${value}' is not an ISO week`)
  }
  return `${isoYear}-W${String(week).padStart(2, '0')}` as IsoWeek
}

/** A calendar month, as `2026-08`. The unit the monthly opt-out rule counts in. */
export type CalendarMonth = Branded<string, 'CalendarMonth'>

/**
 * When a check-in sequence is sent, in the Ministry's own local time.
 *
 * `day` is 0-6 with **0 meaning Sunday** -- the convention Postgres's `dow` and
 * JavaScript's `getDay` already share, so nothing in the stack has to translate.
 * `hour` is a whole hour with no minutes, clamped to 8-21 local by a database
 * check constraint rather than by the form alone.
 */
export interface Cadence {
  readonly day: number
  readonly hour: number
}

/** The civil date and time a Ministry sees on its own wall, for one instant. */
interface ZonedTime {
  readonly year: number
  /** One-based, as people write months. */
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

/**
 * Cached because a Ministry's zone is the same string on every row of a
 * dispatcher run, and constructing an `Intl.DateTimeFormat` is the expensive part
 * of reading one.
 */
const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  const cached = FORMATTERS.get(timeZone)
  if (cached) return cached

  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      // `h23` rather than `hour12: false`, which yields hour `24` at midnight in
      // some locales and would put every midnight in the previous day.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    // A zone the platform does not know is a Ministry setting that would make
    // every week boundary and every cadence silently wrong. It says so instead.
    throw new Error(`'${timeZone}' is not a timezone this platform knows`)
  }

  FORMATTERS.set(timeZone, formatter)
  return formatter
}

const zonedTime = (instant: Date, timeZone: string): ZonedTime => {
  const parts = formatterFor(timeZone).formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type)
    if (!part) throw new Error(`'${timeZone}' yielded no ${type} for ${instant.toISOString()}`)
    return Number(part.value)
  }

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

/**
 * A civil date as a UTC instant, used purely as a calendar coordinate. Nothing
 * derived from it is an instant in the Ministry's day; it exists so that "add
 * three days" and "which weekday is this" can be plain arithmetic.
 */
const asCalendarPoint = (time: ZonedTime): number =>
  Date.UTC(time.year, time.month - 1, time.day)

const DAY = 86_400_000

/** Monday 1 through Sunday 7, which is what the ISO week is defined in terms of. */
const isoWeekdayOf = (calendarPoint: number): number =>
  new Date(calendarPoint).getUTCDay() || 7

/**
 * The Monday that opens a given ISO week, as a calendar coordinate.
 *
 * Week one is the week holding 4 January -- that is the definition, and counting
 * from its Monday makes the arithmetic exact rather than an approximation to be
 * corrected afterwards. Both directions of the conversion go through here, so
 * reading a week and constructing one can never disagree about where it starts.
 */
const mondayOpening = (isoYear: number, week = 1): number => {
  const fourthOfJanuary = Date.UTC(isoYear, 0, 4)
  const firstMonday = fourthOfJanuary - (isoWeekdayOf(fourthOfJanuary) - 1) * DAY
  return firstMonday + (week - 1) * 7 * DAY
}

/**
 * How far a Ministry's clock is from UTC at a given instant, in milliseconds.
 * Read from the zone rather than assumed, so daylight saving is whatever the zone
 * database says it is on the day.
 */
const offsetAt = (instant: Date, timeZone: string): number => {
  const time = zonedTime(instant, timeZone)
  const asIfUtc = Date.UTC(
    time.year,
    time.month - 1,
    time.day,
    time.hour,
    time.minute,
    time.second,
  )
  // The formatter drops milliseconds, so they are taken off the instant too --
  // otherwise every offset would come back up to a second short.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds())
}

/**
 * The instant at which a Ministry's wall clock reads this civil time.
 *
 * Two passes, because the offset depends on the answer: the first guess uses the
 * offset in force at the same civil time read as UTC, and the second uses the
 * offset in force at the instant that guess named. That converges everywhere a
 * zone shifts by less than a day, which is every zone.
 *
 * On the two hours a year that do not exist or happen twice, this lands on one of
 * the two readings rather than refusing. The 8am-9pm clamp keeps the check-in
 * hour well clear of every transition in current use, so the choice is not one a
 * Ministry can observe.
 */
const instantOfLocalTime = (
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
): Date => {
  const asIfUtc = Date.UTC(year, month - 1, day, hour)
  const firstPass = asIfUtc - offsetAt(new Date(asIfUtc), timeZone)
  return new Date(asIfUtc - offsetAt(new Date(firstPass), timeZone))
}

export const isoWeekOf = (instant: Date, timeZone: string): IsoWeek => {
  const point = asCalendarPoint(zonedTime(instant, timeZone))

  // The ISO year is the year of the week's Thursday, which is the whole of the
  // rule: a week belongs to whichever year holds the majority of its days, and
  // Thursday is where the majority always is.
  const thursday = point + (4 - isoWeekdayOf(point)) * DAY
  const isoYear = new Date(thursday).getUTCFullYear()

  const week = Math.round((thursday - mondayOpening(isoYear)) / DAY / 7) + 1

  return `${isoYear}-W${String(week).padStart(2, '0')}` as IsoWeek
}

export const calendarMonthOf = (instant: Date, timeZone: string): CalendarMonth => {
  const { year, month } = zonedTime(instant, timeZone)
  return `${year}-${String(month).padStart(2, '0')}` as CalendarMonth
}

/**
 * When this week's check-in comes due for a Ministry on this cadence.
 *
 * The answer is always inside the week it was asked for. An ISO week runs Monday
 * to Sunday, so a Sunday cadence falls at the *end* of its week rather than at
 * the start of the next one -- which is what keeps one week to exactly one
 * prompt however a coordinator sets the day.
 */
export const cadenceInstantOf = (
  week: IsoWeek,
  timeZone: string,
  cadence: Cadence,
): Date => {
  const [year, number] = week.split('-W')
  const monday = mondayOpening(Number(year), Number(number))

  // Sunday is 0 on the wire and 7 in an ISO week, so it is the seventh day of
  // this week rather than the day before the first.
  const isoWeekday = cadence.day === 0 ? 7 : cadence.day
  const dayOfWeek = new Date(monday + (isoWeekday - 1) * DAY)

  return instantOfLocalTime(
    timeZone,
    dayOfWeek.getUTCFullYear(),
    dayOfWeek.getUTCMonth() + 1,
    dayOfWeek.getUTCDate(),
    cadence.hour,
  )
}
