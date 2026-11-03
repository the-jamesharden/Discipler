'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The tab row on a phone: three tab names at a time, a discreet "›" at the right end
 * for the other three and a "‹" to slide back, each shown only when there is more
 * that way (`.scratch/exponential-launch/spec.md`, "Search, nav and Settings"). On a
 * wider window every tab fits and the arrows are not drawn (`.tabs-wrap` in
 * `public/discipler.css`).
 *
 * The arrows are the only part that needs a script, so without one they stay hidden
 * and the row still slides under a thumb. Every tab is its own route, so the row is
 * new on each page; it opens on the three that hold the current tab rather than on
 * the first three, which would hide where the Admin is.
 */

const PER_VIEW = 3
/** Short of the row's end by less than this, there is no more to show. */
const SLACK = 4

export const TabSlider = ({ children }: { readonly children: ReactNode }) => {
  const wrap = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ prev: false, next: false })

  const row = () => wrap.current?.querySelector<HTMLElement>('.tabs') ?? null

  useLayoutEffect(() => {
    const tabs = row()
    if (!tabs) return

    const sync = () => {
      const prev = tabs.scrollLeft > SLACK
      const next = tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - SLACK
      setMore((was) => (was.prev === prev && was.next === next ? was : { prev, next }))
    }

    const items = [...tabs.children] as HTMLElement[]
    const current = items.findIndex((item) => item.querySelector('[aria-current="page"]'))
    if (current >= 0 && tabs.scrollWidth > tabs.clientWidth) {
      const first = items[current - (current % PER_VIEW)]
      if (first) tabs.scrollTo({ left: first.offsetLeft - tabs.offsetLeft, behavior: 'instant' })
    }

    sync()
    tabs.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)

    return () => {
      tabs.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  const slide = (direction: 1 | -1) => {
    const tabs = row()
    if (tabs) tabs.scrollBy({ left: direction * tabs.clientWidth })
  }

  return (
    <div className="tabs-wrap" ref={wrap}>
      <button
        type="button"
        className={more.prev ? 'tab-arrow prev on' : 'tab-arrow prev'}
        aria-label="Earlier tabs"
        onClick={() => slide(-1)}
      >
        ‹
      </button>
      {children}
      <button
        type="button"
        className={more.next ? 'tab-arrow next on' : 'tab-arrow next'}
        aria-label="More tabs"
        onClick={() => slide(1)}
      >
        ›
      </button>
    </div>
  )
}
