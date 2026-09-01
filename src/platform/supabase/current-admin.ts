import { ministryId, personId, type MinistryId, type PersonId } from '~/domain/ids'
import { createSupabaseServerClient } from './server-client'

export interface SignedInAdmin {
  readonly userId: string
  readonly ministryId: MinistryId
  readonly ministryName: string
  /**
   * Their own row on their own Roster, or null where they hold none.
   *
   * An Admin is a Person in their own Ministry like everybody else -- provisioning
   * creates the row, and ADR-0009 is why they are not given a second identity when
   * they are later invited to lead. The Roster needs to know which row that is,
   * because it is the one row that must not be offered a password reset.
   *
   * Null rather than absent, because it is reachable: `resolveAdmin` answers for a
   * `ministry_member` row, and a Ministry could hold an Admin membership for
   * somebody its Roster does not. There is no row of theirs to treat specially
   * then, which is what null says.
   */
  readonly personId: PersonId | null
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

  // Their own row, read through their own session -- `person_read_self` is the
  // policy that answers it, and it needs no Admin tier at all. Asked here rather
  // than on the Roster because it is part of who the signed-in Admin is, and two
  // surfaces working it out separately would be two answers to *which of these
  // rows is you*.
  const { data: own, error: ownError } = await supabase
    .from('person')
    .select('id')
    .eq('ministry_id', membership.ministry_id)
    .eq('user_id', user.id)
    .maybeSingle()

  // Raised rather than folded into the null case, for the reason the lookup above
  // it is: an Admin whose own row could not be read would be offered the action
  // that resets their own password, which is the one thing this answer prevents.
  if (ownError) {
    throw new Error(`Could not resolve the signed-in Admin's own row: ${ownError.message}`)
  }

  return {
    status: 'admin',
    admin: {
      userId: user.id,
      ministryId: ministryId(membership.ministry_id),
      ministryName: ministry?.name ?? 'Your ministry',
      personId: typeof own?.id === 'string' ? personId(own.id) : null,
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
