import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, type TestClock } from '~/domain/clock'
import { ministryId } from '~/domain/ids'
import type { PhoneCheckAttempt, PhoneCheckEnding } from '~/domain/phone-check'
import { phoneNumber, type PhoneNumber } from '~/domain/roster'
import { createPhoneCheck, type PhoneCheck } from '~/service/phone-check'
import type { PhoneChecks, PhoneCheckUnit } from '~/service/ports'
import { createScriptedVerifier } from '../support/phone-verifier'

/**
 * Checking an Admin's own phone before their first test check-in (Exponential
 * launch, ticket 09), through the service a screen calls, with Twilio Verify and
 * the store both stood in for. The Postgres store is driven for real in
 * `tests/integration/checking-an-admins-phone.test.ts`, and the Twilio adapter in
 * `tests/platform/twilio-verify.test.ts`.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const grace = { userId: '11111111-1111-4111-8111-111111111111', ministryId: ministry }
const gracesPhone = phoneNumber('+13185550142')
const start = new Date('2026-11-05T15:00:00Z')

const minutes = (count: number) => count * 60_000

interface StoredAttempt {
  id: string
  userId: string
  phone: PhoneNumber
  startedAt: Date
  verificationSid: string | null
  codesTried: number
  ending: PhoneCheckEnding | null
  endedAt: Date | null
}

/** The store as plain arrays, keeping only what the port promises. */
const createMemoryPhoneChecks = (phones: Map<string, PhoneNumber>) => {
  const attempts: StoredAttempt[] = []
  const codes: { attemptId: string; at: Date }[] = []

  const attemptOf = (id: string) => attempts.find((attempt) => attempt.id === id)!

  const checks: PhoneChecks = {
    adminPhone: async (_ministryId, userId) => phones.get(userId) ?? null,
    isVerified: async (userId, phone) =>
      attempts.some((a) => a.userId === userId && a.phone === phone && a.ending === 'verified'),
    async transact(userId, phone, work) {
      const unit: PhoneCheckUnit = {
        async latestAttempt() {
          const mine = attempts.filter((a) => a.userId === userId && a.phone === phone)
          const latest = mine.at(-1)
          if (!latest) return null
          const sent = codes.filter((c) => c.attemptId === latest.id).map((c) => c.at.getTime())
          return {
            id: latest.id,
            lastCodeAt: new Date(Math.max(latest.startedAt.getTime(), ...sent)),
            verificationSid: latest.verificationSid,
            codesTried: latest.codesTried,
            ending: latest.ending,
          } satisfies PhoneCheckAttempt
        },
        async recentCodeRequests(since) {
          const recent = codes.filter((c) => c.at.getTime() > since.getTime())
          return {
            byAdmin: recent.filter((c) => attemptOf(c.attemptId).userId === userId).map((c) => c.at),
            toPhone: recent.filter((c) => attemptOf(c.attemptId).phone === phone).map((c) => c.at),
          }
        },
        async startAttempt(at) {
          const id = `attempt-${attempts.length + 1}`
          attempts.push({
            id,
            userId,
            phone,
            startedAt: at,
            verificationSid: null,
            codesTried: 0,
            ending: null,
            endedAt: null,
          })
          return id
        },
        async recordCodeRequest(attemptId, at) {
          codes.push({ attemptId, at })
        },
        async recordVerificationSid(attemptId, sid) {
          attemptOf(attemptId).verificationSid = sid
        },
        async recordTry(attemptId) {
          attemptOf(attemptId).codesTried++
        },
        async returnTry(attemptId) {
          attemptOf(attemptId).codesTried--
        },
        async end(attemptId, ending, at) {
          const attempt = attemptOf(attemptId)
          if (attempt.ending) return
          attempt.ending = ending
          attempt.endedAt = at
        },
      }
      return work(unit)
    },
  }

  return { checks, attempts, codes }
}

let clock: TestClock
let phones: Map<string, PhoneNumber>
let store: ReturnType<typeof createMemoryPhoneChecks>
let twilio: ReturnType<typeof createScriptedVerifier>
let phoneCheck: PhoneCheck

