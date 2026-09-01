import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import { groupHeading, refusalMessages } from '../copy'
import { GroupIntakeWizard, NoGroups } from '../group-wizard'
import { groupWizard } from '../group-wizard-answers'
import { firstValue, readVia, type WizardQuery } from '../wizard-machine'

/**
 * The Ministry's original Intake link, which since ticket 29 is the form for
 * somebody who wants to join one of its groups. The link was already in bulletins
 * and in sent texts, so it keeps working and nobody who has it reaches a dead
 * page: it opens this wizard, or -- for a Ministry with nothing to join -- a page
 * that says so and points at the discipleship form.
 *
 * One link serves the whole Ministry: a pastor sends it directly, or a QR code
 * opens the same one at a leaders' meeting, and `?via=qr` is the only difference
 * between the two. Nothing is prefilled, because the link does not know who
 * opened it, so the form asks. The tokenized link an Admin sends one Person still
 * opens the single-page form with their answers already in it.
 *
 * Ordinary forms and no JavaScript, like every Intake page: it is filled in by
 * somebody who will never have an account.
 */
export default async function GroupIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ ministry: string }>
  searchParams: Promise<WizardQuery>
}) {
  const { ministry } = await params
  const query = await searchParams

  const page = await getIntakeReader().readGroupIntakePage(ministry)
  if (!page) notFound()

  const here = `/intake/${page.ministryId}`
  const discipleshipLink = `${here}/discipleship`
  const via = readVia(query.via)

  // Read once without the groups, for the gender; then again with the groups that
  // gender may be offered, so the group answer is checked against exactly the list
  // the dropdown was drawn from. A group nobody was offered never survives the read.
  const gender = groupWizard.readAnswers(query).gender
  const offered = page.groups.filter(
    (group) => group.declaredGender === null || group.declaredGender === gender,
  )
  const answers = groupWizard.readAnswers(query, {
    groupId: offered.map((group) => group.relationshipId),
  })
  const step = groupWizard.stepToShow(query.step, answers)
  const refused = firstValue(query.refused)
  const problems = refusalMessages(
    refused,
    groupWizard.stuckOnAvailability(query.step, answers)
      ? 'intake.availability_not_selected'
      : undefined,
  )

  return (
    <main>
      <h1>{groupHeading(page.ministryName)}</h1>
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

        {page.groups.length === 0 ? (
          // Every Ministry's day-one state, said before anybody is asked anything.
          <NoGroups ministryName={page.ministryName} discipleshipLink={discipleshipLink} />
        ) : (
          <GroupIntakeWizard
            step={step}
            answers={answers}
            groups={offered}
            here={here}
            submitTo={`${here}/submit`}
            ministryName={page.ministryName}
            discipleshipLink={discipleshipLink}
            via={via}
          />
        )}
      </div>
    </main>
  )
}
