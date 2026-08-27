/**
 * Fixtures for driving an import. Both of these were written out three times over
 * before they were extracted, and the phone numbers in particular are the kind of
 * thing that is subtly wrong when it is copied: the stack outlives a single
 * `npm test`, so a counter starting from the same place every run collides with
 * yesterday's rows and the failure looks like a duplicate-detection bug.
 */

/** A CSV, written as its lines. */
export const file = (...lines: string[]): string => lines.join('\n')

/**
 * North American numbers nobody else in the suite will draw, unique per run as well
 * as per call. Ten digits, so the importer reads them the way it reads a real
 * export, and the caller adds `+1` when asserting against what was stored.
 */
export const phoneNumbers = (): (() => string) => {
  let next = 5_000_000_000 + (Date.now() % 400_000_000) * 10
  return () => `${next++}`
}
