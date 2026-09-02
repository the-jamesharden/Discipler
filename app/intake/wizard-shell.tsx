import Link from 'next/link'
import type { ReactNode } from 'react'
import type { AnswersOf, ChoiceLists, IntakeVia, Wizard } from './wizard-machine'

/**
 * The pieces every screen of every wizard is built from: the hidden inputs that
 * carry the earlier answers forward, the GET form that wraps a screen and names
 * the one after it, and the card the Make design draws them in -- wordmark,
 * subtitle, progress bar, Back and Continue. Written once because there are two
 * wizards now, and a screen that carried its answers differently from the other
 * wizard's screens would go wrong in the one direction that matters -- somebody's
 * answers, on their way forward, silently.
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
 * The design's progress bar: *Step N of M* and a filled track. Percentages of
 * the steps before this one, as the Make project draws it, so the first screen
 * reads 0% and the confirmation reads 100%.
 */
export const Progress = ({ at, of }: { readonly at: number; readonly of: number }) => {
  const done = Math.round(((at - 1) / of) * 100)
  return (
    <div className="progress">
      <div className="progress-labels">
        <strong>{`Step ${at} of ${of}`}</strong>
        <span>{`${done}%`}</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done}
        aria-label={`Step ${at} of ${of}`}
      >
        <div className="progress-fill" style={{ width: `${done}%` }} />
      </div>
    </div>
  )
}

/**
 * Back and the button that moves on, in one row. Back is a link and not a form
 * control, because going back changes nothing: it is the same page with the
 * answers still in the URL.
 */
export const FormActions = ({
  back,
  action,
}: {
  readonly back: string | null
  readonly action: string
}) => (
  <div className="form-actions">
    {back ? (
      <Link className="btn sec" href={back}>
        Back
      </Link>
    ) : (
      <span />
    )}
    <button type="submit">{action}</button>
  </div>
)

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
  back,
  children,
}: {
  readonly wizard: Wizard<L>
  readonly at: number
  readonly answers: AnswersOf<L>
  readonly via: IntakeVia
  readonly here: string
  /** The way to the previous screen, or null on the first. */
  readonly back: string | null
  readonly children: ReactNode
}) => (
  <form method="get" action={here}>
    <Hidden wizard={wizard} answers={answers} via={via} dropping={wizard.notCarriedAt(at)} />
    <input type="hidden" name="step" value={String(at + 1)} />
    {children}
    <FormActions back={back} action="Continue" />
  </form>
)
