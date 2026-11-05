import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readReferralCode } from '~/domain/referrals'
import { createMinistryWithAdmin, localSupabase } from '../support/local-supabase'

/**
 * What the database makes and refuses, and what the domain reads, are the same letters. Asked
 * of the live function and the live constraint, because a later migration could change either
 * and leave the file that first wrote them as it was.
 */
const EVERY_CANDIDATE = [...'0123456789abcdefghijklmnopqrstuvwxyz']
const LEFT_OUT = ['i', 'l', 'o', 'u']

describe('a referral code’s letters', () => {
  let pool: pg.Pool

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl, max: 2 })
  })

  afterAll(async () => {
    await pool.end()
  })

  it('are what the domain reads, every one the database makes', async () => {
    const { rows } = await pool.query<{ code: string }>(
      `select app.a_referral_code() as code from generate_series(1, 200)`,
    )
    for (const { code } of rows) expect(readReferralCode(code), code).toBe(code)

    const used = new Set(rows.flatMap(({ code }) => [...code]))
    expect([...used].sort()).toEqual(EVERY_CANDIDATE.filter((letter) => !LEFT_OUT.includes(letter)))
  })

  it('are refused and accepted alike by the constraint and the domain', async () => {
    const church = await createMinistryWithAdmin('Referral Letters')
    const client = await pool.connect()
    const acceptedBy = async (code: string) => {
      await client.query('begin')
      try {
        await client.query(`insert into referral_code (ministry_id, code, retired_at) values ($1, $2, now())`, [
          church.id,
          code,
        ])
        return true
      } catch (error) {
        expect((error as { constraint?: string }).constraint).toBe('referral_code_is_readable')
        return false
      } finally {
        await client.query('rollback')
      }
    }

    try {
      for (const letter of EVERY_CANDIDATE) {
        const code = letter.repeat(10)
        const accepted = await acceptedBy(code)
        expect(accepted, letter).toBe(!LEFT_OUT.includes(letter))
        expect(readReferralCode(code) === code, letter).toBe(accepted)
      }
      expect(await acceptedBy('abc')).toBe(false)
    } finally {
      client.release()
    }
  })
})
