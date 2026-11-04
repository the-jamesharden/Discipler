'use client'

import { useEffect, useRef } from 'react'
import { loadTurnstile, widgetSizeFor } from '../../turnstile-widget'

/**
 * Cloudflare Turnstile on the page, the other half of `src/platform/cloudflare/turnstile.ts`
 * (Exponential launch, tickets 11 and 25). The token it hands over goes to the server,
 * which is the only thing that judges it, and is good once, so the parent remounts this
 * with a new `key` after any answer that spent one.
 *
 * Rendered by hand because Turnstile's automatic rendering scans the page only when its
 * script loads, which misses a page reached by a client navigation. It shows nothing
 * unless it needs somebody to press something.
 */

export const HumanCheck = ({
  siteKey,
  action,
  onToken,
}: {
  readonly siteKey: string
  readonly action: string
  /** A token, or an empty string once the last one is no longer good. */
  readonly onToken: (token: string) => void
}) => {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let left = false
    let widget: string | undefined

    loadTurnstile()
      .then(() => {
        if (left || !box.current || !window.turnstile) return
        widget = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          appearance: 'interaction-only',
          // Discipler is light only, and left to itself the widget follows the device's dark mode.
          theme: 'light',
          size: widgetSizeFor(box.current),
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        })
      })
      // Nothing to show. With no token Send stays on the form's own sentence, which
      // names support@ as the way round.
      .catch(() => onToken(''))

    return () => {
      left = true
      if (widget) window.turnstile?.remove(widget)
    }
  }, [siteKey, action, onToken])

  return <div className="contact-human-check" ref={box} />
}
