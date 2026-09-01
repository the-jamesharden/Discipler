import { createSupabaseServerClient } from './server-client'

/**
 * Who holds this session, and nothing about what they are part of.
 *
 * Apart from `resolveAdmin` deliberately. That one answers *which Ministry does
 * this person administer*, and the surface that changes your own password must
 * not ask it: the credential is the person's and not a Ministry's, and a
 * membership check would leave an orphaned account -- somebody whose Person row
 * was removed -- with a password it can never change. This asks the one thing that
 * surface needs, which is that there is a session and whose it is.
 */
export interface SignedInUser {
  readonly userId: string
}

export const currentUser = async (): Promise<SignedInUser | null> => {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user ? { userId: user.id } : null
}
