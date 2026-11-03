import { OFFICE_HOURS_EVERY_WEEKS } from '~/domain/launch-terms'

/** What the two cards at the top of Overview say around what the files give them (Exponential launch, ticket 30). */

/** `What's new · Oct 30`, from a calendar date, read as that date wherever the reader is. */
export const whatsNewKicker = (isoDate: string): string =>
  `What's new · ${new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })}`

export const READ_MORE = 'Read more'
export const DISMISS = 'Dismiss'

export const OFFICE_HOURS_KICKER = `Office hours · every ${OFFICE_HOURS_EVERY_WEEKS} weeks`
export const OFFICE_HOURS_SENTENCE = 'Speak with the team directly on Zoom. Any Admin is welcome.'
export const JOIN_ON_ZOOM = 'Join on Zoom'
