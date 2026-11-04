'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { EMAIL_PAGE, INVITED_BANNER, OFFER_SCREEN } from '../copy'
import { carrying, signUpHref } from '../flow'
import { postToSignUp } from '../post'
import { EmailAndPhoneForm } from './form'

/** Confetti's colours and how long it runs, as the approved mock-up has them. */
const CONFETTI_COLOURS = ['#c9a86a', '#e6c98f', '#ffffff', '#f5f1eb', '#7faf8c', '#ddbb7a']
const CONFETTI_PIECES = 140
const CONFETTI_FADES_AFTER_MS = 2200
const CONFETTI_ENDS_AFTER_MS = 3000

/** Once, from the top and bottom edges, and not at all when the device asks for less motion. */
const fireConfetti = (canvas: HTMLCanvasElement): (() => void) => {
  const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const drawing = canvas.getContext('2d')
  if (noMotion || !drawing) return () => {}

  const scale = window.devicePixelRatio
  let width = 0
  let height = 0
  const fit = () => {
    width = canvas.width = canvas.clientWidth * scale
    height = canvas.height = canvas.clientHeight * scale
  }
  fit()
  window.addEventListener('resize', fit)

  const pieces = Array.from({ length: CONFETTI_PIECES }, (_, index) => {
    const fromTop = index % 2 === 0
    return {
      x: Math.random() * width,
      y: fromTop ? -20 : height + 20,
      across: (Math.random() - 0.5) * 6 * scale,
      down: (fromTop ? 1 : -1) * (6 + Math.random() * 9) * scale,
      gravity: (fromTop ? 0.05 : 0.22) * scale,
      size: (4 + Math.random() * 5) * scale,
      angle: Math.random() * Math.PI,
      turn: (Math.random() - 0.5) * 0.3,
      colour: CONFETTI_COLOURS[index % CONFETTI_COLOURS.length]!,
    }
  })

  const startedAt = performance.now()
  let frame = 0
  const draw = (now: number) => {
    const age = now - startedAt
    drawing.clearRect(0, 0, width, height)
    drawing.globalAlpha = Math.max(0, 1 - Math.max(0, age - CONFETTI_FADES_AFTER_MS) / 800)
    for (const piece of pieces) {
      piece.down += piece.gravity
      piece.x += piece.across
      piece.y += piece.down
      piece.angle += piece.turn
      drawing.save()
      drawing.translate(piece.x, piece.y)
      drawing.rotate(piece.angle)
      drawing.fillStyle = piece.colour
      drawing.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
      drawing.restore()
    }
    if (age < CONFETTI_ENDS_AFTER_MS) frame = requestAnimationFrame(draw)
    else drawing.clearRect(0, 0, width, height)
  }
  frame = requestAnimationFrame(draw)

  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', fit)
  }
}

/** Its one button is the only thing to reach, so the keyboard stays on it. */
const keepFocusHere = (event: KeyboardEvent) => {
  if (event.key === 'Tab') event.preventDefault()
}

/** The Exponential special offer over the whole screen (mock-up 1), closed by its button. */
const OfferScreen = ({ onClaim }: { readonly onClaim: () => void }) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const claim = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    claim.current?.focus()
    return canvas.current ? fireConfetti(canvas.current) : undefined
  }, [])

  return (
    <div className="takeover" role="dialog" aria-modal="true" aria-labelledby="offer-title" onKeyDown={keepFocusHere}>
      <canvas ref={canvas} className="confetti" aria-hidden="true" />
      <div className="takeover-inner">
        <p className="to-eyebrow">{OFFER_SCREEN.eyebrow}</p>
        <p className="to-big" id="offer-title">
          {OFFER_SCREEN.big}
        </p>
        <p className="to-then">{OFFER_SCREEN.then}</p>
        <p className="to-small">{OFFER_SCREEN.small}</p>
        <button ref={claim} type="button" className="to-go" onClick={onClaim}>
          {OFFER_SCREEN.claim}
        </button>
      </div>
    </div>
  )
}

/**
 * "Have a code?" and its one box (mock-up 6). The server decides, on its own clock: the
 * rule is `offerFor`'s, a browser's date is not to be believed, and a code that does not
 * apply leaves nothing carried, so sign-up goes on at the normal price.
 */
const HaveACode = ({ onApplied }: { readonly onApplied: (code: string) => void }) => {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const box = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) box.current?.focus()
  }, [open])

  if (!open) {
    return (
      <button type="button" className="have-code" onClick={() => setOpen(true)}>
        {EMAIL_PAGE.haveACode}
      </button>
    )
  }

  const apply = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setSaid(null)
    const answer = await postToSignUp<{ code: string }>('/signup/apply-code', { code: typed })
    setBusy(false)
    if (answer.ok) onApplied(answer.body.code)
    else setSaid(answer.message)
  }

  return (
    <form className="code-box" onSubmit={apply} noValidate>
      <label className="label" htmlFor="typed-code">
        {EMAIL_PAGE.yourCode}
      </label>
      <div className="code-row">
        <input
          ref={box}
          id="typed-code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-describedby={said ? 'code-said' : undefined}
        />
        <button type="submit" className="sec" disabled={busy}>
          {EMAIL_PAGE.apply}
        </button>
      </div>
      {said ? (
        <p className="code-said" id="code-said" role="status">
          {said}
        </p>
      ) : null}
    </form>
  )
}

/**
 * Everything on the email and phone page that depends on how somebody arrived (Exponential
 * launch, ticket 20), around the form, which does not.
 *
 * What the tab has been told lives in its address, replaced rather than pushed: a typed
 * code goes on as if it had been in the link, so every later page has it, and closing the
 * offer screen says `claimed`, so a reload does not open it again.
 */
export const EmailAndPhoneStep = ({
  triedEmail,
  carried: carriedOnArrival,
  offerScreen,
  invited,
  codeRefused,
  canTypeACode,
}: {
  readonly triedEmail: string | null
  readonly carried: string
  readonly offerScreen: boolean
  readonly invited: boolean
  readonly codeRefused: string | null
  readonly canTypeACode: boolean
}) => {
  const [carried, setCarried] = useState(carriedOnArrival)
  const [offerOpen, setOfferOpen] = useState(offerScreen)
  const [applied, setApplied] = useState(false)

  const carryOn = (next: string) => {
    setCarried(next)
    window.history.replaceState(null, '', signUpHref('email_and_phone', next))
  }

  return (
    <>
      {offerOpen ? (
        <OfferScreen
          onClaim={() => {
            setOfferOpen(false)
            carryOn(carrying(carried, 'claimed', '1'))
          }}
        />
      ) : null}
      {invited && !applied ? (
        <div className="offer">
          <span className="seal" aria-hidden="true">
            &#9733;
          </span>
          <span>
            <strong>{INVITED_BANNER.title}</strong>
            {INVITED_BANNER.line}
          </span>
        </div>
      ) : null}
      {codeRefused ? (
        <p className="code-said on-arrival" role="status">
          {codeRefused}
        </p>
      ) : null}
      <EmailAndPhoneForm triedEmail={triedEmail} carried={carried} />
      {canTypeACode && !applied ? (
        <HaveACode
          onApplied={(code) => {
            setApplied(true)
            setOfferOpen(true)
            carryOn(carrying(carried, 'code', code))
          }}
        />
      ) : null}
    </>
  )
}
