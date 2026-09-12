import type { AdminResolution, SignedInAdmin } from '~/service/ports'
import { readPageDocument, resolutionOf } from './page'
import { createSupabaseServerClient } from './server-client'

export type { AdminResolution, SignedInAdmin } from '~/service/ports'

/**
 * Resolves the signed-in user to the Ministry they administer, keeping the
 * distinction between having no session and having one that administers nothing.
 *
 * One read. `signed_in_admin` answers whether the session is still held, which
 * Ministry the caller administers and which Roster row is theirs in one document
 * (`supabase/migrations/20260926000100_a_page_is_one_read.sql`), where this used
 * to be three requests in a row on every page. The pages that need more than the
 * Admin read their own page function, which answers the same question at its top;
 * this is for the surfaces that need nothing else.
 *
 * A failed read is raised rather than folded into the null case. Swallowing it
 * would tell an Admin they have no Ministry because the database was briefly
 * unreachable, and a fault is never read as nobody.
 */
export const resolveAdmin = async (): Promise<AdminResolution> =>
  resolutionOf(await readPageDocument(await createSupabaseServerClient(), 'signed_in_admin'))

/**
 * The same resolution for the surfaces that have nothing different to say about
 * the two ways of not being an Admin. Returns null for both.
 */
export const currentAdmin = async (): Promise<SignedInAdmin | null> => {
  const resolution = await resolveAdmin()
  return resolution.status === 'admin' ? resolution.admin : null
}
