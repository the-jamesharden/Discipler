import Link from 'next/link'
import type { JoinableGroup } from '~/service/ports'
import {
  groupStepSubtitle,
  NO_GROUPS_ALTERNATIVE,
  NO_GROUPS_HEADING,
  noGroupsMessage,
} from './copy'
import {
  AgeBandField,
  Agreements,
  AvailabilityGrid,
  ContactFields,
  GenderField,
  GroupField,
  NOTHING_PREFILLED,
} from './fields'
import {
  GROUP_AGE_AND_GENDER_STEP,
  GROUP_AVAILABILITY_STEP,
  GROUP_LAST_STEP,
  GROUP_STEP,
  groupWizard,
  type GroupWizardAnswers,
} from './group-wizard-answers'
import type { IntakeVia } from './wizard-machine'
import { FormActions, Hidden, Progress, StepForm } from './wizard-shell'

/**
 * The group form: the wizard behind the Ministry's original Intake link. Four
 * screens -- age and gender, the grid, which group, and the screen with the Submit
 * button -- built from the same shell and the same fields as the discipleship
 * wizard, and differing in what is asked.
 *
 * The groups arrive already filtered for the gender answered on the first screen.
 * That filtering is the page's, because the page is what reads the answers and
 * the list together; what this component knows is that an empty list on the group
 * screen means there is nothing to offer, and says so rather than drawing an empty
 * list that cannot be submitted.
 *
 * It has no design of its own yet: the group form's design is coming from James
 * (decision 9 of ticket 31), and until it lands this wizard wears the discipleship
 * wizard's screens, which are the same system.
 */
export const GroupIntakeWizard = ({
  step,
  answers,
  groups,
  here,
  submitTo,
  ministryName,
  discipleshipLink,
  via,
}: {
  readonly step: number
  readonly answers: GroupWizardAnswers
  /** The groups open to this Person, given the gender they answered. */
  readonly groups: readonly JoinableGroup[]
  readonly here: string
  readonly submitTo: string
  readonly ministryName: string
  /** Where somebody who wanted one-to-one discipleship is sent instead. */
  readonly discipleshipLink: string
  readonly via: IntakeVia
}) => {
  const wizard = groupWizard
  const at = Math.min(Math.max(step, wizard.FIRST_STEP), wizard.furthestStep(answers))

  const back =
    at === wizard.FIRST_STEP ? null : `${here}?${wizard.answersAsQuery(answers, via, at - 1)}`

  const screen = (children: React.ReactNode) => (
    <>
      <p className="sub">{groupStepSubtitle[at] ?? ''}</p>
      <Progress at={at} of={GROUP_LAST_STEP} />
      {children}
    </>
  )

  if (at === GROUP_AGE_AND_GENDER_STEP) {
    return screen(
      <StepForm wizard={wizard} at={at} answers={answers} via={via} here={here} back={back}>
        {/* Gender first, because the list of groups on the third screen is
            filtered on it -- which is also why answering it again drops the
            group already chosen rather than carrying it under a different list. */}
        <AgeBandField prefill={{ ...NOTHING_PREFILLED, ageBand: answers.ageBand }} />
        <GenderField prefill={{ ...NOTHING_PREFILLED, gender: answers.gender }} />
      </StepForm>,
    )
  }

  if (at === GROUP_AVAILABILITY_STEP) {
    return screen(
      <StepForm wizard={wizard} at={at} answers={answers} via={via} here={here} back={back}>
        <AvailabilityGrid availability={answers.availability} />
      </StepForm>,
    )
  }

  if (at === GROUP_STEP) {
    if (groups.length === 0) {
      return screen(
        <>
          <NoGroups ministryName={ministryName} discipleshipLink={discipleshipLink} />
          {back ? (
            <p>
              <Link className="btn sec" href={back}>
                Back
              </Link>
            </p>
          ) : null}
        </>,
      )
    }
    return screen(
      <StepForm wizard={wizard} at={at} answers={answers} via={via} here={here} back={back}>
        <GroupField groups={groups} chosen={answers.groupId} />
      </StepForm>,
    )
  }

  return screen(
    // The only POST, and the only write. The consents are here rather than
    // earlier because the checkbox that grants consent belongs on the same
    // screen as the write it authorises. No Goal: nobody who has named a group
    // is being ranked.
    <form method="post" action={submitTo}>
      <Hidden wizard={wizard} answers={answers} via={via} />

      <ContactFields prefill={NOTHING_PREFILLED} />
      <Agreements ministryName={ministryName} prefill={NOTHING_PREFILLED} />

      <FormActions back={back} action="Submit" />
    </form>,
  )
}

/**
 * What the link shows when there is nothing to join. Rendered by the page when the
 * Ministry has no group to offer at all, and by the wizard when every group is
 * closed to the Person who answered: to them the list is empty either way.
 */
export const NoGroups = ({
  ministryName,
  discipleshipLink,
}: {
  readonly ministryName: string
  readonly discipleshipLink: string
}) => (
  <div>
    <h2>{NO_GROUPS_HEADING}</h2>
    <p>{noGroupsMessage(ministryName)}</p>
    <p>
      {NO_GROUPS_ALTERNATIVE} <Link href={discipleshipLink}>{discipleshipLink}</Link>
    </p>
  </div>
)
