/**
 * Everything the Check-Ins tab says in words. The reader deals in this week's
 * relationship-weeks; the counts, the columns and the sealed box decide how to
 * say them. Nothing on this page reads Concern text.
 */

export const THIS_WEEKS_CHECK_INS = 'This week’s check-ins'

export const sentOn = (date: string | null): string => (date ? `Sent ${date}` : 'Nothing sent yet this week')

export const COMPLETED = 'Completed'
export const PENDING = 'Pending'
export const CONCERNS = 'Concerns'

export const OUTSTANDING_COLUMN = 'Outstanding (A)'
export const GOOD_COLUMN = 'Good (B)'
export const CONCERN_COLUMN = 'Concern (C)'

export const NOTHING_YET = 'Nothing yet this week'

export const concernsRaised = (count: number): string =>
  count === 1 ? 'concern raised this week' : 'concerns raised this week'

export const NO_OPEN_CONCERNS = 'No open concerns this week'

/**
 * Concerns are never presented as a browsable list. An Admin reaches Concern text
 * one Person at a time, from Follow-Up, where reading it is a recorded act.
 */
export const CONCERN_TEXT_NOT_HERE =
  'Concern text is not listed here. Open each one from Follow-Up to read what was said.'

export const GO_TO_FOLLOW_UP = 'Go to Follow-Up'

/** *Leader to Participants*, the line on each card. */
export const checkInLine = (leaderNames: readonly string[], participantNames: readonly string[]): string =>
  `${leaderNames.join(', ') || 'Nobody leading'} → ${participantNames.join(', ') || 'nobody'}`
