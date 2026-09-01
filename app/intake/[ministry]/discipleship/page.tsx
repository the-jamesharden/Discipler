import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import { refusalMessages } from '../../copy'
import { IntakeWizard } from '../../wizard'
import {
  firstValue,
  readVia,
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
  const via = readVia(query.via)
  const refused = firstValue(query.refused)
  // The codes a refused submission came back with, and the one this page can raise
  // on its own: Continue with nothing ticked on the grid. Both, because a refused
  // submission whose availability was also unreadable lands on this screen holding
  // the rest of its refusals, and showing only the grid's would send the Person
  // back round to discover the others one at a time.
  const problems = refusalMessages(
    refused,
    stuckOnAvailability(query.step, answers) ? 'intake.availability_not_selected' : undefined,
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
