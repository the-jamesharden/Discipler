import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import { refusalMessages } from '../../copy'
import { IntakeForm } from '../../form'

/**
 * A Person's own Intake form, reopened with their answers already in it.
 *
 * This is the only route by which a Participant's availability changes. There is no
 * Participant dashboard and no SMS path for it: an Admin hands over the link, and
 * possession of it is the whole of the authentication -- the same trade an
 * Invitation Link makes, and for the same reason. Correcting a phone number should
 * not cost somebody an account.
 *
 * The link names who this is, which is what makes a correction possible at all. On
 * the Ministry-wide form a Person is recognised by the name and number they typed,
 * and somebody changing their number would not match themselves.
 */
export default async function ReopenIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ refused?: string }>
}) {
  const { token } = await params
  const { refused } = await searchParams

  const page = await getIntakeReader().readReopenedIntakePage(token)

  // A token that names nothing is a URL that means nothing, and is not the same
  // page as a link that has run out: one sends its holder back to whoever issued
  // it, the other has nobody to send them to.
  if (!page) notFound()

  if (page.state === 'expired') {
    return (
      <main>
        <h1>{page.ministryName}</h1>
        <div className="panel">
          <p className="empty">
            This link has expired. Ask whoever sent it to you for a new one — your
            answers are still on file and nothing has been lost.
          </p>
        </div>
      </main>
    )
  }

  const problems = refusalMessages(refused)

  return (
    <main>
      <h1>Your details at {page.ministryName}</h1>
      <p className="subtle">
        Change whatever has moved on — your times, your number — and submit it again.
        There is still no account to create.
      </p>

      <div className="panel">
        {problems.length > 0 ? (
          <div className="error" role="alert">
            <p>Please check the following:</p>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/*
          `pastor_link`, because that is what this is: a link a pastor sent. The
          route is recorded on every consent record the submission writes, and there
          is no third value for it -- a Person reopening their own form has not
          arrived by some new road, they have been sent the link again.
        */}
        <IntakeForm
          action={`/intake/reopen/${token}/submit`}
          ministryName={page.ministryName}
          goals={page.goals}
          via="link"
          prefill={page.prefill}
        />
      </div>
    </main>
  )
}
