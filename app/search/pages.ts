import { upcomingOfficeHours, type UpcomingOfficeHours } from '~/domain/office-hours'
import { CHANGE_YOUR_PASSWORD } from '../account/copy'
import { ADMIN_TABS } from '../admin-tabs'
import { NEXT_OFFICE_HOURS } from '../help/office-hours'
import { INTAKE_FORMS } from '../intake-forms/copy'
import { helpMenuFor, REFER_A_CHURCH } from '../top-nav-menus'
import { BILLING_LINE, HEADINGS, SETTINGS_SECTIONS, WHERE } from './copy'
import { matching, termsOf, type DirectoryGroup, type DirectoryRow } from './match'

/**
 * The pages search lists (`.scratch/exponential-launch/spec.md`, "Search, nav and
 * Settings"), kept apart from how they are drawn. No read: they are the same for every
 * church, so they are there the moment search opens.
 *
 * **A page is listed only once it exists.** Every entry is written here in its place
 * with the address it will have, and one with a null `href` is not drawn, so no row
 * goes nowhere. This is the rule `./top-nav-menus` holds for the header, and how a later
 * ticket adds its page:
 *
 * - **Refer a church (ticket 32)** sets `REFER_A_CHURCH.href` for the header's button,
 *   and this list reads the same line, so there is nothing to change here.
 * - **Billing (ticket 33)** has its entry's `href` set below, to its own page.
 * - **Anything added to the Help menu** (Restart onboarding, What's new, Office hours,
 *   Contact support, Setup videos, Blog) is listed the moment `helpMenuFor` gives it an
 *   address, so tickets 25, 27 and 30 change nothing here. Office hours has one only
 *   while there is a next call, so the pages are worked out when they are asked for.
 * - **Ask Discipler** has no address: ticket 31 built a circle on every Admin page, so
 *   its entry below stays undrawn until James says what it should do. See
 *   `docs/open-questions.md`, *search once Ask Discipler ships*.
 * - **A new tab** is added to `ADMIN_TABS` and is listed with it. **A new page of any
 *   other kind** is one more entry here, under the heading it belongs with.
 *
 * `typedOnly` keeps a row out of the directory shown with nothing typed, which is drawn
 * with one Settings row, while typing "language" still finds that section.
 */

export interface DirectoryPage extends Omit<DirectoryRow, 'href'> {
  /** Where it goes, or null while there is nowhere yet. */
  readonly href: string | null
  readonly heading: string
  readonly typedOnly?: boolean
}

const section = (label: string, anchor: string): DirectoryPage => ({
  heading: HEADINGS.settings,
  label,
  href: `/settings#${anchor}`,
  where: WHERE.settings,
  icon: 'gear',
  typedOnly: true,
})

export const directoryPages = (
  officeHours: UpcomingOfficeHours | null,
  offerRefer = true,
): readonly DirectoryPage[] => [
  ...ADMIN_TABS.map(
    (tab): DirectoryPage => ({
      heading: HEADINGS.goTo,
      label: tab.label,
      href: tab.href,
      where: WHERE.tab,
      icon: 'page',
    }),
  ),
  {
    heading: HEADINGS.settings,
    label: 'Settings',
    sub: SETTINGS_SECTIONS,
    href: '/settings',
    where: WHERE.settings,
    icon: 'gear',
  },
  section('Ministry', 'ministry'),
  section('Language', 'language'),
  section('Pairing', 'pairing'),
  section('Check-in', 'check-in'),
  {
    heading: HEADINGS.settings,
    label: 'Billing',
    sub: BILLING_LINE,
    href: '/settings/billing',
    where: WHERE.settings,
    icon: 'card',
  },
  {
    heading: HEADINGS.settings,
    label: INTAKE_FORMS,
    href: '/intake-forms',
    where: WHERE.page,
    icon: 'form',
  },
  {
    heading: HEADINGS.settings,
    label: REFER_A_CHURCH.label,
    // Not while sign-up is shut: the header's button is not drawn then, and its page is a 404.
    href: offerRefer ? REFER_A_CHURCH.href : null,
    where: WHERE.page,
    icon: 'gift',
  },
  {
    heading: HEADINGS.settings,
    label: CHANGE_YOUR_PASSWORD,
    also: WHERE.account,
    href: '/account',
    where: WHERE.account,
    icon: 'key',
  },
  ...helpMenuFor({ whatsNewIsNew: false, officeHours })
    .flatMap((group) => group.items)
    .map(
      (item): DirectoryPage => ({
        heading: HEADINGS.help,
        label: item.label,
        href: item.href,
        where: WHERE.help,
        icon: item.icon,
        ...(item.newTab ? { newTab: true } : {}),
      }),
    ),
  {
    heading: HEADINGS.help,
    label: 'Ask Discipler',
    href: null, // A circle with no address. See the note at the top of this file.
    where: WHERE.help,
    icon: 'help',
  },
]

/** One row for each page with an address, under its heading, in the order written. */
const grouped = (pages: readonly DirectoryPage[]): readonly DirectoryGroup[] => {
  const groups = new Map<string, DirectoryRow[]>()
  for (const page of pages) {
    if (page.href === null) continue
    const { heading, typedOnly: _typedOnly, ...row } = page
    groups.set(heading, [...(groups.get(heading) ?? []), { ...row, href: page.href }])
  }
  return [...groups].map(([heading, rows]) => ({ heading, rows }))
}

/** The rows `/search` sends, read when search is opened. */
export interface SearchNames {
  readonly people: readonly DirectoryRow[]
  readonly relationships: readonly DirectoryRow[]
  readonly materials: readonly DirectoryRow[]
  /** The Help center's pages, which are too many to draw with nothing typed. */
  readonly help: readonly DirectoryRow[]
}

/**
 * What search shows for what is typed. With nothing typed, the pages. With something
 * typed, the groups in the order drawn: People, Relationships, Materials, then the
 * pages, which keep their own headings, with the Help pages under Help.
 *
 * `names` is null until `/search` has answered, so the pages are there at once and the
 * names join them. `pages` is an argument so a test can give an unbuilt page an address.
 */
/** The pages as of this moment, with Office hours only while there is a next call. */
export const pagesNow = (offerRefer: boolean): readonly DirectoryPage[] =>
  directoryPages(upcomingOfficeHours(NEXT_OFFICE_HOURS, new Date()), offerRefer)

export const directoryFor = (
  query: string,
  names: SearchNames | null,
  pages: readonly DirectoryPage[] = pagesNow(true),
): readonly DirectoryGroup[] => {
  if (query.trim() === '') return grouped(pages.filter((page) => !page.typedOnly))

  // Nothing but punctuation is something typed that no name can answer.
  const terms = termsOf(query)
  if (terms.length === 0) return []

  const listed = grouped(pages)
  const pageGroups = listed.filter((group) => group.heading !== HEADINGS.help)
  const helpRows = listed.find((group) => group.heading === HEADINGS.help)?.rows ?? []
  const onTheMenu = new Set(helpRows.map((row) => row.href))

  return matching(
    [
      { heading: HEADINGS.people, rows: names?.people ?? [] },
      { heading: HEADINGS.relationships, rows: names?.relationships ?? [] },
      { heading: HEADINGS.materials, rows: names?.materials ?? [] },
      ...pageGroups,
      {
        heading: HEADINGS.help,
        rows: [...helpRows, ...(names?.help ?? []).filter((row) => !onTheMenu.has(row.href))],
      },
    ],
    terms,
  )
}
