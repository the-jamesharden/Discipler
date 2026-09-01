import type { ReactNode } from 'react'
import type { AnswersOf, ChoiceLists, IntakeVia, Wizard } from './wizard-machine'

/**
 * The two pieces every screen of every wizard is built from: the hidden inputs
 * that carry the earlier answers forward, and the GET form that wraps a screen and
 * names the one after it. Written once because there are two wizards now, and a
 * screen that carried its answers differently from the other wizard's screens
 * would go wrong in the one direction that matters -- somebody's answers, on
 * their way forward, silently.
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
 * so an answer added to a wizard is carried here without anybody remembering to
 * add it.
 */
export const Hidden = <L extends ChoiceLists>({
  wizard,
  answers,
  via,
  dropping = [],
}: {
  readonly wizard: Wizard<L>
  readonly answers: AnswersOf<L>
  readonly via: IntakeVia
  /** What this screen asks for or rewords. Those are not carried as hidden. */
  readonly dropping?: readonly (keyof L | 'availability')[]
}) => {
  const carried = (field: keyof L | 'availability') => !dropping.includes(field)

  return (
    <>
      <input type="hidden" name="via" value={via} />
      {wizard.CHOICE_FIELDS.map((field) => {
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
 * The shell every step but the last shares: a GET back to the wizard's own page,
 * carrying every answer this screen is neither asking for nor rewording, and
 * naming the screen after it on Continue.
 *
 * Both of those are read from the screen list rather than written per screen. Which
 * fields a screen carries was once four hand-written lists, and getting one wrong is
 * how a screen reached by pressing Back quietly emptied somebody's availability;
 * which step comes next was four literals in a sequence written down nowhere.
 */
export const StepForm = <L extends ChoiceLists>({
  wizard,
  at,
  answers,
  via,
  here,
  children,
}: {
  readonly wizard: Wizard<L>
  readonly at: number
  readonly answers: AnswersOf<L>
  readonly via: IntakeVia
  readonly here: string
  readonly children: ReactNode
}) => (
  <form method="get" action={here}>
    <Hidden wizard={wizard} answers={answers} via={via} dropping={wizard.notCarriedAt(at)} />
    <input type="hidden" name="step" value={String(at + 1)} />
    {children}
    <button type="submit">Continue</button>
  </form>
)
