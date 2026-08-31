import pg from 'pg'
import { ministryId, type MinistryId } from '~/domain/ids'
import type { MinistryDirectory } from '~/service/ports'

/**
 * Reads on the same trusted connection the command boundary uses, because the
 * scheduler has no session behind it -- the same reason the Intake form, the
 * Invitation Link and the inbound webhook do.
 *
 * Deliberately unscoped, and deliberately the only thing here. It answers *which
 * Ministries exist* so the tick can be run for each in its own scoped transaction;
 * everything the tick then reads or writes is bounded by that transaction and by
 * the policies under it. Widening this to return anything but ids would make it a
 * way to read across every Ministry at once, which is the one thing this schema is
 * built to refuse.
 */
export interface PostgresMinistryDirectory extends MinistryDirectory {
  close(): Promise<void>
}

export const createPostgresMinistryDirectory = (
  connectionString: string,
): PostgresMinistryDirectory => {
  const pool = new pg.Pool({ connectionString })

  return {
    async everyMinistry(): Promise<readonly MinistryId[]> {
      // Ordered so a run that fails partway is the same prefix every time, which is
      // what makes "it got as far as Northgate" a usable thing to read in a log.
      const { rows } = await pool.query<{ id: string }>(
        `select id from ministry order by created_at, id`,
      )
      return rows.map((row) => ministryId(row.id))
    },

    close: () => pool.end(),
  }
}
