import pg from 'pg'
import type { DailyCapHold, NewDailyCapHold } from '~/domain/daily-cap'
import type { DailyCapHolds } from '~/service/ports'

/**
 * The days Twilio's daily limit was reached, on the trusted connection and nothing
 * else (Exponential launch, ticket 07). `daily_cap_hold` belongs to no church, so like
 * `shared_number` it is read without `set local role discipler_command`: the command
 * role acts for exactly one church and holds no grant on it.
 */
export interface PostgresDailyCapHolds extends DailyCapHolds {
  close(): Promise<void>
}

export const createPostgresDailyCapHolds = (connectionString: string): PostgresDailyCapHolds => {
  const pool = new pg.Pool({ connectionString })

  return {
    async latest(at: Date): Promise<DailyCapHold | null> {
      // `day::text` because `pg` reads a `date` as local midnight, and a calendar day
      // that moves with the server's zone is not the day it was.
      const { rows } = await pool.query<{
        day: string
        reached_at: Date
        held_until: Date
        alerted_at: Date | null
      }>(
        `select day::text as day, reached_at, held_until, alerted_at
           from daily_cap_hold
          where reached_at <= $1
          order by reached_at desc
          limit 1`,
        [at],
      )
      const row = rows[0]
      return row
        ? {
            day: row.day,
            reachedAt: row.reached_at,
            heldUntil: row.held_until,
            alertedAt: row.alerted_at,
          }
        : null
    },

    async record(hold: NewDailyCapHold) {
      await pool.query(
        `insert into daily_cap_hold (day, reached_at, held_until)
         values ($1, $2, $3)
         on conflict (day) do nothing`,
        [hold.day, hold.reachedAt, hold.heldUntil],
      )
    },

    async recordAlerted(day: string, at: Date) {
      // The first time it was told is the one kept, for two drains that raced.
      await pool.query(
        `update daily_cap_hold set alerted_at = $2 where day = $1 and alerted_at is null`,
        [day, at],
      )
    },

    close: () => pool.end(),
  }
}
