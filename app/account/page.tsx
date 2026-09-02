import { redirect } from 'next/navigation'
import { currentUser } from '~/platform/supabase/current-user'
import { PageShell, SignOut } from '../shell'
import {
  CHANGE_ACTION,
  CHANGE_YOUR_PASSWORD,
  passwordChangeRefusalMessages,
  SIGNS_YOU_OUT_EVERYWHERE,
} from './copy'

export const dynamic = 'force-dynamic'

/**
 * Where a signed-in person changes their own password: a password form and nothing
 * more.
 *
 * No name, no number, nothing else about the person. A name and a number are
 * Roster facts an Admin owns (`docs/adr/0005-a-person-is-a-name-and-a-number.md`),
 * a name change would bear on history and safeguarding, and the number is the
 * credential. It shows no phone number for the reason the reset surface shows
 * none: the current-password check takes the number from the account itself, never
 * from the form.
 *
 * Reachable by anyone holding a session, including one that resolves to no
 * Ministry membership at all. The credential is theirs and not the Ministry's, and
 * a membership check would leave an orphaned account with a password it can never
 * change. That is why this is not under `/settings`, which is Admin-gated, and why
 * it asks `currentUser` rather than `resolveAdmin`.
 *
 * Nothing typed is carried across the round trip. A refusal comes back as codes on
 * the query string and every field starts empty again.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { error } = await searchParams
  const refusals = passwordChangeRefusalMessages(error)

  return (
    <PageShell
      title={CHANGE_YOUR_PASSWORD}
      subtitle="Discipler"
      back={{ href: '/', label: 'Back' }}
      actions={<SignOut />}
    >
      <div className="card">
        {refusals.length > 0 ? (
          <p className="toast error" role="alert">
            {refusals.join(' ')}
          </p>
        ) : null}

        <form method="post" action="/account/change">
          {/* Required, because sessions here run to about a year and *signed in*
              is a weak proof of presence. Without it a borrowed unlocked phone is a
              permanent account takeover. */}
          <div className="field">
            <label className="label" htmlFor="currentPassword">Current password</label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          {/* Twice, where the invitation form takes it once, and the difference is
              deliberate. Success ends every session, so a mistyped new password
              locks the person out until an Admin resets them -- and for a
              Ministry's sole Admin there is no path at all. The second field is the
              only guard the product can offer before the door closes. */}
          <div className="field">
            <label className="label" htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="newPasswordAgain">New password again</label>
            <input
              id="newPasswordAgain"
              name="newPasswordAgain"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>

          {/* Before the button, not after it. */}
          <p className="notice">{SIGNS_YOU_OUT_EVERYWHERE}</p>

          <button type="submit">{CHANGE_ACTION}</button>
        </form>
      </div>
    </PageShell>
  )
}
