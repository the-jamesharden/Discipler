import type { SupabaseClient } from '@supabase/supabase-js'
import { ministryId, personId, type MinistryId } from '~/domain/ids'
import type { AdminPage, AdminResolution } from '~/service/ports'
import { text } from './rows'
import { verifiedTokenSubject } from './session'

/**
 * A page is one read.
 *
 * Every signed-in page used to ask the database for its data as a chain of
 * separate requests: who is signed in, then whether the session is still held,
 * then which Ministry they administer, then the page's own reads one after the
 * other, then the shell's badge on top. Each request was a network round trip
 * that cost many times the statement behind it, and a click that fired several
 * at once was the burst that stalled the origin. So each page now has one SQL
 * function that answers the whole page in one document
 * (`supabase/migrations/20260926000100_a_page_is_one_read.sql`), and this file
 * is how a reader asks for one and reads the verdict off the top of it.
 *
 * The document is keyed by the read it replaces, with the same columns under the
 * same names, so the readers parse rows out of it with the checks they already
 * had. What is new is only where the rows come from.
 */

/** One page's document, as the function returned it: a shape read field by field. */
export type PageDocument = Readonly<Record<string, unknown>>

/** The document for nobody: the verdict alone, the same shape the function gives it. */
const SIGNED_OUT: PageDocument = { session: 'signed-out' }

/**
 * The document for one page, through whichever client is handed in.
 *
 * A request with no verified token is answered `signed-out` here, before any
 * read: the page functions are executable by a signed-in role and nobody else,
 * so a visitor's request would be refused at the door rather than answered, and
 * a refusal is not a verdict. The token that verifies is then sent, and the
 * function decides whether the session it names is still held.
 *
 * Raised rather than read as empty when the function could not answer: the
 * page's own reads are about to fail on the same fault, and a signed-in Admin
 * shown an empty Ministry over a broken connection is the wrong answer shown
 * confidently.
 */
export const readPageDocument = async (
  supabase: SupabaseClient,
  page: string,
  args?: Readonly<Record<string, unknown>>,
): Promise<PageDocument> => {
  if (!(await verifiedTokenSubject(supabase))) return SIGNED_OUT

  const { data, error } = await supabase.rpc(page, args)

  if (error) throw new Error(`Could not read the page ${page}: ${error.message}`)
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`The page ${page} answered with something other than a document`)
  }

  return data as PageDocument
}

/**
 * The three answers a page can get about the session, off the top of its
 * document. `signed-out` is a token that verifies but names no held session
 * (`docs/adr/0016-a-password-change-ends-every-session.md`), as much as no token
 * at all; `not-an-admin` is a held session that administers nothing.
 *
 * A verdict this reader does not know is raised rather than read as signed-out:
 * silence about who is here is not the same as nobody being here.
 */
export const resolutionOf = (doc: PageDocument): AdminResolution => {
  const session = doc.session

  if (session === 'signed-out') return { status: 'signed-out' }
  if (session === 'not-an-admin') return { status: 'not-an-admin' }
  if (session !== 'admin') {
    throw new Error(`A page answered with a session verdict this reader does not know: ${String(session)}`)
  }

  const userId = text(doc.user_id)
  const admin = (doc.admin ?? {}) as Record<string, unknown>
  const ministry = text(admin.ministry_id)
  if (!userId || !ministry) {
    throw new Error('A page said an Admin is signed in without saying who or of which Ministry')
  }

  const own = text(admin.person_id)

  return {
    status: 'admin',
    admin: {
      userId,
      ministryId: ministryId(ministry),
      ministryName: text(admin.ministry_name) ?? 'Your ministry',
      personId: own ? personId(own) : null,
    },
  }
}

/**
 * A page's answer with what the page derives from its document, or the verdict
 * alone where there is no Admin to derive for.
 */
export const adminPage = <T>(
  doc: PageDocument,
  derive: (doc: PageDocument, admin: AdminResolution & { readonly status: 'admin' }) => T,
): AdminPage<T> => {
  const resolution = resolutionOf(doc)
  if (resolution.status !== 'admin') return resolution
  return { status: 'admin', admin: resolution.admin, page: derive(doc, resolution) }
}

/**
 * One named part of a document. Raised when it is missing, for the reason every
 * reader here raises on a missing column: a page that has been told less than it
 * needs must not render what it was told as if it were everything.
 */
export const section = (doc: PageDocument, key: string): PageDocument => {
  const value = doc[key]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`The page document has no ${key}`)
  }
  return value as PageDocument
}

/** One named list of rows in a document, each a shape read field by field. */
export const list = (doc: PageDocument, key: string): readonly Record<string, unknown>[] => {
  const value = doc[key]
  if (!Array.isArray(value)) throw new Error(`The page document has no ${key}`)
  return value as Record<string, unknown>[]
}

/**
 * One page's document for one Ministry, through whichever signed-in client it is
 * handed, or null where the session does not administer that Ministry.
 *
 * Kept so a test can drive a reader's derivation with a real session rather than
 * a Next.js request context, which is the one thing `createSupabaseServerClient`
 * needs and the one thing a test cannot supply. The Ministry named is the one the
 * caller is asking about: a page function answers for the session's own Ministry
 * and no other, so asking about somebody else's reads as the empty Ministry the
 * policies would have returned.
 */
export const documentFor = async (
  supabase: SupabaseClient,
  ministry: MinistryId,
  page: string,
  args?: Readonly<Record<string, unknown>>,
): Promise<PageDocument | null> => {
  const doc = await readPageDocument(supabase, page, args)
  const resolution = resolutionOf(doc)
  return resolution.status === 'admin' && resolution.admin.ministryId === ministry ? doc : null
}
