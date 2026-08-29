import { ministryId, type MinistryId } from '~/domain/ids'
import { createSupabaseServerClient } from './server-client'

export interface SignedInAdmin {
  readonly userId: string
  readonly ministryId: MinistryId
  readonly ministryName: string
}

/**
 * The three answers a surface can get, because a page that must tell a visitor
 * with no session apart from a signed-in Leader cannot do it with a null. Asking
 * the session twice to find out which is one round trip and one chance to
 * disagree with itself.
 */
export type AdminResolution =
  | { readonly status: 'admin'; readonly admin: SignedInAdmin }
  | { readonly status: 'not-an-admin' }
  | { readonly status: 'signed-out' }

/**
 * Resolves the signed-in user to the Ministry they administer, keeping the
 * distinction between having no session and having one that administers nothing.
 */
export const resolveAdmin = async (): Promise<AdminResolution> => {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'signed-out' }

  // Deliberately not `.maybeSingle()`: that raises rather than returns when a
  // person administers more than one Ministry.
  const { data, error } = await supabase
    .from('ministry_member')
    .select('ministry_id, ministry(name)')
    .eq('user_id', user.id)
    .eq('tier', 'admin')
    .order('created_at')
    .limit(1)

  // A failed lookup is not the same fact as "not an Admin". Swallowing it would
  // tell an Admin they have no Ministry because the database was briefly
  // unreachable, so it is raised rather than folded into the null case.
  if (error) throw new Error(`Could not resolve the signed-in Admin: ${error.message}`)

  const membership = data?.[0]
  if (!membership) return { status: 'not-an-admin' }

  const ministry = membership.ministry as unknown as { name: string } | null

  return {
    status: 'admin',
    admin: {
      userId: user.id,
      ministryId: ministryId(membership.ministry_id),
      ministryName: ministry?.name ?? 'Your ministry',
    },
  }
}

/**
 * The same resolution for the surfaces that have nothing different to say about
 * the two ways of not being an Admin. Returns null for both.
 */
export const currentAdmin = async (): Promise<SignedInAdmin | null> => {
  const resolution = await resolveAdmin()
  return resolution.status === 'admin' ? resolution.admin : null
}
