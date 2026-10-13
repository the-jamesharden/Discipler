/**
 * Everything the Check-Ins tab says in words. The reader deals in this week's
 * relationship-weeks; the counts and the columns decide how to say them. Nothing
 * on the tab itself reads Concern text: the words are on the pair card, which
 * each row opens (Pastor feedback, ticket 09), and whose words live beside it.
 */

export const THIS_WEEKS_CHECK_INS = 'This week’s check-ins'

export const sentOn = (date: string | null): string => (date ? `Sent ${date}` : 'Nothing sent yet this week')

export const COMPLETED = 'Completed'
export const PENDING = 'Pending'
export const CONCERNS = 'Concerns'

/** One column per answer the satisfaction question offers, by its letter. */
export const OUTSTANDING_COLUMN = 'Outstanding (A)'
export const GOOD_COLUMN = 'Good (B)'
export const OKAY_COLUMN = 'Okay (C)'
export const CONCERN_COLUMN = 'Concern (D)'

export const NOTHING_YET = 'Nothing yet this week'

/** *Leader to Participants*, the line on each card. */
export const checkInLine = (leaderNames: readonly string[], participantNames: readonly string[]): string =>
  `${leaderNames.join(', ') || 'Nobody leading'} → ${participantNames.join(', ') || 'nobody'}`
