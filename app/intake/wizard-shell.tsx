import Link from 'next/link'
import type { ReactNode } from 'react'
import type { AnswersOf, ChoiceLists, FieldOf, FormPin, IntakeVia, Wizard } from './wizard-machine'

/**
 * The pieces every screen of every wizard is built from: the hidden inputs that
 * carry the earlier answers forward, the GET form that wraps a screen and names
 * the one after it, and the card the Make design draws them in -- the Ministry's
 * name, subtitle, progress bar, Back and Continue. Written once because there are two
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
  pin,
  dropping = [],
}: {
  readonly wizard: Wizard<L>
  readonly answers: AnswersOf<L>
  readonly via: IntakeVia
  /** The version of the form this visitor opened, and whether it is a preview. */
  readonly pin: FormPin
  /** What this screen asks for or rewords. Those are not carried as hidden. */
  readonly dropping?: readonly FieldOf<L>[]
}) => {
  const carried = (field: FieldOf<L>) => !dropping.includes(field)

  return (
    <>
      <input type="hidden" name="via" value={via} />
      {/* The version they opened, carried to the end, so an edit made while they
          are part-way through changes nothing in front of them (Pastor feedback,
          ticket 11). */}
      <input type="hidden" name="v" value={String(pin.version)} />
      {pin.preview ? <input type="hidden" name="preview" value="1" /> : null}
      {/* What the group form's switch brought with them (Group form exits,
          ticket 02), carried to the end like the version. */}
      {(pin.carried ?? []).map((field) => (
        <input key={`carried=${field}`} type="hidden" name="carried" value={field} />
      ))}
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
      {/* The Ministry's own choice questions (ticket 12), each value an id the
          form served or yes or no. */}
      {wizard.OWN_FIELDS.flatMap((field) =>
        carried(field.key)
          ? (answers.own[field.key] ?? []).map((value) => (
              <input key={`${field.key}=${value}`} type="hidden" name={field.key} value={value} />
            ))
          : [],
      )}
    </>
  )
}

/**
 * The design's progress bar: *Step N of M* and a filled track, filled N parts in
 * M, so the bar and the words beside it always agree and the last step -- the one
 * with Submit on it -- reads 100%. It once filled only the steps before this one,
 * which left *Step 5 of 5* reading 80% on the screen that finishes the form.
 */
export const Progress = ({ at, of }: { readonly at: number; readonly of: number }) => {
  const done = Math.round((at / of) * 100)
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
 * What an Admin previewing the form is told on every screen of it, and on the
 * page after Submit: that this is the form as a newcomer sees it, and that
 * nothing they put in it is kept or sent.
 */
export const PreviewNotice = () => (
  <p className="toast" role="status">
    Preview. This is the form as a newcomer sees it. Nothing you enter is recorded, and nobody
    is texted.
  </p>
)

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
 * naming the screen after it on Continue -- or, for somebody the group form's
 * switch brought, the next screen they have not already answered (`nextStep`).
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
  pin,
  here,
  back,
  children,
}: {
  readonly wizard: Wizard<L>
  readonly at: number
  readonly answers: AnswersOf<L>
  readonly via: IntakeVia
  readonly pin: FormPin
  readonly here: string
  /** The way to the previous screen, or null on the first. */
  readonly back: string | null
  readonly children: ReactNode
}) => (
  <form method="get" action={here}>
    <Hidden wizard={wizard} answers={answers} via={via} pin={pin} dropping={wizard.notCarriedAt(at)} />
    <input type="hidden" name="step" value={String(wizard.nextStep(at, answers, pin.carried))} />
    {children}
    <FormActions back={back} action="Continue" />
  </form>
)
