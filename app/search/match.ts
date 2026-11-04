/**
 * How search decides what a typed word finds. It looks only at the words a row is
 * listed under: its label, and for a relationship the names of the people in it.
 *
 * A typed word finds a row when it starts one of the row's words, so "gr" finds Greg
 * and "Young adults group", and "reg" finds neither. Every word typed must find
 * something, in any order, so "law gr" finds Greg Lawson. Case and accents are ignored,
 * so "jose" finds José.
 */

export type DirectoryIcon =
  | 'page'
  | 'gear'
  | 'card'
  | 'form'
  | 'gift'
  | 'key'
  | 'book'
  | 'restart'
  | 'megaphone'
  | 'calendar'
  | 'mail'
  | 'video'
  | 'pen'
  | 'help'
  | 'pair'
  | 'people'
  | 'material'

export interface DirectoryRow {
  readonly label: string
  /** The small line beneath it. */
  readonly sub?: string
  readonly href: string
  /** Where it opens, at the row's end. */
  readonly where: string
  readonly icon: DirectoryIcon
  /** A person's initials, drawn in a circle in place of the icon. */
  readonly initials?: string
  /** Other names the row answers to, not shown: the people in a named group. */
  readonly also?: string
  /** Somewhere outside Discipler, which opens in a tab of its own. */
  readonly newTab?: boolean
}

export interface DirectoryGroup {
  readonly heading: string
  readonly rows: readonly DirectoryRow[]
}

const WORD = /[\p{L}\p{N}]+/gu

const folded = (words: string): string =>
  words
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** The words typed, folded. A query of nothing but punctuation has none. */
export const termsOf = (query: string): readonly string[] => folded(query).match(WORD) ?? []

/** Whether a row answers to every word typed. */
export const rowMatches = (row: DirectoryRow, terms: readonly string[]): boolean => {
  const words = folded([row.label, row.also ?? ''].join(' ')).match(WORD) ?? []
  return terms.every((term) => words.some((word) => word.startsWith(term)))
}

/** The groups holding a row that answers, in their own order and without the rest. */
export const matching = (
  groups: readonly DirectoryGroup[],
  terms: readonly string[],
): readonly DirectoryGroup[] =>
  groups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => rowMatches(row, terms)) }))
    .filter((group) => group.rows.length > 0)

export interface LabelPart {
  readonly text: string
  /** Whether a typed word is what found this part, and it is marked. */
  readonly marked: boolean
}

/** How many of a word's own letters it takes to say a folded prefix, accents and all. */
const lettersSaying = (word: string, prefix: string): number => {
  let letters = 0
  for (const letter of word) {
    if (folded(word.slice(0, letters)).length >= prefix.length) break
    letters += letter.length
  }
  return letters
}

/** A label cut into what a typed word found and the rest, for the highlight in each row. */
export const labelParts = (label: string, terms: readonly string[]): readonly LabelPart[] => {
  const parts: LabelPart[] = []
  let done = 0

  for (const found of label.matchAll(WORD)) {
    const word = found[0]
    const term = terms
      .filter((each) => folded(word).startsWith(each))
      .sort((a, b) => b.length - a.length)[0]
    if (!term) continue

    if (found.index > done) parts.push({ text: label.slice(done, found.index), marked: false })
    const end = found.index + lettersSaying(word, term)
    parts.push({ text: label.slice(found.index, end), marked: true })
    done = end
  }

  if (done < label.length) parts.push({ text: label.slice(done), marked: false })
  return parts
}
