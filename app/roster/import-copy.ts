import type { ImportMode } from '~/domain/roster-csv'
import type { RowOutcome } from '~/domain/roster-import'

/**
 * Everything the import says in words: the two layouts, their sentences and
 * columns, the example an Admin can insert, and the labels on the review. In the
 * prototype's own words wherever it had them (ticket 36), and one place so the
 * dialog and the page that serves it without script cannot disagree.
 */

export const IMPORT_DATASET = 'Import Dataset'

/** The dialog's id, which is what the Import Dataset link targets. Here rather than on the dialog: a value a server page reads cannot live in a client module. */
export const IMPORT_DIALOG_ID = 'import'
export const SUPPORT_EMAIL = 'support@trydiscipler.com'

export const IMPORT_STEP = {
  layout: 'How is your data laid out?',
  paste: 'Paste your rows (copy straight from a spreadsheet)',
  review: 'Review & confirm',
} as const

export const IMPORT_MODE_LABEL: Record<ImportMode, string> = {
  already_paired: 'Already paired',
  people_only: 'People only',
}

/** The sentence under the toggle, before the columns. */
export const IMPORT_MODE_SENTENCE: Record<ImportMode, string> = {
  already_paired:
    'Each row is one discipler–disciple pair. Both people are added to the Roster and the pair is planned: it forms itself once both have completed Intake.',
  people_only:
    'Each row is one person. Add a Role column (Discipler or Disciple) and, to plan pairs, a Paired With column naming who they are paired with.',
}

/** The column chips, in the order the example lays them out. */
export const IMPORT_MODE_COLUMNS: Record<ImportMode, readonly string[]> = {
  already_paired: ['Discipler', 'Discipler Phone', 'Discipler Email', 'Disciple', 'Disciple Phone', 'Disciple Email'],
  people_only: ['Name', 'Role', 'Phone', 'Email', 'Paired With'],
}

/** Said in both layouts, at the product owner's direction, around a link to the address. */
export const IMPORT_HELP = {
  before: 'Not sure how to lay it out, or whether it came out right? Email the spreadsheet to ',
  after: ' and we will import it for you.',
} as const

/** Tab-separated, as a spreadsheet pastes, with the header row the reader needs. */
export const IMPORT_EXAMPLE: Record<ImportMode, string> = {
  already_paired: [
    'Discipler\tDiscipler Phone\tDiscipler Email\tDisciple\tDisciple Phone\tDisciple Email',
    'Sam Rivera\t(706) 555-0101\tsam.rivera@example.org\tTaylor Brooks\t(706) 555-0440\ttaylor.brooks@example.edu',
    'Alex Morgan\t(706) 555-0102\talex.morgan@example.org\tCasey Nguyen\t(706) 555-0441\tcasey.nguyen@example.edu',
    'Jordan Lee\t(706) 555-0103\tjordan.lee@example.org\tRiley Carter\t(706) 555-0442\triley.carter@example.edu',
  ].join('\n'),
  people_only: [
    'Name\tRole\tPhone\tEmail\tPaired With',
    'Sam Rivera\tDiscipler\t(706) 555-0101\tsam.rivera@example.org\tTaylor Brooks',
    'Taylor Brooks\tDisciple\t(706) 555-0440\ttaylor.brooks@example.edu\tSam Rivera',
    'Alex Morgan\t\t(706) 555-0102\talex.morgan@example.org\t',
  ].join('\n'),
}

export const INSERT_EXAMPLE = 'Insert example'
export const CLEAR = 'Clear'
export const PASTE_HERE = 'Paste here...'

/** The four tiles, in the prototype's words: nothing is created at import, but *Pairs created* is what it says (ticket 36, Q3). */
export const TILE_LABEL = {
  newDisciplers: 'New disciplers',
  newDisciples: 'New disciples',
  pairsCreated: 'Pairs created',
  alreadyInRoster: 'Already in roster',
} as const

export const REVIEW_COLUMNS = ['#', 'Name', 'Role', 'Phone', 'Email', 'Paired with'] as const
export const ROLE_PILL = { discipler: 'Discipler', disciple: 'Disciple' } as const
export const REVIEW_UNPAIRED = 'unpaired'

/** Under the name of a row the import will not add, saying why in the review's own words. */
export const ROW_NOTE: Record<Exclude<RowOutcome, 'new'>, string> = {
  already_on_the_roster: 'already on the Roster, left as they are',
  held: 'number already on the Roster under another name, waits on you',
}

export const REVIEW_EMPTY = 'Paste your rows above and the review appears here.'

/** A congregation of thousands is reviewed by its numbers; the table shows the first of them. */
export const REVIEW_LISTED_AT_MOST = 200
export const REVIEW_MORE_ROWS = (more: number): string =>
  `and ${more} more ${more === 1 ? 'row' : 'rows'} not shown here.`

/** *Import 6 people & 3 pairs*: everyone the paste names, and only the pairs that will be planned. Bare *Import* before there is anything to count. */
export const importButtonLabel = (people?: number, pairs = 0): string =>
  people === undefined
    ? 'Import'
    : `Import ${people} ${people === 1 ? 'person' : 'people'}${
        pairs > 0 ? ` & ${pairs} ${pairs === 1 ? 'pair' : 'pairs'}` : ''
      }`

export const CANCEL = 'Cancel'

/** Without script, the review is the server's and comes back with the import. */
export const NO_SCRIPT_REVIEW =
  'Review and confirm happens after you press Import: the Roster comes back saying who was added, which pairs were planned, and any rows that could not be read, by line.'
