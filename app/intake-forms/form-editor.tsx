import Link from 'next/link'
import Script from 'next/script'
import { INTAKE_PATHS, type IntakePath } from '~/domain/intake'
import {
  addBackQuestion,
  hasChoices,
  isOwnQuestion,
  isRemovable,
  isTypedKind,
  moveQuestion,
  neededBy,
  OWN_KINDS,
  presetForm,
  questionOn,
  removalDeletesAnswers,
  removedQuestions,
  rulesOf,
  type FormPage,
  type FormQuestion,
  type FormText,
  type IntakeForm,
  type OwnKind,
} from '~/domain/intake-form'
import {
  ABOUT,
  ABOUT_CHOICES,
  ABOUT_TYPED,
  ABOUT_YOUR_QUESTION,
  ADD_A_PAGE,
  ADD_A_QUESTION,
  ADD_BACK,
  addBackLabel,
  ADD_KIND,
  addKindLabel,
  answersDeleted,
  ADD_PAGE,
  ALWAYS_ASKED,
  CANCEL,
  CHOICES,
  choiceLabel,
  dragLabel,
  EDIT,
  EMPTY_PAGE,
  FORM_HEADING,
  FORM_TOGGLE,
  HINT,
  INTRO,
  INTRO_HINT,
  KEEP_IT,
  KIND,
  KIND_IN_FULL,
  KIND_LABEL,
  LIVE_AS_YOU_SAVE,
  MENTEE_WORDING,
  MENTOR_WORDING,
  MORE_CHOICES,
  moveDown,
  moveUp,
  neededFirst,
  NEW_PAGE_HINT,
  NEW_QUESTION,
  NONE_YET,
  NOTHING_KEPT,
  OPTIONAL,
  PAGE_NAME,
  pageTitle,
  PREVIEW_FORM,
  QUESTION,
  questionCount,
  RENAME,
  REMOVE_QUESTION,
  REMOVED_LIVE,
  removeIt,
  removeTitle,
  REQUIRED,
  SAVE,
  SAVED_LIVE,
  STOPS_WORKING,
  THANK_YOU,
  THANK_YOU_HINT,
  TYPED_ON_THE_LAST_PAGE,
  USED_BY,
  WHERE_IT_IS,
  YOUR_QUESTION,
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
  /**
   * The open question's *Remove question…* was pressed: the row asks once more,
   * saying what it deletes, and only its second button removes (ticket 13).
   */
  readonly removing: boolean
  /** The page whose name is being changed. */
  readonly renaming: string | null
  /** The intro or the thank-you being written. */
  readonly writing: FormText | null
  readonly addingPage: boolean
  /** The question being added, of which kind and at the foot of which page (ticket 12). */
  readonly adding: { readonly pageId: string; readonly kind: OwnKind } | null
  /** What was typed into a question being added that was refused, put back. */
  readonly draft: QuestionDraft | null
  /**
   * A question key, `page:<id>`, `page`, `intro`, `thank_you`, `order`, or
   * `removed:<page id>` for a question just removed from that page.
   */
  readonly saved: string | null
  /** Why the last edit was refused, in words. */
  readonly refusal: string | null
}

/** A new question's boxes as an Admin left them when it was refused. */
export interface QuestionDraft {
  readonly wording: string
  readonly hint: string
  readonly required: boolean
  /** One to a line, as typed. */
  readonly choices: string
}

const editorHref = (form: IntakePath, params: Record<string, string> = {}, anchor = 'form-editor') =>
  `/intake-forms?${new URLSearchParams({ form, ...params })}#${anchor}`

