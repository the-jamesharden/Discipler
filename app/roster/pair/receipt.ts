import type { SeparatePairingsOutcome } from '~/service/separate-pairings'

/**
 * What a set of separate one-to-ones did (Manual pairing, ticket 21), carried from
 * the pairing route to the Roster in the query string, as the import's report is
 * and for the same reasons: as a count, ids and a code, never as prose and never as
 * anybody's name. The Roster owns the wording and reads the names off its own rows.
 *
 * Its own name for the code, because `error` on the Roster is the import's.
 */

export interface SeparateReceipt {
  /** One-to-ones that were formed. What landed, never what was asked for. */
  readonly formed: number
  /** Disciples the set stopped before, where it stopped partway. Ids, unread. */
  readonly notPaired: readonly string[]
  /** Why it stopped, as a code that is looked up and never rendered. */
  readonly refusal: string | undefined
}

export const encodeSeparateReceipt = (
  outcome: Exclude<SeparatePairingsOutcome, { readonly status: 'refused' }>,
): URLSearchParams => {
  const params = new URLSearchParams()

  if (outcome.status === 'formed') {
    params.set('pairs', String(outcome.formed))
    return params
  }

  params.set('pairs', String(outcome.formed.length))
  for (const id of outcome.notFormed) params.append('notPaired', id)
  if (outcome.refusal !== null) params.set('pairError', outcome.refusal)
  return params
}

export const decodeSeparateReceipt = (query: {
  readonly pairs?: string | undefined
  readonly notPaired?: string | readonly string[] | undefined
  readonly pairError?: string | undefined
}): SeparateReceipt | undefined => {
  const formed = Number.parseInt(query.pairs ?? '', 10)
  // A set that formed none was refused, and came back to the form it was sent from.
  if (!Number.isInteger(formed) || formed < 1) return undefined

  return {
    formed,
    notPaired: [query.notPaired ?? []].flat(),
    refusal: query.pairError,
  }
}
