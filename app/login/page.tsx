import { Centred } from '../shell'
import { signInFailureMessage } from './failures'
import { signInNoticeMessage } from './notices'

/**
 * One sign-in form for every user. The credential is a phone number and a password,
 * for Admins and Leaders alike -- email is optional at Intake, so a Person may hold
 * a relationship without Discipler ever learning an address for them. See
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
 *
 * The design's two role buttons are not here. Which surface a person lands on is
 * decided at `/` from what they hold, not from a button they pressed.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const { error, notice } = await searchParams
  const message = signInFailureMessage(error)
  const explanation = signInNoticeMessage(notice)

  return (
    <Centred subtitle="Sign in to your ministry">
      {/* Not an error. Somebody sent here by the product -- having just changed
          their password, and been signed out everywhere by doing so -- needs to
          be told why, or they read the page as failure and try the old one. */}
      {explanation ? (
        <p className="toast" role="status">
          {explanation}
        </p>
      ) : null}
      {message ? (
        <p className="toast error" role="alert">
          {message}
        </p>
      ) : null}

      <form method="post" action="/auth/sign-in">
        <div className="field">
          <label className="label" htmlFor="phone">
            Phone number
          </label>
          <input id="phone" name="phone" type="tel" required autoComplete="tel" />
        </div>

        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>

        <button type="submit">Sign in</button>
      </form>

      {/* One-time codes are post-launch. Until they ship a lost password is an
          Admin reset, and saying so is better than a link that goes nowhere. The
          closing line is the prototype's, and it is true of the product. */}
      <p className="card-note">
        People being discipled have no account and no dashboard. They take part
        entirely over text. Forgotten your password? Ask whoever runs Discipler at
        your church to reset it.
      </p>
    </Centred>
  )
}
