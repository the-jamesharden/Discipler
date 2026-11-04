import type { OfficeHours } from '~/domain/office-hours'

/**
 * The next office hours (`.scratch/exponential-launch/spec.md`, "Help, What's new and
 * office hours"), or null while none is set. Everything that shows them reads this one
 * value through `upcomingOfficeHours`: the Overview card, the Help menu's item, search
 * and the welcome window's "Speak with the team directly!" card.
 *
 * Null ships until the team gives the Zoom link and the next date, so nothing shows.
 * After each call, set the next one here, for example:
 *
 *   { date: 'YYYY-MM-DD', time: 'HH:MM', timezone: 'America/New_York', link: 'https://...' }
 *
 * The repo is public, so the link is too: everything in this file can be read by anyone.
 */
export const NEXT_OFFICE_HOURS: OfficeHours | null = null
