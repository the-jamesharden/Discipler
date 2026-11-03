import { afterEach, describe, expect, it, vi } from 'vitest'
import { HUMAN_CHECK_ACTIONS } from '~/domain/sign-up-attempt'
import { createTurnstile, turnstileConfig } from '~/platform/cloudflare/turnstile'

/**
 * Cloudflare's boundary, driven against a stubbed `fetch` (Exponential launch, ticket
 * 11). Cloudflare is never called in a test run: what is proved is the request
 * Discipler makes, that a yes needs all of `success`, `hostname` and `action`, and that
 * everything else is a no.
 */

const SECRET = 'a-secret-only-the-server-holds'
const turnstile = createTurnstile(() => ({ secret: SECRET, hostname: 'app.trydiscipler.com' }))
const action = HUMAN_CHECK_ACTIONS.startSignUp

const good = { success: true, hostname: 'app.trydiscipler.com', action }

const answering = (payload: unknown, status = 200) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('asking Cloudflare about a token', () => {
  it('posts the secret and the token to siteverify, and says yes on all three', async () => {
    const fetched = answering(good)

    expect(await turnstile.verify('the-token', action)).toBe(true)

    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(init.method).toBe('POST')
    const body = init.body as URLSearchParams
    expect(body.get('secret')).toBe(SECRET)
    expect(body.get('response')).toBe('the-token')
  })

  it.each([
    ['success is false', { ...good, success: false }],
    ['success is missing', { hostname: good.hostname, action }],
    ['success is only truthy', { ...good, success: 'true' }],
    ['the token was solved on another host', { ...good, hostname: 'discipler.evil.example' }],
    ['the hostname is missing', { success: true, action }],
    ['the token was issued for the other step', { ...good, action: HUMAN_CHECK_ACTIONS.openChurch }],
    ['the action is missing', { success: true, hostname: good.hostname }],
    ['the answer is not an object', null],
  ])('says no when %s', async (_why, payload) => {
    answering(payload)
    expect(await turnstile.verify('the-token', action)).toBe(false)
  })

  it('says no, and asks nothing, with no token or an impossibly long one', async () => {
    const fetched = answering(good)

    expect(await turnstile.verify('', action)).toBe(false)
    expect(await turnstile.verify('x'.repeat(2049), action)).toBe(false)
    expect(fetched).not.toHaveBeenCalled()
  })

  it('says no when Cloudflare does not answer, or answers nonsense', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await turnstile.verify('the-token', action)).toBe(false)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))
    expect(await turnstile.verify('the-token', action)).toBe(false)
  })

  it('refuses every token with the secret unset, without calling Cloudflare', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetched = answering(good)
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.trydiscipler.com')

    expect(turnstileConfig()).toBeNull()
    expect(await createTurnstile().verify('the-token', action)).toBe(false)

    expect(fetched).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('TURNSTILE_SECRET_KEY'))
  })

  it('reads the host a token must be from out of the app’s own address', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', SECRET)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.trydiscipler.com')
    expect(turnstileConfig()).toEqual({ secret: SECRET, hostname: 'app.trydiscipler.com' })
  })

  it('never logs the token or the secret, and names a key Cloudflare refused', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    answering({ success: false, 'error-codes': ['invalid-input-secret'] })

    await turnstile.verify('the-token', action)

    const said = logged.mock.calls.flat().join(' ')
    expect(said).toContain('invalid-input-secret')
    expect(said).not.toContain('the-token')
    expect(said).not.toContain(SECRET)
  })
})
