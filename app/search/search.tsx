'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import {
  Book,
  Calendar,
  Card,
  Form,
  Gear,
  Gift,
  Key,
  Mail,
  Megaphone,
  PageIcon,
  Pair,
  Pen,
  People,
  QuestionMark,
  Restart,
  Search as SearchIcon,
  Video,
} from '../icons'
import {
  ENTER,
  ESC,
  FROM_ANYWHERE,
  LOOKING,
  NAMES_FAILED,
  nothingFound,
  OR,
  SEARCH,
  SEARCH_PLACEHOLDER,
  TO_OPEN,
} from './copy'
import { labelParts, termsOf, type DirectoryIcon, type DirectoryRow } from './match'
import { directoryFor, pagesNow, type SearchNames } from './pages'

/**
 * Search (Exponential launch, ticket 24; `.lavish/top-nav-search/`, layout B). A
 * directory rather than a question box, opened with ⌘K, with `/` or from the bar at the
 * right end of the tab row.
 *
 * `SearchDirectory` is on every Admin page, in the top nav, so the keys work on the ones
 * with no tab row. `SearchBar` is on the ones with, and says "open" to it by an event,
 * because the two sit in different parts of the page.
 *
 * It reads nothing until it is opened, so a page that is only looked at makes no extra
 * call (`docs/adr/0023-a-page-is-one-read.md`), and it reads afresh each time, so
 * somebody added a minute ago is there. The pages are there at once and the names join
 * them. Every row is a plain link rather than a client navigation, so `/overview#rel-…`
 * lands on the card with `:target` set, and nothing is prefetched.
 *
 * A native `dialog` shown modally: the browser keeps focus inside it, closes it on Esc,
 * gives focus back to whatever had it, and draws it over everything else.
 */

const OPEN = 'discipler:search-open'
const CLOSED = 'discipler:search-closed'

const ICONS: Readonly<Record<DirectoryIcon, ComponentType>> = {
  page: PageIcon,
  gear: Gear,
  card: Card,
  form: Form,
  gift: Gift,
  key: Key,
  book: Book,
  restart: Restart,
  megaphone: Megaphone,
  calendar: Calendar,
  mail: Mail,
  video: Video,
  pen: Pen,
  help: QuestionMark,
  pair: Pair,
  people: People,
  material: Book,
}

/**
 * The shortcut as this keyboard says it. ⌘K as drawn, until a script can see it is not
 * an Apple keyboard, where Ctrl K is the same shortcut.
 */
const useShortcut = (): string => {
  const [apple, setApple] = useState(true)
  useEffect(() => setApple(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)), [])
  return apple ? '⌘K' : 'Ctrl K'
}

/** Whether a key press is somebody typing into a field, which search leaves alone. */
const isTypingIn = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches('input, textarea, select'))

const LabelOf = ({ label, terms }: { readonly label: string; readonly terms: readonly string[] }) => (
  <>
    {labelParts(label, terms).map((part, index) =>
      part.marked ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
    )}
  </>
)

const rowId = (index: number): string => `search-row-${index}`

