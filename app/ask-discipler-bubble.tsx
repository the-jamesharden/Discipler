'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { LONGEST_QUESTION } from '~/domain/ask-discipler'
import { ASK, questionsLeftLine, stepsDoneLine } from './help/ask/copy'
import type { GuideReply } from './help/ask/reply'

/**
 * The bubble, its chat, and the tab it tucks into, as mock-up 4 draws them
 * (`.lavish/ai-guide/`).
 *
 * The chat is read the first time it is opened on a page and not before. What is said
 * after that is kept here, with a failed answer shown only to the one who saw it fail:
 * it is not stored, and is gone when the page is.
 *
 * Opening it hides the unpaired pop-up, by CSS and nothing else (`body:has(.ask-panel)`
 * in `discipler.css`), so the pop-up keeps its own state and is there again on closing.
 */

export interface AskDisciplerSetup {
  readonly done: number
  readonly of: number
  /** The next step with somewhere to go, or null where none has yet. */
  readonly next: { readonly words: string; readonly button: string; readonly href: string } | null
}

type Said =
  | { readonly kind: 'exchange'; readonly key: string; readonly question: string; readonly reply: GuideReply }
  | { readonly kind: 'question'; readonly key: string; readonly question: string }
  | { readonly kind: 'failed'; readonly key: string }

const icon = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** Face B, the Chat friend: a white speech bubble with a green smile. */
const Face = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <path
      d="M8 5.5h16a4.5 4.5 0 014.5 4.5v9a4.5 4.5 0 01-4.5 4.5H14l-5.6 4.4a.6.6 0 01-1-.5V23.4A4.5 4.5 0 013.5 19v-9A4.5 4.5 0 018 5.5z"
      fill="#fff"
    />
    <circle cx="12" cy="13" r="1.75" fill="#2d5016" />
    <circle cx="20" cy="13" r="1.75" fill="#2d5016" />
    <path d="M11.4 17.2 Q16 21.2 20.6 17.2" fill="none" stroke="#2d5016" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
)

const Book = () => (
  <svg {...icon}>
    <path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5" />
  </svg>
)

const Dots = () => (
  <div className="ask-dots" role="status" aria-label="Answering">
    <span />
    <span />
    <span />
  </div>
)

const Reply = ({ reply }: { readonly reply: GuideReply }) => (
  <div className="ask-msg ai">
    {/* Drawn by `guideReply`, which leaves no raw HTML, no image and no link but to a help page. */}
    <div dangerouslySetInnerHTML={{ __html: reply.html }} />
    <p className="src">
      <Book />
      <a href={reply.source.href} target="_blank" rel="noopener">
        {reply.source.label}
      </a>
    </p>
  </div>
)

const remember = (tucked: boolean): void => {
  // Stored for the next page. A failure leaves this page as pressed and the next as it was.
  void fetch('/help/ask/tuck', { method: 'POST', body: new URLSearchParams({ tucked: String(tucked) }) }).catch(
    () => undefined,
  )
}

