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
 * script. It guards on a mark of its own rather than on `js`, which the form
 * editor's drag on the same page sets too (Pastor feedback, ticket 11). The order the list was drawn in is kept on the list itself, the first
 * time a handle is touched, which is before anything has moved.
 */
(() => {
  const html = document.documentElement;
  if (html.dataset.goalDrag) return;
  html.dataset.goalDrag = 'on';
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
