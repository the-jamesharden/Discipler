import pg from 'pg'
import type { TwilioBalanceFall, TwilioBalanceFalls } from '~/service/ports'

/**
 * Each time the Twilio balance fell below its floor, on the trusted connection and
 * nothing else (Exponential launch, ticket 08). The account is shared by every
 * church, so like `shared_number_capacity_alert` this belongs to none of them.
 */
export interface PostgresTwilioBalanceFalls extends TwilioBalanceFalls {
  close(): Promise<void>
}

interface FallRow {
  id: string
  fell_at: Date
  balance_cents: number
  told_at: Date | null
}

const OPEN_FALL = `select id, fell_at, balance_cents, told_at
                     from twilio_balance_fall
                    where recovered_at is null`

const fallOf = (row: FallRow): TwilioBalanceFall => ({
  id: row.id,
  fellAt: row.fell_at,
  balanceCents: row.balance_cents,
  toldAt: row.told_at,
})

export const createPostgresTwilioBalanceFalls = (
  connectionString: string,
): PostgresTwilioBalanceFalls => {
  const pool = new pg.Pool({ connectionString })

  const open = async (): Promise<TwilioBalanceFall | null> => {
    const { rows } = await pool.query<FallRow>(OPEN_FALL)
    return rows[0] ? fallOf(rows[0]) : null
  }

  return {
    open,

    async recordFall(at, balanceCents) {
      // `on conflict` for two passes that raced to the same fall: the partial unique
      // index lets one in, and both go on with the one that is there.
      await pool.query(
        `insert into twilio_balance_fall (fell_at, balance_cents)
         values ($1, $2)
         on conflict do nothing`,
        [at, balanceCents],
      )
      const fall = await open()
      if (!fall) throw new Error('The balance fall just recorded is not open')
      return fall
    },

    async recordTold(id, at) {
      await pool.query(
        `update twilio_balance_fall set told_at = $2 where id = $1 and told_at is null`,
        [id, at],
      )
    },

    async recordRecovery(at, balanceCents) {
      const { rowCount } = await pool.query(
        `update twilio_balance_fall
            set recovered_at = $1, recovered_balance_cents = $2
          where recovered_at is null`,
        [at, balanceCents],
      )
      return (rowCount ?? 0) > 0
    },

    close: () => pool.end(),
  }
}
