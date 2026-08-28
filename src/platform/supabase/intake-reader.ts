import pg from 'pg'
import { discipleshipGoalId } from '~/domain/intake'
import { ministryId } from '~/domain/ids'
import type { DiscipleshipGoalOption, IntakePage, IntakeReader } from '~/service/ports'

/**
 * What the Intake form needs to render itself. The page is served to somebody with
 * no account and no session -- that is the whole point of it -- so it reads on the
 * server over the same trusted connection the command boundary uses, scoped to the
 * one Ministry whose link was opened.
 *
 * The pool is opened here but never reached for here: only the composition root
 * constructs this reader, and `close` is what it holds so the suite has something
 * to shut down when it ends.
 */
export interface PostgresIntakeReader extends IntakeReader {
  close(): Promise<void>
}

export const createPostgresIntakeReader = (
  connectionString: string,
): PostgresIntakeReader => {
  const pool = new pg.Pool({ connectionString })

  return {
    async readIntakePage(id: string): Promise<IntakePage | null> {
      // A link is typed, forwarded and scanned off a printed page, so the identifier
      // in it is not to be trusted into a query as a uuid until it looks like one.
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null

      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [id])

        const { rows: ministries } = await client.query<{ name: string }>(
          `select name from ministry where id = $1`,
          [id],
        )
        const name = ministries[0]?.name
        if (!name) return null

        const { rows } = await client.query<{ id: string; label: string }>(
          `select id, label from discipleship_goal where ministry_id = $1 order by position`,
          [id],
        )
        const goals: DiscipleshipGoalOption[] = rows.map((row) => ({
          id: discipleshipGoalId(row.id),
          label: row.label,
        }))

        return { ministryId: ministryId(id), ministryName: name, goals }
      } finally {
        await client.query('rollback')
        client.release()
      }
    },

    close: () => pool.end(),
  }
}
