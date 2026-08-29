import { notFound } from 'next/navigation'
import { SHORTEST_PASSWORD } from '~/platform/supabase/leader-accounts'
import { getInvitationReader } from '~/service/container'
import { asList, invitationProblemMessage } from '../copy'

/**
 * The Invitation Link's page. **The match is revealed before any input is
 * requested**: who they have been matched with and for which Ministry are on
 * screen above the form, so a Leader decides whether to lead before they are
 * asked to set a password.
 *
 * There is no session here and none is consulted. Opening it does not consume it.
 */
export const dynamic = 'force-dynamic'

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string; done?: string }>
}) {
  const { token } = await params
  const { error, done } = await searchParams
  const invitation = await getInvitationReader().readInvitationPage(token)

  // A token that resolves to nothing says nothing about a Ministry, or about
  // whether one ever existed.
  if (!invitation) notFound()

  const { ministryName, fullName, phone, role, state, withNames, participantCount } = invitation
  const problem = invitationProblemMessage(error)
  const leaders = role === 'participant' ? withNames : []

  if (done === 'accepted') {
    return (
      <main>
        <h1>You’re all set</h1>
        <p className="subtle">{ministryName}</p>
        <div className="panel">
          <p>
            We’ll text you each week to see how it’s going. Sign in any time with your
            phone number and the password you just set.
          </p>
        </div>
      </main>
    )
  }

  if (done === 'disputed' || done === 'declined') {
    return (
      <main>
        <h1>Thanks — we’ve passed that on</h1>
        <p className="subtle">{ministryName}</p>
        <div className="panel">
          <p>
            {done === 'disputed'
              ? 'Nothing has changed on your account. Someone from the ministry will be in touch to put the number right.'
              : 'Nothing has changed. Someone from the ministry will take a look and be in touch.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main>
      {/* The reveal, above everything. Nothing below is asked until this is read. */}
      <h1>
        {role === 'leader'
          ? `You’ve been matched with ${asList(withNames)}`
          : `You’ve been matched with ${asList(leaders)}`}
      </h1>
      <p className="subtle">{ministryName}</p>

      <div className="panel">
        {problem ? (
          <p className="error" role="alert">
            {problem}
          </p>
        ) : null}

        {role === 'leader' ? (
          <>
            <p>
              {participantCount > 1
                ? `You’ve been asked to disciple these ${participantCount} people. It’s an invitation, not an assignment — you can say no.`
                : 'You’ve been asked to disciple them. It’s an invitation, not an assignment — you can say no.'}
            </p>

            {state === 'live' ? (
              <>
                <form method="post" action={`/invitation/${token}/accept`}>
                  <label htmlFor="fullName">Your name</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    defaultValue={fullName}
                    autoComplete="name"
                  />

                  <label htmlFor="password">Choose a password</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={SHORTEST_PASSWORD}
                    autoComplete="new-password"
                  />

                  {/*
                    Displayed, never requested. A Leader cannot mistype their way out
                    of their own check-ins, and there is no input here a forwarded
                    link could use to re-point an account.
                  */}
                  <p>
                    We’ll text you at <strong>{phone ?? 'a number we don’t have on file'}</strong>.
                    You’ll sign in with that number and this password.
                  </p>

                  <button type="submit">Accept and start</button>
                </form>

                <form method="post" action={`/invitation/${token}/dispute`}>
                  <button type="submit">That’s not my number</button>
                </form>
              </>
            ) : (
              <>
                <p role="alert">
                  {invitationProblemMessage(
                    state === 'expired' ? 'invitation.expired' : 'invitation.already_used',
                  )}
                </p>
                {/*
                  Still offered on a link that has run out. Discovering the number is
                  wrong a fortnight later is the same condition, and the affordance
                  that raises it must not be the thing that expired.
                */}
                <form method="post" action={`/invitation/${token}/dispute`}>
                  <button type="submit">That’s not my number</button>
                </form>
              </>
            )}
          </>
        ) : (
          <>
            <p>
              They’ll text you to arrange when to meet, so you’ll know the number when it
              arrives. Nothing else is needed from you.
            </p>

            {/*
              Offered whatever the expiry says, unlike the Leader's form above. An
              expiry protects a credential that creates an account; declining
              creates nothing and raises an item, so there is nothing here for it
              to protect -- and a match that is wrong is wrong in week three as
              much as in week one.
            */}
            <form method="post" action={`/invitation/${token}/decline`}>
              <button type="submit">This isn’t the right match</button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