export const FormEditor = ({
  form,
  path,
  answerCounts,
  state,
}: {
  readonly form: IntakeForm
  /** Where the form is, as a pastor says it: `/join/<short name>`, and `/groups` after. */
  readonly path: string
  /** How many people have answered each question on this form, by key (ticket 13). */
  readonly answerCounts: Readonly<Record<string, number>>
  readonly state: EditorState
}) => {
  // Said where the edit was being made, so an Admin who pressed Save on a row
  // reads why beside it; an order or a page added is said at the top.
  const refusedInPlace =
    state.refusal !== null
    && (state.question !== null
      || state.renaming !== null
      || state.writing !== null
      || state.addingPage
      || state.adding !== null)

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
            answerCounts={answerCounts}
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
  answerCounts,
  page,
  number,
  first,
  last,
  state,
}: {
  readonly form: IntakeForm
  readonly answerCounts: Readonly<Record<string, number>>
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
      {state.saved === `removed:${page.id}` ? (
        <p className="fe-saved fe-note" role="status">
          {REMOVED_LIVE}
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
          <QuestionRow
            key={question.key}
            form={form}
            question={question}
            answered={answerCounts[question.key] ?? 0}
            state={state}
          />
        ))}
      </ul>
      {page.questions.length === 0 && state.adding?.pageId !== page.id ? (
        <p className="fe-empty">{EMPTY_PAGE}</p>
      ) : null}
      {state.adding?.pageId === page.id ? (
        <NewQuestionRow form={form} page={page} kind={state.adding.kind} state={state} />
      ) : null}
      <AddAQuestion form={form} page={page} number={number} last={last} />
    </section>
  )
}

/**
 * The foot of a page box (Pastor feedback, ticket 12): *Add a question*, and a
 * button for each kind, each opening a new row in place to be worded. Links, so
 * they work before any script. The two kinds somebody types into are offered on
 * the last page only, and said so on the others.
 */
const AddAQuestion = ({
  form,
  page,
  number,
  last,
}: {
  readonly form: IntakeForm
  readonly page: FormPage
  readonly number: number
  readonly last: boolean
}) => {
  // Discipler's own questions this form no longer asks, each offered on the pages
  // it may be asked on, in the words it comes back in (ticket 13).
  const back = removedQuestions(form).filter((key) => {
    const added = addBackQuestion(form, page.id, key)
    return added !== null && !('refusal' in added)
  })
  return (
    <div className="fe-add">
      <span className="fe-add-label">{ADD_A_QUESTION}</span>
      {OWN_KINDS.filter((kind) => last || !isTypedKind(kind)).map((kind) => (
        <Link
          key={kind}
          className="btn sec small"
          href={editorHref(form.name, { adding: kind, addTo: page.id }, 'new-question')}
          aria-label={addKindLabel(kind, `page ${number}`)}
        >
          {ADD_KIND[kind]}
        </Link>
      ))}
      {last ? null : <span className="fe-add-note">{TYPED_ON_THE_LAST_PAGE}</span>}
      {back.length > 0 ? (
        <form method="post" action="/intake-forms/form/add-back" className="fe-add-back">
          <input type="hidden" name="form" value={form.name} />
          <input type="hidden" name="pageId" value={page.id} />
          <span className="fe-add-label">{ADD_BACK}</span>
          {back.map((key) => {
            const wording = questionOn(presetForm(form.name), key)!.wording
            return (
              <button
                key={key}
                type="submit"
                name="key"
                value={key}
                className="sec small"
                aria-label={addBackLabel(wording, `page ${number}`)}
              >
                {wording}
              </button>
            )
          })}
        </form>
      ) : null}
    </div>
  )
}

/**
 * A question being added, open in place at the foot of its page: worded, given a
 * hint, required or not, and for the two choice kinds its choices, one to a line.
 * *Save* adds it as the form's next version, live at once.
 *
 * Outside the page's list of rows, so the drag never picks it up: it is not on
 * the form until it is saved.
 */