export const SearchDirectory = ({ offerRefer }: { readonly offerRefer: boolean }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const reading = useRef<AbortController | null>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [names, setNames] = useState<SearchNames | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)
  const shortcut = useShortcut()

  const read = useCallback(() => {
    reading.current?.abort()
    const controller = new AbortController()
    reading.current = controller
    setFailed(false)

    fetch('/search', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Search answered ${response.status}`)
        setNames((await response.json()) as SearchNames)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
  }, [])

  const show = useCallback(() => {
    setQuery('')
    setActive(0)
    setOpen(true)
    read()
  }, [read])

  const close = useCallback(() => {
    reading.current?.abort()
    setOpen(false)
  }, [])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      input.current?.focus()
    }
    if (!open && element.open) element.close()
    if (!open) document.dispatchEvent(new Event(CLOSED))
  }, [open])

  useEffect(() => {
    const pressed = (event: globalThis.KeyboardEvent) => {
      const isCommandK =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k'
      const isSlash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey
      if (!isCommandK && !isSlash) return

      if (dialog.current?.open) {
        if (isCommandK) {
          event.preventDefault()
          close()
        }
        return
      }
      if (isTypingIn(event.target)) return

      event.preventDefault()
      for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.top-menu[open]')) {
        menu.open = false
      }
      show()
    }

    document.addEventListener('keydown', pressed)
    document.addEventListener(OPEN, show)
    return () => {
      document.removeEventListener('keydown', pressed)
      document.removeEventListener(OPEN, show)
    }
  }, [show, close])

  const groups = useMemo(() => directoryFor(query, names, pagesNow(offerRefer)), [query, names, offerRefer])
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups])
  const terms = useMemo(() => termsOf(query), [query])
  const typed = query.trim() !== ''
  const current = Math.min(active, Math.max(rows.length - 1, 0))

  const go = (row: DirectoryRow) => {
    close()
    if (row.newTab) window.open(row.href, '_blank', 'noopener,noreferrer')
    else window.location.assign(row.href)
  }

  const moved = (to: number) => {
    setActive(to)
    list.current?.querySelector(`#${rowId(to)}`)?.scrollIntoView({ block: 'nearest' })
  }

  const typedKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && rows.length > 0) {
      event.preventDefault()
      moved((current + 1) % rows.length)
    } else if (event.key === 'ArrowUp' && rows.length > 0) {
      event.preventDefault()
      moved((current - 1 + rows.length) % rows.length)
    } else if (event.key === 'Enter' && rows[current]) {
      event.preventDefault()
      go(rows[current])
    }
  }

  let index = -1

  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-label={SEARCH}
      onClose={close}
      // A press on the backdrop lands on the dialog itself; its contents fill it.
      onClick={(event) => {
        if (event.target === dialog.current) close()
      }}
    >
      {open ? (
        <>
          <div className="palette-input">
            <SearchIcon />
            <input
              ref={input}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={typedKey}
              placeholder={SEARCH_PLACEHOLDER}
              aria-label={SEARCH_PLACEHOLDER}
              role="combobox"
              aria-expanded="true"
              aria-controls="search-rows"
              aria-activedescendant={rows.length > 0 ? rowId(current) : undefined}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            <button type="button" className="palette-esc" onClick={close}>
              {ESC}
            </button>
          </div>

          <div className="palette-body" id="search-rows" role="listbox" aria-label={SEARCH} ref={list}>
            {groups.map((group) => (
              <div className="palette-group" key={group.heading}>
                {/* Seen and not read out: each row says where it opens, and a heading is no option. */}
                <h4 aria-hidden="true">{group.heading}</h4>
                {group.rows.map((row) => {
                  index += 1
                  const mine = index
                  const Icon = ICONS[row.icon]
                  return (
                    <a
                      key={`${row.href}:${row.label}`}
                      id={rowId(mine)}
                      className={mine === current ? 'palette-row on' : 'palette-row'}
                      href={row.href}
                      role="option"
                      aria-selected={mine === current}
                      {...(row.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      onMouseMove={() => setActive(mine)}
                      onClick={close}
                    >
                      {row.initials ? (
                        <span className="palette-mark palette-initials">{row.initials}</span>
                      ) : (
                        <span className="palette-mark">
                          <Icon />
                        </span>
                      )}
                      <span className="palette-words">
                        <span className="palette-label">
                          <LabelOf label={row.label} terms={typed ? terms : []} />
                        </span>
                        {row.sub ? <small>{row.sub}</small> : null}
                      </span>
                      <span className="palette-where">{row.where}</span>
                    </a>
                  )
                })}
              </div>
            ))}

            {typed && failed ? <p className="palette-note">{NAMES_FAILED}</p> : null}
            {typed && !failed && names === null ? <p className="palette-note">{LOOKING}</p> : null}
            {typed && !failed && names !== null && rows.length === 0 ? (
              <p className="palette-note">{nothingFound(query.trim())}</p>
            ) : null}
          </div>

          <div className="palette-foot">
            <span>
              <kbd>{ENTER}</kbd> {TO_OPEN}
            </span>
            <span>
              <kbd>{shortcut}</kbd> {OR} <kbd>/</kbd> {FROM_ANYWHERE}
            </span>
          </div>
        </>
      ) : null}
    </dialog>
  )
}

/**
 * The bar at the right end of the tab row, which grows when clicked and stays grown
 * while search is open. A button that looks like a field, because search is typed into
 * over the page and not here. With no script nothing could open, so it is not drawn.
 */
export const SearchBar = () => {
  const [grown, setGrown] = useState(false)
  const shortcut = useShortcut()

  useEffect(() => {
    const closed = () => setGrown(false)
    document.addEventListener(CLOSED, closed)
    return () => document.removeEventListener(CLOSED, closed)
  }, [])

  return (
    <>
      <noscript>
        <style>{'.search-bar { display: none; }'}</style>
      </noscript>
      <button
        type="button"
        className={grown ? 'search-bar on' : 'search-bar'}
        aria-label={SEARCH_PLACEHOLDER}
        aria-haspopup="dialog"
        onClick={() => {
          setGrown(true)
          document.dispatchEvent(new Event(OPEN))
        }}
      >
        <SearchIcon />
        <span className="search-bar-word">{SEARCH}</span>
        <kbd>{shortcut}</kbd>
      </button>
    </>
  )
}
