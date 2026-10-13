import Link from 'next/link'
import Script from 'next/script'
import { INTAKE_PATHS, type IntakePath } from '~/domain/intake'
import {
  BUILT_IN,
  moveQuestion,
  type FormPage,
  type FormQuestion,
  type FormText,
  type IntakeForm,
} from '~/domain/intake-form'
import {
  ABOUT,
  ADD_A_PAGE,
  ADD_PAGE,
  ALWAYS_ASKED,
  CANCEL,
  dragLabel,
  EDIT,
  EMPTY_PAGE,
  FORM_HEADING,
  FORM_TOGGLE,
  HINT,
  INTRO,
  INTRO_HINT,
  KIND,
  KIND_IN_FULL,
  KIND_LABEL,
  LIVE_AS_YOU_SAVE,
  MENTEE_WORDING,
  MENTOR_WORDING,
  moveDown,
  moveUp,
  NEW_PAGE_HINT,
  NONE_YET,
  OPTIONAL,
  PAGE_NAME,
  pageTitle,
  PREVIEW_FORM,
  QUESTION,
  questionCount,
  RENAME,
  REQUIRED,
  SAVE,
  SAVED_LIVE,
  THANK_YOU,
  THANK_YOU_HINT,
  USED_BY,
  WHERE_IT_IS,
} from './form/copy'

/**
 * The form editor on Intake forms (Pastor feedback, ticket 11; settled in James's
 * Lavish review of 2026-10-12, `.lavish/pastor-feedback/mock-forms-editor.html`).
 *
 * One form at a time, chosen by the toggle at the top: every wizard page is a box
 * titled with its number and name, the first with its intro and the last with its
 * thank-you in its head, and every question is a row with its wording and chips
 * saying what kind it is, whether it is optional and what in the product uses it.
 * *Edit* opens the row in place: wording, hint and *Required*. The wording and the
 * hint are boxes that wrap rather than one-line fields, so an Admin on a phone reads
 * the whole of what they are editing. Saving makes it live
 * at once, as the form's next version, and the row says so.
 *
 * Everything is an ordinary form or link, so the editor works before any script
 * has run: *Edit* reloads the page with that row open, and each row carries up and
 * down buttons. The script is the drag: rows are dragged by their handles within a
 * page and between pages, and letting go posts the whole order, as the goals
 * list's drag does.
 */

/** What is open on the editor, and what was just saved or refused, off the query string. */
export interface EditorState {
  /** The question whose row is open. */
  readonly question: string | null
  /** The page whose name is being changed. */
  readonly renaming: string | null
  /** The intro or the thank-you being written. */
  readonly writing: FormText | null
  readonly addingPage: boolean
  /** A question key, `page:<id>`, `page`, `intro`, `thank_you` or `order`. */
  readonly saved: string | null
  /** Why the last edit was refused, in words. */
  readonly refusal: string | null
}

const editorHref = (form: IntakePath, params: Record<string, string> = {}, anchor = 'form-editor') =>
  `/intake-forms?${new URLSearchParams({ form, ...params })}#${anchor}`

