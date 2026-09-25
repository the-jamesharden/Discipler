'use client'

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { assignToCount, assignToTheTicked } from '../../assign-button'
import { TICKED_FIELD } from '../../assign-to-more'

/**
 * What script adds to a Material's assign page (Richer materials, ticket 02; M-3
 * of `.lavish/richer-materials/mockup.html`): the button counting the ticks as
 * they are made and disabled at none, and **Select all shown**.
 *
 * The script is the improvement and never the mechanism, as on the availability
 * grid. Every row is a real checkbox rendered on the server inside a real form,
 * so a browser that never runs this still ticks them one at a time and posts the
 * same form; its button promises no number, and the route refuses a press with
 * nothing ticked. Select all shown is drawn only once there is script to do it,
 * because a box that does nothing when ticked is worse than no box.
 *
 * Its words arrive as props, or from `../../assign-button`. `../../copy` is the
 * server's, and reading it from here would carry every sentence on the tab into
 * the browser.
 */
export const AssignPicker = ({
  title,
  filters,
  selectAll,
  cancel,
  children,
}: {
  /** The Material's title, which the button names. */
  readonly title: string
  /** The Men's / Women's filter, drawn by the page. */
  readonly filters: ReactNode
  readonly selectAll: string
  /** The way back to the folder, drawn by the page. */
  readonly cancel: ReactNode
  /** The groups of rows, drawn by the page. */
  readonly children: ReactNode
}) => {
  const rows = useRef<HTMLDivElement>(null)
  const all = useRef<HTMLInputElement>(null)
  /** How many are ticked of how many, or null until script has counted. */
  const [count, setCount] = useState<{ readonly ticked: number; readonly of: number } | null>(null)

  const boxes = (): HTMLInputElement[] => [
    ...(rows.current?.querySelectorAll<HTMLInputElement>(`input[name="${TICKED_FIELD}"]`) ?? []),
  ]

  /** Read off the checkboxes themselves, which are what the form will post. */
  const recount = () => {
    const every = boxes()
    setCount({ ticked: every.filter((box) => box.checked).length, of: every.length })
  }

  // A browser going Back can put the ticks back into the boxes by itself, and
  // those are what will be posted, whatever the page was drawn with.
  useEffect(recount, [])

  // Neither ticked nor clear while only some are: the box says so rather than
  // claiming all or none.
  useEffect(() => {
    if (all.current && count) all.current.indeterminate = count.ticked > 0 && count.ticked < count.of
  }, [count])

  const tickAll = (event: ChangeEvent<HTMLInputElement>) => {
    for (const box of boxes()) box.checked = event.target.checked
    recount()
  }

  return (
    <>
      <div className="pick-tools">
        {filters}
        {count !== null && count.of > 0 ? (
          <label className="check">
            <input
              ref={all}
              type="checkbox"
              checked={count.ticked === count.of}
              onChange={tickAll}
            />{' '}
            <span>{selectAll}</span>
          </label>
        ) : null}
      </div>
      <div ref={rows} onChange={recount}>
        {children}
      </div>
      <div className="pick-foot">
        {cancel}
        <button type="submit" disabled={count !== null && count.ticked === 0}>
          {count === null ? assignToTheTicked(title) : assignToCount(title, count.ticked)}
        </button>
      </div>
    </>
  )
}
