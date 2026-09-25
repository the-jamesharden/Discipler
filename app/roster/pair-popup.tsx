'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { initialsOf } from '../initials'
import { PAIR_POPUP, type RosterList } from './copy'
import { CANCEL } from './import-copy'
import { SIDE_FIELD, type PairSide } from './lists'

/**
 * What the two sides of the Pair popup share (Manual pairing, tickets 12 and 23):
 * the backdrop, the head, the refusal, the ways out, and a person's row. Each side
 * is a file of its own beside this one, `pair-popup-from-a-disciple.tsx` and
 * `pair-popup-from-a-discipler.tsx`, and work on one side edits that side's file
 * and never the other's. What belongs to both is changed here, once.
 *
 * The popup is the Roster's own page at `?pair=`, so the server sends it open, a
 * refresh keeps it open, and every way out is a link back to the list behind it.
 * It is fed from the document the Roster already read; opening it is no second read.
 *
 * Script is the improvement here as it is in the import dialog: the sentence, the
 * button's words and its disabled state follow the marks once script runs. The
 * form is an ordinary one to the existing pairing route, so it posts without
 * script, and the route refuses an empty choice as it always has.
 *
 * **One popup with the side as its state** (Roles per pairing, ticket 01). Nobody
 * is a Discipler or a Disciple; the popup asks which side of this one pairing the
 * person is on, directly under its title, and the two files beside this one are
 * its two sides. The side is in the address, so the chooser is two links and
 * switches with one press, with script or without.
 */

