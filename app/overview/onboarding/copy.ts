import { REMINDER_AFTER_HOURS } from '~/domain/check-in'
import { INVITATION_LIFETIME_DAYS } from '~/domain/invitations'
import { ACCEPTANCE_ESCALATION_DAYS, ACCEPTANCE_REMINDER_DAYS } from '~/domain/relationships'
import { DAYS, hourLabel } from '../../settings/copy'

/**
 * Everything the onboarding modal says (Exponential launch, ticket 27), in the words of
 * `.lavish/onboarding/s0-welcome.html` and `s1-modal.html`, which are James's.
 */

export const CLOSE = 'Close'

export const WELCOME_EYEBROW = 'Welcome to Discipler'
export const welcomeTitle = (fullName: string | null): string => {
  const first = fullName?.trim().split(/\s+/)[0]
  return first ? `Welcome, ${first}` : 'Welcome'
}
export const welcomeLede = (ministryName: string): string =>
  `A minute from James on what Discipler will do for ${ministryName}, then three quick things to get you running.`
export const PLAY_THE_VIDEO = "Play James's welcome video"
export const VIDEO_LENGTH = '1 min'
export const CONTINUE = 'Continue'
export const WATCH_IT_AGAIN = 'You can watch it again from Help, then Setup videos.'

export const EYEBROW = 'One last thing'
export const onboardingTitle = (ministryName: string): string => `Get ${ministryName} running`

export const TOUR_CARD = {
  title: 'Take the 2-minute tour',
  body: 'Watch Example Ministry, a church already running on Discipler, at work.',
  start: 'Start the tour',
  again: 'Take it again',
}

export const TEST_CARD_TITLE = 'Send yourself a test check-in'

export const TEAM_CARD = { title: 'Speak with the team directly!', zoom: 'Zoom', join: 'Join on Zoom' }

export const WHAT_HAPPENS_NEXT = 'What happens next'
export const EDIT_SETTINGS = 'Edit settings'
export const EDIT_SETTINGS_ADDRESS = '/settings#check-in'
export const FOOT = 'Close this whenever you like. Help, then Restart onboarding, brings it back.'

const counted = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * The six lines, from the church's own settings and the constants the product runs on,
 * so that changing either changes what this says.
 */
export const whatHappensNext = ({
  checkIn,
  leaderNoun,
  participantNoun,
}: {
  readonly checkIn: { readonly day: number; readonly hour: number }
  readonly leaderNoun: string
  readonly participantNoun: string
}): readonly string[] => {
  const day = DAYS.find(({ value }) => value === checkIn.day)?.label ?? ''
  return [
    `Every ${day} at ${hourLabel(checkIn.hour)}, each ${leaderNoun} is texted to ask whether they met with each ${participantNoun} this week, and how it went.`,
    `A ${leaderNoun} who hasn't replied in ${counted(REMINDER_AFTER_HOURS, 'hour')} is asked once more, then left until next week.`,
    `A concern goes straight to your Follow-Up tab, with what the ${leaderNoun} wrote.`,
    `When you pair two people, the ${leaderNoun} is texted a link to accept. It works for ${counted(INVITATION_LIFETIME_DAYS, 'day')}.`,
    `A ${leaderNoun} who hasn't accepted in ${counted(ACCEPTANCE_REMINDER_DAYS, 'day')} gets a reminder. After ${counted(ACCEPTANCE_ESCALATION_DAYS, 'day')} it shows on your Follow-Up tab.`,
    'Discipler only texts people who filled in your Intake form, and anyone can reply STOP.',
  ]
}
