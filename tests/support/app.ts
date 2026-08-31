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
export const cronSecret = ((): string | undefined => {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET

  try {
    const line = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
      .split('\n')
      .find((row) => row.trimStart().startsWith('CRON_SECRET='))

    return line?.slice(line.indexOf('=') + 1).trim() || undefined
  } catch {
    // No file is an ordinary state, not a failure: CI has none.
    return undefined
  }
})()

export const appIsRunning = await fetch(`${baseUrl}/login`, { redirect: 'manual' })
  .then((response) => response.ok)
  .catch(() => false)

export const skipUnlessAppIsRunning = !appIsRunning && !process.env.CI

export const cookiesFrom = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ')

export const signIn = async (ministry: MinistryFixture) => {
  const response = await fetch(`${baseUrl}/auth/sign-in`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      email: ministry.adminEmail,
      password: ministry.adminPassword,
    }),
  })

  return { response, cookie: cookiesFrom(response) }
}

export const getPage = async (path: string, cookie: string) => {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: { cookie } })
  return { response, html: await response.text() }
}
