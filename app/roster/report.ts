import type { FileProblem } from '~/domain/errors'
import { isRowProblem, type RowProblem, type RowRejection } from '~/domain/roster'

/**
 * What an import did, carried from the route handler back to the Roster in the
 * query string -- as codes and line numbers, never as prose and never as anybody's
 * name or number. Two reasons, and both matter.
 *
 * The first is the rule the sign-in page already follows: the screen owns the
 * wording, so nothing a stranger puts in the URL can be rendered inside the app's
 * own styling. The second is that a URL is logged, shared and kept: a report saying
 * *line 7* is as useful to the Admin looking at their own spreadsheet as one saying
 * *Emily Johnson, +1 555 014 2000*, and it leaves no congregant's number in a log.
 */

export interface ImportReport {
  readonly added: number
  readonly refused: readonly RowRejection[]
  /**
   * Refused rows the report had no room to list, counted by why. A count with no
   * reason would be the silent drop this ticket exists to prevent; a thousand line
   * numbers do not fit in a URL. So the lines run out before the reasons do.
   */
  readonly hidden: readonly { readonly problem: RowProblem; readonly count: number }[]
}

/**
 * A URL has a length limit, so a file with a thousand bad rows cannot come back a
 * line at a time. Grouping by problem is what buys most of the room -- one code and
 * a run of line numbers, rather than the code repeated on each of them -- and what
 * does not fit is still counted by reason rather than dropped.
 */
const LISTED_AT_MOST = 200

const groupByProblem = (
  rejections: readonly RowRejection[],
): Map<RowProblem, number[]> => {
  const grouped = new Map<RowProblem, number[]>()
  for (const { line, problem } of rejections) {
    grouped.set(problem, [...(grouped.get(problem) ?? []), line])
  }
  return grouped
}

export const encodeImportReport = (
  added: number,
  refused: readonly RowRejection[],
): URLSearchParams => {
  const listed = refused.slice(0, LISTED_AT_MOST)
  const params = new URLSearchParams({ added: String(added) })

  const groupsOf = (rejections: readonly RowRejection[], render: (lines: number[]) => string) =>
    [...groupByProblem(rejections)]
      .map(([problem, lines]) => `${problem}:${render(lines)}`)
      .join(',')

  if (listed.length > 0) {
    params.set('refused', groupsOf(listed, (lines) => lines.join('.')))
  }
  if (refused.length > listed.length) {
    // Counted by reason. "And 340 more" tells an Admin nothing they can act on;
    // "340 more with no phone number" tells them their export is missing a column.
    params.set('hidden', groupsOf(refused.slice(LISTED_AT_MOST), (lines) => String(lines.length)))
  }

  return params
}

const asCount = (value: string | undefined): number => {
  const count = Number(value)
  return Number.isInteger(count) && count >= 0 ? count : 0
}

/** `no_phone:2.5.9,no_name:4` -- one code, then the lines it applies to. */
const decodeGroups = (raw: string | undefined): [RowProblem, string[]][] =>
  (raw ?? '')
    .split(',')
    .flatMap((group) => {
      const [problem, values] = group.split(':')
      if (!problem || !isRowProblem(problem) || !values) return []
      return [[problem, values.split('.')] as [RowProblem, string[]]]
    })

/**
 * Anything unrecognised is dropped rather than rendered. An invented `?refused=`
 * therefore says nothing, which is the same promise the sign-in page makes about an
 * invented `?error=`.
 */
export const decodeImportReport = (params: {
  added?: string
  refused?: string
  hidden?: string
}): ImportReport | undefined => {
  if (params.added === undefined) return undefined

  const refused = decodeGroups(params.refused)
    .flatMap(([problem, lines]) =>
      lines.flatMap((value) => {
        const line = Number(value)
        return Number.isInteger(line) && line >= 1 ? [{ line, problem }] : []
      }),
    )
    .sort((first, second) => first.line - second.line)

  const hidden = decodeGroups(params.hidden)
    .map(([problem, values]) => ({ problem, count: asCount(values[0]) }))
    .filter((group) => group.count > 0)

  return { added: asCount(params.added), refused, hidden }
}

/**
 * The import never started, or was abandoned whole. Distinct from a report: no
 * Person reached the Roster, so there is nothing to count. A `FileProblem` is one of
 * these by definition -- an unreadable file rejects every row in it.
 */
export type ImportFailure = FileProblem | 'no_file' | 'too_large' | 'roster_changed'
