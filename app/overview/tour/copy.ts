/**
 * Everything the tour says (Exponential launch, ticket 27), in the words of
 * `.lavish/onboarding/demo.mjs`, which are James's.
 *
 * It is a demo of Example Ministry, whose people are mentors and mentees and whose
 * check-ins go out on Mondays at 9am, so these are its words on its pages, whatever the
 * church watching calls theirs.
 */

export const TOUR_TITLE = 'The 2-minute tour'
export const DEMO = 'Demo'
export const START_YOUR_DEMO = 'Start your demo'
export const CLOSE_THE_TOUR = 'Close the tour'
export const BACK = 'Back'
export const NEXT = 'Next'
export const DONE = 'Done'
export const OF_THE_STEPS = 'of'

export const PHONE_OWNER = "Mark Wilson's phone (example)"
export const PHONE_WHEN = 'Text message · Monday 9:00 AM'

/** One press of Next each, with its caption. */
export const TOUR_STEPS = [
  {
    title: 'Your week at a glance',
    text: 'How many relationships are active, how many met, and how many mentors answered, updated as the replies come in.',
  },
  {
    title: 'Everyone in one list',
    text: 'People join through your Intake link, or you add them. Each row shows who they are paired with.',
  },
  {
    title: 'Pair people in two clicks',
    text: 'Choose who a mentor will disciple, and Discipler texts the mentor a link to accept.',
  },
  {
    title: 'Mentors answer by text',
    text: 'Every Monday at 9am, each mentor is asked whether they met and how it went. Answers land here the moment they come in.',
  },
  {
    title: 'What needs you',
    text: 'A concern, a pair that stopped meeting, an invitation nobody accepted. Each one stays here until you act on it.',
  },
  {
    title: 'Invite people in',
    text: 'Share one link or QR code. Everyone who fills it in lands on your Roster, ready to pair.',
  },
  {
    title: 'Help is one click away',
    text: 'The question mark opens help, the gear opens your settings, and your initials open your account.',
  },
] as const

/** The one note on the most important thing on each page. */
export const TOUR_NOTES = {
  meetingRate: 'Of the mentors who answered last week, how many actually met.',
  grace: 'Grace Lee wants to disciple someone, and nobody is paired with her yet.',
  invited: 'Grace is texted a link to accept. Nothing starts until she says yes.',
  mark: 'Mark answered A, outstanding. It lands here the moment he replies.',
  resolve: 'Resolve it once you’ve reached out. It stays until you do.',
  copied: 'Text or email this link. Everyone who fills it in lands on your Roster.',
  help: 'Help, setup videos, What’s new, and office hours with the team.',
  settings: 'Settings: your check-in day and hour, the words your mentors get, and the name your texts come from.',
  account: 'Your account: your Intake forms, your password, and signing out.',
} as const

export const INVITATION_SENT = 'Invitation sent'
export const COPIED = 'Copied'
export const JUST_NOW = 'Now'
