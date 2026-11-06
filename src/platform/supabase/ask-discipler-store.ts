import pg from 'pg'
import type { AskDisciplerStore } from '~/service/ports'

/**
 * Where Ask Discipler's chats are written (Exponential launch, ticket 31). A write drops
 * into `discipler_command` and names its church first, so row-level security holds it to
 * that church, and each statement names the author too.
 *
 * Reading a chat is not here: it comes through the session, under the policy that holds
 * it to its author (`ask_discipler_page`). The only reads here are the two a new question
 * needs while it holds its place, on behalf of the Admin the session named.
 *
 * Deleting what has been kept long enough and the record of a spend stop belong to no
 * church, so they are on the trusted connection itself.
 */

export interface PostgresAskDisciplerStore extends AskDisciplerStore {
  close(): Promise<void>
}

/** A class of its own, so an Admin here can never be the same lock as an Admin elsewhere. */
const ASKING_LOCKS = 7_325_131

export const createPostgresAskDisciplerStore = (connectionString: string): PostgresAskDisciplerStore => {
  const pool = new pg.Pool({ connectionString })

  const asTheChurch = async <T>(ministryId: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    let connectionIsSuspect: Error | undefined
    try {
      await client.query('begin')
      // Both reset at commit or rollback, so neither can leak to the next borrower.
      await client.query('set local role discipler_command')
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministryId])
      const result = await work(client)
      await client.query('commit')
      return result
    } catch (error) {
      try {
        await client.query('rollback')
      } catch (rollbackError) {
        // A connection that could not roll back may still hold the transaction and its
        // locks, so it is destroyed rather than handed to the next borrower.
        connectionIsSuspect = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
      }
      throw error
    } finally {
      client.release(connectionIsSuspect)
    }
  }

  return {
    holdAPlace({ ministryId, userId, sessionId, question, at, most, remembering }) {
      return asTheChurch(ministryId, async (client) => {
        // A burst queues here and sees the rows the ones before it wrote, so two tabs
        // cannot both be the thirtieth. Nothing else happens under it: the model is
        // asked after this commits, so no lock waits on a vendor.
        await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [ASKING_LOCKS, userId])

        const { rows: counted } = await client.query<{ asked: number }>(
          `select count(*)::int as asked
             from ask_discipler_question q
            where q.user_id = $1
              and q.ministry_id = $2
              and q.asked_at >= app.start_of_local_day(
                    $3, (select m.timezone from ministry m where m.id = $2))`,
          [userId, ministryId, at],
        )
        const asked = counted[0]?.asked ?? 0
        if (asked >= most) return null

        const { rows: remembered } = await client.query<{ question: string; answer: string }>(
          `select question, answer from (
             select q.question, q.answer, q.asked_at, q.id
               from ask_discipler_question q
              where q.user_id = $1
                and q.session_id = $2
                and q.answer is not null
              order by q.asked_at desc, q.id desc
              limit $3
           ) latest
           order by asked_at, id`,
          [userId, sessionId, remembering],
        )

        const { rows } = await client.query<{ id: string }>(
          `insert into ask_discipler_question (ministry_id, user_id, session_id, question, asked_at)
           values ($1, $2, $3, $4, $5)
           returning id`,
          [ministryId, userId, sessionId, question, at],
        )

        return { id: rows[0]!.id, askedToday: asked + 1, history: remembered }
      })
    },

    async keepAnswer({ ministryId, userId, id, answer, at }) {
      await asTheChurch(ministryId, (client) =>
        client.query(
          `update ask_discipler_question set answer = $3, answered_at = $4
            where id = $1 and user_id = $2`,
          [id, userId, answer, at],
        ),
      )
    },

    async giveUpThePlace({ ministryId, userId, id }) {
      await asTheChurch(ministryId, (client) =>
        client.query(`delete from ask_discipler_question where id = $1 and user_id = $2`, [id, userId]),
      )
    },

    async setTucked({ ministryId, userId, tucked }) {
      await asTheChurch(ministryId, (client) =>
        client.query(
          `update ministry_member set ask_discipler_tucked = $3
            where ministry_id = $1 and user_id = $2`,
          [ministryId, userId, tucked],
        ),
      )
    },

    async deleteAskedBefore(before) {
      const { rowCount } = await pool.query(`delete from ask_discipler_question where asked_at < $1`, [before])
      return rowCount ?? 0
    },

    async recordSpendStop(month, at) {
      const { rowCount } = await pool.query(
        `insert into ask_discipler_spend_stop (month, stopped_at) values ($1, $2)
         on conflict (month) do nothing`,
        [month, at],
      )
      return rowCount === 1
    },

    async forgetSpendStop(month) {
      await pool.query(`delete from ask_discipler_spend_stop where month = $1`, [month])
    },

    async close() {
      await pool.end()
    },
  }
}
