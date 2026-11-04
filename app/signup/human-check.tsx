'use client'

import { useEffect, useRef, useState } from 'react'
import { loadTurnstile, widgetSizeFor } from '../turnstile-widget'
import { TRY_AGAIN } from './copy'
import { postToSignUp } from './post'

/**
 * Page one's whole job (Exponential launch, ticket 15): Cloudflare Turnstile, which
 * passes by itself when it can, and the page goes on by itself when it has.
 *
 * It says nothing about what it is doing, which James decided in the mock-up 1 review;
 * the widget draws its own "Verifying...". Words appear only when it could not pass.
 * Retrying is a reload rather than `turnstile.reset`, because a reload is also the one
 * thing that helps when Cloudflare's script never arrived.
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

  useEffect(() => {
    if (!siteKey) return

    const pass = async (token: string) => {
      const answer = await postToSignUp('/signup/human-check', { token })
      if (answer.ok) window.location.replace(next)
      else setRefused(answer.message)
    }

    const draw = () => {
      if (!window.turnstile || !host.current || drawn.current) return
      drawn.current = true
      window.turnstile.render(host.current, {
        sitekey: siteKey,
        action,
        // Discipler is light only, and left to itself the widget follows the device's dark mode.
        theme: 'light',
        size: widgetSizeFor(host.current),
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

    loadTurnstile()
      .then(draw)
      .catch(() => setRefused(couldNotPass))
  }, [siteKey, action, next, couldNotPass])

  return (
    <>
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
