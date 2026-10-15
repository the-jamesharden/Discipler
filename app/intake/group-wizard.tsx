import Link from 'next/link'
import { askedPages, type IntakeForm } from '~/domain/intake-form'
import type { JoinableGroup } from '~/service/ports'
import {
  MEANT_FOR_MENTORSHIP_LINK,
  MEANT_FOR_MENTORSHIP_QUESTION,
  NO_GROUPS_ALTERNATIVE,
  NO_GROUPS_HEADING,
  noGroupsMessage,
} from './copy'
import { Agreements, AskedQuestion, NOTHING_PREFILLED, type Answering } from './fields'
import { groupWizardFor, mentorshipSwitchQuery, type GroupWizardAnswers } from './group-wizard-answers'
import type { FormPin, IntakeVia } from './wizard-machine'
import { FormActions, Hidden, Progress, StepForm } from './wizard-shell'

/**
 * The group form: the wizard behind the Ministry's original Intake link. Its
 * screens are the pages of the Ministry's own groups form (Pastor feedback,
 * ticket 11), in the version the Person opened; the preset is today's four --
 * age and gender, the grid, which group, and the screen with the Submit button --
 * built from the same shell and the same fields as the discipleship wizard, and
 * differing in what is asked.
 *
 * The groups arrive already filtered for the gender answered on an earlier screen.
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
  form,
  discipleshipForm,
  preview,
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
  /** The version of the Ministry's groups form this visitor opened. */
  readonly form: IntakeForm
  /** The Ministry's mentor and mentee form as it stands, which the switch on the group step opens. */
  readonly discipleshipForm: IntakeForm
  /** An Admin's preview, which records nothing. */
  readonly preview: boolean
}) => {
  const wizard = groupWizardFor(form)
  const pin: FormPin = { version: form.version, preview }
  const at = Math.min(Math.max(step, wizard.FIRST_STEP), wizard.furthestStep(answers))
  const page = askedPages(form)[at - 1]
  if (!page) throw new Error(`The groups form has no page ${at} to show`)

  const back =
    at === wizard.FIRST_STEP ? null : `${here}?${wizard.answersAsQuery(answers, via, at - 1, pin)}`

  const screen = (children: React.ReactNode) => (
    <>
      <p className="sub">{page.name}</p>
      <Progress at={at} of={wizard.LAST_STEP} />
      {at === wizard.FIRST_STEP && form.intro ? <p className="card-lead">{form.intro}</p> : null}
      {children}
    </>
  )

  const asksTheGroup = page.questions.some((question) => question.key === 'groupId')

  // The screen that asks which group, with nothing to offer this Person.
  if (asksTheGroup && groups.length === 0) {
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

  const answering: Answering = {
    prefill: {
      ...NOTHING_PREFILLED,
      ageBand: answers.ageBand,
      gender: answers.gender,
      availability: answers.availability,
      own: answers.own,
    },
    side: null,
    experience: null,
    goals: [],
    groups,
    groupChosen: answers.groupId,
    ministryName,
  }
  const questions = page.questions.map((question) => (
    <AskedQuestion key={question.key} question={question} answering={answering} />
  ))

  // For somebody who meant the discipleship form: under the group step's
  // actions, and outside its form, so following it submits nothing (Group form
  // exits, ticket 02, S-7). One way only; the discipleship wizard has no link back.
  const meantForMentorship = asksTheGroup ? (
    <MeantForMentorship
      href={`${discipleshipLink}?${mentorshipSwitchQuery({ groupForm: form, discipleshipForm, answers, via, preview })}`}
    />
  ) : null

  if (at < wizard.LAST_STEP) {
    return screen(
      <>
        <StepForm wizard={wizard} at={at} answers={answers} via={via} pin={pin} here={here} back={back}>
          {questions}
        </StepForm>
        {meantForMentorship}
      </>,
    )
  }

  return screen(
    // The only POST, and the only write. The consents are here rather than
    // earlier because the checkbox that grants consent belongs on the same
    // screen as the write it authorises. No Goal: nobody who has named a group
    // is being ranked.
    <>
      <form method="post" action={submitTo}>
        <Hidden wizard={wizard} answers={answers} via={via} pin={pin} dropping={wizard.notCarriedAt(at)} />

        {questions}
        <Agreements ministryName={ministryName} prefill={NOTHING_PREFILLED} />

        <FormActions back={back} action="Submit" />
      </form>
      {meantForMentorship}
    </>,
  )
}

/**
 * The line under the group step's actions: the way across to the discipleship
 * wizard for somebody who meant to sign up for that, with what they have already
 * answered carried in the address so it is not asked twice.
 */
const MeantForMentorship = ({ href }: { readonly href: string }) => (
  <p className="card-note">
    {`${MEANT_FOR_MENTORSHIP_QUESTION} `}
    <Link href={href}>{MEANT_FOR_MENTORSHIP_LINK}</Link>
  </p>
)

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
