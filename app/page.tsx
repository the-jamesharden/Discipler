import { redirect } from 'next/navigation'
import { resolveAdmin } from '~/platform/supabase/current-admin'

/**
 * Which of the two surfaces this session opens on. There are two in V1 and no
 * third: Admin and Leader.
 *
 * An Admin lands on the Roster, because that is the surface that only they have.
 * Everybody else lands on their own relationships -- including an Admin who leads,
 * who reaches theirs from the link on the Roster rather than by being sent
 * somewhere on the strength of a tier.
 */
export default async function Home() {
  const resolution = await resolveAdmin()

  if (resolution.status === 'signed-out') redirect('/login')
  redirect(resolution.status === 'admin' ? '/roster' : '/relationships')
}
