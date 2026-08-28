import pg from 'pg'
import { ministryId, type MinistryId } from '~/domain/ids'
import { commandDatabaseUrl } from './credentials'

/**
 * What the Intake form needs to render itself. The page is served to somebody with
 * no account and no session -- that is the whole point of it -- so it reads on the
 * server over the same trusted connection the command boundary uses, scoped to the
 * one Ministry whose link was opened.
 */

export interface DiscipleshipGoalOption {
  readonly id: string
  readonly label: string
}

export interface IntakePage {
  readonly ministryId: MinistryId
  readonly ministryName: string
  readonly goals: readonly DiscipleshipGoalOption[]
}

let pool: pg.Pool | undefined
const connection = (): pg.Pool => (pool ??= new pg.Pool({ connectionString: commandDatabaseUrl() }))

/** Null when the link names no Ministry this Discipler holds. */
export const readIntakePage = async (id: string): Promise<IntakePage | null> => {
  // A link is typed, forwarded and scanned off a printed page, so the identifier in
  // it is not to be trusted into a query as a uuid until it looks like one.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null

  const client = await connection().connect()
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

    const { rows: goals } = await client.query<{ id: string; label: string }>(
      `select id, label from discipleship_goal where ministry_id = $1 order by position`,
      [id],
    )

    return { ministryId: ministryId(id), ministryName: name, goals }
  } finally {
    await client.query('rollback')
    client.release()
  }
}
