import { OFFICE_HOURS_EVERY_WEEKS } from '~/domain/launch-terms'
import type { OfficeHours, UpcomingOfficeHours } from '~/domain/office-hours'

/**
 * The next office hours (`.scratch/exponential-launch/spec.md`, "Help, What's new and
 * office hours"), or null while none is set. Everything that shows them reads this one
 * value through `upcomingOfficeHours`: the Overview card, the Help menu's item and the
 * welcome window's "Speak with the team directly!" card.
 *
 * Null ships until the team gives the Zoom link and the next date, so nothing shows.
 * After each call, set the next one here, for example:
 *
 *   { date: 'YYYY-MM-DD', time: 'HH:MM', timezone: 'America/New_York', link: 'https://...' }
 *
 * The repo is public, so the link is too: everything in this file can be read by anyone.
 */
export const NEXT_OFFICE_HOURS: OfficeHours | null = null

/** The welcome window's card (ticket 27), which leaves out its Next line when there is no date. */
export const speakWithTheTeamLine = (upcoming: UpcomingOfficeHours | null): string => {
  const every = `Office hours on Zoom every ${OFFICE_HOURS_EVERY_WEEKS} weeks.`
  return upcoming ? `${every} Next: ${upcoming.date}, at ${upcoming.time}.` : every
}