export const FormEditor = ({
  form,
  path,
  state,
}: {
  readonly form: IntakeForm
  /** Where the form is, as a pastor says it: `/join/<short name>`, and `/groups` after. */
  readonly path: string
  readonly state: EditorState
}) => {
  // Said where the edit was being made, so an Admin who pressed Save on a row
  // reads why beside it; an order or a page added is said at the top.
  const refusedInPlace =
    state.refusal !== null
    && (state.question !== null || state.renaming !== null || state.writing !== null || state.addingPage)

  return (
    <div className="card" id="form-editor" style={{ marginTop: '1.5rem' }}>
      <div className="fe-bar">
        <div>
          <h2 className="card-title">{FORM_HEADING[form.name]}</h2>
          <p className="muted">
            {WHERE_IT_IS} <code>{path}</code>. {LIVE_AS_YOU_SAVE}
          </p>
        </div>
        <div className="btn-row">
          {/* A new tab, so the editor stays where it was. The readable link with
              `preview=1`, which the form carries to the end and which records
              nothing. */}
          <a className="ghost-btn small" href={`${path}?preview=1`} target="_blank" rel="noopener">
            {PREVIEW_FORM}
          </a>
        </div>
      </div>

      <div className="fe-tabs">
        <span className="seg">
          {INTAKE_PATHS.map((name) => (
            <a
              key={name}
              href={editorHref(name)}
              aria-current={name === form.name ? 'true' : undefined}
            >
              {FORM_TOGGLE[name]}
            </a>
          ))}
        </span>
        {state.saved === 'order' || state.saved === 'page' ? (
          <span className="fe-saved" role="status">
            {SAVED_LIVE}
          </span>
        ) : null}
      </div>

      {state.refusal && !refusedInPlace ? (
        <p className="toast error" role="alert">
          {state.refusal}
        </p>
      ) : null}

      <div className="fe-pages">
        {form.pages.map((page, index) => (
          <PageBox
            key={page.id}
            form={form}
            page={page}
            number={index + 1}
            first={index === 0}
            last={index === form.pages.length - 1}
            state={state}
          />
        ))}
      </div>

      {/* The order, posted whole. Filled in by the script when a drag ends; empty
          and hidden otherwise. */}
      <form method="post" action="/intake-forms/form/arrange" id="fe-order" hidden>
        <input type="hidden" name="form" value={form.name} />
      </form>

      <div id="add-page">
        {state.addingPage ? (
          <form method="post" action="/intake-forms/form/add-page" className="fe-inline">
            <input type="hidden" name="form" value={form.name} />
            <label className="label" htmlFor="fe-new-page">
              {PAGE_NAME}
            </label>
            <p className="subtle">{NEW_PAGE_HINT}</p>
            {state.refusal ? (
              <p className="toast error" role="alert">
                {state.refusal}
              </p>
            ) : null}
            <input id="fe-new-page" name="name" type="text" required />
            <div className="btn-row">
              <button type="submit" className="small">
                {ADD_PAGE}
              </button>
              <Link className="btn sec small" href={editorHref(form.name, {}, 'add-page')}>
                {CANCEL}
              </Link>
            </div>
          </form>
        ) : (
          <div className="btn-row">
            <Link className="btn sec small" href={editorHref(form.name, { addingPage: '1' }, 'add-page')}>
              {ADD_A_PAGE}
            </Link>
          </div>
        )}
      </div>

      <Script id="form-editor-drag" strategy="afterInteractive">{DRAG_TO_ARRANGE}</Script>
    </div>
  )
}

const PageBox = ({
  form,
  page,
  number,
  first,
  last,
  state,
}: {
  readonly form: IntakeForm
  readonly page: FormPage
  readonly number: number
  readonly first: boolean
  readonly last: boolean
  readonly state: EditorState
}) => {
  const renaming = state.renaming === page.id
  return (
    <section className="fe-page" id={`page-${page.id}`}>
      <div className="fe-page-head">
        <h3>
          {pageTitle(number, page.name)}{' '}
          <Link className="fe-rename" href={editorHref(form.name, { renaming: page.id }, `page-${page.id}`)}>
            {RENAME}
          </Link>
        </h3>
        <span className="muted">
          {first ? <TextSummary form={form} which="intro" saved={state.saved === 'intro'} /> : null}
          {first && last ? ' · ' : null}
          {last ? <TextSummary form={form} which="thank_you" saved={state.saved === 'thank_you'} /> : null}
          {!first && !last ? questionCount(page.questions.length) : null}
        </span>
      </div>

      {state.saved === `page:${page.id}` ? (
        <p className="fe-saved fe-note" role="status">
          {SAVED_LIVE}
        </p>
      ) : null}

      {renaming ? (
        <form method="post" action="/intake-forms/form/rename-page" className="fe-inline">
          <input type="hidden" name="form" value={form.name} />
          <input type="hidden" name="pageId" value={page.id} />
          <label className="label" htmlFor={`fe-page-${page.id}`}>
            {PAGE_NAME}
          </label>
          {state.refusal ? (
            <p className="toast error" role="alert">
              {state.refusal}
            </p>
          ) : null}
          <input id={`fe-page-${page.id}`} name="name" type="text" required defaultValue={page.name} />
          <div className="btn-row">
            <button type="submit" className="small">
              {SAVE}
            </button>
            <Link className="btn sec small" href={editorHref(form.name, {}, `page-${page.id}`)}>
              {CANCEL}
            </Link>
          </div>
        </form>
      ) : null}

      {first && state.writing === 'intro' ? <TextForm form={form} which="intro" state={state} /> : null}
      {last && state.writing === 'thank_you' ? <TextForm form={form} which="thank_you" state={state} /> : null}

      <ul className="fe-qs" data-page-id={page.id}>
        {page.questions.map((question) => (
          <QuestionRow key={question.key} form={form} question={question} state={state} />
        ))}
      </ul>
      {page.questions.length === 0 ? <p className="fe-empty">{EMPTY_PAGE}</p> : null}
    </section>
  )
}

