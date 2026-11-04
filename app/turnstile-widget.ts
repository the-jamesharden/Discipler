/**
 * Cloudflare's Turnstile script, as much of it as Discipler's human checks use: sign-up's,
 * the support form's and a forgotten password's. `Window` can only say one thing about it,
 * and the script must load only once even when a client navigation goes from one check to
 * another, so both live here rather than in any of them.
 *
 * Cloudflare has to be allowed by any Content-Security-Policy, for its script and its
 * frame (ticket 37).
 */
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** How wide Turnstile's normal widget is. Narrower than this it has to be the compact one. */
const FULL_WIDGET_WIDTH = 300

let loading: Promise<void> | undefined

/** Rejects if the script never arrives, and the next check to ask then tries again. */
export const loadTurnstile = (): Promise<void> => {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      loading = undefined
      reject(new Error('Turnstile did not load'))
    }
    document.head.append(script)
  })
  return loading
}

/** The widget that fits the box it is drawn in, which has to be laid out to measure. */
export const widgetSizeFor = (host: HTMLElement): 'normal' | 'compact' =>
  host.clientWidth >= FULL_WIDGET_WIDTH ? 'normal' : 'compact'

export interface TurnstileWidgetOptions {
  readonly sitekey: string
  readonly action: string
  readonly appearance?: 'interaction-only'
  readonly theme?: 'light'
  readonly size?: 'normal' | 'compact'
  readonly retry?: 'never'
  /** `execute` draws it and waits, so a token is made only when the page asks for one. */
  readonly execution?: 'execute'
  readonly callback: (token: string) => void
  readonly 'expired-callback'?: () => void
  /** Returning true tells Turnstile the page has handled the error itself. */
  readonly 'error-callback'?: () => boolean | void
  readonly 'timeout-callback'?: () => void
  readonly 'unsupported-callback'?: () => void
}

export interface TurnstileWidget {
  render(host: HTMLElement, options: TurnstileWidgetOptions): string | undefined
  execute(widget: string): void
  remove(widget: string): void
}

/**
 * Turnstile when a button is pressed, and not when the page opens, so a token is made
 * only when the page asks and cannot have run out while somebody was typing. Drawn in
 * `host`, where it shows itself only if Cloudflare needs somebody to press something.
 * It rejects when no token came. `done` takes the widget away once the token has been
 * answered, because a token is good once.
 */
export const passTurnstile = async (
  host: HTMLElement,
  siteKey: string,
  action: string,
): Promise<{ readonly token: string; readonly done: () => void }> => {
  await loadTurnstile()
  const { turnstile } = window
  if (!turnstile) throw new Error('Turnstile did not load')

  return new Promise((resolve, reject) => {
    const widget = turnstile.render(host, {
      sitekey: siteKey,
      action,
      execution: 'execute',
      appearance: 'interaction-only',
      // Discipler is light only, and left to itself the widget follows the device's dark mode.
      theme: 'light',
      size: widgetSizeFor(host),
      retry: 'never',
      callback: (token) => resolve({ token, done: () => widget && turnstile.remove(widget) }),
      'error-callback': () => {
        if (widget) turnstile.remove(widget)
        reject(new Error('Turnstile failed'))
        return true
      },
      'timeout-callback': () => {
        if (widget) turnstile.remove(widget)
        reject(new Error('Turnstile timed out'))
      },
      'unsupported-callback': () => reject(new Error('Turnstile is unsupported')),
    })
    if (widget) turnstile.execute(widget)
    else reject(new Error('Turnstile drew nothing'))
  })
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget
  }
}
