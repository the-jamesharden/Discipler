import { notFound } from 'next/navigation'
import { SHORTEST_PASSWORD } from '~/domain/accounts'
import { getMinistrySetup } from '~/service/container'
import { Centred } from '../../shell'
import { setupProblemMessage } from '../copy'

/**
 * The Ministry Setup Link's page: how a church's first Admin opens their Ministry.
 * The church and the number they will sign in with are on screen above the form,
 * so what they are agreeing to is read before anything is asked. Opening the page
 * does not spend the link; the submit does.
 *
 * There is no session here and none is consulted. Its holder has no account --
 * getting one is what the page is for.
 */
export const dynamic = 'force-dynamic'

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string; done?: string }>
}) {
  const { token } = await params
  const { error, done } = await searchParams
  const link = await getMinistrySetup().read(token)

  // A token that resolves to nothing says nothing about whether one ever existed.
  if (!link) notFound()

  const { ministryName, adminPhone, state } = link
  const problem = setupProblemMessage(error)

  /**
   * A spent link is not a failure: the Ministry exists and the way in is to sign
   * in. Drawn from the token, not from the query string. `done` only chooses the
   * tense: a link carrying `?done=opened` that has not actually been spent would
   * otherwise tell somebody they had a Ministry they do not have, and a spent
   * link opened again a week later is told the same thing in the past tense.
   */
  if (state === 'consumed') {
    const justNow = done === 'opened'
    return (
      <Centred subtitle={ministryName}>
        <div className="tick" aria-hidden="true">
          ✓
        </div>
        <h1 style={{ textAlign: 'center' }}>
          {justNow ? `${ministryName} is set up` : `${ministryName} is already set up`}
        </h1>
        <p className="muted" style={{ textAlign: 'center' }}>
          {justNow
            ? 'Sign in with your phone number and the password you just chose. Your Roster is empty until you add people to it.'
            : 'This link has done its work. Sign in with your phone number and the password you chose when you opened it.'}
        </p>
        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <a className="btn" href="/login">
            Sign in
          </a>
        </p>
      </Centred>
    )
  }

  return (
    <Centred subtitle="Setting up Discipler">
      <h1>{`Set up Discipler for ${ministryName}`}</h1>

      <div>
        {problem ? (
          <p className="toast error" role="alert">
            {problem}
          </p>
        ) : null}

        {state === 'live' ? (
          <>
            <p>
              You’ll be the first Admin of {ministryName}: you’ll see everyone on its
              Roster, every relationship, and everything they report. Choose the
              password you’ll sign in with.
            </p>

            <form method="post" action={`/setup/${token}/open`}>
              {/*
                Displayed, never requested, and above the fields: which number they
                are about to bind a password to is the thing to read before typing
                one. The number is fixed on the link by whoever minted it, so a
                forwarded link cannot open a Ministry on a stranger's phone.
              */}
              <p className="notice">
                You’ll sign in with <strong>{adminPhone}</strong> and this password.
                If that isn’t your number, don’t continue. Ask whoever set this up for
                you to send a new link.
              </p>

              <div className="field">
                <label className="label" htmlFor="fullName">Your name</label>
                <input id="fullName" name="fullName" type="text" required autoComplete="name" />
              </div>

              <div className="field">
                <label className="label" htmlFor="password">Choose a password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={SHORTEST_PASSWORD}
                  autoComplete="new-password"
                />
              </div>

              <button type="submit">Open your Ministry</button>
            </form>
          </>
        ) : (
          // Only `expired` reaches here; a spent link was answered above.
          <p className="toast error" role="alert">
            {setupProblemMessage('setup.expired')}
          </p>
        )}
      </div>
    </Centred>
  )
}