/** True once script runs. Disabling only then leaves an Admin without script able to post. */
export const useHydrated = (): boolean => {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

/**
 * The scrolling list, with what was restored from a refusal brought into view. A
 * restored choice may sit below the fold of a long list, and *everything restored*
 * has to be in front of the Admin. Once, on opening.
 */
export const PairList = ({
  exactlyOne,
  children,
}: {
  /** Round marks of which exactly one can be chosen, or boxes of which several can. */
  readonly exactlyOne: boolean
  readonly children: ReactNode
}) => {
  const listElement = useRef<HTMLElement | null>(null)
  useEffect(() => {
    listElement.current?.querySelector('input:checked')?.closest('label')?.scrollIntoView({ block: 'nearest' })
  }, [])
  // The list says when there is more below it (James, 2026-09-21): the groups sit
  // under the people, and a list that ends cleanly on a row looks finished. While
  // there is more to scroll to, its bottom edge fades; at the end it does not. Its
  // scrollbar is always there, in the stylesheet. Measured again whenever it is
  // scrolled or its size or its rows' size changes, which a shape's controls do.
  const [moreBelow, setMoreBelow] = useState(false)
  useEffect(() => {
    const list = listElement.current
    if (list === null) return
    const measure = () => {
      setMoreBelow(list.scrollHeight - list.scrollTop - list.clientHeight > 1)
      // How wide this browser draws the scrollbar, which the fade leaves alone:
      // eight pixels where it is styled, nothing where it floats over the rows.
      list.style.setProperty('--pair-scrollbar', `${list.offsetWidth - list.clientWidth}px`)
    }
    measure()
    list.addEventListener('scroll', measure, { passive: true })
    const resized = new ResizeObserver(measure)
    resized.observe(list)
    if (list.firstElementChild) resized.observe(list.firstElementChild)
    return () => {
      list.removeEventListener('scroll', measure)
      resized.disconnect()
    }
    // The rows' element is a different one for round marks and for boxes.
  }, [exactlyOne])
  const keepListElement = (element: HTMLElement | null) => {
    listElement.current = element
  }
  // Boxes are a fieldset, which is the grouping role natively; round marks are a
  // radiogroup, which no element is. What scrolls is a plain box around either: a
  // fieldset made to give way inside the popup's column does not clip its rows.
  return (
    <div ref={keepListElement} className={moreBelow ? 'pair-list more-below' : 'pair-list'}>
      {exactlyOne ? (
        <div className="pair-rows" role="radiogroup" aria-labelledby="pair-title">
          {children}
        </div>
      ) : (
        <fieldset className="pair-rows" aria-labelledby="pair-title">
          {children}
        </fieldset>
      )}
    </div>
  )
}

/**
 * One person's row: a mark, their initials, their name, and beneath it what the
 * side says about them, or why they cannot be chosen. A group is listed like a
 * person (Manual pairing, recut ticket 03), on a square so it is not taken for one.
 */
export const PairRow = ({
  mark,
  name,
  avatar = 'of_a_person',
  person,
  details,
  also = [],
  greyed,
  held = false,
  checked,
  onChange,
}: {
  /** Round where exactly one can be chosen, a box where several can. */
  readonly mark: 'radio' | 'checkbox'
  /** The field the mark posts as. */
  readonly name: string
  /** Round for a person, square for a group. */
  readonly avatar?: 'of_a_person' | 'of_a_group'
  /** Who the row is, or what: a group's row says what the group is called here. */
  readonly person: { readonly id: string; readonly fullName: string }
  /** Each missing detail is simply absent: a null is left out and no dash stands in for it. */
  readonly details: readonly (string | null)[]
  /**
   * What they do now, on a second line under the details (Roles per pairing,
   * ticket 01): *Discipled by Rachel Adams*, *In Tuesday Women's*. None says nothing.
   * A greyed row gives its reason in its place, as it does the details.
   */
  readonly also?: readonly string[]
  /**
   * Why they cannot be chosen, already in words, or null where they can (Manual
   * pairing, ticket 23). A greyed row is shown and says why. Whoever is not to be
   * shown at all was left off the list before it reached here.
   */
  readonly greyed: string | null
  /**
   * Held until script runs, though nothing is wrong with the row (Manual pairing,
   * recut ticket 03). The form is pointed at one route, and a mark that means the
   * other act needs script to point it there; until then it cannot be pressed, so a
   * form posted before script runs never makes something other than what was
   * marked. Which marks those are is the side's to say: it knows where the form
   * points. Not greyed, and given no reason: a moment later it is open.
   */
  readonly held?: boolean
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}) => (
  <label className={`pair-opt${checked ? ' on' : ''}${greyed ? ' off' : ''}`}>
    {/* Disabled is the whole of it: no mouse or key presses it, a screen reader
        says unavailable and then the reason, and no form posts it, with script or
        without. */}
    <input
      type={mark}
      name={name}
      value={person.id}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      disabled={greyed !== null || held}
      aria-describedby={greyed ? `pair-why-${person.id}` : undefined}
    />
    <span className={avatar === 'of_a_group' ? 'avatar of-a-group' : 'avatar'} aria-hidden="true">
      {initialsOf(person.fullName)}
    </span>
    <span className="pair-who">
      <span className="pair-name">{person.fullName}</span>
      {/* The reason stands where the details would, as the mock has it: a row
          nobody can choose has no use for a number to ring. */}
      {greyed ? (
        <span className="pair-why" id={`pair-why-${person.id}`}>{greyed}</span>
      ) : (
        <>
          <span className="pair-sub">
            {/* Each detail wraps whole, with its dot behind it, so a line that wraps at
                phone width never opens on a dot. */}
            {details
              .filter((detail): detail is string => detail !== null)
              .map((detail, index, shown) => (
                <span key={index} className="pair-detail">
                  {index < shown.length - 1 ? `${detail} · ` : detail}
                </span>
              ))}
          </span>
          {also.length > 0 ? (
            <span className="pair-also">
              {/* Each item wraps whole, as a detail does. */}
              {also.map((item, index) => (
                <span key={index} className="pair-detail">
                  {index < also.length - 1 ? `${item} · ` : item}
                </span>
              ))}
            </span>
          ) : null}
        </>
      )}
    </span>
  </label>
)

/**
 * The heading over the people a side's list opens on (Roles per pairing, ticket
 * 01): who asked to be discipled, or who disciples somebody already or offered
 * to. Drawn only over somebody.
 */
export const ListedFirst = ({ side, children }: { readonly side: PairSide; readonly children: ReactNode }) => (
  <>
    <p className="pair-group-head">{PAIR_POPUP.listedFirst[side]}</p>
    {children}
  </>
)

/**
 * Everybody else the gender rule allows, folded under **Everyone else · N**
 * (Roles per pairing, ticket 01; James, 2026-09-24: *"this but we will come back
 * to it"*). Closed, and one press opens it, without script as well as with it: it
 * is the browser's own disclosure. It opens already where it holds what a refusal
 * restored, so everything restored is in front of the Admin, and where nothing is
 * listed above it, so a side with nobody usual does not open on a closed fold
 * alone. Once open or shut by the Admin it stays as they left it.
 */
export const EveryoneElse = ({
  count,
  opensOpen,
  children,
}: {
  /** Whoever is in it now: the count follows the rows as a Coed Group opens them. */
  readonly count: number
  /** Whether it is open when the popup opens. Read once. */
  readonly opensOpen: boolean
  readonly children: ReactNode
}) => {
  const [open, setOpen] = useState(opensOpen)
  return (
    <details className="pair-more" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {`${PAIR_POPUP.everyoneElse} `}
        <span>{`· ${count}`}</span>
      </summary>
      <div className="pair-rows">{children}</div>
    </details>
  )
}

/**
 * The side chooser, directly under the title (Roles per pairing, ticket 01): *In
 * this pairing, Emily* **Disciples somebody** · **Is discipled**. Two links to the
 * popup's own address on either side, so one press switches it with script or
 * without, keeping everything else in the address; the side it is on is the one
 * the page says is current. The preset only picked which of the two it opened on.
 */
const SideChooser = ({
  person,
  side,
}: {
  readonly person: { readonly fullName: string }
  readonly side: { readonly current: PairSide; readonly hrefs: Readonly<Record<PairSide, string>> }
}) => (
  <div className="pair-side">
    <span className="pair-side-who" id="pair-side-label">{PAIR_POPUP.inThisPairing(person.fullName)}</span>
    <nav className="seg-radio" aria-labelledby="pair-side-label">
      {(['discipler', 'disciple'] as const).map((each) => (
        <Link
          key={each}
          href={side.hrefs[each]}
          scroll={false}
          replace
          aria-current={side.current === each ? 'true' : undefined}
        >
          {PAIR_POPUP.side[each]}
        </Link>
      ))}
    </nav>
  </div>
)

export const PairPopupShell = ({
  person,
  list,
  side,
  refusal,
  posts,
  postsTo = 'create',
  summary,
  submit,
  grows = false,
  children,
}: {
  /** Whose row was pressed: who this popup pairs. */
  readonly person: { readonly id: string; readonly fullName: string }
  /** The list behind the popup, which every way out returns to and the receipt lands on. */
  readonly list: RosterList
  /** Which side of this pairing the person is on, and the popup's address on each side. */
  readonly side: { readonly current: PairSide; readonly hrefs: Readonly<Record<PairSide, string>> }
  /** Why the last submission was refused, already in words, if it was. */
  readonly refusal: string | undefined
  /** What the form posts without being asked, beside who the popup is for and the list behind it. */
  readonly posts: Readonly<Record<string, string>>
  /**
   * Which route takes the form, as what is chosen decides (Manual pairing, recut
   * ticket 03): the one that forms a relationship out of a selection, or the one
   * that puts somebody into a group that exists. Which of the two an Admin meant
   * is the form's action, never a field that happened to be present.
   */
  readonly postsTo?: 'create' | 'join'
  /**
   * The sentence saying exactly what is about to be made, or null with nothing to
   * make, and the words at its start drawn in bold, as the mock-ups draw who will
   * disciple whom (Roles per pairing, ticket 01), or null for none.
   */
  readonly summary: { readonly said: string; readonly bold: string | null } | null
  /** The button is the same act as the sentence. */
  readonly submit: { readonly label: string; readonly disabled: boolean }
  /**
   * Whether what is chosen adds controls beneath the list (Manual pairing, recut
   * ticket 02). A box that grows is held by its top edge and not centred, so it
   * grows downward and no row moves from under the pointer that just ticked it.
   */
  readonly grows?: boolean
  /** The side's own: who the list is for, its toolbar and its rows. */
  readonly children: ReactNode
}) => {
  const back = `/roster?${new URLSearchParams({ list })}`

  return (
    <div
      className="modal-bg open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pair-title"
      data-testid="pair-popup"
    >
      {/* The backdrop is a link like the other two ways out, under the popup and
          out of the tab order: the X and Cancel already say Close to a keyboard. */}
      <Link className="modal-backdrop" href={back} scroll={false} aria-hidden="true" tabIndex={-1} />

      <form method="post" action={`/roster/pair/${postsTo}`} className={grows ? 'modal pair grows' : 'modal pair'}>
        <input type="hidden" name="pair" value={person.id} />
        <input type="hidden" name="list" value={list} />
        <input type="hidden" name={SIDE_FIELD} value={side.current} />
        {Object.entries(posts).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <div className="modal-head">
          <h2 id="pair-title" className="card-title">{PAIR_POPUP.title(person.fullName)}</h2>
          <Link className="modal-close" href={back} scroll={false} aria-label={PAIR_POPUP.close}>
            ✕
          </Link>
        </div>

        <SideChooser person={person} side={side} />

        {refusal ? (
          <p className="toast error" role="alert">{refusal}</p>
        ) : null}

        {children}

        {summary ? (
          <p className="pair-summary" role="status">
            {summary.bold !== null && summary.said.startsWith(summary.bold) ? (
              <>
                <b>{summary.bold}</b>
                {summary.said.slice(summary.bold.length)}
              </>
            ) : (
              summary.said
            )}
          </p>
        ) : null}

        <div className="modal-actions">
          <Link className="btn sec" href={back} scroll={false}>
            {CANCEL}
          </Link>
          <button type="submit" disabled={submit.disabled}>
            {submit.label}
          </button>
        </div>
      </form>
    </div>
  )
}
