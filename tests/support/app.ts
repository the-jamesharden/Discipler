import { readFileSync } from 'node:fs'
import type { MinistryFixture } from './local-supabase'

/**
 * Driving the running app over HTTP rather than through a browser, so the surfaces
 * an Admin actually touches are covered by the suite rather than by someone's memory
 * of having clicked them once.
 *
 * Requires the app to be running (`npm run build && npm start`). Suites skip
 * themselves otherwise so a plain `npm test` does not fail for a reason unrelated to
 * the code -- but never under CI, where a silent pass would hide the only proof that
 * an Admin can reach their Roster at all.
 */

export const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:3000'

/**
 * The secret the *running app* was started with, discovered rather than chosen --
 * the same reason `local-supabase.ts` shells out to `supabase status` instead of
 * hard-coding keys. A test that picked its own would be proving the route agrees
 * with itself and nothing about whether the scheduler can reach it.
 *
 * `process.env` first, so `CRON_SECRET=... npm test` works in CI where there is no
 * `.env.local`; then the file, because a developer's server read it from there and
 * the test runner does not load it.
 */
const fromEnvironment = (name: string): string | undefined => {
  if (process.env[name]) return process.env[name]

  try {
    const line = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
      .split('\n')
      .find((row) => row.trimStart().startsWith(`${name}=`))

    return line?.slice(line.indexOf('=') + 1).trim() || undefined
  } catch {
    // No file is an ordinary state, not a failure: CI has none.
    return undefined
  }
}

export const cronSecret = fromEnvironment('CRON_SECRET')

/**
 * The same discovery, for the same reason, for the webhook's own credential.
 *
 * The inbound route verifies `X-Twilio-Signature` and refuses anything unsigned, so
 * a test that posts to it has to sign the way the vendor would. It signs rather than
 * being given a way round the guard: a test route past it is a guard that can be off
 * in production and green in CI.
 */
export const twilioAuthToken = fromEnvironment('TWILIO_AUTH_TOKEN')

export const appIsRunning = await fetch(`${baseUrl}/login`, { redirect: 'manual' })
  .then((response) => response.ok)
  .catch(() => false)

export const skipUnlessAppIsRunning = !appIsRunning && !process.env.CI

export const cookiesFrom = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ')

/**
 * A phone number and a password, which is the credential for every user. See
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
 */
export const signInAs = async (credential: {
  readonly phone: string
  readonly password: string
}) => {
  const response = await fetch(`${baseUrl}/auth/sign-in`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ phone: credential.phone, password: credential.password }),
  })

  return { response, cookie: cookiesFrom(response) }
}

export const signIn = async (ministry: MinistryFixture) =>
  signInAs({ phone: ministry.adminPhone, password: ministry.adminPassword })

export const getPage = async (path: string, cookie: string) => {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: { cookie } })
  return { response, html: await response.text() }
}
