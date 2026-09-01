import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import { refusalMessages } from '../../copy'
import { IntakeWizard } from '../../wizard'
import {
  readWizardAnswers,
  stepToShow,
  stuckOnAvailability,
  type WizardQuery,
} from '../../wizard-answers'

/**
 * The discipleship Intake link: a second link for the same Ministry, opening a
 * step-by-step form whose first question is which side the Person is offering to
 * stand on.
 *
 * `/intake/<ministry>` is untouched by this. It keeps working exactly as it does
 * today and keeps writing a null path -- ticket 29 is what turns it into the group
 * form. Two links, because an Admin hands out whichever fits the conversation, and
 * both are printable: neither carries a token, so there is nothing on either that
 * could be secret from anybody.
 *
 * Like the page beside it, this is ordinary forms and no JavaScript. It is filled
 * in by somebody who will never have an account.
 */
export default async function DiscipleshipIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ ministry: string }>
  searchParams: Promise<WizardQuery>
}) {
  const { ministry } = await params
  const query = await searchParams

  const page = await getIntakeReader().readIntakePage(ministry)
  if (!page) notFound()

  const answers = readWizardAnswers(query)
  const step = stepToShow(query.step, answers)
  const via = query.via === 'qr' ? 'qr' : 'link'
  const refused = Array.isArray(query.refused) ? query.refused[0] : query.refused
  // The codes a refused submission came back with, and the one this page can raise
  // on its own: Continue with nothing ticked on the grid.
  const problems = refusalMessages(
    stuckOnAvailability(query.step, answers)
      ? 'intake.availability_not_selected'
      : refused,
  )

  const here = `/intake/${page.ministryId}/discipleship`

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

        <IntakeWizard
          step={step}
          answers={answers}
          here={here}
          submitTo={`${here}/submit`}
          ministryName={page.ministryName}
          goals={page.goals}
          via={via}
        />
      </div>
    </main>
  )
}
