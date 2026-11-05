/**
 * The drag, and nothing else: a row's handle is held, the row follows the pointer
 * into whichever page box it is over and past the middles of its neighbours there,
 * and letting go posts the whole order -- every page, and each page's questions
 * top to bottom. The arrow keys move a focused handle's row the same way, across
 * the edge of a page as the buttons do, and Enter posts. Nothing is posted when
 * the order lands as it started.
 *
 * Pointer events rather than the HTML5 drag-and-drop API, for the reasons the
 * goals list gives: a finger, a pen and a mouse all work, and nothing but the
 * handle can begin a drag. Plain script, run once per document by `next/script`,
 * listening on the document for whichever editor is on it. It marks the document
 * `js`, which hides the up and down buttons and shows the handles.
 *
 * Where a question may be dropped is the form's rule, not this script's: an order
 * the form refuses comes back with the reason and the order as it stood.
 */
(() => {
  const html = document.documentElement;
  if (html.dataset.formEditorDrag) return;
  html.dataset.formEditorDrag = 'on';
  html.classList.add('js');

  const lists = () => Array.from(document.querySelectorAll('#form-editor .fe-qs'));
  const order = () =>
    lists().flatMap((list) => [
      'page:' + list.dataset.pageId,
      ...Array.from(list.querySelectorAll(':scope > .fe-q')).map((row) => 'question:' + row.dataset.key),
    ]);
  const editor = () => document.getElementById('form-editor');
  const shown = () => {
    const box = editor();
    return box.dataset.shown || (box.dataset.shown = order().join(','));
  };
  const post = () => {
    if (order().join(',') === shown()) return;
    const form = document.getElementById('fe-order');
    form.querySelectorAll('input[name="layout"]').forEach((input) => input.remove());
    for (const entry of order()) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'layout';
      input.value = entry;
      form.appendChild(input);
    }
    form.submit();
  };
  const putBack = () => {
    const rows = new Map(
      Array.from(document.querySelectorAll('#form-editor .fe-q')).map((row) => [row.dataset.key, row]),
    );
    let list = null;
    for (const entry of shown().split(',')) {
      if (entry.startsWith('page:')) {
        list = lists().find((each) => each.dataset.pageId === entry.slice(5));
      } else if (list) {
        list.appendChild(rows.get(entry.slice(9)));
      }
    }
  };
  const handleOf = (event) =>
    event.target instanceof Element ? event.target.closest('#form-editor .fe-handle') : null;
  const middleOf = (element) => {
    const box = element.getBoundingClientRect();
    return box.top + box.height / 2;
  };
  const listAt = (y) => {
    const all = lists();
    for (const list of all) {
      const box = list.closest('.fe-page').getBoundingClientRect();
      if (y >= box.top && y <= box.bottom) return list;
    }
    return y < all[0].closest('.fe-page').getBoundingClientRect().top ? all[0] : all[all.length - 1];
  };

  let held = null;
  document.addEventListener('pointerdown', (event) => {
    const handle = handleOf(event);
    if (!handle || held || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const row = handle.closest('.fe-q');
    shown();
    held = { handle, row, pointerId: event.pointerId };
    handle.setPointerCapture(event.pointerId);
    row.classList.add('dragging');
  });
  document.addEventListener('pointermove', (event) => {
    if (!held || event.pointerId !== held.pointerId) return;
    const { row } = held;
    const list = listAt(event.clientY);
    if (row.parentElement !== list) {
      const after = Array.from(list.children).find((other) => other !== row && event.clientY < middleOf(other));
      list.insertBefore(row, after || null);
      return;
    }
    while (row.previousElementSibling && event.clientY < middleOf(row.previousElementSibling)) {
      list.insertBefore(row, row.previousElementSibling);
    }
    while (row.nextElementSibling && event.clientY > middleOf(row.nextElementSibling)) {
      list.insertBefore(row.nextElementSibling, row);
    }
  });
  const letGo = (event) => {
    if (!held || event.pointerId !== held.pointerId) return;
    const { handle, row } = held;
    held = null;
    row.classList.remove('dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (event.type === 'pointerup') post();
    else putBack();
  };
  document.addEventListener('pointerup', letGo);
  document.addEventListener('pointercancel', letGo);

  document.addEventListener('keydown', (event) => {
    const handle = handleOf(event);
    if (!handle) return;
    const row = handle.closest('.fe-q');
    const list = row.parentElement;
    const all = lists();
    const at = all.indexOf(list);
    shown();
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
      else if (at > 0) all[at - 1].appendChild(row);
      handle.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
      else if (at < all.length - 1) all[at + 1].insertBefore(row, all[at + 1].firstElementChild);
      handle.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      post();
    }
  });
})();
