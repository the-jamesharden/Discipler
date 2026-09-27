import type { RosterEntry } from '~/service/ports'
import { ROSTER_MENU, shownAs } from './copy'
import { isAGroupNow, isDiscipledBySomebody, leadsSomebody, offeredToMentor } from './lists'

/**
 * The Everyone menu over the Roster (Roles per pairing, ticket 02). The Roster is
 * one list: the All / Disciplers / Disciples toggle went, and this menu replaced
 * it. **Everyone** at the top clears it; then **Pairings**, where a person must
 * match every option ticked, **Gender**, which picks one, and **Access**.
 *
 * What is ticked lives in the address, so a refresh keeps it and it needs no
 * script: every option is a plain link to the Roster with that one option
 * changed, as the toggle's three links were. Pure, so what each option means, the
 * counts and the address are held by `tests/app` with no server near them.
 */

/** The Pairings options, in the menu's order, as the address spells them. */
export const PAIRINGS = [
  'disciples-somebody',
  'being-discipled',
  'in-a-group',
  'unpaired',
  'offered-to-disciple',
  'awaiting-intake',
] as const
export type PairingsOption = (typeof PAIRINGS)[number]

/** The genders the menu can narrow to. Neither picked is *Men and women*, the default. */
export const GENDERS_SHOWN = ['men', 'women'] as const
export type GenderShown = (typeof GENDERS_SHOWN)[number]

/** What the Roster shows. Nothing ticked is everybody. */
export interface RosterView {
  /** In the menu's order, each once. */
  readonly pairings: readonly PairingsOption[]
  readonly gender: GenderShown | null
  readonly admins: boolean
}

export const EVERYONE: RosterView = { pairings: [], gender: null, admins: false }

export const isEveryone = (view: RosterView): boolean =>
  view.pairings.length === 0 && view.gender === null && !view.admins

/** The address's field for each section, and the one value Access holds. */
export const MENU_FIELD = { pairings: 'pairings', gender: 'gender', access: 'access' } as const
const ADMINS = 'admins'

/**
 * Keeps the menu open on the page an option's link lands on, so several can be
 * ticked one after another; the button closes it, and **Everyone** leaves it
 * closed. A way out of the menu (Pair on a row, the popup's) never carries it.
 */
export const MENU_OPEN = ['menu', 'open'] as const

/**
 * What each Pairings option means (Roles per pairing, spec, *What each Pairings
 * option means*), over the reader's own facts.
 */
export const PAIRINGS_MEANS: Record<PairingsOption, (person: RosterEntry) => boolean> = {
  /** An open leader membership, one still awaiting their acceptance included: the Paired with cell shows those. */
  'disciples-somebody': (person) => leadsSomebody(person),
  /** An open participant membership, one-to-one or group. */
  'being-discipled': (person) => isDiscipledBySomebody(person),
  /** An open membership, either side, with more than one Disciple in it now, from the live count. */
  'in-a-group': (person) => person.relationships.some(isAGroupNow),
  /** No open membership on either side, and no plan an import made: the cell reads *Unpaired*. */
  unpaired: (person) => person.relationships.length === 0 && person.intendedPairings.length === 0,
  /** Answered Mentor on the Intake form, and leads nothing. */
  'offered-to-disciple': (person) => offeredToMentor(person) && !leadsSomebody(person),
  /** Participation Status is No Intake Submitted. */
  'awaiting-intake': (person) => person.participationStatus === 'no_intake_submitted',
}

const GENDER_MEANS: Record<GenderShown, (person: RosterEntry) => boolean> = {
  men: (person) => person.gender === 'male',
  women: (person) => person.gender === 'female',
}

/** Whether the Roster shows somebody: every Pairings option ticked, the gender picked, and Admins where ticked. */
export const isShown = (view: RosterView, person: RosterEntry): boolean =>
  view.pairings.every((option) => PAIRINGS_MEANS[option](person)) &&
  (view.gender === null || GENDER_MEANS[view.gender](person)) &&
  (!view.admins || person.isAdmin)

/**
 * The count beside every option, each over the whole Roster and never narrowed by
 * what else is ticked, so a count says how many there are and not how many would
 * be left.
 */
