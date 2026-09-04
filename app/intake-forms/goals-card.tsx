import Link from 'next/link'
import type { OfferedGoal } from '~/domain/discipleship-goals'
import { chosenByLabel, removalWarning } from './goals/copy'

/**
 * The one question on both Intake forms that a Ministry writes itself: *What are
 * you hoping for?*, answered from this list. Every other question on the forms is
 * Discipler's; this one's options are the Ministry's own, set before a semester
 * begins, in the order they most want people to consider them. The seeded list
 * carries no product meaning and exists so a new Ministry is never unable to serve
 * its own form.
 *
 * A card on Intake forms rather than a page under Ministry Settings, since ticket
 * 34: the list is a property of the forms an Admin hands out, and this is the page
 * those forms are handed out from.
 *
 * Removing is the one act here that costs anybody anything, so it is the one act
 * that takes two presses. The control opens a warning saying how many people have
 * chosen the option and that their answer goes with it; only the button inside
 * that warning removes. Nothing here removes an option in one press, because the
 * answers it loses cannot be got back.
 */
export const GoalsCard = ({
  goals,
  removing,
  refusal,
}: {
  readonly goals: readonly OfferedGoal[]
  /** The option an Admin has asked to remove, looked up on the list, or null. */
  readonly removing: OfferedGoal | null
  /** Why the last edit was refused, in words, or null. */
  readonly refusal: string | null
}) => (
  <div className="card" id="goals" style={{ marginTop: '1.5rem' }}>
    <div className="card-head">
      <h2 className="card-title">The goals question</h2>
    </div>
    <p className="card-lead">
      Both forms end by asking <em>What are you hoping for?</em> These are the options a
      person chooses from. They are this ministry’s own — set them before a semester
      begins, in the order you most want people to consider them.
    </p>

    {refusal ? (
      <p className="toast error" role="alert">
        {refusal}
      </p>
    ) : null}

    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Chosen by</th>
            <th>Order</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((goal, index) => (
            <tr key={goal.id}>
              {/* Reworded in place, because the option is a row and the answers
                  point at the row. A ministry that decides *Career* should read
                  *Career and calling* has not asked anybody a new question, and
                  nobody who chose it loses anything. */}
              <td>
                <form method="post" action="/intake-forms/goals/rename">
                  <input type="hidden" name="goalId" value={goal.id} />
                  <label className="visually-hidden" htmlFor={`label-${goal.id}`}>Wording</label>
                  <input
                    id={`label-${goal.id}`}
                    name="label"
                    type="text"
                    defaultValue={goal.label}
                    required
                    style={{ width: 'auto', minWidth: '14rem', marginRight: '0.5rem' }}
                  />
                  <button type="submit" className="sec small">Save wording</button>
                </form>
              </td>
              <td>{chosenByLabel(goal.chosenBy)}</td>
              {/* Up and down rather than a drag, so the ordering works before
                  JavaScript has loaded — and the ends offer nothing to press,
                  because the top option cannot go higher. */}
              <td>
                {index > 0 ? (
                  <form method="post" action="/intake-forms/goals/move">
                    <input type="hidden" name="goalId" value={goal.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" className="sec small">{`Move “${goal.label}” up`}</button>
                  </form>
                ) : null}
                {index < goals.length - 1 ? (
                  <form method="post" action="/intake-forms/goals/move">
                    <input type="hidden" name="goalId" value={goal.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button type="submit" className="sec small">{`Move “${goal.label}” down`}</button>
                  </form>
                ) : null}
              </td>
              {/* A link and not a form. Pressing it removes nothing: it reloads
                  this page with the warning open on this option, and the only
                  control that removes is inside that warning. */}
              <td>
                {goals.length > 1 ? (
                  <Link className="btn sec small danger" href={`/intake-forms?removing=${goal.id}#goals`}>
                    Remove
                  </Link>
                ) : (
                  // The last option is not offered for removal at all, and the
                  // reason is said rather than left to a control that does
                  // nothing. The boundary and the database refuse it too.
                  <span className="muted">
                    The only option left — Intake could not be served without it
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {removing ? (
      <div role="alert" className="notice" style={{ marginTop: '1.25rem' }}>
        <h3>{`Remove “${removing.label}”?`}</h3>
        <p>{removalWarning(removing.label, removing.chosenBy)}</p>
        <form method="post" action="/intake-forms/goals/remove">
          <input type="hidden" name="goalId" value={removing.id} />
          {/* The confirmation itself. The route removes nothing without it, so
              a link or a stale form that names an option and says nothing else
              reopens this warning rather than acting on it. */}
          <input type="hidden" name="confirm" value="yes" />
          <button type="submit">{`Yes, remove “${removing.label}” and lose those answers`}</button>
        </form>
        <p style={{ marginTop: '0.75rem' }}>
          <Link className="btn sec" href="/intake-forms#goals">Keep it</Link>
        </p>
      </div>
    ) : null}

    <h3>Add an option</h3>
    <p className="subtle">It goes to the bottom of the list, where you can move it up.</p>
    <form method="post" action="/intake-forms/goals/add">
      <div className="field">
        <label className="label" htmlFor="label">Wording</label>
        <input id="label" name="label" type="text" required />
      </div>
      <button type="submit">Add</button>
    </form>
  </div>
)
