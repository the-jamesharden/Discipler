import Link from 'next/link'
import { redirect } from 'next/navigation'
import { generatePassword, passwordResetRefusal } from '~/domain/accounts'
import { personId as asPersonId } from '~/domain/ids'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getRandomSource, getRosterReader } from '~/service/container'
import { CHANGE_YOUR_PASSWORD } from '../../../account/copy'
import {
  NOTHING_IS_SENT,
  passwordResetRefusalMessage,
  RESET_ACTION,
  resetHeading,
  resetWarning,
} from '../copy'

export const dynamic = 'force-dynamic'

/**
 * Where an Admin resets somebody else's password: a screen that names the Person,
 * says what pressing the button does, and carries the password Discipler has
 * already chosen.
 *
 * Its own route rather than a form on the Roster, because of the line below that
 * mints the password. The candidate has to exist before the POST -- a password is
 * hashed on write and cannot be read back, so post-redirect-get cannot carry one --
 * and putting that form on the Roster would put a candidate credential in the HTML
 * of every account-holding row: a page full of would-be passwords, which is the
 * exact thing the Intake-link design refuses.
 *
 * The caveat is real and is accepted. A hand-crafted POST could carry a password
 * somebody chose, so *Discipler generates it* is a property of this surface rather
 * than a rule the server enforces. What it guards against is an Admin's habits --
 * one pastor's own password, typed for everybody -- not an Admin's malice, and a
 * malicious Admin can already reset anyone on their Roster and read the result.
 *
 * No phone number anywhere on it, deliberately. A reset was asked for by somebody
 * already in contact -- they rang, or they are standing there -- and a second
 * reveal path on a screen reachable for any Person would quietly widen the one
 * disclosure this product narrowed to `public.contact_to_share`.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ personId: string }>
}) {
  const resolution = await resolveAdmin()

  if (resolution.status === 'signed-out') redirect('/login')
  // Signed in and administering nothing. There is no Roster of theirs to reset
  // anybody on, and the Roster itself is the page that says so.
  if (resolution.status === 'not-an-admin') redirect('/roster')

  const admin = resolution.admin
  const { personId } = await params

  const target = await getRosterReader().accountOnTheRoster(
    admin.ministryId,
    asPersonId(personId),
  )

  // The rule itself lives in the domain, so this screen, the route it posts to and
  // the command that records the reset cannot come to disagree about who may be
  // reset.
  const refusal = passwordResetRefusal(target?.userId ?? null, admin.userId)

  if (refusal) {
    return (
      <main>
        <h1>Reset a password</h1>
        <p className="subtle">{admin.ministryName}</p>
        <div className="panel">
          <p className="error" role="alert">{passwordResetRefusalMessage(refusal)}</p>
          {/* The sentence above says *change it yourself*; this is where. */}
          {refusal === 'account.cannot_reset_yourself' ? (
            <p>
              <Link href="/account">{CHANGE_YOUR_PASSWORD}</Link>
            </p>
          ) : null}
          <p>
            <Link href="/roster">Back to the Roster</Link>
          </p>
        </div>
      </main>
    )
  }

  // Unreachable: the rule above answers `account.no_account` for every absent
  // account, so a Person the Roster does not hold has already been refused. It is
  // restated because TypeScript cannot see that one value narrows another, and it
  // throws rather than defaulting -- a reset screen rendered for nobody would carry
  // a live candidate password and a button.
  if (!target) throw new Error(`No account came back for ${personId} and nothing refused it`)

  // Minted here, on the GET, and carried through the POST in a hidden field. It is
  // what makes a refresh of the result page safe: the browser re-posts the same
  // four words and sets the same password, rather than silently issuing a second
  // one and killing the password the Admin has just read out.
  //
  // Not in the query string either, on the way here or back. That is where
  // `?intakeLinkFor=` set the rule -- the Person travels and the credential never
  // does -- because a query string is written into browser history and server logs.
  const candidate = generatePassword(getRandomSource())

  return (
    <main>
      <h1>{resetHeading(target.fullName)}</h1>
      <p className="subtle">{admin.ministryName}</p>

      <div className="panel">
        <p>{resetWarning(target.fullName)}</p>
        <p className="subtle">{NOTHING_IS_SENT}</p>

        <form method="post" action={`/roster/reset/${target.personId}/done`}>
          {/* The password itself, not a token that stands for one. There is nowhere
              to keep a candidate between two requests that is not storage, and
              storage of a password nobody has yet agreed to set is worse than a
              hidden field on a screen only this Admin is looking at. */}
          <input type="hidden" name="password" value={candidate} />
          <button type="submit">{RESET_ACTION}</button>
        </form>
      </div>

      <p>
        <Link href="/roster">Back to the Roster</Link>
      </p>
    </main>
  )
}
