import { signUpIsOpen } from '~/platform/sign-up-switch'
import { Centred } from '../shell'
import { CREATE_AN_ACCOUNT } from '../signup/copy'
import { signInFailureMessage } from './failures'
import { signInNoticeMessage } from './notices'

/**
 * One sign-in form for every user: one box for who they are, and a password. An Admin
 * who signed up with an email may type either, and everybody else types their phone,
 * because email is optional at Intake, so a Person may hold a relationship without
 * Discipler ever learning an address for them. See
 * `docs/adr/0030-an-admin-signs-in-with-email-or-phone.md`, and ADR-0008 for everybody
 * without an email.
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
    <Centred subtitle="Sign in to your ministry" botanical>
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
          <label className="label" htmlFor="login">
            Email or phone
          </label>
          {/* Text, not `tel` or `email`, because it is either; and no capital or
              correction from a phone's keyboard on somebody's address. */}
          <input
            id="login"
            name="login"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
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
          {/* Only while sign-up is open: until then no account holds an email, so
              the page could only say a link went when none did. */}
          {signUpIsOpen(process.env) ? (
            <p className="hint">
              <a href="/login/forgot">Forgot your password?</a>
            </p>
          ) : null}
        </div>

        <button type="submit" className="full sec">
          Sign in
        </button>
      </form>

      {/* Only while sign-up is open, so production's page does not offer a 404. A
          plain link and not `next/link`, which would fetch sign-up's first page ahead
          of anybody asking for it. */}
      {signUpIsOpen(process.env) ? (
        <>
          <div className="divider-or">new to Discipler?</div>
          <a className="btn full" href="/signup">
            {CREATE_AN_ACCOUNT}
          </a>
        </>
      ) : null}

      <p className="card-note">
        People being discipled have no account and no dashboard. They take part
        entirely over text. Leaders who sign in with a phone number: if you&apos;ve
        forgotten your password, ask whoever runs Discipler at your church to reset it.
      </p>
    </Centred>
  )
}
