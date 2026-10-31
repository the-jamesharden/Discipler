import pg from 'pg'
import type { CapacityConcern, SharedNumberLoad } from '~/domain/shared-numbers'
import { asPhoneNumber } from '~/domain/roster'
import type { SharedNumberCapacity } from '~/service/ports'

/**
 * The shared set of Discipler numbers, on the trusted connection and nothing else
 * (Exponential launch, ticket 06).
 *
 * `shared_number` and `shared_number_capacity_alert` belong to no church, so like
 * `ministry_setup` they are read without `set local role discipler_command`: the
 * command role acts for exactly one church and holds no grant on either. What it
 * returns is counts, never a phone.
 */
export interface PostgresSharedNumbers extends SharedNumberCapacity {
  /**
   * Adds a number to the shared set, for whoever runs Discipler once it is in the
   * Messaging Service. Read the way every phone in the product is read, and a
   * second add of the same number changes nothing. Returns the number as stored.
   */
  add(phone: string, at: Date): Promise<string>
  close(): Promise<void>
}

export class SharedNumberNotAdded extends Error {
  constructor(readonly reason: string) {
    super(`Could not add the shared number: ${reason}`)
    this.name = 'SharedNumberNotAdded'
  }
}

export const createPostgresSharedNumbers = (connectionString: string): PostgresSharedNumbers => {
  const pool = new pg.Pool({ connectionString })

  return {
    async load(): Promise<SharedNumberLoad> {
      const { rows } = await pool.query<{
        numbers: number
        recipients: number
        most_churches_on_one_phone: number
      }>(
        `select (select count(*) from shared_number)::int as numbers,
                (select count(*) from sending_number_assignment)::int as recipients,
                coalesce((select max(churches)
                            from (select count(*) as churches
                                    from sending_number_assignment
                                   group by phone) per_phone), 0)::int
                  as most_churches_on_one_phone`,
      )
      const row = rows[0]!
      return {
        numbers: row.numbers,
        recipients: row.recipients,
        mostChurchesOnOnePhone: row.most_churches_on_one_phone,
      }
    },

    async alreadyRaised(concern: CapacityConcern, numbers: number): Promise<boolean> {
      const { rows } = await pool.query(
        `select 1 from shared_number_capacity_alert where concern = $1 and numbers = $2`,
        [concern, numbers],
      )
      return rows.length > 0
    },

    async recordRaised(concern: CapacityConcern, at: Date, load: SharedNumberLoad) {
      // `on conflict` for two passes that raced to the same alert: the second has
      // nothing to add to the history the first wrote.
      await pool.query(
        `insert into shared_number_capacity_alert
           (concern, raised_at, numbers, recipients, most_churches_on_one_phone)
         values ($1, $2, $3, $4, $5)
         on conflict (concern, numbers) do nothing`,
        [concern, at, load.numbers, load.recipients, load.mostChurchesOnOnePhone],
      )
    },

    async add(phone: string, at: Date): Promise<string> {
      const number = asPhoneNumber(phone)
      if (!number) throw new SharedNumberNotAdded(`unreadable number: ${phone}`)

      await pool.query(
        `insert into shared_number (phone, added_at) values ($1, $2)
         on conflict (phone) do nothing`,
        [number, at],
      )
      return number
    },

    close: () => pool.end(),
  }
}