export const menuCounts = (roster: readonly RosterEntry[]) => {
  const counted = (means: (person: RosterEntry) => boolean): number => roster.filter(means).length
  return {
    everyone: roster.length,
    pairings: Object.fromEntries(PAIRINGS.map((option) => [option, counted(PAIRINGS_MEANS[option])])) as Record<
      PairingsOption,
      number
    >,
    gender: { all: roster.length, men: counted(GENDER_MEANS.men), women: counted(GENDER_MEANS.women) },
    admins: counted((person) => person.isAdmin),
  }
}

/**
 * What the address ticked. Anything it does not know is nothing ticked, the old
 * toggle's `list` included, so an old address still opens the Roster, on
 * Everyone. Each option once and in the menu's order, whatever order the address
 * said them in; the first gender said is the one read.
 */
export const viewIn = (said: (field: string) => readonly unknown[]): RosterView => {
  const pairings = said(MENU_FIELD.pairings)
  const gender = said(MENU_FIELD.gender)[0]
  return {
    pairings: PAIRINGS.filter((option) => pairings.includes(option)),
    gender: GENDERS_SHOWN.find((each) => each === gender) ?? null,
    admins: said(MENU_FIELD.access).includes(ADMINS),
  }
}

/** What the address says of it: the fields `viewIn` reads back to the same thing, in the menu's order. */
export const viewFields = (view: RosterView): [string, string][] => [
  ...view.pairings.map((option): [string, string] => [MENU_FIELD.pairings, option]),
  ...(view.gender === null ? [] : [[MENU_FIELD.gender, view.gender] satisfies [string, string]]),
  ...(view.admins ? [[MENU_FIELD.access, ADMINS] satisfies [string, string]] : []),
]

/** The Roster showing this, with anything else the address is to carry after it. */
export const rosterHref = (view: RosterView, more: readonly (readonly [string, string])[] = []): string => {
  const query = new URLSearchParams([...viewFields(view), ...more.map(([name, value]): [string, string] => [name, value])])
  const said = query.toString()
  return said === '' ? '/roster' : `/roster?${said}`
}

/**
 * Where Pair on a row goes: the popup over what the Roster shows (Manual pairing,
 * ticket 12, and Roles per pairing, ticket 02), on the side the preset gives
 * (ticket 01), so closing it lands back on the same people.
 */
export const pairHref = (person: Pick<RosterEntry, 'personId'>, view: RosterView): string =>
  rosterHref(view, [['pair', person.personId]])

/** One line in the menu: what it says, its count, whether it is ticked, and where it goes. */
export interface MenuOption {
  readonly label: string
  readonly count: number
  readonly ticked: boolean
  readonly href: string
}

export interface MenuSection {
  readonly heading: string
  /** Tick any, or pick one: drawn as boxes or as rounds. */
  readonly pick: 'any' | 'one'
  readonly options: readonly MenuOption[]
}

/** The menu as the Roster draws it, over what the address ticked. */
export const theMenu = (view: RosterView, roster: readonly RosterEntry[]) => {
  const counts = menuCounts(roster)
  const option = (label: string, count: number, ticked: boolean, next: RosterView): MenuOption => ({
    label,
    count,
    ticked,
    href: rosterHref(next, [MENU_OPEN]),
  })
  const pairings: MenuSection = {
    heading: ROSTER_MENU.pairings,
    pick: 'any',
    options: PAIRINGS.map((each) => {
      const ticked = view.pairings.includes(each)
      return option(ROSTER_MENU.pairing[each], counts.pairings[each], ticked, {
        ...view,
        pairings: ticked ? view.pairings.filter((other) => other !== each) : PAIRINGS.filter((other) => other === each || view.pairings.includes(other)),
      })
    }),
  }
  const gender: MenuSection = {
    heading: ROSTER_MENU.gender,
    pick: 'one',
    options: [
      option(ROSTER_MENU.genderShown.all, counts.gender.all, view.gender === null, { ...view, gender: null }),
      ...GENDERS_SHOWN.map((each) =>
        option(ROSTER_MENU.genderShown[each], counts.gender[each], view.gender === each, { ...view, gender: each }),
      ),
    ],
  }
  const access: MenuSection = {
    heading: ROSTER_MENU.access,
    pick: 'any',
    options: [option(ROSTER_MENU.admins, counts.admins, view.admins, { ...view, admins: !view.admins })],
  }
  return {
    button: shownAs(view),
    everyone: { label: ROSTER_MENU.everyone, count: counts.everyone, ticked: isEveryone(view), href: rosterHref(EVERYONE) },
    sections: [pairings, gender, access],
  }
}
