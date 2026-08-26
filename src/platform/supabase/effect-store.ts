import type { PoolClient } from 'pg'
import pg from 'pg'
import type { OutboundMessageDraft } from '~/domain/effects'
import type { HistoryEvent } from '~/domain/history'
import { eventId, type MinistryId } from '~/domain/ids'
import type { EffectSink, EffectStore } from '~/service/ports'

/**
 * Command-side persistence. Writes run inside a transaction on a connection that
 * has dropped into `discipler_command` -- a role that cannot bypass row-level
 * security -- and that has declared which Ministry it is acting for. A command
 * handling one Ministry cannot write a row belonging to another, whatever the
 * application code asks for.
 */

const sinkFor = (client: PoolClient): EffectSink => ({
  async appendHistory(events) {
    const inserted: HistoryEvent[] = []

    for (const event of events) {
      const { rows } = await client.query<{ id: string; recorded_at: Date }>(
        `insert into ministry_event
           (ministry_id, occurred_at, type, subject_type, subject_id, payload)
         values ($1, $2, $3, $4, $5, $6)
         returning id, recorded_at`,
        [
          event.ministryId,
          event.occurredAt,
          event.type,
          event.subjectType,
          event.subjectId,
          JSON.stringify(event.payload),
        ],
      )

      const row = rows[0]
      if (!row) throw new Error('History append returned no row')

      inserted.push({ ...event, id: eventId(row.id), recordedAt: row.recorded_at })
    }

    return inserted
  },

  async enqueueMessages(messages: readonly OutboundMessageDraft[]) {
    for (const message of messages) {
      await client.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at)
         values ($1, $2, $3, $4, $5)`,
        [
          message.ministryId,
          message.personId,
          message.toPhone,
          message.body,
          message.enqueuedAt,
        ],
      )
    }
  },
})

export interface PostgresEffectStore extends EffectStore {
  close(): Promise<void>
}

export const createPostgresEffectStore = (connectionString: string): PostgresEffectStore => {
  const pool = new pg.Pool({ connectionString })

  return {
    async transact<T>(ministryId: MinistryId, work: (sink: EffectSink) => Promise<T>) {
      const client = await pool.connect()
      // A connection that died mid-transaction cannot be rolled back and must not
      // go back into the pool, or the next command to borrow it fails for a reason
      // that has nothing to do with itself.
      let connectionIsSuspect: Error | undefined

      try {
        await client.query('begin')
        // Both reset at commit or rollback, so they cannot leak to the next
        // command that borrows this connection from the pool.
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministryId])

        const result = await work(sinkFor(client))
        await client.query('commit')
        return result
      } catch (error) {
        try {
          await client.query('rollback')
        } catch (rollbackError) {
          // Swallowed on purpose: the rollback failing is a symptom, and throwing
          // it here would replace the error that actually explains the failure.
          connectionIsSuspect =
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
        }
        throw error
      } finally {
        client.release(connectionIsSuspect)
      }
    },
    close: () => pool.end(),
  }
}
