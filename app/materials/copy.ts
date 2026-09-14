import { GENDERS, isOneOf, type Gender } from '~/domain/intake'
import type { ClosedMaterialPeriod } from '~/service/ports'

/**
 * Everything the Materials tab says in words, as `.lavish/materials/design.html`
 * has it. The reader deals in Materials and relationships; the tab, the folders
 * and the cards decide how to say them.
 */

export const MATERIALS = 'Materials'
export const MATERIALS_LEAD = 'One material at a time, assigned to the relationship'

export const NO_MATERIALS_YET =
  "No materials yet. Create one, then assign it from its folder or from a group's card on Intake forms."

/** The dashed folder for accepted relationships on no Material, and its page's heading. */
export const NO_MATERIAL_ASSIGNED = 'No material assigned'

/** The three answers on the filter, in the order the design draws them. */
export const FILTERS = [null, ...GENDERS] as const
export type MaterialsFilter = (typeof FILTERS)[number]

export const FILTER_LABEL: Record<Gender | 'all', string> = {
  all: 'All',
  male: "Men's",
  female: "Women's",
}

/**
 * Which filter a query string names. Anything it does not say, and anything it
 * says that is not a gender, reads as All: a typed value is not a filter.
 */
export const filterIn = (value: string | undefined): MaterialsFilter =>
  isOneOf(GENDERS, value) ? value : null

/** The query string a filter travels as, on the tab and on every link that keeps it. */
export const filterQuery = (filter: MaterialsFilter): string =>
  filter === null ? '' : `?${new URLSearchParams({ gender: filter })}`

/** *N relationships* under a folder, or the line for one nobody is on. */
export const folderCount = (count: number): string =>
  count === 0 ? 'Nobody working through it' : count === 1 ? '1 relationship' : `${count} relationships`

/** The head of a Material's folder. */
export const workingThroughItNow = (count: number): string =>
  count === 1
    ? '1 relationship working through it now'
    : `${count} relationships working through it now`

/** The head of the "No material assigned" folder. */
export const notWorkingThroughAnything = (count: number): string =>
  count === 1
    ? '1 relationship is not working through anything yet'
    : `${count} relationships are not working through anything yet`

export const ALL_MATERIALS = '← All materials'

/** The relationship label on a card's meta line: the demo's, from what the relationship is now. */
export const relationshipLabel = (isAGroup: boolean, groupName: string | null): string =>
  isAGroup ? (groupName ? `Group, ${groupName}` : 'Group') : 'One-to-one'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The day, month and year an instant falls on in a zone, as numbers. */
const calendarDay = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant)
  const part = (type: string) => Number(parts.find((each) => each.type === type)?.value)
  return { day: part('day'), month: part('month'), year: part('year') }
}

/**
 * *3 Aug 2026*, the date a card prints, in the Ministry's own zone: a period
 * that began at nine on a Monday evening in London began on the Monday, whatever
 * day it was where the server stood. The month is spelled here rather than by a
 * locale, so September is *Sep* on every runtime.
 */
export const dayMonthYear = (instant: Date, timeZone: string): string => {
  const { day, month, year } = calendarDay(instant, timeZone)
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/**
 * *12 Jul – 3 Aug 2026*: a closed period's two dates, with the year said once
 * where both fall in it.
 */
export const dateRange = (startedAt: Date, endedAt: Date, timeZone: string): string => {
  const start = calendarDay(startedAt, timeZone)
  const end = calendarDay(endedAt, timeZone)
  const from =
    start.year === end.year
      ? `${start.day} ${MONTHS[start.month - 1]}`
      : dayMonthYear(startedAt, timeZone)
  return `${from} – ${dayMonthYear(endedAt, timeZone)}`
}

/** *since 3 Aug 2026* in a Material's folder; *started 31 Aug 2026* in the dashed one. */
export const sinceLine = (
  folder: 'material' | 'none',
  since: Date,
  acceptedAt: Date,
  timeZone: string,
): string =>
  folder === 'material'
    ? `since ${dayMonthYear(since, timeZone)}`
    : `started ${dayMonthYear(acceptedAt, timeZone)}`

/** The "Previously:" line: every closed period with a length, earliest first. */
export const previouslyLine = (
  periods: readonly ClosedMaterialPeriod[],
  timeZone: string,
): string =>
  `Previously: ${periods
    .map((period) => `${period.title ?? NO_MATERIAL} (${dateRange(period.startedAt, period.endedAt, timeZone)})`)
    .join(' · ')}`

/** What the stretch with no Material is called on a history line and in a dropdown. */
export const NO_MATERIAL = 'No material'
