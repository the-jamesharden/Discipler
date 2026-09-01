import Link from 'next/link'
import type { ReactNode } from 'react'
import { DECLARED_SIDES, EXPERIENCE_ANSWERS } from '~/domain/intake'
import type { DiscipleshipGoalOption } from '~/service/ports'
import {
  DONE_BEFORE_ANSWER,
  FIRST_TIME_ANSWER,
  firstTimeQuestion,
  SIDE_QUESTION,
  sideLabel,
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
  CHOICE_FIELDS,
  FIRST_TIME_STEP,
  furthestStep,
  notCarriedAt,
  SIDE_STEP,
  type IntakeVia,
  type WizardAnswers,
} from './wizard-answers'

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
 * themselves are the ones the single page asks, imported rather than restated:
 * `Agreements` in particular is the wording a consent record points at by version,
 * and two forms drifting apart would make that version ambiguous.
 *
 * Steps one to four are GET forms back to this same page; step five is the only
 * POST, and it is the only write. An abandoned wizard leaves nothing behind.
 *
 * Which screen is which is read from `wizard-answers` by name and never by
 * position, for the reason the screen list gives: the order is written down in one
 * place, and a screen added in the middle must not have to be found again here.
 */

/**
 * Every answer the wizard holds, carried forward, minus the ones this screen must
 * not send -- what it is asking for itself, and what its own question rewords.
 *
 * Named fields rather than a step number, and not for tidiness: a screen reached by
 * pressing Back still holds the answers to the screens after it, and carrying only
 * *the steps before this one* would drop them on the way forward again. Somebody who
 * went back to correct their age would find their availability quietly emptied.
 *
 * The fields themselves come from the same table that says what each one may hold,
 * so an answer added to the wizard is carried here without anybody remembering to
 * add it.
 */
const Hidden = ({
  answers,
  via,
  dropping = [],
}: {
  readonly answers: WizardAnswers
  readonly via: IntakeVia
  /** What this screen asks for or rewords. Those are not carried as hidden. */
  readonly dropping?: readonly (keyof WizardAnswers)[]
}) => {
  const carried = (field: keyof WizardAnswers) => !dropping.includes(field)

  return (
    <>
      <input type="hidden" name="via" value={via} />
      {CHOICE_FIELDS.map((field) => {
        const answer = answers[field]
        return carried(field) && answer !== null ? (
          <input key={field} type="hidden" name={field} value={answer} />
        ) : null
      })}
      {carried('availability')
        ? answers.availability.map((slot) => (
            <input key={slot} type="hidden" name="availability" value={slot} />
          ))
        : null}
    </>
  )
}

/**
 * The shell steps one to four share: a GET back to this page, carrying every answer
 * this screen is neither asking for nor rewording, and naming the screen after it
 * on Continue.
 *
 * Both of those are read from the screen list rather than written per screen. Which
 * fields a screen carries was four hand-written lists, and getting one wrong is
 * how a screen reached by pressing Back quietly emptied somebody's availability;
 * which step comes next was four literals in a sequence written down nowhere.
 */
const StepForm = ({
  at,
  answers,
  via,
  here,
  children,
}: {
  readonly at: number
  readonly answers: WizardAnswers
  readonly via: IntakeVia
  readonly here: string
  readonly children: ReactNode
}) => (
  <form method="get" action={here}>
    <Hidden answers={answers} via={via} dropping={notCarriedAt(at)} />
    <input type="hidden" name="step" value={String(at + 1)} />
    {children}
    <button type="submit">Continue</button>
  </form>
)

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

  const back =
    at === SIDE_STEP ? null : (
      <p>
        <Link href={`${here}?${answersAsQuery(answers, via, at - 1)}`}>Back</Link>
      </p>
    )

  if (at === SIDE_STEP || side === null) {
    return (
      <StepForm at={at} answers={answers} via={via} here={here}>
        <fieldset>
          <legend>{SIDE_QUESTION}</legend>
          {/* Nothing else on the screen. The first-time question and the closing
              line are worded from this answer, so anything beside it would be
              said in words that do not yet exist -- which is also why answering
              it again drops the first-time answer rather than carrying it. */}
          {DECLARED_SIDES.map((option) => (
            <label key={option} htmlFor={`side:${option}`}>
              <input
                id={`side:${option}`}
                type="radio"
                name="side"
                value={option}
                required
                defaultChecked={answers.side === option}
              />{' '}
              {sideLabel[option]}
            </label>
          ))}
        </fieldset>
      </StepForm>
    )
  }

  if (at === AGE_AND_GENDER_STEP) {
    return (
      <>
        <StepForm at={at} answers={answers} via={via} here={here}>
          <AgeBandField prefill={{ ...NOTHING_PREFILLED, ageBand: answers.ageBand }} />
          <GenderField prefill={{ ...NOTHING_PREFILLED, gender: answers.gender }} />
        </StepForm>
        {back}
      </>
    )
  }

  if (at === FIRST_TIME_STEP) {
    return (
      <>
        <StepForm at={at} answers={answers} via={via} here={here}>
          <fieldset>
            <legend>{firstTimeQuestion[side]}</legend>
            {/* Two answers, worded as statements rather than as yes and no, so
                the answer is legible without the question. The values say the
                same thing the labels do, for the reason the labels are worded
                this way at all. */}
            {EXPERIENCE_ANSWERS.map((option) => (
              <label key={option} htmlFor={`experience:${option}`}>
                <input
                  id={`experience:${option}`}
                  type="radio"
                  name="experience"
                  value={option}
                  required
                  defaultChecked={answers.experience === option}
                />{' '}
                {option === 'first_time' ? FIRST_TIME_ANSWER : DONE_BEFORE_ANSWER}
              </label>
            ))}
          </fieldset>
        </StepForm>
        {back}
      </>
    )
  }

  if (at === AVAILABILITY_STEP) {
    return (
      <>
        <StepForm at={at} answers={answers} via={via} here={here}>
          <AvailabilityGrid availability={answers.availability} />
        </StepForm>
        {back}
      </>
    )
  }

  return (
    <>
      {/* The only POST, and the only write. The consents are here rather than
          earlier because the checkbox that grants consent belongs on the same
          screen as the write it authorises. */}
      <form method="post" action={submitTo}>
        {/* Nothing is asked again here, so everything is carried. */}
        <Hidden answers={answers} via={via} />

        <ContactFields prefill={NOTHING_PREFILLED} />
        <GoalField goals={goals} prefill={NOTHING_PREFILLED} />
        <Agreements ministryName={ministryName} prefill={NOTHING_PREFILLED} />

        <button type="submit">Submit</button>
      </form>
      {back}
    </>
  )
}
