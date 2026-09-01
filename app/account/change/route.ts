import { NextResponse, type NextRequest } from 'next/server'
import { passwordChangeRefusals } from '~/domain/accounts'
import { currentUser } from '~/platform/supabase/current-user'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getAccounts } from '~/service/container'

/**
 * The change itself, behind the one form. An ordinary form POST like sign-in and
 * the reset, so it works before JavaScript has loaded.
 *
 * Two checks in a fixed order. The form's own rules first and together, in the
 * domain, so too short and not matching come back in field order and a form that
 * was going to be refused anyway spends nothing against the sign-in rate limit.
 * Then the port, once, which is the only thing that can say whether the current
 * password is right -- and which does the whole of the rest, the sessions ending
 * included, because one method cannot be called wrong
 * (`docs/adr/0016-a-password-change-ends-every-session.md`).
 *
 * Nothing is recorded. `person.password_reset` exists to answer *did somebody
 * else change this person's credential*, and this is the case where the answer is
 * no. Nothing is sent either.
 */

const ACCOUNT = '/account'

const back = (request: NextRequest, refusals: readonly string[]) =>
  NextResponse.redirect(
    new URL(`${ACCOUNT}?${new URLSearchParams({ error: refusals.join(',') })}`, request.url),
    { status: 303 },
  )

/** A field as it arrives. Absent is the empty string: every rule below refuses it. */
const typed = (form: FormData, field: string): string => {
  const value = form.get(field)
  return typeof value === 'string' ? value : ''
}

export async function POST(request: NextRequest) {
  // The same question the page asks, asked the same way: is there a session, and
  // whose. Not `currentAdmin` -- a Leader has no Ministry to administer and an
  // orphaned account has no Ministry at all, and both may change their password.
  const user = await currentUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const form = await request.formData()
  const currentPassword = typed(form, 'currentPassword')
  const newPassword = typed(form, 'newPassword')

  const refused = passwordChangeRefusals(newPassword, typed(form, 'newPasswordAgain'))
  if (refused.length > 0) return back(request, refused)

  // The account is the session's own, and only its own. The number the current
  // password is checked against is read from that account inside the port; the
  // form carries none.
  const outcome = await getAccounts().changePassword(user.userId, currentPassword, newPassword)
  if ('refusal' in outcome) return back(request, [outcome.refusal])

  // Every session on the account has ended, this one with them. What is left is a
  // cookie carrying a dead session, and it is cleared here rather than left for the
  // next request to be refused on. The call is made for its clearing of the cookie:
  // supabase-js still posts the dead token to `/logout` first, is refused, treats
  // that refusal as *already signed out*, and then removes the session from the
  // cookie store -- which is the part this wants.
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  // Not fatal: the password is changed and the session is dead either way, and the
  // middleware will refuse the stale cookie on the next request. Logged, because a
  // cookie that outlives its session is still worth knowing about.
  if (error) console.error(error)

  return NextResponse.redirect(
    new URL(`/login?${new URLSearchParams({ notice: 'password-changed' })}`, request.url),
    { status: 303 },
  )
}
