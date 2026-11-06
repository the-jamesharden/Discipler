'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type { SetupStep } from '~/domain/setup-meter'
import { afterOnboardingCloses } from './overview/onboarding/hold'
import { SETUP_TITLE, type SetupMeterView, type SetupStepView } from './setup-meter-copy'

/**
 * The bar and the badge. The server draws both whole, so without a script the bar
 * still says where the church stands and still grows on hover and focus (`.setup` in
 * `public/discipler.css`), and "Thank you!" is still a form. What needs a script is
 * the tap on a phone, the confetti, and telling the server what has been played.
 *
 * A step this Admin has not seen is only ever played from here, and the server is told
 * at once rather than after the animation, so moving on mid-burst does not play it a
 * second time.
 */

const SEEN_ADDRESS = '/settings/setup-seen'
const CONFETTI = ['#c9a86a', '#7faf8c', '#2d5016', '#e6c98f', '#4a7c2e']

/** Long enough for the bar to finish growing before the first box pops. */
const OPENING_MS = 350
const BETWEEN_POPS_MS = 280
const POP_MS = 600
/** How long the grown bar stays after the last pop, before folding itself again. */
const LINGER_MS = 1600

/**
 * What this page load has played. A page moved to before the server's answer lands, or
 * one the browser restores from its cache, still says these are unseen, and must not
 * play them twice.
 */
const played = new Set<string>()

const stillPlease = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const tellTheServer = (fields: Record<string, string>) => {
  // Keepalive so it lands if the Admin has already moved on. A failure costs nothing
  // but a second playing on the next page.
  void fetch(SEEN_ADDRESS, {
    method: 'POST',
    body: new URLSearchParams({ ...fields, stay: 'yes' }),
    keepalive: true,
  }).catch(() => undefined)
}

