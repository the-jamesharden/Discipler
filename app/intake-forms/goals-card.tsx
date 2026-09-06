import Link from 'next/link'
import Script from 'next/script'
import type { OfferedGoal } from '~/domain/discipleship-goals'
import { chosenByLabel, removalWarning } from './goals/copy'

/**
 * The one question on both Intake forms that a Ministry writes itself: *What are
 * you hoping for?*, answered from this list. Every other question on the forms is
 * Discipler's; this one's options are the Ministry's own, set before a semester
 * begins, in the order they most want people to consider them.
 *
 * A card on Intake forms rather than a page under Ministry Settings, since ticket
 * 34: the list is a property of the forms an Admin hands out, and this is the page
 * those forms are handed out from.
 *
 * One row per option. On the left, the cross that removes it; in the middle, its
 * wording; on the right, the handle it is dragged by. The drag is the card's one
 * piece of script, and it posts the whole order the moment the option is let go,
 * so the list an Admin is looking at is the list the Ministry has. Before the
 * script has run -- or without it -- the same rows carry the up and down buttons
 * the page offered before, so the ordering still works. The card itself stays a
 * server component; the script travels through `next/script` so that it also runs
 * when this page is reached without a full load, from the account menu or the
 * Roster.
 *
 * Removing is the one act here that costs anybody anything, so it is the one act
 * that takes two presses. The cross removes nothing: it reopens this page with the
 * warning open on that option, saying how many people have chosen it and that
 * their answer goes with it, and only the button inside that warning removes.
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

    <p className="subtle">
      Drag an option by its handle to change the order people see it in. The cross
      removes an option, after a warning about who has chosen it.
    </p>

    {/* Not a table: a row is one option and its three controls, and the drag
        needs the rows to be the things that move. The list is outside every
        form on it, because a form cannot hold another. */}
    <ol className="goal-list">
      {goals.map((goal, index) => (
        <li key={goal.id} className="goal-row" data-goal-id={goal.id}>
          {/* A link and not a form. Pressing it removes nothing: it reloads this
              page with the warning open on this option, and the only control
              that removes is inside that warning. The last option is not offered
              for removal at all; the boundary and the database refuse it too. */}
          {goals.length > 1 ? (
            <Link
              className="goal-x"
              href={`/intake-forms?removing=${goal.id}#goals`}
              aria-label={`Remove “${goal.label}”`}
              title={`Remove “${goal.label}”`}
            >
              ×
            </Link>
          ) : (
            <span
              className="goal-x last"
              title="The only option left — Intake could not be served without it"
              aria-hidden="true"
            >
              ×
            </span>
          )}

          {/* Reworded in place, because the option is a row and the answers
              point at the row. A ministry that decides *Career* should read
              *Career and calling* has not asked anybody a new question, and
              nobody who chose it loses anything. */}
          <form method="post" action="/intake-forms/goals/rename" className="goal-wording">
            <input type="hidden" name="goalId" value={goal.id} />
            <label className="visually-hidden" htmlFor={`label-${goal.id}`}>Wording</label>
            <input id={`label-${goal.id}`} name="label" type="text" defaultValue={goal.label} required />
            <button type="submit" className="sec small">Save wording</button>
          </form>

          <span className="goal-chosen muted">{chosenByLabel(goal.chosenBy)}</span>

          {/* Up and down, for a page whose script has not run. The script hides
              these and shows the handle instead; the ends offer nothing to press,
              because the top option cannot go higher. */}
          <span className="goal-move">
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
          </span>

          {/* The handle. A button so it can take focus: the arrow keys move the
              row and Enter posts the order, for whoever is not holding a mouse. */}
          <button
            type="button"
            className="goal-handle"
            aria-label={`Drag “${goal.label}” to change its place. Arrow keys move it; Enter saves the order.`}
            title="Drag to reorder"
          >
            ⋮⋮
          </button>
        </li>
      ))}
    </ol>

    {/* The order, posted whole. Filled in by the script when a drag ends; empty
        and hidden otherwise. */}
    <form method="post" action="/intake-forms/goals/reorder" id="goal-order" className="goal-order" hidden />
    <Script id="goal-drag" strategy="afterInteractive">{DRAG_TO_REORDER}</Script>

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
    <p className="subtle">It goes to the bottom of the list, where you can drag it up.</p>
    <form method="post" action="/intake-forms/goals/add">
      <div className="field">
        <label className="label" htmlFor="label">Wording</label>
        <input id="label" name="label" type="text" required />
      </div>
      <button type="submit">Add</button>
    </form>
  </div>
)