const NewQuestionRow = ({
  form,
  page,
  kind,
  state,
}: {
  readonly form: IntakeForm
  readonly page: FormPage
  readonly kind: OwnKind
  readonly state: EditorState
}) => {
  const draft = state.draft
  return (
    <div className="fe-q editing fe-new" id="new-question">
      <span className="fe-handle" aria-hidden="true">
        ⋮⋮
      </span>
      <div>
        <div className="fe-wording">{NEW_QUESTION}</div>
        <div className="fe-meta">
          <span className="fe-chip custom">{YOUR_QUESTION}</span>
          <span className="fe-chip">{KIND[kind]}</span>
        </div>
        <form method="post" action="/intake-forms/form/add-question" className="fe-edit">
          <input type="hidden" name="form" value={form.name} />
          <input type="hidden" name="pageId" value={page.id} />
          <input type="hidden" name="kind" value={kind} />
          {state.refusal ? (
            <p className="toast error" role="alert">
              {state.refusal}
            </p>
          ) : null}
          <div>
            <label htmlFor="fe-new-wording">{QUESTION}</label>
            <textarea
              id="fe-new-wording"
              name="wording"
              rows={1}
              required
              autoFocus
              defaultValue={draft?.wording ?? ''}
            />
          </div>
          <div>
            <label htmlFor="fe-new-hint">{HINT}</label>
            <textarea id="fe-new-hint" name="hint" rows={1} defaultValue={draft?.hint ?? ''} />
          </div>
          {hasChoices(kind) ? (
            <div>
              <label htmlFor="fe-new-choices">{CHOICES}</label>
              <textarea
                id="fe-new-choices"
                name="choices"
                rows={3}
                required
                className="fe-choices"
                defaultValue={draft?.choices ?? ''}
              />
            </div>
          ) : null}
          <KindAndRequired
            id="new"
            kind={KIND_IN_FULL[kind]}
            required={draft?.required ?? false}
            fixed={false}
          />
          <div className="fe-warn">{aboutYourQuestion(kind)}</div>
          <div className="btn-row">
            <button type="submit" className="small">
              {SAVE}
            </button>
            <Link className="btn sec small" href={editorHref(form.name, {}, `page-${page.id}`)}>
              {CANCEL}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

/** What an open row says about one of the Ministry's own questions. */
const aboutYourQuestion = (kind: OwnKind): string =>
  [ABOUT_YOUR_QUESTION, ...(isTypedKind(kind) ? [ABOUT_TYPED] : []), ...(hasChoices(kind) ? [ABOUT_CHOICES] : [])].join(
    ' ',
  )

/**
 * The open row's kind, which an edit cannot change, and *Required*: greyed and
 * ticked on a question Discipler keeps required.
 */
const KindAndRequired = ({
  id,
  kind,
  required,
  fixed,
}: {
  readonly id: string
  readonly kind: string
  readonly required: boolean
  readonly fixed: boolean
}) => (
  <div className="row2">
    <div>
      <label htmlFor={`fe-kind-${id}`}>{KIND_LABEL}</label>
      <select id={`fe-kind-${id}`} disabled>
        <option>{kind}</option>
      </select>
    </div>
    <div>
      <span className="fe-spacer" aria-hidden="true">
        &nbsp;
      </span>
      <label className="check" htmlFor={`fe-required-${id}`}>
        <input
          id={`fe-required-${id}`}
          type="checkbox"
          name="required"
          value="yes"
          defaultChecked={required}
          disabled={fixed}
        />{' '}
        {REQUIRED}
      </label>
      {/* A disabled box sends nothing, and nothing is *not required*. */}
      {fixed ? <input type="hidden" name="required" value="yes" /> : null}
    </div>
  </div>
)

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

/**
 * The chips under a question's wording: whose it is or what fixes it, what kind it
 * is, and whether it may be left.
 */
const Chips = ({ question }: { readonly question: FormQuestion }) => {
  const rules = rulesOf(question)
  return (
    <div className="fe-meta">
      {isOwnQuestion(question) ? <span className="fe-chip custom">{YOUR_QUESTION}</span> : null}
      {rules.alwaysAsked ? <span className="fe-chip fixed">{ALWAYS_ASKED}</span> : null}
      {rules.usedBy ? <span className="fe-chip uses">{USED_BY[rules.usedBy]}</span> : null}
      <span className="fe-chip">{KIND[rules.kind]}</span>
      {question.required ? null : <span className="fe-chip">{OPTIONAL}</span>}
    </div>
  )
}

/** A question's wording as its row shows it: both of a question worded from the side. */
const shownWording = (question: FormQuestion): string =>
  question.menteeWording ? `${question.wording} / ${question.menteeWording}` : question.wording

const QuestionRow = ({
  form,
  question,
  answered,
  state,
}: {
  readonly form: IntakeForm
  readonly question: FormQuestion
  /** How many people have answered it, which removing it deletes. */
  readonly answered: number
  readonly state: EditorState
}) => {
  const open = state.question === question.key
  const removing = open && state.removing && isRemovable(question)
  const anchor = `q-${question.key}`
  const rules = rulesOf(question)
  const about = isOwnQuestion(question) ? aboutYourQuestion(question.kind) : ABOUT[question.key]
  // A move the form would refuse is not offered: the top of the form going up, a
  // question that stays on the last page, a question worded from the side onto the side's.
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
        {removing ? (
          <Removal form={form} question={question} answered={answered} state={state} />
        ) : open ? (
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
            {isOwnQuestion(question) && hasChoices(question.kind) ? (
              <fieldset className="fe-choice-boxes">
                {question.choices.map((choice, index) => (
                  <div key={choice.id}>
                    <label htmlFor={`fe-choice-${choice.id}`}>{choiceLabel(index + 1)}</label>
                    <input
                      id={`fe-choice-${choice.id}`}
                      type="text"
                      name={`choice:${choice.id}`}
                      required
                      defaultValue={choice.wording}
                    />
                  </div>
                ))}
                <div>
                  <label htmlFor={`fe-more-${question.key}`}>{MORE_CHOICES}</label>
                  <textarea id={`fe-more-${question.key}`} name="moreChoices" rows={1} className="fe-choices" />
                </div>
              </fieldset>
            ) : null}
            <KindAndRequired
              id={question.key}
              kind={KIND_IN_FULL[rules.kind]}
              required={question.required}
              fixed={rules.requiredFixed}
            />
            {about ? <div className="fe-warn">{about}</div> : null}
            <div className="btn-row">
              <button type="submit" className="small">
                {SAVE}
              </button>
              <Link className="btn sec small" href={editorHref(form.name, {}, anchor)}>
                {CANCEL}
              </Link>
              {isRemovable(question) ? (
                <>
                  <span className="spacer" aria-hidden="true" />
                  {/* The first of two presses: it asks again, in place, and
                      removes nothing. */}
                  <Link
                    className="btn sec small danger"
                    href={editorHref(form.name, { question: question.key, removingQuestion: '1' }, anchor)}
                  >
                    {REMOVE_QUESTION}
                  </Link>
                </>
              ) : null}
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

/** The page a question is on, by its id. */
const pageOf = (form: IntakeForm, key: string): string =>
  form.pages.find((page) => page.questions.some((question) => question.key === key))?.id ?? ''

/**
 * The second press, in the row in place of its fields (Pastor feedback, ticket
 * 13; `.lavish/pastor-feedback/mock-forms-remove.html`): what is being removed,
 * what stops working where the product reads it, how many people's answers go
 * with it and that this cannot be undone, then the one button that removes and
 * one that keeps it. The side, while the first-time or one-to-two question is
 * worded from it, says so and offers only to keep it.
 */
const Removal = ({
  form,
  question,
  answered,
  state,
}: {
  readonly form: IntakeForm
  readonly question: FormQuestion
  readonly answered: number
  readonly state: EditorState
}) => {
  const anchor = `q-${question.key}`
  const needing = neededBy(form, question.key)
  const blocked = needing.length > 0
  const stops = isOwnQuestion(question) ? undefined : STOPS_WORKING[form.name][question.key]
  const deletes = removalDeletesAnswers(question.key)
  const people = deletes ? answered : 0
  const cost = deletes ? answersDeleted(people, stops !== undefined) : NOTHING_KEPT[question.key]
  return (
    <div className="fe-edit">
      {state.refusal ? (
        <p className="toast error" role="alert">
          {state.refusal}
        </p>
      ) : null}
      <div className="fe-warn fe-removal" role="alert">
        <strong>{removeTitle(question.wording)}</strong>
        {blocked ? (
          <p>{neededFirst(needing.map((each) => each.key))}</p>
        ) : (
          <>
            {stops ? <p>{stops}</p> : null}
            {cost ? <p>{cost}</p> : null}
          </>
        )}
      </div>
      <form method="post" action="/intake-forms/form/remove-question" className="btn-row">
        <input type="hidden" name="form" value={form.name} />
        <input type="hidden" name="key" value={question.key} />
        <input type="hidden" name="pageId" value={pageOf(form, question.key)} />
        {blocked ? null : (
          <button type="submit" className="small decline-yes">
            {removeIt(people)}
          </button>
        )}
        <Link className="btn sec small" href={editorHref(form.name, { question: question.key }, anchor)}>
          {KEEP_IT}
        </Link>
      </form>
    </div>
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
