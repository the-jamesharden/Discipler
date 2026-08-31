import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import { refusalMessages } from '../copy'
import { IntakeForm, NOTHING_PREFILLED } from '../form'

/**
 * One form, reached with no account and no software to learn. One link serves the
 * whole Ministry: a pastor sends it directly, or a QR code opens the same one at a
 * leaders' meeting, and `?via=qr` is the only difference between the two.
 *
 * Nothing is prefilled here, and that is what the link being the Ministry's rather
 * than a Person's means: it does not know who opened it, so the form asks. The
 * tokenized link an Admin sends one Person is the page that does know.
 *
 * It is an ordinary form POST, so it works before JavaScript has loaded -- this is
 * the one page in Discipler filled in by somebody who will never have an account.
 */
export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ ministry: string }>
  searchParams: Promise<{ via?: string; refused?: string }>
}) {
  const { ministry } = await params
  const { via, refused } = await searchParams

  const page = await getIntakeReader().readIntakePage(ministry)
  if (!page) notFound()

  const problems = refusalMessages(refused)

  return (
    <main>
      <h1>Join discipleship at {page.ministryName}</h1>
      <p className="subtle">
        A few questions, once. There is nothing to download and no account to create.
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

        <IntakeForm
          action={`/intake/${page.ministryId}/submit`}
          ministryName={page.ministryName}
          goals={page.goals}
          via={via === 'qr' ? 'qr' : 'link'}
          prefill={NOTHING_PREFILLED}
        />
      </div>
    </main>
  )
}
