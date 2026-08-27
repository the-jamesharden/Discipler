import { describe, expect, it } from 'vitest'
import { decodeImportReport, encodeImportReport } from '../../app/roster/report'
import type { RowRejection } from '~/domain/roster'

/**
 * The report an Admin reads after an import, and the query string that carries it.
 * Two claims worth holding: nothing a stranger puts in the URL is rendered, and no
 * refused row leaves the report without a reason attached to it.
 */

const roundTrip = (added: number, refused: readonly RowRejection[]) =>
  decodeImportReport(Object.fromEntries(encodeImportReport(added, refused)))

describe('an import report', () => {
  it('carries every refused row back with its line and its reason', () => {
    const refused: RowRejection[] = [
      { line: 2, problem: 'no_name' },
      { line: 4, problem: 'phone_unreadable' },
      { line: 9, problem: 'already_on_the_roster' },
    ]

    expect(roundTrip(14, refused)).toEqual({ added: 14, refused, hidden: [] })
  })

  it('carries no name and no phone number, only line numbers', () => {
    const params = encodeImportReport(1, [{ line: 7, problem: 'no_phone' }]).toString()

    expect(params).toBe('added=1&refused=no_phone%3A7')
  })

  it('counts what it had no room to list, by reason rather than as a bare total', () => {
    // A count alone is the silent drop this whole ticket exists to prevent: an Admin
    // told "and 340 more" learns nothing they can act on.
    const refused: RowRejection[] = [
      ...Array.from({ length: 250 }, (_, index) => ({
        line: index + 2,
        problem: 'no_phone' as const,
      })),
      { line: 400, problem: 'no_name' },
    ]

    const report = roundTrip(0, refused)

    expect(report?.refused).toHaveLength(200)
    expect(report?.hidden).toEqual([
      { problem: 'no_phone', count: 50 },
      { problem: 'no_name', count: 1 },
    ])
  })

  it('stays inside a URL even for a file that is almost entirely unreadable', () => {
    const refused: RowRejection[] = Array.from({ length: 5000 }, (_, index) => ({
      line: index + 2,
      problem: 'phone_unreadable' as const,
    }))

    expect(encodeImportReport(0, refused).toString().length).toBeLessThan(2048)
  })

  it('renders nothing for a report somebody invented in the query string', () => {
    const report = decodeImportReport({
      added: '1',
      refused: '<script>alert(1)</script>:2',
      hidden: 'not_a_problem:9',
    })

    expect(report).toEqual({ added: 1, refused: [], hidden: [] })
  })

  it('is absent altogether when no import has happened', () => {
    expect(decodeImportReport({})).toBeUndefined()
  })
})
