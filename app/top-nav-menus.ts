import { CONTACT_SUPPORT, CONTACT_SUPPORT_PAGE } from './help/contact/copy'
import { HELP_CENTER } from './help/copy'
import { SETUP_VIDEOS } from './help/setup-videos'

/**
 * What the top nav offers beside the Admin's own menu (`.scratch/exponential-launch/spec.md`,
 * "Search, nav and Settings"), kept apart from how it is drawn.
 *
 * **Every entry is written here in its place as soon as the spec names it, and shows
 * the moment it has an address.** Until then `href` is null and nothing is drawn, so
 * no control goes nowhere and landing a ticket is setting one line. The ticket that
 * builds each one is beside it.
 */

export type TopNavIcon =
  | 'book'
  | 'restart'
  | 'megaphone'
  | 'calendar'
  | 'mail'
  | 'video'
  | 'pen'

export interface HelpMenuItem {
  readonly label: string
  readonly icon: TopNavIcon
  /** Where it goes, or null while there is nowhere yet. */
  readonly href: string | null
  /** The small tag at the row's end. */
  readonly tag?: string
  /** Somewhere outside Discipler, which opens in a tab of its own. */
  readonly newTab?: boolean
  /** Its address names the page the menu was opened on. */
  readonly carriesThePage?: boolean
}

export interface HelpMenuGroup {
  readonly label: string
  readonly items: readonly HelpMenuItem[]
}

export const HELP_MENU: readonly HelpMenuGroup[] = [
  {
    label: 'Help and feedback',
    items: [
      { label: HELP_CENTER, icon: 'book', href: '/help' },
      { label: 'Restart onboarding', icon: 'restart', href: null }, // Ticket 27.
      // Ticket 30, which also makes the tag follow each Admin's own dismissal.
      { label: "What's new", icon: 'megaphone', href: null, tag: 'New' },
      { label: 'Office hours', icon: 'calendar', href: null }, // Ticket 30.
      // A bug report attaches the page it was reported from, so the link says which.
      { label: CONTACT_SUPPORT, icon: 'mail', href: CONTACT_SUPPORT_PAGE, carriesThePage: true },
    ],
  },
  {
    label: 'Learn',
    items: [
      // The page exists and says the videos are being recorded, which is no reason to
      // send anybody there from a menu. It appears with the first line in `SETUP_VIDEOS`.
      { label: 'Setup videos', icon: 'video', href: SETUP_VIDEOS.length > 0 ? '/help/setup-videos' : null },
      // https://trydiscipler.com/blog, hidden until that page exists.
      { label: 'Blog', icon: 'pen', href: null, newTab: true },
    ],
  },
]

/** The header's button with a gift on it. Ticket 32 builds the page it opens. */
export const REFER_A_CHURCH: { readonly label: string; readonly href: string | null } = {
  label: 'Refer a church',
  href: null,
}

/** An item that has somewhere to go. */
export type LiveHelpMenuItem = HelpMenuItem & { readonly href: string }

/** The menu as it is drawn: the items with an address, and the groups holding any. */
export const liveMenu = (
  menu: readonly HelpMenuGroup[],
): readonly { readonly label: string; readonly items: readonly LiveHelpMenuItem[] }[] =>
  menu
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item): item is LiveHelpMenuItem => item.href !== null),
    }))
    .filter((group) => group.items.length > 0)
