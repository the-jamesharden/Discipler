import { SUPPORT_EMAIL } from '../roster/import-copy'

/**
 * What the Help center's own screens say, around the pages. The pages' words are
 * their Markdown files; these are the frame.
 */

export const HELP_CENTER = 'Help center'

export const HELP_CENTER_LEAD = 'How Discipler works, in plain words.'

/** The way back from the Help center. `/` sends a signed-in Admin to Overview and anyone else to sign-in. */
export const BACK_TO_DISCIPLER = 'Back to Discipler'

export const ALL_HELP_PAGES = 'All help pages'

export const NEXT_PAGE = 'Next'
export const PREVIOUS_PAGE = 'Previous'

/** Under every page and the list: the way to a person when a page has not answered. */
export const STILL_STUCK = {
  before: 'Still stuck? ',
  form: 'Send us a message',
  middle: ' or write to ',
  email: SUPPORT_EMAIL,
  after: ' and the team will help.',
} as const

/** The browser tab's title for one page. */
export const helpPageTitle = (title: string): string => `${title} · Discipler Help`
