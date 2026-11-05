import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, SECURITY_HEADERS } from '~/platform/security-headers'

/**
 * What a browser is told to refuse (Exponential launch, ticket 37; finding F3 of
 * `.scratch/security-hardening/spec.md`). The policy is a pure function of the nonce and
 * the Supabase project, so each allowance is a line here, with the reason it is there.
 * That the browser then runs every page under it is `the-security-headers-over-http`,
 * and the rest was a look in a real browser (the ticket's Comments).
 */

const policy = (development = false) =>
  contentSecurityPolicy({
    nonce: 'abc123',
    supabaseUrl: 'https://project.supabase.co/some/path',
    development,
  })

const directive = (name: string, of = policy()): readonly string[] => {
  const found = of
    .split(';')
    .map((part) => part.trim().split(' '))
    .find(([each]) => each === name)
  if (!found) throw new Error(`The policy has no ${name}`)
  return found.slice(1)
}

describe('the headers every response carries', () => {
  const named = (key: string) => SECURITY_HEADERS.find((header) => header.key === key)?.value

  it('holds to HTTPS for two years, and takes nobody off this site with a token in the address', () => {
    expect(named('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains')
    // Invitation, Material and reset links carry their tokens in the path.
    expect(named('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('refuses to guess a type, or to be framed by a browser too old for frame-ancestors', () => {
    expect(named('X-Content-Type-Options')).toBe('nosniff')
    expect(named('X-Frame-Options')).toBe('DENY')
  })
})

describe('the Content-Security-Policy', () => {
  it('allows nothing not named, and nobody may frame a page', () => {
    expect(directive('default-src')).toEqual(["'self'"])
    expect(directive('frame-ancestors')).toEqual(["'none'"])
    expect(directive('object-src')).toEqual(["'none'"])
    expect(directive('base-uri')).toEqual(["'self'"])
  })

  it('runs an inline script only with this response nonce, never by being inline', () => {
    expect(directive('script-src')).toContain("'nonce-abc123'")
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
    expect(directive('script-src')).not.toContain("'unsafe-eval'")
  })

  it('loads Turnstile, as a script and as a frame', () => {
    expect(directive('script-src')).toContain('https://challenges.cloudflare.com')
    expect(directive('frame-src')).toContain('https://challenges.cloudflare.com')
  })

  it("allows everything Stripe's guide lists for Stripe.js", () => {
    for (const host of ['https://js.stripe.com', 'https://*.js.stripe.com']) {
      expect(directive('script-src')).toContain(host)
      expect(directive('frame-src')).toContain(host)
    }
    // A card that asks for 3D Secure.
    expect(directive('frame-src')).toContain('https://hooks.stripe.com')
    expect(directive('connect-src')).toContain('https://api.stripe.com')
  })

  it("allows everything Stripe's guide lists for Link", () => {
    for (const host of ['https://link.com', 'https://*.link.com']) {
      expect(directive('frame-src')).toContain(host)
      expect(directive('connect-src')).toContain(host)
    }
    expect(directive('img-src')).toContain('https://*.link.com')
  })

  it("plays the onboarding's video from YouTube's no-cookie address or Loom, and from no other YouTube", () => {
    expect(directive('frame-src')).toContain('https://www.youtube-nocookie.com')
    expect(directive('frame-src')).toContain('https://www.loom.com')
    expect(directive('frame-src')).not.toContain('https://www.youtube.com')
  })

  it("lets the Elements fetch the stylesheet behind their `fonts` option, which Stripe's guide puts under connect-src", () => {
    expect(directive('connect-src')).toContain('https://fonts.googleapis.com')
  })

  it("loads the site's own fonts", () => {
    expect(directive('style-src')).toContain('https://fonts.googleapis.com')
    expect(directive('font-src')).toEqual(["'self'", 'https://fonts.gstatic.com'])
  })

  it('allows the style attributes server rendering writes', () => {
    expect(directive('style-src')).toContain("'unsafe-inline'")
    // A nonce here would make a browser ignore 'unsafe-inline'.
    expect(directive('style-src').join(' ')).not.toContain('nonce')
  })

  it('allows the QR codes, which are data addresses', () => {
    expect(directive('img-src')).toContain('data:')
  })

  it("reaches this deployment's own Supabase project, for a Material's direct upload, by its origin alone", () => {
    expect(directive('connect-src')).toContain('https://project.supabase.co')
  })

  it('names no Supabase project when it was given none, rather than failing the request', () => {
    const without = contentSecurityPolicy({ nonce: 'n', supabaseUrl: undefined, development: false })
    expect(directive('connect-src', without).join(' ')).not.toContain('supabase')
    expect(directive('connect-src', without).join(' ')).not.toContain('undefined')
  })

  it("lets a form lead only here, or to Stripe's billing page, which a POST redirects to", () => {
    expect(directive('form-action')).toEqual(["'self'", 'https://billing.stripe.com'])
  })

  it('relaxes nothing on a server that is not in development', () => {
    expect(policy()).not.toContain('ws:')
    expect(directive('script-src', policy(true))).toContain("'unsafe-eval'")
    expect(directive('connect-src', policy(true))).toContain('ws:')
  })

  it('is one line, because it travels as a header', () => {
    expect(policy()).not.toMatch(/\n/)
  })
})
