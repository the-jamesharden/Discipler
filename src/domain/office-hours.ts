import { calendarDayOf } from './week'

/**
 * Office hours (Exponential launch, ticket 30): a Zoom call with the team, set in a
 * file in the repo (`app/help/office-hours.ts`). The Overview card, the Help menu's
 * item, search and the welcome window's card all ask here, so none of them can go on
 * showing a call that has been and gone.
 */

export interface OfficeHours {
  /** A calendar date, `YYYY-MM-DD`, in `timezone`. */
  readonly date: string
  /** On the 24-hour clock, `HH:MM`, in `timezone`. */
  readonly time: string
  /** An IANA zone, such as `America/New_York`. */
  readonly timezone: string
  /** The Zoom link. */
  readonly link: string
}

/** The next call as an Admin reads it. */
export interface UpcomingOfficeHours {
  /** `Thursday, November 12` */
  readonly date: string
  /** `12pm CT` */
  readonly time: string
  readonly link: string
}

/** `12pm`, `12:30pm` and `9am`: the minutes only where there are some. */
const clockTime = (time: string): string => {
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  const minutes = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${hour % 12 === 0 ? 12 : hour % 12}${minutes}${hour < 12 ? 'am' : 'pm'}`
}

/** `CT`: the zone's name all year round, so it is right whichever side of daylight saving the call falls. */
const zoneName = (timezone: string, date: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortGeneric' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === 'timeZoneName')?.value ?? timezone

/**
 * The next call, or null where the file names none or its date has passed.
 *
 * Its date passes at midnight where the call is held, so the card stays for the whole
 * of that day and a pastor running late can still find the link. It comes back only
 * when the file is updated.
 */
export const upcomingOfficeHours = (
  hours: OfficeHours | null,
  now: Date,
): UpcomingOfficeHours | null => {
  if (hours === null || calendarDayOf(now, hours.timezone) > hours.date) return null

  return {
    date: new Date(`${hours.date}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    time: `${clockTime(hours.time)} ${zoneName(hours.timezone, hours.date)}`,
    link: hours.link,
  }
}
