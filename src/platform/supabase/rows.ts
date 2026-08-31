import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reading a PostgREST response, for every adapter in this directory.
 *
 * These three were written out per file until two of them drifted: `rows` and
 * `text` stood letter-for-letter in both the Care Needed reader and the Leader
 * Dashboard, and each surface had grown its own id-to-name query on top of them.
 * A helper that means the same thing in two files is one helper, and a difference
 * between the copies is a bug nobody would go looking for.
 */

/**
 * The rows of a response, as a shape that can be read field by field. `null` data
 * is no rows rather than a failure: an `in` filter that matched nothing is an
 * ordinary answer, and the error channel is where a broken read arrives.
 */
export const rows = (data: unknown): readonly Record<string, unknown>[] =>
  (data ?? []) as Record<string, unknown>[]

/**
 * A column as a string, or null where it holds nothing worth showing. An empty
 * string is folded into null deliberately: a name that came back blank is a name
 * the surface has to fall back on, not one it should print as nothing.
 */
export const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

/**
 * One column of one table, keyed by id -- the follow-up read for a set of ids
 * already in hand.
 *
 * Two things it deliberately does. It asks nothing when there is nothing to ask
 * about, because an `in` filter on an empty list is a round trip whose answer is
 * known. And it drops rows `read` cannot make sense of rather than carrying a
 * placeholder forward: a caller that gets no entry falls back on its own wording,
 * whereas one handed the string `"null"` would print it.
 *
 * `failed` is the caller's, because which read fell over is a question about the
 * screen that asked -- Care Needed and the Leader Dashboard say different things
 * to their own users about the same broken query.
 */
export const lookup = async <T>(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: readonly (string | null)[],
  read: (value: unknown) => T | null,
  failed: (error: { readonly message: string }) => Error,
): Promise<Map<string, T>> => {
  const wanted = [...new Set(ids.flatMap((id) => (id ? [id] : [])))]
  if (wanted.length === 0) return new Map()

  const { data, error } = await supabase.from(table).select(`id, ${column}`).in('id', wanted)
  if (error) throw failed(error)

  return new Map(
    rows(data).flatMap((row) => {
      const id = text(row.id)
      const value = read(row[column])
      return id !== null && value !== null ? [[id, value] as const] : []
    }),
  )
}
