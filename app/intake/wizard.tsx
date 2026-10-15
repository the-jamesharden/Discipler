import { askedPages, type IntakeForm } from '~/domain/intake-form'
import type { DiscipleshipGoalOption } from '~/service/ports'
import { Agreements, AskedQuestion, NOTHING_PREFILLED, type Answering } from './fields'
import {
  discipleshipWizardFor,
  type FormPin,
  type IntakeVia,
  type WizardAnswers,
} from './wizard-answers'
import { FormActions, Hidden, Progress, StepForm } from './wizard-shell'

/**
 * The discipleship Intake wizard: one component with a `side` argument, the way
 * `form.tsx` is already one component for two routes.
 *
 * Mentor and mentee are an answer inside a form and not two links. A dedicated
 * mentor link reads as a channel the Admin endorsed; a mentor answer reads as a
 * preference the Person stated, and the second is the weaker of the two claims,
 * which is the point -- leading stays a plan an Admin records (ticket 16).
 *
 * Its screens are the pages of the Ministry's own form (Pastor feedback, ticket
 * 11), in the version the Person opened: each page's name is the line at the top
 * of its screen, and its questions are asked in the order and the words the form
 * has them. A Ministry that never edited is served the preset: the five screens
 * the wizard always had, and the one-to-two question's beside the first-time one
 * (Suggestions beyond the one-to-one, ticket 01). The fields themselves are the
 * ones the group form asks, imported rather than restated: `Agreements` in
 * particular is the wording a consent record points at by version, and two forms
 * drifting apart would make that version ambiguous.
 *
 * Every screen but the last is a GET form back to this same page; the last is the
 * only POST, and it is the only write. An abandoned wizard leaves nothing behind.
 * The screens are the Make project's, drawn server-side: the option buttons are
 * labels around radios, and the progress bar is a number the page already knows.
 */

export const IntakeWizard = ({
  step,
  answers,
  here,
  submitTo,
  ministryName,
  goals,
  via,
  form,
  preview,
}: {
  readonly step: number
  readonly answers: WizardAnswers
  /** The wizard's own URL. Every screen but the last comes back to it. */
  readonly here: string
  readonly submitTo: string
  readonly ministryName: string
  readonly goals: readonly DiscipleshipGoalOption[]
  readonly via: IntakeVia
  /** The version of the Ministry's form this visitor opened. */
  readonly form: IntakeForm
  /** An Admin's preview, which records nothing. */
  readonly preview: boolean
}) => {
  const wizard = discipleshipWizardFor(form)
  const pin: FormPin = { version: form.version, preview }

  // The screen actually shown. Clamped here as well as on the page, because the
  // step after this one is now derived from it: a component handed a step the
  // answers do not reach would otherwise render one screen and name another on its
  // Continue button.
  const at = Math.min(Math.max(step, wizard.FIRST_STEP), wizard.furthestStep(answers))
  const page = askedPages(form)[at - 1]
  if (!page) throw new Error(`The form has no page ${at} to show`)

  const back =
    at === wizard.FIRST_STEP ? null : `${here}?${wizard.answersAsQuery(answers, via, at - 1, pin)}`

  const answering: Answering = {
    prefill: {
      ...NOTHING_PREFILLED,
      ageBand: answers.ageBand,
      gender: answers.gender,
      availability: answers.availability,
      own: answers.own,
    },
    side: answers.side,
    experience: answers.experience,
    oneToTwo: answers.oneToTwo,
    goals,
    groups: [],
    groupChosen: null,
    ministryName,
  }
  const questions = page.questions.map((question) => (
    <AskedQuestion key={question.key} question={question} answering={answering} />
  ))

  const screen = (children: React.ReactNode) => (
    <>
      <p className="sub">{page.name}</p>
      <Progress at={at} of={wizard.LAST_STEP} />
      {at === wizard.FIRST_STEP && form.intro ? <p className="card-lead">{form.intro}</p> : null}
      {children}
    </>
  )

  if (at < wizard.LAST_STEP) {
    return screen(
      <StepForm wizard={wizard} at={at} answers={answers} via={via} pin={pin} here={here} back={back}>
        {questions}
      </StepForm>,
    )
  }

  return screen(
    // The only POST, and the only write. The name, the number and the consents
    // are here rather than earlier because the checkbox that grants consent
    // belongs on the same screen as the write it authorises -- and the design's
    // missing screen was added here, beside the goal, for that reason (decision 5
    // of ticket 31). The form keeps every question typed into on this page, so
    // nothing typed ever travels in a URL.
    <form method="post" action={submitTo}>
      {/* Everything the earlier screens asked, carried; what this one asks, not. */}
      <Hidden wizard={wizard} answers={answers} via={via} pin={pin} dropping={wizard.notCarriedAt(at)} />

      {questions}
      <Agreements ministryName={ministryName} prefill={NOTHING_PREFILLED} />

      <FormActions back={back} action="Submit" />
    </form>,
  )
}
