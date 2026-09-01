import Link from 'next/link'
import { DECLARED_SIDES, EXPERIENCE_ANSWERS } from '~/domain/intake'
import type { DiscipleshipGoalOption } from '~/service/ports'
import {
  DONE_BEFORE_ANSWER,
  FIRST_TIME_ANSWER,
  firstTimeQuestion,
  SIDE_QUESTION,
  sideHint,
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
import { answersAsQuery, LAST_STEP, type WizardAnswers } from './wizard-answers'

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
 */

/**
 * Every answer the wizard holds, carried forward, minus the ones this screen is
 * about to ask for itself -- a hidden `ageBand` beside the age question would send
 * two of them.
 *
 * Named fields rather than a step number, and not for tidiness: a screen reached by
 * pressing Back still holds the answers to the screens after it, and carrying only
 * *the steps before this one* would drop them on the way forward again. Somebody who
 * went back to correct their age would find their availability quietly emptied.
 */
const Hidden = ({
  answers,
  via,
  asking = [],
}: {
  readonly answers: WizardAnswers
  readonly via: 'link' | 'qr'
  /** What this screen's own fields are named. Those are not carried as hidden. */
  readonly asking?: readonly (keyof WizardAnswers)[]
}) => {
  const carried = (field: keyof WizardAnswers) => !asking.includes(field)

  return (
    <>
      <input type="hidden" name="via" value={via} />
      {carried('side') && answers.side ? (
        <input type="hidden" name="side" value={answers.side} />
      ) : null}
      {carried('ageBand') && answers.ageBand ? (
        <input type="hidden" name="ageBand" value={answers.ageBand} />
      ) : null}
      {carried('gender') && answers.gender ? (
        <input type="hidden" name="gender" value={answers.gender} />
      ) : null}
      {carried('experience') && answers.experience ? (
        <input type="hidden" name="experience" value={answers.experience} />
      ) : null}
      {carried('availability')
        ? answers.availability.map((slot) => (
            <input key={slot} type="hidden" name="availability" value={slot} />
          ))
        : null}
    </>
  )
}

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
  readonly via: 'link' | 'qr'
}) => {
  // Never read on a screen that has one, because `stepToShow` refuses to show a
  // later screen until the first question is answered. Narrowed here once so the
  // wording lookups below are not each asserting it.
  const side = answers.side

  const back =
    step === 1 ? null : (
      <p>
        <Link href={`${here}?${answersAsQuery(answers, via, step - 1)}`}>Back</Link>
      </p>
    )

  if (step === 1 || side === null) {
    return (
      <form method="get" action={here}>
        <Hidden answers={answers} via={via} asking={['side']} />
        <input type="hidden" name="step" value="2" />

        <fieldset>
          <legend>{SIDE_QUESTION}</legend>
          {/* Nothing else on the screen. Every later screen's wording follows
              from this answer, so asking anything beside it would be asking it
              in words that do not yet exist. */}
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
              <span className="subtle"> — {sideHint[option]}</span>
            </label>
          ))}
        </fieldset>

        <button type="submit">Continue</button>
      </form>
    )
  }

  if (step === 2) {
    return (
      <>
        <form method="get" action={here}>
          <Hidden answers={answers} via={via} asking={['ageBand', 'gender']} />
          <input type="hidden" name="step" value="3" />

          <AgeBandField prefill={{ ...NOTHING_PREFILLED, ageBand: answers.ageBand }} />
          <GenderField prefill={{ ...NOTHING_PREFILLED, gender: answers.gender }} />

          <button type="submit">Continue</button>
        </form>
        {back}
      </>
    )
  }

  if (step === 3) {
    return (
      <>
        <form method="get" action={here}>
          <Hidden answers={answers} via={via} asking={['experience']} />
          <input type="hidden" name="step" value="4" />

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

          <button type="submit">Continue</button>
        </form>
        {back}
      </>
    )
  }

  if (step === 4) {
    return (
      <>
        <form method="get" action={here}>
          <Hidden answers={answers} via={via} asking={['availability']} />
          <input type="hidden" name="step" value={String(LAST_STEP)} />

          <AvailabilityGrid availability={answers.availability} />

          <button type="submit">Continue</button>
        </form>
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