beforeEach(() => {
  clock = createTestClock(start)
  phones = new Map([[grace.userId, gracesPhone]])
  store = createMemoryPhoneChecks(phones)
  twilio = createScriptedVerifier()
  phoneCheck = createPhoneCheck({ checks: store.checks, verifier: twilio.verifier, clock })
  // The service logs what Twilio refused; the tests read the outcome instead.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sending a code', () => {
  it('texts a code to the phone on the Admin’s own Roster row', async () => {
    expect(await phoneCheck.sendCode(grace)).toEqual({ sent: gracesPhone })
    expect(twilio.sent).toEqual([gracesPhone])
  })

  it('refuses a number outside the US before Twilio is asked, and counts nothing', async () => {
    phones.set(grace.userId, phoneNumber('+14165550100'))

    expect(await phoneCheck.sendCode(grace)).toEqual({ refusal: 'phone_check.not_us' })
    expect(twilio.sent).toEqual([])
    expect(store.codes).toEqual([])
  })

  it('refuses an Admin with no phone on the Roster', async () => {
    phones.delete(grace.userId)

    expect(await phoneCheck.sendCode(grace)).toEqual({ refusal: 'phone_check.no_phone' })
    expect(twilio.sent).toEqual([])
  })

  it('sends nothing for a phone this Admin has already verified', async () => {
    await phoneCheck.sendCode(grace)
    await phoneCheck.confirmCode(grace, '123456')

    expect(await phoneCheck.sendCode(grace)).toEqual({ verified: gracesPhone })
    expect(twilio.sent).toHaveLength(1)
  })

  it('resends within the same attempt, so the tries already spent stay spent', async () => {
    await phoneCheck.sendCode(grace)
    await phoneCheck.confirmCode(grace, '000000')
    clock.advanceBy(minutes(2))

    await phoneCheck.sendCode(grace)

    expect(store.attempts).toHaveLength(1)
    expect(await phoneCheck.confirmCode(grace, '000001')).toEqual({
      refusal: 'phone_check.wrong_code',
      triesLeft: 3,
    })
  })

  it('stops at the fifth code in an hour', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await phoneCheck.sendCode(grace)).toEqual({ sent: gracesPhone })
      clock.advanceBy(minutes(1))
    }

    expect(await phoneCheck.sendCode(grace)).toEqual({ refusal: 'phone_check.too_many_codes' })
    expect(twilio.sent).toHaveLength(5)

    clock.advanceBy(minutes(60))
    expect(await phoneCheck.sendCode(grace)).toEqual({ sent: gracesPhone })
  })

  it('counts the codes sent to a phone by every Admin together', async () => {
    const jordan = { userId: '22222222-2222-4222-8222-222222222222', ministryId: ministry }
    phones.set(jordan.userId, gracesPhone)

    for (let i = 0; i < 5; i++) await phoneCheck.sendCode(i % 2 === 0 ? grace : jordan)

    expect(await phoneCheck.sendCode(jordan)).toEqual({ refusal: 'phone_check.too_many_codes' })
  })

  it('starts a new attempt once the last code has expired', async () => {
    await phoneCheck.sendCode(grace)
    clock.advanceBy(minutes(11))

    await phoneCheck.sendCode(grace)

    expect(store.attempts.map((a) => a.ending)).toEqual(['expired', null])
    // Ended when its code stopped working, not when somebody noticed.
    expect(store.attempts[0]!.endedAt).toEqual(new Date(start.getTime() + minutes(10)))
  })

  it('tells a refusal by the service’s country permissions as outside the US', async () => {
    twilio.answerSendsWith(async () => ({ refused: 'outside_permitted_countries' }))

    expect(await phoneCheck.sendCode(grace)).toEqual({ refusal: 'phone_check.not_us' })
  })

  it('says a code was not sent when Twilio refuses the number or fails', async () => {
    twilio.answerSendsWith(async () => ({ refused: 'undeliverable' }))
    expect(await phoneCheck.sendCode(grace)).toEqual({ refusal: 'phone_check.not_sent' })

    twilio.answerSendsWith(async () => {
      throw new Error('socket hang up')
    })
    expect(await phoneCheck.sendCode(grace)).toEqual({ refusal: 'phone_check.not_sent' })
  })

  it('counts a code Twilio failed to send against the limits', async () => {
    twilio.answerSendsWith(async () => {
      throw new Error('socket hang up')
    })
    for (let i = 0; i < 5; i++) await phoneCheck.sendCode(grace)

    expect(await phoneCheck.sendCode(grace)).toEqual({ refusal: 'phone_check.too_many_codes' })
  })
})

