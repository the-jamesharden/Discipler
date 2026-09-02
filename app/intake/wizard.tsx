import { DECLARED_SIDES, EXPERIENCE_ANSWERS } from '~/domain/intake'
import type { DiscipleshipGoalOption } from '~/service/ports'
import {
  DONE_BEFORE_ANSWER,
  DONE_BEFORE_DESCRIPTION,
  FIRST_TIME_ANSWER,
  FIRST_TIME_DESCRIPTION,
  FIRST_TIME_HELP,
  firstTimeQuestion,
  SIDE_QUESTION,
  sideDescription,
  sideLabel,
  stepSubtitle,
} from './copy'
import {
  AgeBandField,
  Agreements,
  AvailabilityGrid,
  ContactFields,
  GenderField,
  GoalField,
  NOTHING_PREFILLED,
} from './fields'
import {
  AGE_AND_GENDER_STEP,
  answersAsQuery,
  AVAILABILITY_STEP,
  discipleshipWizard,
  FIRST_TIME_STEP,
  furthestStep,
  LAST_STEP,
  SIDE_STEP,
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
 * Both sides are asked the same five things in the same order and differ only in
 * wording, which lives in `copy.ts` as a record keyed on the side. The fields
 * themselves are the ones the group form asks, imported rather than restated:
 * `Agreements` in particular is the wording a consent record points at by version,
 * and two forms drifting apart would make that version ambiguous.
 *
 * Steps one to four are GET forms back to this same page; step five is the only
 * POST, and it is the only write. An abandoned wizard leaves nothing behind. The
 * screens are the Make project's, drawn server-side: the option buttons are labels
 * around radios, and the progress bar is a number the page already knows.
 *
 * Which screen is which is read from `wizard-answers` by name and never by
 * position, for the reason the screen list gives: the order is written down in one
 * place, and a screen added in the middle must not have to be found again here.
 */

export const IntakeWizard = ({
  step,
  answers,
  here,
  submitTo,
  ministryName,
  goals,
  via,
}: {
  readonly step: number
  readonly answers: WizardAnswers
  /** The wizard's own URL. Steps one to four come back to it. */
  readonly here: string
  readonly submitTo: string
  readonly ministryName: string
  readonly goals: readonly DiscipleshipGoalOption[]
  readonly via: IntakeVia
}) => {
  // The screen actually shown. Clamped here as well as on the page, because the
  // step after this one is now derived from it: a component handed a step the
  // answers do not reach would otherwise render one screen and name another on its
  // Continue button.
  const at = Math.min(Math.max(step, SIDE_STEP), furthestStep(answers))

  // Never null on a screen that reads it, because `at` cannot reach one until the
  // first question is answered. Narrowed here once so the wording lookups below are
  // not each asserting it.
  const side = answers.side

  const wizard = discipleshipWizard
  const back = at === SIDE_STEP ? null : `${here}?${answersAsQuery(answers, via, at - 1)}`

  const screen = (children: React.ReactNode) => (
    <>
      <p className="sub">{stepSubtitle[at] ?? ''}</p>
      <Progress at={at} of={LAST_STEP} />
      {children}
    </>
  )

  if (at === SIDE_STEP || side === null) {
    return screen(
      <StepForm wizard={wizard} at={at} answers={answers} via={via} here={here} back={back}>
        <fieldset>
          <legend>{SIDE_QUESTION}</legend>
          {/* Nothing else on the screen. The first-time question and the closing
              line are worded from this answer, so anything beside it would be
              said in words that do not yet exist -- which is also why answering
              it again drops the first-time answer rather than carrying it. */}
          <div className="choices stack">
            {DECLARED_SIDES.map((option) => (
              <label key={option} className="option" htmlFor={`side:${option}`}>
                <input
                  id={`side:${option}`}
                  type="radio"
                  name="side"
                  value={option}
                  required
                  defaultChecked={answers.side === option}
                />
                <span className="option-title">{sideLabel[option]}</span>
                <span className="option-desc">{sideDescription[option]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </StepForm>,
    )
  }

  if (at === AGE_AND_GENDER_STEP) {
    return screen(
      <StepForm wizard={wizard} at={at} answers={answers} via={via} here={here} back={back}>
        <AgeBandField prefill={{ ...NOTHING_PREFILLED, ageBand: answers.ageBand }} />
        <GenderField prefill={{ ...NOTHING_PREFILLED, gender: answers.gender }} />
      </StepForm>,
    )
  }

  if (at === FIRST_TIME_STEP) {
    return screen(
      <StepForm wizard={wizard} at={at} answers={answers} via={via} here={here} back={back}>
        <fieldset>
          <legend>{firstTimeQuestion[side]}</legend>
          <p className="subtle">{FIRST_TIME_HELP}</p>
          {/* Two answers, worded as statements rather than as yes and no, so
              the answer is legible without the question. The values say the
              same thing the labels do, for the reason the labels are worded
              this way at all. */}
          <div className="choices stack">
            {EXPERIENCE_ANSWERS.map((option) => (
              <label key={option} className="option" htmlFor={`experience:${option}`}>
                <input
                  id={`experience:${option}`}
                  type="radio"
                  name="experience"
                  value={option}
                  required
                  defaultChecked={answers.experience === option}
                />
                <span className="option-title">
                  {option === 'first_time' ? FIRST_TIME_ANSWER : DONE_BEFORE_ANSWER}
                </span>
                <span className="option-desc">
                  {option === 'first_time' ? FIRST_TIME_DESCRIPTION : DONE_BEFORE_DESCRIPTION}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </StepForm>,
    )
  }

  if (at === AVAILABILITY_STEP) {
    return screen(
      <StepForm wizard={wizard} at={at} answers={answers} via={via} here={here} back={back}>
        <AvailabilityGrid availability={answers.availability} />
      </StepForm>,
    )
  }

  return screen(
    // The only POST, and the only write. The name, the number and the consents
    // are here rather than earlier because the checkbox that grants consent
    // belongs on the same screen as the write it authorises -- and the design's
    // missing screen was added here, beside the goal, for that reason (decision 5
    // of ticket 31).
    <form method="post" action={submitTo}>
      {/* Nothing is asked again here, so everything is carried. */}
      <Hidden wizard={wizard} answers={answers} via={via} />

      <GoalField goals={goals} prefill={NOTHING_PREFILLED} />
      <ContactFields prefill={NOTHING_PREFILLED} />
      <Agreements ministryName={ministryName} prefill={NOTHING_PREFILLED} />

      <FormActions back={back} action="Submit" />
    </form>,
  )
}
