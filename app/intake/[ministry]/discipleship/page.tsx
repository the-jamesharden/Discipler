import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import { Centred } from '../../../shell'
import { refusalMessages } from '../../copy'
import { IntakeWizard } from '../../wizard'
import {
  discipleshipWizardFor,
  firstValue,
  readPreview,
  readVersion,
  readVia,
  type WizardQuery,
} from '../../wizard-answers'
import { PreviewNotice } from '../../wizard-shell'

/**
 * The discipleship Intake link: a second link for the same Ministry, opening a
 * step-by-step form whose first question is which side the Person is offering to
 * stand on.
 *
 * `/intake/<ministry>` is the group form, since ticket 29. Two links, because an
 * Admin hands out whichever fits the conversation, and both are printable: neither
 * carries a token, so there is nothing on either that could be secret from anybody.
 *
 * Like the page beside it, this is ordinary forms and no JavaScript. It is filled
 * in by somebody who will never have an account.
 *
 * Its screens are the version of the Ministry's form the visitor opened (Pastor
 * feedback, ticket 11): the URL carries the version from screen to screen, and
 * a visitor arriving fresh is served the form as it stands. `?preview=1` is an
 * Admin's *Preview form*, which is the same form and records nothing.
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

  const page = await getIntakeReader().readIntakePage(ministry, readVersion(query.v))
  if (!page) notFound()

  const wizard = discipleshipWizardFor(page.form)
  const answers = wizard.readAnswers(query)
  const step = wizard.stepToShow(query.step, answers)
  const via = readVia(query.via)
  const preview = readPreview(query.preview)
  // Somebody the group form's switch brought here, and what it carried
  // (Group form exits, ticket 02).
  const carried = wizard.readCarried(query.carried)
  const refused = firstValue(query.refused)
  // The codes a refused submission came back with, and the one this page can raise
  // on its own: Continue with nothing ticked on the grid. Both, because a refused
  // submission whose availability was also unreadable lands on this screen holding
  // the rest of its refusals, and showing only the grid's would send the Person
  // back round to discover the others one at a time.
  const problems = refusalMessages(
    refused,
    wizard.stuckOnAvailability(query.step, answers) ? 'intake.availability_not_selected' : undefined,
    wizard.stuckOnOwnQuestion(query.step, answers) ? 'intake.question_unanswered' : undefined,
  )

  const here = `/intake/${page.ministryId}/discipleship`

  return (
    <Centred ministryName={page.ministryName}>
      <p className="visually-hidden">{`Join discipleship at ${page.ministryName}`}</p>
      {preview ? <PreviewNotice /> : null}
      {problems.length > 0 ? (
        <div className="toast error" role="alert">
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
        form={page.form}
        preview={preview}
        carried={carried}
      />
    </Centred>
  )
}
