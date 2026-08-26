import { ministryId, type MinistryId } from '~/domain/ids'
import { createSupabaseServerClient } from './server-client'

export interface SignedInAdmin {
  readonly userId: string
  readonly ministryId: MinistryId
  readonly ministryName: string
}

/**
 * Resolves the signed-in user to the Ministry they administer. Returns null both
 * for a visitor with no session and for a signed-in user who is not an Admin --
 * a Leader, say -- because neither may see a Roster.
 */
export const currentAdmin = async (): Promise<SignedInAdmin | null> => {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Deliberately not `.maybeSingle()`: that raises rather than returns when a
  // person administers more than one Ministry.
  const { data } = await supabase
    .from('ministry_member')
    .select('ministry_id, ministry(name)')
    .eq('user_id', user.id)
    .eq('tier', 'admin')
    .order('created_at')
    .limit(1)

  const membership = data?.[0]
  if (!membership) return null

  const ministry = membership.ministry as unknown as { name: string } | null

  return {
    userId: user.id,
    ministryId: ministryId(membership.ministry_id),
    ministryName: ministry?.name ?? 'Your ministry',
  }
}
