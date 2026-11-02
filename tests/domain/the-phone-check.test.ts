import { describe, expect, it } from 'vitest'
import { phoneNumber } from '~/domain/roster'
import {
  attemptStanding,
  codeRequestAllowed,
  isUsPhone,
  readPhoneCode,
  type PhoneCheckAttempt,
} from '~/domain/phone-check'

/**
 * The rules of checking an Admin's own phone with a texted code (Exponential
 * launch, ticket 09), as pure functions: which numbers may be sent a code at all,
 * what counts as a code, how many codes a phone and an Admin may be sent, and when
 * an attempt is over.
 */

describe('which numbers may be sent a code', () => {
  it('takes a number in the United States', () => {
    expect(isUsPhone(phoneNumber('+13185550142'))).toBe(true)
    expect(isUsPhone(phoneNumber('+12125550100'))).toBe(true)
  })

  it('refuses a number outside North America', () => {
    expect(isUsPhone(phoneNumber('+447700900123'))).toBe(false)
    expect(isUsPhone(phoneNumber('+5215512345678'))).toBe(false)
  })

  it('refuses a Canadian number, though it dials with the same +1', () => {
    // Toronto, Vancouver and Montreal.
    expect(isUsPhone(phoneNumber('+14165550100'))).toBe(false)
    expect(isUsPhone(phoneNumber('+16045550100'))).toBe(false)
    expect(isUsPhone(phoneNumber('+15145550100'))).toBe(false)
  })

  it('refuses the Caribbean countries that share +1', () => {
    // Jamaica and the Dominican Republic.
    expect(isUsPhone(phoneNumber('+18765550100'))).toBe(false)
    expect(isUsPhone(phoneNumber('+18095550100'))).toBe(false)
  })

  it('refuses the US territories, which Twilio counts as countries of their own', () => {
    // Puerto Rico and Guam.
    expect(isUsPhone(phoneNumber('+17875550100'))).toBe(false)
    expect(isUsPhone(phoneNumber('+16715550100'))).toBe(false)
  })

  it('refuses a +1 number that is not ten digits', () => {
    expect(isUsPhone(phoneNumber('+1318555014'))).toBe(false)
    expect(isUsPhone(phoneNumber('+131855501420'))).toBe(false)
  })
})

describe('what counts as a code', () => {
  it('is six digits', () => {
    expect(readPhoneCode('482913')).toBe('482913')
  })

  it('forgives the spaces and dashes a phone or a person puts in one', () => {
    expect(readPhoneCode(' 482 913 ')).toBe('482913')
    expect(readPhoneCode('482-913')).toBe('482913')
  })

  it('is not anything else, so a slip is not spent as one of the five tries', () => {
    expect(readPhoneCode('')).toBeNull()
    expect(readPhoneCode('48291')).toBeNull()
    expect(readPhoneCode('4829130')).toBeNull()
    expect(readPhoneCode('48291a')).toBeNull()
  })
})

describe('how many codes may be sent', () => {
  const now = new Date('2026-11-05T15:00:00Z')
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)
  const times = (count: number, minutes: number) => Array.from({ length: count }, () => minutesAgo(minutes))

  it('allows a first code', () => {
    expect(codeRequestAllowed({ byAdmin: [], toPhone: [] }, now)).toBe(true)
  })

  it('allows a fifth code within an hour, and not a sixth', () => {
    expect(codeRequestAllowed({ byAdmin: times(4, 5), toPhone: times(4, 5) }, now)).toBe(true)
    expect(codeRequestAllowed({ byAdmin: times(5, 5), toPhone: times(5, 5) }, now)).toBe(false)
  })

  it('counts an Admin and a phone each on their own', () => {
    // One Admin trying many phones, and many Admins trying one phone, are both
    // stopped -- the second is somebody else's number being flooded with codes.
    expect(codeRequestAllowed({ byAdmin: times(5, 5), toPhone: [] }, now)).toBe(false)
    expect(codeRequestAllowed({ byAdmin: [], toPhone: times(5, 5) }, now)).toBe(false)
  })

  it('forgets a code sent more than an hour ago, for the hour', () => {
    expect(codeRequestAllowed({ byAdmin: times(5, 61), toPhone: times(5, 61) }, now)).toBe(true)
  })

  it('allows ten codes in a day, and not an eleventh', () => {
    expect(codeRequestAllowed({ byAdmin: times(9, 120), toPhone: [] }, now)).toBe(true)
    expect(codeRequestAllowed({ byAdmin: times(10, 120), toPhone: [] }, now)).toBe(false)
    expect(codeRequestAllowed({ byAdmin: [], toPhone: times(10, 120) }, now)).toBe(false)
  })

  it('forgets a code sent more than a day ago', () => {
    expect(codeRequestAllowed({ byAdmin: times(10, 24 * 60 + 1), toPhone: [] }, now)).toBe(true)
  })
})

describe('when an attempt is over', () => {
  const sent = new Date('2026-11-05T15:00:00Z')
  const attempt = (overrides: Partial<PhoneCheckAttempt> = {}): PhoneCheckAttempt => ({
    id: 'attempt-1',
    lastCodeAt: sent,
    verificationSid: 'VE123',
    codesTried: 0,
    ending: null,
    ...overrides,
  })
  const minutesAfter = (minutes: number) => new Date(sent.getTime() + minutes * 60_000)

  it('is open with five tries while its code is fresh', () => {
    expect(attemptStanding(attempt(), minutesAfter(1))).toEqual({ kind: 'open', triesLeft: 5 })
    expect(attemptStanding(attempt({ codesTried: 3 }), minutesAfter(9))).toEqual({
      kind: 'open',
      triesLeft: 2,
    })
  })

  it('has expired ten minutes after its last code, as Twilio’s code has', () => {
    expect(attemptStanding(attempt(), minutesAfter(10))).toEqual({
      kind: 'expired',
      at: minutesAfter(10),
    })
  })

  it('is over after five codes were tried', () => {
    expect(attemptStanding(attempt({ codesTried: 5 }), minutesAfter(1))).toEqual({
      kind: 'ended',
      ending: 'wrong_codes',
    })
  })

  it('stays however it ended', () => {
    expect(attemptStanding(attempt({ ending: 'verified' }), minutesAfter(60))).toEqual({
      kind: 'ended',
      ending: 'verified',
    })
    expect(attemptStanding(attempt({ ending: 'expired' }), minutesAfter(1))).toEqual({
      kind: 'ended',
      ending: 'expired',
    })
  })
})
