/**
 * What search says. The headings, the placeholder, "Enter to open" and "to search
 * from anywhere" are as drawn in mock-up 2 (`.lavish/top-nav-search/`); the lines
 * marked as drafts are for James, because the mock-up does not draw those states.
 */

export const SEARCH = 'Search'
export const SEARCH_PLACEHOLDER = 'Search people, pages and help'

export const HEADINGS = {
  goTo: 'Go to',
  settings: 'Settings and more',
  people: 'People',
  relationships: 'Relationships',
  materials: 'Materials',
  help: 'Help',
} as const

/** Where each row says it opens. */
export const WHERE = {
  tab: 'Tab',
  settings: 'Settings',
  page: 'Page',
  account: 'Account',
  help: 'Help',
  helpCenter: 'Help center',
  roster: 'Roster',
  overview: 'Overview',
  materials: 'Materials',
} as const

/** The line under Settings, as drawn: its three sections. */
export const SETTINGS_SECTIONS = 'Ministry, Language, Pairing'

/** The line under Billing, as drawn. */
export const BILLING_LINE = 'Plan, payment method, invoices'

export const ENTER = 'Enter'
export const TO_OPEN = 'to open'
export const OR = 'or'
export const FROM_ANYWHERE = 'to search from anywhere'
export const ESC = 'Esc'

/** The line under a person. "Admin, you" and "Ready to Pair" are as drawn. */
export const ADMIN_YOU = 'Admin, you'
export const ADMIN = 'Admin'
export const READY_TO_PAIR = 'Ready to Pair'
/** Draft: a person holding more pairings than the line has room to say. */
export const andMore = (line: string, more: number): string => (more > 0 ? `${line} and ${more} more` : line)

/** The line under a relationship. The first and the last are as drawn. */
export const pairStarted = (date: string): string => `Pair, started ${date}`
/** Draft: a pair nobody has accepted yet has no start to say. */
export const PAIR_AWAITING = 'Pair, awaiting acceptance'
export const groupOf = (people: number): string => `Group, ${people === 1 ? '1 person' : `${people} people`}`

/** Draft: nothing matched. Says what search looks at, because it is not everything. */
export const nothingFound = (query: string): string => `No names or pages match "${query}".`
/** Draft: typed before the names have arrived. */
export const LOOKING = 'Looking through names...'
/** Draft: the names could not be read, though the pages are still there. */
export const NAMES_FAILED = 'Names could not be loaded just now. Close this and try again.'
