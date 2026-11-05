/**
 * What a browser is told to refuse (Exponential launch, ticket 37; finding F3 of
 * `.scratch/security-hardening/spec.md`).
 *
 * **No imports**, deliberately: `next.config.ts` loads this before anything is compiled,
 * and `middleware.ts` runs it on the edge runtime, as `src/platform/deployment.ts` is.
 *
 * The plain headers go on every response through `next.config.ts`. The
 * Content-Security-Policy goes on through `middleware.ts`, because it holds a nonce and a
 * nonce is one request's.
 *
 * **Adding to the policy.** One policy serves every page, so a new page that needs a new
 * host adds it to a list here, with a line in `tests/platform/the-security-headers.test.ts`
 * saying why. Nothing else needs doing for anything same-origin: a same-origin script,
 * stylesheet, image, font, video or `fetch` is already allowed. Three things will fail
 * silently if nobody thinks of them:
 *
 * - **An inline script does not run.** Next's own carry the nonce. Discipler's have none:
 *   put it in a client component, or `public/scripts/` and `next/script` with `src`. A
 *   `next/script` with inline children cannot hold a nonce across a client navigation,
 *   because the document's policy keeps the nonce it arrived with.
 * - **A form that posts here and is redirected elsewhere is stopped by `form-action`**,
 *   in Chrome, at the redirect. The destination has to be in `FORM_LEADS_TO`.
 * - **No page may be framed, not even by another of Discipler's.**
 */

/** A list of source expressions, one for each thing the browser may reach. */
type Sources = readonly string[]

const TURNSTILE = 'https://challenges.cloudflare.com'

/** Stripe.js, as "Content Security Policy" in Stripe's security guide lists it. */
const STRIPE_JS: Sources = ['https://js.stripe.com', 'https://*.js.stripe.com']
/** The frame a card's 3D Secure opens in. */
const STRIPE_REDIRECTS = 'https://hooks.stripe.com'
const STRIPE_API = 'https://api.stripe.com'
/** Link's sign-in, which the same guide lists on top of Stripe.js. */
const STRIPE_LINK: Sources = ['https://link.com', 'https://*.link.com']

/**
 * The two places a Help or onboarding video plays from in a frame (ticket 27). YouTube only
 * through its no-cookie address. A video file on another host would need `media-src`.
 */
const VIDEO_PLAYERS: Sources = ['https://www.youtube-nocookie.com', 'https://www.loom.com']

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com'
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com'

/**
 * Where a form may lead. Stripe's billing page is reached by a POST that redirects to it
 * (ticket 33), and `form-action` is applied to the redirect as well.
 */
const FORM_LEADS_TO: Sources = ["'self'", 'https://billing.stripe.com']

/** The origin of a project's address, or nothing when there is none to read. */
const originOf = (url: string | undefined): Sources => {
  if (!url) return []
  try {
    return [new URL(url).origin]
  } catch {
    return []
  }
}

export interface PolicyFor {
  /** New for each request. */
  readonly nonce: string
  /** `NEXT_PUBLIC_SUPABASE_URL`: a Material's file goes straight from the browser to Storage. */
  readonly supabaseUrl: string | undefined
  /** `next dev` evaluates scripts and holds a socket open, and no built server does either. */
  readonly development: boolean
}

export const contentSecurityPolicy = ({ nonce, supabaseUrl, development }: PolicyFor): string => {
  const directives: Readonly<Record<string, Sources>> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      TURNSTILE,
      ...STRIPE_JS,
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    // Inline, because server rendering writes `style` attributes throughout, and Stripe's
    // and Cloudflare's scripts set them on the frames they make. No nonce: its presence
    // would make a browser ignore 'unsafe-inline'.
    'style-src': ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS],
    'font-src': ["'self'", GOOGLE_FONTS_FILES],
    // `data:` for the Intake QR codes.
    'img-src': ["'self'", 'data:', ...STRIPE_LINK.slice(1)],
    'connect-src': [
      "'self'",
      ...originOf(supabaseUrl),
      STRIPE_API,
      ...STRIPE_LINK,
      // Not only a stylesheet: the Payment Element's `fonts` option fetches its CSS.
      GOOGLE_FONTS_CSS,
      ...(development ? ['ws:'] : []),
    ],
    'frame-src': [TURNSTILE, ...STRIPE_JS, STRIPE_REDIRECTS, ...STRIPE_LINK, ...VIDEO_PLAYERS],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': FORM_LEADS_TO,
    'frame-ancestors': ["'none'"],
  }

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}

/** Random, and new for each request. Base64, so it fits a nonce's grammar and any header. */
export const newNonce = (): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))

/**
 * On every response, through `next.config.ts`.
 *
 * `X-Frame-Options` for a browser too old for `frame-ancestors`, which the policy says too.
 * Two years of `Strict-Transport-Security`, without `preload`, which is a list that is slow
 * to get off and a decision about the whole domain and not just this app.
 */
export const SECURITY_HEADERS: readonly { readonly key: string; readonly value: string }[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Not to be loosened: Invitation, Material and reset links hold their tokens in the path,
  // and this keeps the path out of every other site's logs.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
]
