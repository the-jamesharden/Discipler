import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseCredentials } from './credentials'

/**
 * The reading side. This client carries the signed-in user's session, so every
 * query it makes is evaluated under row-level security as that user. A missing
 * `where ministry_id = ...` here returns nothing rather than another Ministry's
 * data, which is the whole point of enforcing isolation in the database.
 */
export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseCredentials()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}