/**
 * The drag, and nothing else: the handle is held, the row follows the pointer past
 * the middles of its neighbours, and letting go posts the whole order. The same
 * order is posted when Enter is pressed on a handle that the arrow keys have moved.
 * Nothing is posted when the row lands where it started.
 *
 * Pointer events rather than the HTML5 drag-and-drop API, so that a finger, a pen
 * and a mouse all work -- Android browsers do not start a native drag from touch --
 * and so that nothing but the handle can begin one: text dragged out of a wording
 * field never reorders anything.
 *
 * Plain script rather than a client component, because the card is rendered on
 * the server and this is the only thing on the page that needs a browser. It runs
 * once per document: `next/script` remembers an id it has loaded and does not run
 * it again when the page is navigated back to. So it listens on the document, for
 * whichever list is on it, and marks the document rather than the list as having
 * script. The order the list was drawn in is kept on the list itself, the first
 * time a handle is touched, which is before anything has moved.
 */
const DRAG_TO_REORDER = `
(() => {
  const html = document.documentElement;
  if (html.classList.contains('js')) return;
  html.classList.add('js');

  const rows = (list) => Array.from(list.querySelectorAll('.goal-row'));
  const order = (list) => rows(list).map((row) => row.dataset.goalId).join(',');
  const shown = (list) => list.dataset.shown || (list.dataset.shown = order(list));
  const post = (list) => {
    if (order(list) === shown(list)) return;
    const form = document.getElementById('goal-order');
    form.querySelectorAll('input').forEach((input) => input.remove());
    for (const row of rows(list)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'order';
      input.value = row.dataset.goalId;
      form.appendChild(input);
    }
    form.submit();
  };
  const putBack = (list) => {
    for (const id of shown(list).split(',')) {
      list.appendChild(rows(list).find((row) => row.dataset.goalId === id));
    }
  };
  const handleOf = (event) =>
    event.target instanceof Element ? event.target.closest('.goal-handle') : null;
  const middleOf = (row) => {
    const box = row.getBoundingClientRect();
    return box.top + box.height / 2;
  };

  let held = null;
  document.addEventListener('pointerdown', (event) => {
    const handle = handleOf(event);
    if (!handle || held || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const row = handle.closest('.goal-row');
    const list = row.parentElement;
    shown(list);
    held = { handle, row, list, pointerId: event.pointerId };
    handle.setPointerCapture(event.pointerId);
    row.classList.add('dragging');
  });
  document.addEventListener('pointermove', (event) => {
    if (!held || event.pointerId !== held.pointerId) return;
    const { row, list } = held;
    while (row.previousElementSibling && event.clientY < middleOf(row.previousElementSibling)) {
      list.insertBefore(row, row.previousElementSibling);
    }
    while (row.nextElementSibling && event.clientY > middleOf(row.nextElementSibling)) {
      list.insertBefore(row.nextElementSibling, row);
    }
  });
  const letGo = (event) => {
    if (!held || event.pointerId !== held.pointerId) return;
    const { handle, row, list } = held;
    held = null;
    row.classList.remove('dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (event.type === 'pointerup') post(list);
    else putBack(list);
  };
  document.addEventListener('pointerup', letGo);
  document.addEventListener('pointercancel', letGo);

  document.addEventListener('keydown', (event) => {
    const handle = handleOf(event);
    if (!handle) return;
    const row = handle.closest('.goal-row');
    const list = row.parentElement;
    shown(list);
    if (event.key === 'ArrowUp' && row.previousElementSibling) {
      event.preventDefault();
      list.insertBefore(row, row.previousElementSibling);
      handle.focus();
    } else if (event.key === 'ArrowDown' && row.nextElementSibling) {
      event.preventDefault();
      list.insertBefore(row.nextElementSibling, row);
      handle.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      post(list);
    }
  });
})();
`
