'use client'

import { useEffect, useRef } from 'react'

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

interface Turnstile {
  render(
    container: HTMLElement,
    options: {
      readonly sitekey: string
      readonly action: string
      readonly appearance: 'interaction-only'
      readonly callback: (token: string) => void
      readonly 'expired-callback': () => void
      readonly 'error-callback': () => void
    },
  ): string
  remove(widget: string): void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<void> | undefined

const loadTurnstile = (): Promise<void> => {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      // So the next page to ask tries again.
      loading = undefined
      reject(new Error('Turnstile did not load'))
    }
    document.head.append(script)
  })
  return loading
}

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

  return <div className="human-check" ref={box} />
}
