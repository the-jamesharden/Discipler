'use client'

import Script from 'next/script'
import { useRef, useState } from 'react'
import { TRY_AGAIN } from './copy'
import { postToSignUp } from './post'

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** How wide Turnstile's normal widget is. Narrower than this it has to be the compact one. */
const FULL_WIDGET_WIDTH = 300

/**
 * Page one's whole job (Exponential launch, ticket 15): Cloudflare Turnstile, which
 * passes by itself when it can, and the page goes on by itself when it has.
 *
 * It says nothing about what it is doing, which James decided in the mock-up 1 review;
 * the widget draws its own "Verifying...". Words appear only when it could not pass.
 * Retrying is a reload rather than `turnstile.reset`, because a reload is also the one
 * thing that helps when Cloudflare's script never arrived.
 *
 * Cloudflare has to be allowed by any Content-Security-Policy, for its script and its
 * frame (ticket 37).
 */
export const HumanCheck = ({
  siteKey,
  action,
  next,
  couldNotPass,
}: {
  readonly siteKey: string | null
  /** `HUMAN_CHECK_ACTIONS.startSignUp`, handed in so the page and the route name one word. */
  readonly action: string
  readonly next: string
  readonly couldNotPass: string
}) => {
  const host = useRef<HTMLDivElement>(null)
  const drawn = useRef(false)
  const [refused, setRefused] = useState<string | null>(siteKey ? null : couldNotPass)

  const pass = async (token: string) => {
    const answer = await postToSignUp('/signup/human-check', { token })
    if (answer.ok) window.location.replace(next)
    else setRefused(answer.message)
  }

  const draw = () => {
    if (!siteKey || !window.turnstile || !host.current || drawn.current) return
    drawn.current = true
    window.turnstile.render(host.current, {
      sitekey: siteKey,
      action,
      // Discipler is light only, and left to itself the widget follows the device's dark mode.
      theme: 'light',
      size: host.current.clientWidth >= FULL_WIDGET_WIDTH ? 'normal' : 'compact',
      retry: 'never',
      callback: (token) => void pass(token),
      'error-callback': () => {
        setRefused(couldNotPass)
        return true
      },
      'timeout-callback': () => setRefused(couldNotPass),
      'unsupported-callback': () => setRefused(couldNotPass),
    })
  }

  return (
    <>
      {siteKey ? <Script src={TURNSTILE_SCRIPT} onReady={draw} onError={() => setRefused(couldNotPass)} /> : null}
      {siteKey ? <div ref={host} className="human-check" /> : null}
      {refused ? (
        <div className="human-check-refused">
          <p className="field-error" role="alert">
            {refused}
          </p>
          {siteKey ? (
            <button type="button" className="sec" onClick={() => window.location.reload()}>
              {TRY_AGAIN}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