describe('checking a code', () => {
  it('verifies the phone when Twilio approves the code', async () => {
    await phoneCheck.sendCode(grace)

    expect(await phoneCheck.confirmCode(grace, '123 456')).toEqual({ verified: gracesPhone })
    expect(twilio.checked).toEqual([{ sid: 'VE1', code: '123456' }])
    expect(await phoneCheck.status(grace)).toEqual({ phone: gracesPhone, verified: true })
  })

  it('never asks again for a phone once verified, nor checks another code', async () => {
    await phoneCheck.sendCode(grace)
    await phoneCheck.confirmCode(grace, '123456')

    expect(await phoneCheck.confirmCode(grace, '999999')).toEqual({ verified: gracesPhone })
    expect(twilio.checked).toHaveLength(1)
  })

  it('asks again when the Admin’s phone changes', async () => {
    await phoneCheck.sendCode(grace)
    await phoneCheck.confirmCode(grace, '123456')

    phones.set(grace.userId, phoneNumber('+13185550199'))

    expect(await phoneCheck.status(grace)).toEqual({
      phone: phoneNumber('+13185550199'),
      verified: false,
    })
  })

  it('says how many tries are left after a wrong code', async () => {
    await phoneCheck.sendCode(grace)

    expect(await phoneCheck.confirmCode(grace, '000000')).toEqual({
      refusal: 'phone_check.wrong_code',
      triesLeft: 4,
    })
  })

  it('ends the attempt at the fifth wrong code, and cancels it at Twilio', async () => {
    await phoneCheck.sendCode(grace)
    for (let i = 0; i < 4; i++) await phoneCheck.confirmCode(grace, '000000')

    expect(await phoneCheck.confirmCode(grace, '000000')).toEqual({
      refusal: 'phone_check.attempt_ended',
    })
    expect(twilio.canceled).toEqual(['VE1'])

    // Even the right code is refused now, without asking Twilio.
    expect(await phoneCheck.confirmCode(grace, '123456')).toEqual({
      refusal: 'phone_check.attempt_ended',
    })
    expect(twilio.checked).toHaveLength(5)
  })

  it('starts afresh with a new code after an ended attempt', async () => {
    await phoneCheck.sendCode(grace)
    for (let i = 0; i < 5; i++) await phoneCheck.confirmCode(grace, '000000')

    await phoneCheck.sendCode(grace)

    expect(await phoneCheck.confirmCode(grace, '123456')).toEqual({ verified: gracesPhone })
  })

  it('does not spend a try on something that is not a code', async () => {
    await phoneCheck.sendCode(grace)

    expect(await phoneCheck.confirmCode(grace, '12345')).toEqual({
      refusal: 'phone_check.malformed_code',
    })
    expect(twilio.checked).toEqual([])
    expect(await phoneCheck.confirmCode(grace, '000000')).toMatchObject({ triesLeft: 4 })
  })

  it('refuses a code when none was sent', async () => {
    expect(await phoneCheck.confirmCode(grace, '123456')).toEqual({
      refusal: 'phone_check.no_code',
    })
    expect(twilio.checked).toEqual([])
  })

  it('refuses a code when sending it had failed', async () => {
    twilio.answerSendsWith(async () => ({ refused: 'undeliverable' }))
    await phoneCheck.sendCode(grace)

    expect(await phoneCheck.confirmCode(grace, '123456')).toEqual({
      refusal: 'phone_check.no_code',
    })
  })

  it('refuses a code ten minutes after it was sent, without asking Twilio', async () => {
    await phoneCheck.sendCode(grace)
    clock.advanceBy(minutes(10))

    expect(await phoneCheck.confirmCode(grace, '123456')).toEqual({
      refusal: 'phone_check.code_expired',
    })
    expect(twilio.checked).toEqual([])
  })

  it('takes Twilio’s word that a verification is gone', async () => {
    await phoneCheck.sendCode(grace)
    twilio.judgeWith(async () => 'gone')

    expect(await phoneCheck.confirmCode(grace, '123456')).toEqual({
      refusal: 'phone_check.code_expired',
    })
    expect(store.attempts[0]!.ending).toBe('expired')
  })

  it('takes Twilio’s word that its own tries are used up', async () => {
    await phoneCheck.sendCode(grace)
    twilio.judgeWith(async () => 'tries_used_up')

    expect(await phoneCheck.confirmCode(grace, '123456')).toEqual({
      refusal: 'phone_check.attempt_ended',
    })
    expect(store.attempts[0]!.ending).toBe('wrong_codes')
  })

  it('gives the try back when Twilio could not judge the code', async () => {
    await phoneCheck.sendCode(grace)
    twilio.judgeWith(async () => {
      throw new Error('503')
    })

    expect(await phoneCheck.confirmCode(grace, '123456')).toEqual({
      refusal: 'phone_check.not_checked',
    })
    expect(store.attempts[0]!.codesTried).toBe(0)
  })
})

describe('where an Admin stands', () => {
  it('names the phone and whether it is verified', async () => {
    expect(await phoneCheck.status(grace)).toEqual({ phone: gracesPhone, verified: false })
  })

  it('has no phone for an Admin with no Roster row', async () => {
    phones.delete(grace.userId)
    expect(await phoneCheck.status(grace)).toEqual({ phone: null, verified: false })
  })
})