export const AskDisciplerBubble = ({
  setup,
  tucked: tuckedAtFirst,
}: {
  readonly setup: AskDisciplerSetup | null
  readonly tucked: boolean
}) => {
  const [tucked, setTucked] = useState(tuckedAtFirst)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [said, setSaid] = useState<readonly Said[]>([])
  const [left, setLeft] = useState<number | null>(null)
  const [answering, setAnswering] = useState(false)
  const [typed, setTyped] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const bubble = useRef<HTMLButtonElement>(null)
  const next = useRef(0)
  const keyed = (): string => `said-${(next.current += 1)}`

  const atTheLimit = left === 0

  useEffect(() => {
    if (!open || loaded) return
    let stale = false
    fetch('/help/ask/chat')
      .then(async (response) => {
        if (!response.ok) return
        const chat = (await response.json()) as {
          readonly exchanges: readonly { readonly id: string; readonly question: string; readonly reply: GuideReply }[]
          readonly questionsLeft: number
        }
        if (stale) return
        // After, and not instead of, anything asked while this was on its way: its answer
        // is coming back to the place it holds.
        setSaid((since) => [
          ...chat.exchanges.map((one): Said => ({ kind: 'exchange', key: one.id, question: one.question, reply: one.reply })),
          ...since,
        ])
        setLeft(chat.questionsLeft)
      })
      // Nothing to show is the empty chat, and asking is still there to try.
      .catch(() => undefined)
      .finally(() => {
        if (!stale) setLoaded(true)
      })
    return () => {
      stale = true
    }
  }, [open, loaded])

  // Not on a phone, where it would put the keyboard over the starters and the next step
  // before anybody has chosen to type.
  const readyToType = useCallback(() => {
    if (window.matchMedia('(hover: hover)').matches) box.current?.focus()
  }, [])

  useEffect(() => {
    if (open) readyToType()
  }, [open, readyToType])

  useEffect(() => {
    const scroller = body.current
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [said, answering, loaded, atTheLimit])

  // The box grows with what is typed, up to the height the CSS allows.
  useEffect(() => {
    const field = box.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [typed, open])

  const close = useCallback(() => {
    setOpen(false)
    bubble.current?.focus()
  }, [])

  const ask = async (question: string) => {
    const asked = question.trim()
    if (asked === '' || answering || atTheLimit) return

    const key = keyed()
    setSaid((before) => [...before, { kind: 'question', key, question: asked }])
    setTyped('')
    setAnswering(true)
    // A starter pressed is gone from the page, and would take the focus with it.
    readyToType()

    try {
      const response = await fetch('/help/ask/question', {
        method: 'POST',
        body: new URLSearchParams({ question: asked }),
      })
      const answer = (await response.json()) as
        | { readonly kind: 'answered'; readonly reply: GuideReply; readonly questionsLeft: number }
        | { readonly kind: 'limit'; readonly questionsLeft: 0 }
        | { readonly kind: 'failed' | 'signed-out'; readonly questionsLeft?: number | null }

      if (answer.kind === 'answered') {
        setSaid((before) =>
          before.map((one) =>
            one.key === key ? { kind: 'exchange', key, question: asked, reply: answer.reply } : one,
          ),
        )
        setLeft(answer.questionsLeft)
      } else if (answer.kind === 'limit') {
        // Another tab reached the limit first. The limit's own message says the rest.
        setSaid((before) => before.filter((one) => one.key !== key))
        setLeft(0)
      } else {
        setSaid((before) => [...before, { kind: 'failed', key: keyed() }])
        if (typeof answer.questionsLeft === 'number') setLeft(answer.questionsLeft)
      }
    } catch {
      setSaid((before) => [...before, { kind: 'failed', key: keyed() }])
    } finally {
      setAnswering(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void ask(typed)
  }

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void ask(typed)
    }
  }

  if (tucked) {
    return (
      <button
        type="button"
        className="ask-tab"
        aria-label={ASK.untuck}
        onClick={() => {
          setTucked(false)
          remember(false)
        }}
      >
        <Face />
        <svg {...icon} className="chev" strokeWidth={2.6}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
    )
  }

  const before = setup !== null
  const leftLine = questionsLeftLine(left)
  const starters = before ? ASK.startersBefore : ASK.startersAfter
  const empty = loaded && said.length === 0 && !answering

  return (
    <>
      {open ? (
        <section
          className="ask-panel"
          role="dialog"
          aria-label={ASK.name}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
          }}
        >
          <div className="ask-head">
            <span className="ask-face">
              <Face />
              <span className="ai">AI</span>
            </span>
            <div className="ask-title">
              <strong>{ASK.name}</strong>
              <span>{ASK.subtitle}</span>
            </div>
            <button type="button" className="ask-icon" aria-label={ASK.close} onClick={close}>
              <svg {...icon}>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="ask-body" ref={body} aria-live="polite">
            {!loaded ? <Dots /> : null}
            {empty ? (
              <>
                <p className="ask-hello">{before ? ASK.helloBefore : ASK.helloAfter}</p>
                {setup?.next ? (
                  <div className="ask-next">
                    <p className="k">{ASK.yourNextStep}</p>
                    <div className="row">
                      <p className="t">{setup.next.words}</p>
                      <a className="btn small" href={setup.next.href}>
                        {setup.next.button}
                      </a>
                    </div>
                    <p className="ask-meter">{stepsDoneLine(setup.done, setup.of)}</p>
                  </div>
                ) : null}
                {atTheLimit ? null : (
                  <div className="ask-starters">
                    <p className="k">{ASK.tryAsking}</p>
                    {starters.map((question) => (
                      <button type="button" className="ask-chip" key={question} onClick={() => void ask(question)}>
                        {question}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : null}
            {said.map((one) =>
              one.kind === 'failed' ? (
                <div className="ask-msg ai err" key={one.key}>
                  <p>{ASK.failed}</p>
                </div>
              ) : (
                <div className="ask-exchange" key={one.key}>
                  <div className="ask-msg me">{one.question}</div>
                  {one.kind === 'exchange' ? <Reply reply={one.reply} /> : null}
                </div>
              ),
            )}
            {answering ? <Dots /> : null}
            {atTheLimit && loaded ? (
              <div className="ask-msg ai limit">
                <p>{ASK.limitLine}</p>
                <p>
                  {ASK.limitBeforeLink}
                  <a href="/help" target="_blank" rel="noopener">
                    {ASK.helpCenter}
                  </a>
                  {ASK.limitAfterLink}
                </p>
              </div>
            ) : null}
          </div>

          <div className="ask-foot">
            <form className="ask-box" onSubmit={submit}>
              <textarea
                ref={box}
                rows={1}
                value={typed}
                maxLength={LONGEST_QUESTION}
                placeholder={atTheLimit ? ASK.limitBox : ASK.placeholder}
                aria-label={ASK.yourQuestion}
                disabled={atTheLimit}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={onKey}
              />
              <button
                type="submit"
                className="ask-send"
                aria-label={ASK.send}
                disabled={atTheLimit || answering}
              >
                <svg {...icon} strokeWidth={2.4}>
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
            {leftLine ? <p className="ask-left">{leftLine}</p> : null}
            <p className="ask-warn">{ASK.warning}</p>
          </div>
        </section>
      ) : null}

      <div className="ask-wrap">
        <button
          type="button"
          ref={bubble}
          className={open ? 'ask-bubble open' : 'ask-bubble'}
          aria-label={ASK.name}
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          <Face />
          <span className="ai">AI</span>
        </button>
        {open ? null : (
          <button
            type="button"
            className="ask-tuck"
            aria-label={ASK.tuck}
            onClick={() => {
              setTucked(true)
              remember(true)
            }}
          >
            <svg {...icon} strokeWidth={3}>
              <path d="M6 12h12" />
            </svg>
          </button>
        )}
      </div>
      {open ? null : before ? (
        <span className="ask-label">{ASK.startOnboarding}</span>
      ) : (
        <span className="ask-label hover">{ASK.name}</span>
      )}
    </>
  )
}