/** One burst of confetti on a canvas, from a point in that canvas's own pixels. */
const burst = (
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  {
    pieces,
    launch,
    smallest,
    gravity,
    lasts,
  }: {
    readonly pieces: number
    /** How one piece sets off, in CSS pixels a frame. */
    readonly launch: () => { readonly vx: number; readonly vy: number }
    readonly smallest: number
    readonly gravity: number
    readonly lasts: number
  },
) => {
  const context = canvas.getContext('2d')
  if (!context) return

  const scale = window.devicePixelRatio
  canvas.width = canvas.clientWidth * scale
  canvas.height = canvas.clientHeight * scale

  const bits = Array.from({ length: pieces }, (_unused, index) => {
    const { vx, vy } = launch()
    return {
      x: x * scale,
      y: y * scale,
      vx: vx * scale,
      vy: vy * scale,
      size: (smallest + Math.random() * smallest) * scale,
      angle: Math.random() * 3,
      colour: CONFETTI[index % CONFETTI.length]!,
    }
  })

  const began = performance.now()
  const frame = (now: number) => {
    const age = now - began
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (age >= lasts) return

    context.globalAlpha = Math.max(0, 1 - age / lasts)
    for (const bit of bits) {
      bit.vy += gravity * scale
      bit.x += bit.vx
      bit.y += bit.vy
      bit.angle += 0.2
      context.save()
      context.translate(bit.x, bit.y)
      context.rotate(bit.angle)
      context.fillStyle = bit.colour
      context.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2)
      context.restore()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

const Tick = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

/** The green seal with a sprout and gold rays, with no word on it. */
const Seal = () => (
  <div className="seal" aria-hidden="true">
    <svg viewBox="0 0 120 120">
      <g className="rays">
        {Array.from({ length: 16 }, (_unused, ray) => (
          <path key={ray} d="M60 4l5 12h-10z" transform={`rotate(${ray * 22.5} 60 60)`} fill="#e6c98f" />
        ))}
      </g>
      <circle cx="60" cy="60" r="44" fill="#c9a86a" />
      <circle cx="60" cy="60" r="38" fill="#2d5016" />
      <circle cx="60" cy="60" r="38" fill="none" stroke="#e6c98f" strokeWidth="1.5" strokeDasharray="2 4" />
      <path d="M60 84V58" stroke="#e6c98f" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M60 64c-12 0-18-8-18-18 10 0 18 6 18 18zM60 58c0-12 7-19 19-19 0 12-7 19-19 19z" fill="#7faf8c" />
    </svg>
  </div>
)

const Badge = ({
  badge,
  steps,
  onThanks,
}: {
  readonly badge: NonNullable<SetupMeterView['badge']>
  readonly steps: readonly SetupStepView[]
  readonly onThanks: () => void
}) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const thanks = useRef<HTMLButtonElement>(null)
  const seal = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Nothing plays behind the onboarding modal, whose first opening is the same page.
    // The stylesheet keeps the badge out of sight until then.
    let timer = 0
    const holding = afterOnboardingCloses(() => {
      thanks.current?.focus()
      if (played.has('badge')) return
      played.add('badge')

      // It plays once whichever way the Admin leaves it, so this is said as it plays
      // and not on the button.
      tellTheServer({ steps: steps.map(({ step }) => step).join(','), badge: 'yes' })

      if (stillPlease() || !canvas.current) return
      const onCanvas = canvas.current
      timer = window.setTimeout(() => {
        const box = seal.current?.getBoundingClientRect()
        if (!box) return
        burst(onCanvas, box.left + box.width / 2, box.top + box.height / 2, {
          pieces: 140,
          // Out in every direction from the seal.
          launch: () => {
            const angle = Math.random() * Math.PI * 2
            const speed = 4 + Math.random() * 9
            return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4 }
          },
          smallest: 4,
          gravity: 0.22,
          lasts: 2200,
        })
      }, OPENING_MS)
    })
    return () => {
      holding()
      window.clearTimeout(timer)
    }
  }, [steps])

  return (
    <div className="modal-bg open badge-bg">
      <canvas className="badge-burst" ref={canvas} aria-hidden="true" />
      <div className="modal badge-card" role="dialog" aria-modal="true" aria-labelledby="badge-title">
        <div ref={seal}>
          <Seal />
        </div>
        <h2 id="badge-title">{badge.title}</h2>
        <p>{badge.body}</p>
        {/* A form so that it still closes with no script; with one, nothing reloads. */}
        <form
          method="post"
          action={SEEN_ADDRESS}
          onSubmit={(event) => {
            event.preventDefault()
            onThanks()
          }}
        >
          <input type="hidden" name="badge" value="yes" />
          <button type="submit" ref={thanks}>
            {badge.thanks}
          </button>
        </form>
      </div>
    </div>
  )
}

