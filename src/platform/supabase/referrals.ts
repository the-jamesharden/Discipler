import pg from 'pg'
import { readReferralCode } from '~/domain/referrals'
import type { Invitations } from '~/service/open-trial'
import type { ReferralCodes } from '~/service/ports'

/**
 * Whether a code is live and whether a church was invited (Exponential launch, ticket
 * 20), on the trusted connection: somebody signing up has no session and no Ministry, and
 * `referral` spans two churches, so neither question can be asked as a church.
 *
 * `isLive` asks one indexed question whichever way it answers, so a live code and an
 * unknown or retired one take the same time and say nothing but the answer.
 */
export interface PostgresReferrals extends ReferralCodes, Invitations {
  close(): Promise<void>
}

export const createPostgresReferrals = (connectionString: string): PostgresReferrals => {
  const pool = new pg.Pool({ connectionString })

  return {
    async isLive(given) {
      const code = readReferralCode(given)
      if (!code) return false
      const { rows } = await pool.query(`select 1 from referral_code where code = $1 and retired_at is null`, [code])
      return rows.length > 0
    },

    async wasInvited(church) {
      const { rows } = await pool.query(`select 1 from referral where invited_church = $1`, [church])
      return rows.length > 0
    },

    close: () => pool.end(),
  }
}
