/**
 * Cloudflare's Turnstile script, as much of it as Discipler's two human checks use: the
 * sign-up page's and the support form's. `Window` can only say one thing about it, and
 * the script must load only once even when a client navigation goes from one check to
 * the other, so both live here rather than in either of them.
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

declare global {
  interface Window {
    turnstile?: TurnstileWidget
  }
}
