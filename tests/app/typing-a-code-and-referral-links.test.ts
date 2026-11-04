import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as referralLink } from '../../app/r/[code]/route'
import { POST as applyCode } from '../../app/signup/apply-code/route'

/**
 * "Have a code?" and `/r/<code>` (Exponential launch, ticket 20), through their routes.
 * Neither touches a database: the first reads the rule and the second reads nothing.
 */

const apply = (code?: string) =>
  applyCode(
    new NextRequest('http://127.0.0.1:3211/signup/apply-code', {
      method: 'POST',
      body: new URLSearchParams(code === undefined ? {} : { code }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }),
  )

const follow = (code: string) =>
  referralLink(new NextRequest(`https://app.trydiscipler.com/r/${encodeURIComponent(code)}`), {
    params: Promise.resolve({ code }),
  })

beforeEach(() => {
  vi.stubEnv('SIGN_UP_OPEN', 'true')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('applying a typed code', () => {
  it.each(['EXPO26', 'expo26', ' Expo26 '])('takes %j, and answers it as it is carried', async (typed) => {
    const response = await apply(typed)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ code: 'EXPO26' })
  })

  it.each(['EXPO25', '', 'x'.repeat(5000)])('does not recognize %j, and the trial still applies', async (typed) => {
    const response = await apply(typed)

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      refusal: 'offer.code_unknown',
      message: "We don't recognize that code, but your free trial still applies.",
    })
  })

  it('reads no code at all as one nobody recognizes', async () => {
    expect((await apply()).status).toBe(422)
  })

  it('refuses it after the end of its last day, Pacific', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-12T08:00:00Z'))

    const response = await apply('expo26')

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      refusal: 'offer.code_expired',
      message: 'That code has expired, but your free trial still applies.',
    })
  })

  it('still takes it at the last minute of that day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-12T07:59:00Z'))

    expect((await apply('EXPO26')).status).toBe(200)
  })

  it('is not there while sign-up is shut', async () => {
    vi.stubEnv('SIGN_UP_OPEN', '')

    const response = await apply('EXPO26')

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })
})

describe('a referral link', () => {
  it('goes to sign-up carrying the code', async () => {
    const response = await follow('k7m2qp9xab')

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.trydiscipler.com/signup?ref=k7m2qp9xab')
  })

  it('says the same for any code, because it asks nothing about it', async () => {
    const answers = await Promise.all(['0000000000', 'zzzzzzzzzz'].map(follow))

    expect(answers.map((answer) => answer.status)).toEqual([307, 307])
    expect(answers.map((answer) => answer.headers.get('location'))).toEqual([
      'https://app.trydiscipler.com/signup?ref=0000000000',
      'https://app.trydiscipler.com/signup?ref=zzzzzzzzzz',
    ])
    expect([...answers[0]!.headers.keys()].sort()).toEqual([...answers[1]!.headers.keys()].sort())
  })

  it('does not repeat something that could not be a code', async () => {
    const response = await follow('"><script>')

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.trydiscipler.com/signup')
  })

  it('is not there while sign-up is shut', async () => {
    vi.stubEnv('SIGN_UP_OPEN', '')

    const response = await follow('k7m2qp9xab')

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
  })
})
