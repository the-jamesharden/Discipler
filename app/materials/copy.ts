import type { MaterialAssignmentRefusal, MaterialRefusal } from '~/domain/errors'
import { GENDERS, isOneOf, type Gender } from '~/domain/intake'
import { LARGEST_PDF_BYTES } from '~/domain/materials'
import type { ClosedMaterialPeriod } from '~/service/ports'
import { refusalIn } from '../refusals'

/**
 * Everything the Materials tab, its folders and the create and edit pages say in
 * words, as `.lavish/materials/design.html` has it. The reader deals in Materials
 * and relationships and the boundary refuses in codes; the screens decide how
 * to say them.
 */

export const MATERIALS = 'Materials'

export const MATERIALS_INFO =
  'Relationships are sorted into folders by the Material they are working through. Two or more on the same Material share a folder; one on its own gets a tile of its own. Open a folder to see who is inside.'

export const NO_MATERIALS_YET =
  "No materials yet. Create one, then assign it from its folder or from a group's card on Intake forms."

export const MATERIALS_LEGEND =
  '📁 Folder = a Material several relationships share · single tile = one relationship, on a Material of its own'

/** The legend's word for the neutral tint: a folder of both genders, or of nobody. */
export const MIXED_OR_NOBODY = 'Mixed or nobody'

/** The dashed tile for accepted relationships on no Material, and its page's heading. */
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

// ---------------------------------------------------------------------------
// Creating, editing and removing (ticket 02)
// ---------------------------------------------------------------------------

export const NEW_MATERIAL = 'New material'
export const BACK_TO_MATERIALS = '← Materials'

export const NEW_MATERIAL_LEAD =
  'What a relationship works through: a book, a reading plan, a set of practices. Give it a title and either some text, a PDF, or both. Leaders see it on their dashboard once it is assigned.'

export const TITLE_LABEL = 'Title'
export const TEXT_LABEL = 'Text'
export const TEXT_PLACEHOLDER =
  'What the leader reads. A plan for the weeks, questions to bring, anything they should have in front of them.'
export const TEXT_HINT = 'Shown to the leader as written, line breaks kept.'
export const PDF_LABEL = 'PDF'

/** The cap, said in megabytes, from the one constant the route checks against. */
const LARGEST_PDF_MB = Math.round(LARGEST_PDF_BYTES / (1024 * 1024))

export const PDF_HINT = `PDF only, up to ${LARGEST_PDF_MB} MB. The leader downloads it from their dashboard.`

export const CANCEL = 'Cancel'
export const CREATE_MATERIAL = 'Create material'

export const EDIT_THIS_MATERIAL = 'Edit this material'
export const REMOVE_THE_PDF = 'Remove the PDF'
export const REPLACE_IT = 'Replace it'
export const SAVE_CHANGES = 'Save changes'

export const REMOVE_THIS_MATERIAL = 'Remove this material'
export const REMOVE_LEAD =
  'Takes it off the Materials tab and out of every assign list. Its history stays: any week a relationship spent on it still says so.'
export const REMOVE = 'Remove'
export const KEEP_IT = 'Keep it'

/** *Remove “Romans”?*, the confirmation's heading; and the one button inside it that removes. */
export const removalQuestion = (title: string): string => `Remove “${title}”?`
export const confirmRemoval = (title: string): string => `Yes, remove “${title}”`

/** The notice on the Remove card while anybody is working through the Material. */
export const inUseNotice = (count: number): string =>
  count === 1
    ? '1 relationship is working through it. Move it to another material, or to none, before removing it.'
    : `${count} relationships are working through it. Move them to another material, or to none, before removing it.`

/**
 * *1.8 MB*, or *240 KB* under a megabyte: the size beside the current PDF's
 * name, said the way a file browser says it.
 */
export const fileSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

const REFUSALS: Record<MaterialRefusal, string> = {
  'material.not_on_the_list': 'That material is no longer on the list. Somebody may have removed it.',
  'material.needs_title': 'A material needs a title.',
  'material.title_taken': 'This ministry already has a material with that title.',
  'material.needs_content': 'A material needs text, a PDF, or both.',
  'material.in_use':
    'Relationships are working through it. Move them to another material, or to none, before removing it.',
  'material.pdf_only': 'Only a PDF can be attached.',
  'material.pdf_too_large': `The PDF is larger than ${LARGEST_PDF_MB} MB.`,
}

/**
 * The wording for a refusal that came back on the query string, or null for one
 * this screen does not recognise. The sentences are this screen's; the lookup
 * is `refusalIn`, shared with every surface that reads a code off a query string.
 */
export const refusalMessage = (code: string | undefined): string | null =>
  refusalIn(REFUSALS, code)

// ---------------------------------------------------------------------------
// Assigning (Materials, ticket 03)
// ---------------------------------------------------------------------------

/** The assign row's button in a Material's folder, where there is something to save over. */
export const SAVE_ASSIGNMENT = 'Save'
/** The same button in the no-material folder, where there is not. */
export const ASSIGN = 'Assign'
/** The line the no-material folder's dropdown opens on. */
export const CHOOSE_A_MATERIAL = 'Choose a material…'
/** The dropdown's own name, for a screen reader: the row has no visible label. */
export const MATERIAL_LABEL = 'Material'

const ASSIGNMENT_REFUSALS: Record<MaterialAssignmentRefusal, string> = {
  'material.relationship_not_found': 'That relationship is not on this Roster any more.',
  'material.relationship_not_accepted':
    'A material can be assigned once its leader has accepted.',
  'material.relationship_ended': 'That relationship has ended, so there is nothing left to change.',
  'material.not_found': 'That material is no longer on the list. Somebody may have removed it.',
  'material.assigner_is_not_in_this_ministry': 'This account cannot assign materials here.',
  'material.already_running': 'It is already working through that material, so nothing changed.',
}

/** The sentence for an assignment refused from a folder's card, or null for a code it does not know. */
export const assignmentRefusalMessage = (code: string | undefined): string | null =>
  refusalIn(ASSIGNMENT_REFUSALS, code)