export const SetupMeterBar = ({ view }: { readonly view: SetupMeterView }) => {
  const bar = useRef<HTMLElement>(null)
  const pointer = useRef('')
  const [open, setOpen] = useState(false)
  // Steps to draw unticked for now, because their tick is still to come.
  const [waiting, setWaiting] = useState<ReadonlySet<SetupStep>>(new Set())
  const [popping, setPopping] = useState<ReadonlySet<SetupStep>>(new Set())
  const [gone, setGone] = useState(() => played.has('badge-closed'))

  const nextStep = view.steps.find(({ step }) => step === view.next) ?? null
  const hasBadge = view.badge !== null
  const unseen = view.unseen.join(',')

  useEffect(() => {
    // The badge says all of it at once, with every step marked seen as it plays.
    if (hasBadge) return

    const toPlay = view.unseen.filter((step) => !played.has(step))
    if (toPlay.length === 0) return

    let timers: readonly number[] = []

    // Not behind the onboarding modal, where the Admin would miss it and it would still
    // be marked seen.
    const holding = afterOnboardingCloses(() => {
      for (const step of toPlay) played.add(step)
      tellTheServer({ steps: toPlay.join(',') })

      // With reduced motion asked for they are simply ticked, as the server drew them.
      if (stillPlease()) return

      setWaiting(new Set(toPlay))
      setOpen(true)

      const pops = toPlay.map((step, index) =>
        window.setTimeout(() => {
          setWaiting((still) => new Set([...still].filter((other) => other !== step)))
          setPopping((now) => new Set([...now, step]))

          const canvas = bar.current?.querySelector('canvas')
          const box = bar.current?.querySelector(`[data-step="${step}"] .box`)?.getBoundingClientRect()
          const host = canvas?.getBoundingClientRect()
          if (canvas && box && host) {
            burst(canvas, box.left - host.left + box.width / 2, box.top - host.top + box.height / 2, {
              pieces: 60,
              // Up and out of the checkbox.
              launch: () => ({ vx: (Math.random() - 0.5) * 9, vy: -(3 + Math.random() * 7) }),
              smallest: 3,
              gravity: 0.28,
              lasts: 1300,
            })
          }

          window.setTimeout(() => {
            setPopping((now) => new Set([...now].filter((other) => other !== step)))
          }, POP_MS)
        }, OPENING_MS + index * BETWEEN_POPS_MS),
      )
      const fold = window.setTimeout(
        () => setOpen(false),
        OPENING_MS + toPlay.length * BETWEEN_POPS_MS + LINGER_MS,
      )
      timers = [...pops, fold]
    })

    return () => {
      holding()
      for (const timer of timers) window.clearTimeout(timer)
    }
    // `unseen` stands for the list, which is a new array on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen, hasBadge])

  // A press anywhere else folds a bar a tap opened.
  useEffect(() => {
    if (!open) return
    const pressed = (event: globalThis.PointerEvent) => {
      if (pointer.current !== 'touch' || bar.current?.contains(event.target as Node)) return
      bar.current?.blur()
      setOpen(false)
    }
    document.addEventListener('pointerdown', pressed)
    return () => document.removeEventListener('pointerdown', pressed)
  }, [open])

  if (gone) return null

  const tapped = (event: MouseEvent<HTMLElement>) => {
    // A mouse grows it by hovering, and a key by focusing. A tap has only this.
    if (pointer.current !== 'touch') return
    if (event.target instanceof Element && event.target.closest('a')) return
    if (open) bar.current?.blur()
    setOpen(!open)
  }

  return (
    <>
      <section
        ref={bar}
        className={open ? 'setup slim open' : 'setup slim'}
        aria-label={SETUP_TITLE}
        tabIndex={0}
        onPointerDown={(event: PointerEvent<HTMLElement>) => {
          pointer.current = event.pointerType
        }}
        onClick={tapped}
      >
        <canvas className="burst" aria-hidden="true" />
        <div className="setup-line">
          <strong>{SETUP_TITLE}</strong>
          <div className="mini" aria-hidden="true">
            <div style={{ width: `${view.filled}%` }} />
          </div>
          <span className="count">{view.count}</span>
          {nextStep?.action ? (
            <span className="next-line">
              <span>Next: {nextStep.words}</span>
              <Link href={nextStep.action.href} prefetch={false}>
                {nextStep.action.button}
              </Link>
            </span>
          ) : null}
        </div>
        <div className="more">
          <div>
            <ol className="steps">
              {view.steps.map(({ step, words, done, action }) => {
                const ticked = done && !waiting.has(step)
                const classes = [
                  'step',
                  ticked ? 'done' : null,
                  popping.has(step) ? 'popping' : null,
                  step === view.next ? 'next' : null,
                ]
                return (
                  <li key={step} data-step={step} className={classes.filter(Boolean).join(' ')}>
                    <span className="box" aria-hidden="true">
                      <Tick />
                    </span>
                    <span className="txt">
                      <span>{words}</span>
                      {done ? <span className="visually-hidden"> (done)</span> : null}
                    </span>
                    {action ? (
                      <Link className="go" href={action.href} prefetch={false}>
                        {action.button}
                      </Link>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </section>
      {view.badge ? (
        <Badge
          badge={view.badge}
          steps={view.steps}
          onThanks={() => {
            played.add('badge-closed')
            setGone(true)
          }}
        />
      ) : null}
    </>
  )
}
