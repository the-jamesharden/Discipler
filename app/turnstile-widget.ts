/**
 * As much of Cloudflare's Turnstile script as Discipler's two human checks use, the
 * sign-up page's and the support form's. `Window` can only say one thing about it, so
 * the declaration lives here rather than in either of them.
 */
export interface TurnstileWidgetOptions {
  readonly sitekey: string
  readonly action: string
  readonly appearance?: 'interaction-only'
  readonly theme?: 'light'
  readonly size?: 'normal' | 'compact'
  readonly retry?: 'never'
  readonly callback: (token: string) => void
  readonly 'expired-callback'?: () => void
  /** Returning true tells Turnstile the page has handled the error itself. */
  readonly 'error-callback'?: () => boolean | void
  readonly 'timeout-callback'?: () => void
  readonly 'unsupported-callback'?: () => void
}

export interface TurnstileWidget {
  render(host: HTMLElement, options: TurnstileWidgetOptions): string | undefined
  remove(widget: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget
  }
}
