/**
 * Everything the Check-Ins tab says in words. The reader deals in this week's
 * relationship-weeks; the counts and the columns decide how to say them. Nothing
 * on the tab itself reads Concern text: the words are on the pair card, which
 * each row opens (Pastor feedback, ticket 09), and whose words live beside it.
 */

import type { Satisfaction } from '~/domain/check-in'
import type { TestCheckInThisWeek } from '~/service/ports'

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

/**
 * The test check-ins, under the columns and counted in nothing above (Exponential launch,
 * ticket 28). All of this but the word Test is a draft: the mock-ups drew no row.
 */
export const TEST_CHECK_INS = 'Test check-ins'
export const TEST_TAG = 'Test'
export const TESTS_ARE_NOT_COUNTED = 'Admins trying it out. Nothing from a test is counted.'

const RATED: Readonly<Record<Satisfaction, string>> = {
  outstanding: 'Met, outstanding',
  good: 'Met, good',
  okay: 'Met, okay',
  concern: 'Met, concern',
}

/** How a test went, in the terms of the columns above it. */
export const testOutcome = ({
  met,
  satisfaction,
  waiting,
}: Pick<TestCheckInThisWeek, 'met' | 'satisfaction' | 'waiting'>): string => {
  if (satisfaction) return RATED[satisfaction]
  if (met === false) return "Didn't meet"
  if (waiting) return 'Waiting for a reply'
  return met ? 'Met' : 'No reply'
}
