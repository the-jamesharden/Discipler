'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Cross } from '../icons'

/**
 * Where the browser keeps the last showing the card was shown in (Exponential
 * launch, ticket 29). One key, overwritten, so nothing piles up.
 */
const SHOWN_IN = 'discipler.unpaired-pop-up.shown-in'

/**
 * The unpaired pop-up's frame: whether it is on screen, and its close button.
 * What it says is drawn on the server and handed in.
 *
 * It shows on the first Overview visit of each showing (`showingOf`: one sign-in
 * on one of the church's days) and not again in it. The showing it was shown in
 * is written down the moment it shows, so closing it, moving to another tab and
 * coming back, or reloading the Overview all leave it put away until the next
 * sign-in or the next day. Opening a pair card or changing the growth chart is
 * not moving tab: the page re-renders around the card, which stays as it was.
 *
 * Remembered by the browser rather than the database: a sign-in is one browser's
 * already, the day is decided on the server against the church's zone, and a
 * page read must write nothing. Where the browser keeps nothing (a private
 * window that refuses storage), it shows on every visit rather than never.
 *
 * Never in the server's markup, so a visit that has seen it is not shown it for
 * a moment before the script puts it away.
 */
export const UnpairedPopUp = ({
  showing,
  label,
  dismiss,
  children,
}: {
  readonly showing: string
  readonly label: string
  readonly dismiss: string
  readonly children: ReactNode
}) => {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (shownIn() === showing) return
    remember(showing)
    setOpen(true)
  }, [showing])

  if (!open) return null
  return (
    <aside className="unpaired" aria-label={label}>
      <button type="button" className="x" aria-label={dismiss} onClick={() => setOpen(false)}>
        <Cross />
      </button>
      {children}
    </aside>
  )
}

const shownIn = (): string | null => {
  try {
    return window.localStorage.getItem(SHOWN_IN)
  } catch {
    return null
  }
}

const remember = (showing: string): void => {
  try {
    window.localStorage.setItem(SHOWN_IN, showing)
  } catch {
    // Kept nowhere, so it shows again next visit: better than never.
  }
}
