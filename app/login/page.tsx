import { signInFailureMessage } from './failures'

/**
 * One sign-in form for every user. The credential is a phone number and a password,
 * for Admins and Leaders alike -- email is optional at Intake, so a Person may hold
 * a relationship without Discipler ever learning an address for them. See
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = signInFailureMessage(error)

  return (
    <main>
      <h1>Sign in</h1>
      <p className="subtle">Discipler</p>

      <div className="panel">
        {message ? (
          <p className="error" role="alert">
            {message}
          </p>
        ) : null}

        <form method="post" action="/auth/sign-in">
          <label htmlFor="phone">Phone number</label>
          <input id="phone" name="phone" type="tel" required autoComplete="tel" />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />

          <button type="submit">Sign in</button>
        </form>

        {/* One-time codes are post-launch. Until they ship a lost password is an
            Admin reset, and saying so is better than a link that goes nowhere. */}
        <p className="subtle">
          Forgotten your password? Ask whoever runs Discipler at your church to reset
          it.
        </p>
      </div>
    </main>
  )
}