/** The head of the first or last page: what its intro or thank-you says, and *Edit*. */
const TextSummary = ({
  form,
  which,
  saved,
}: {
  readonly form: IntakeForm
  readonly which: FormText
  readonly saved: boolean
}) => {
  const text = which === 'intro' ? form.intro : form.thankYou
  return (
    <span id={`text-${which}`}>
      {saved ? (
        <span className="fe-saved" role="status">
          {SAVED_LIVE}
        </span>
      ) : null}
      {saved ? ' ' : null}
      {`${which === 'intro' ? INTRO : THANK_YOU}: `}
      {text ? `“${text}”` : NONE_YET}{' '}
      <Link href={editorHref(form.name, { writing: which }, `text-${which}`)}>{EDIT}</Link>
    </span>
  )
}

const TextForm = ({
  form,
  which,
  state,
}: {
  readonly form: IntakeForm
  readonly which: FormText
  readonly state: EditorState
}) => (
  <form method="post" action="/intake-forms/form/text" className="fe-inline">
    <input type="hidden" name="form" value={form.name} />
    <input type="hidden" name="which" value={which} />
    <label className="label" htmlFor={`fe-${which}`}>
      {which === 'intro' ? INTRO : THANK_YOU}
    </label>
    <p className="subtle">{which === 'intro' ? INTRO_HINT : THANK_YOU_HINT}</p>
    {state.refusal ? (
      <p className="toast error" role="alert">
        {state.refusal}
      </p>
    ) : null}
    <textarea
      id={`fe-${which}`}
      name="text"
      rows={3}
      defaultValue={(which === 'intro' ? form.intro : form.thankYou) ?? ''}
    />
    <div className="btn-row">
      <button type="submit" className="small">
        {SAVE}
      </button>
      <Link className="btn sec small" href={editorHref(form.name)}>
        {CANCEL}
      </Link>
    </div>
  </form>
)

/** The chips under a question's wording: what fixes it, what kind it is, and whether it may be left. */
const Chips = ({ question }: { readonly question: FormQuestion }) => {
  const rules = BUILT_IN[question.key]
  return (
    <div className="fe-meta">
      {rules.alwaysAsked ? <span className="fe-chip fixed">{ALWAYS_ASKED}</span> : null}
      {rules.usedBy ? <span className="fe-chip uses">{USED_BY[rules.usedBy]}</span> : null}
      <span className="fe-chip">{KIND[rules.kind]}</span>
      {question.required ? null : <span className="fe-chip">{OPTIONAL}</span>}
    </div>
  )
}

/** A question's wording as its row shows it: both of the first-time question's. */
const shownWording = (question: FormQuestion): string =>
  question.menteeWording ? `${question.wording} / ${question.menteeWording}` : question.wording

