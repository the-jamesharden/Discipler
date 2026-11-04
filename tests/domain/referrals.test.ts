import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readReferralCode } from '~/domain/referrals'

/** A referral code as `/r/<code>` carries it (Exponential launch, ticket 20). */
describe('reading a referral code', () => {
  it('takes one as it is stored', () => {
    expect(readReferralCode('k7m2qp9xab')).toBe('k7m2qp9xab')
  })

  it('does not mind case or the spaces of a paste', () => {
    expect(readReferralCode(' K7M2QP9XAB\n')).toBe('k7m2qp9xab')
  })

  it.each([
    ['nothing', ''],
    ['too short', 'k7m2qp9xa'],
    ['too long', 'k7m2qp9xabc'],
    ['a letter Crockford leaves out', 'k7m2qp9xau'],
    ['another', 'k7m2qp9xai'],
    ['something else entirely', "k7m2'p9xab"],
  ])('refuses %s', (_why, given) => {
    expect(readReferralCode(given)).toBeNull()
  })

  it('refuses no value at all', () => {
    expect(readReferralCode(null)).toBeNull()
    expect(readReferralCode(undefined)).toBeNull()
  })

  it('reads the same letters the database makes and checks', () => {
    const migration = readFileSync(
      fileURLToPath(new URL('../../supabase/migrations/20261104110020_referral_codes_and_who_invited_whom.sql', import.meta.url)),
      'utf8',
    )
    const letters = /letters constant text := '([^']+)'/.exec(migration)![1]!

    expect(letters).toHaveLength(32)
    for (const letter of letters) expect(readReferralCode(letter.repeat(10)), letter).toBe(letter.repeat(10))
    expect(migration).toContain(`'^[0-9a-hjkmnp-tv-z]{10}$'`)
  })
})