const QuestionRow = ({
  form,
  question,
  state,
}: {
  readonly form: IntakeForm
  readonly question: FormQuestion
  readonly state: EditorState
}) => {
  const open = state.question === question.key
  const anchor = `q-${question.key}`
  const rules = BUILT_IN[question.key]
  // A move the form would refuse is not offered: the top of the form going up, a
  // question that stays on the last page, the first-time question onto the side's.
  const canMove = (direction: 'up' | 'down') => {
    const moved = moveQuestion(form, question.key, direction)
    return moved !== null && !('refusal' in moved)
  }

  return (
    <li className={open ? 'fe-q editing' : 'fe-q'} id={anchor} data-key={question.key}>
      <button
        type="button"
        className="fe-handle"
        aria-label={dragLabel(question.wording)}
        title="Drag to move"
      >
        ⋮⋮
      </button>
      <div>
        <div className="fe-wording">{shownWording(question)}</div>
        <Chips question={question} />
        {open ? (
          <form method="post" action="/intake-forms/form/question" className="fe-edit">
            <input type="hidden" name="form" value={form.name} />
            <input type="hidden" name="key" value={question.key} />
            {state.refusal ? (
              <p className="toast error" role="alert">
                {state.refusal}
              </p>
            ) : null}
            <div>
              <label htmlFor={`fe-wording-${question.key}`}>
                {question.menteeWording !== null ? MENTOR_WORDING : QUESTION}
              </label>
              <textarea
                id={`fe-wording-${question.key}`}
                name="wording"
                rows={1}
                required
                defaultValue={question.wording}
              />
            </div>
            {question.menteeWording !== null ? (
              <div>
                <label htmlFor={`fe-mentee-${question.key}`}>{MENTEE_WORDING}</label>
                <textarea
                  id={`fe-mentee-${question.key}`}
                  name="menteeWording"
                  rows={1}
                  required
                  defaultValue={question.menteeWording}
                />
              </div>
            ) : null}
            <div>
              <label htmlFor={`fe-hint-${question.key}`}>{HINT}</label>
              <textarea id={`fe-hint-${question.key}`} name="hint" rows={1} defaultValue={question.hint ?? ''} />
            </div>
            <div className="row2">
              <div>
                <label htmlFor={`fe-kind-${question.key}`}>{KIND_LABEL}</label>
                <select id={`fe-kind-${question.key}`} disabled>
                  <option>{KIND_IN_FULL[rules.kind]}</option>
                </select>
              </div>
              <div>
                <span className="fe-spacer" aria-hidden="true">
                  &nbsp;
                </span>
                <label className="check" htmlFor={`fe-required-${question.key}`}>
                  <input
                    id={`fe-required-${question.key}`}
                    type="checkbox"
                    name="required"
                    value="yes"
                    defaultChecked={question.required}
                    disabled={rules.requiredFixed}
                  />{' '}
                  {REQUIRED}
                </label>
                {/* A disabled box sends nothing, and nothing is *not required*. */}
                {rules.requiredFixed ? <input type="hidden" name="required" value="yes" /> : null}
              </div>
            </div>
            {ABOUT[question.key] ? <div className="fe-warn">{ABOUT[question.key]}</div> : null}
            <div className="btn-row">
              <button type="submit" className="small">
                {SAVE}
              </button>
              <Link className="btn sec small" href={editorHref(form.name, {}, anchor)}>
                {CANCEL}
              </Link>
            </div>
          </form>
        ) : null}
      </div>
      {open ? null : (
        <div className="fe-q-actions">
          {state.saved === question.key ? (
            <span className="fe-saved" role="status">
              {SAVED_LIVE}
            </span>
          ) : null}
          <span className="fe-move">
            {(['up', 'down'] as const).map((direction) =>
              canMove(direction) ? (
                <form key={direction} method="post" action="/intake-forms/form/move">
                  <input type="hidden" name="form" value={form.name} />
                  <input type="hidden" name="key" value={question.key} />
                  <input type="hidden" name="direction" value={direction} />
                  <button
                    type="submit"
                    className="sec small"
                    aria-label={direction === 'up' ? moveUp(question.wording) : moveDown(question.wording)}
                  >
                    {direction === 'up' ? '↑' : '↓'}
                  </button>
                </form>
              ) : null,
            )}
          </span>
          <Link
            className="btn sec small"
            href={editorHref(form.name, { question: question.key }, anchor)}
          >
            {EDIT}
          </Link>
        </div>
      )}
    </li>
  )
}

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
const DRAG_TO_ARRANGE = `
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
`
