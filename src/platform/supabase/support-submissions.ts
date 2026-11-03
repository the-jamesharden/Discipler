import { createHash } from 'node:crypto'
import pg from 'pg'
import type { EmailAddress } from '~/domain/email'
import type { SupportKind, SupportSubmission } from '~/domain/support-form'
import type { SupportSubmissions } from '~/service/ports'

/**
 * Where the Help menu's form is kept (Exponential launch, ticket 25).
 *
 * A signed-in Admin's is written the way a church's billing is: the transaction drops
 * into `discipler_command` and names its church first, so row-level security holds
 * the write to that church whatever the code asks for. Anybody else's belongs to no
 * church, so it is written on the trusted connection, as a pending sign-up is.
 *
 * Reading them back, marking them sent and deleting them are the operator's, on the
 * trusted connection across both tables: no page or command holds a grant to do it.
 *
 * Each `keep` holds a lock on the sender while it counts and adds, so a burst queues
 * and sees the rows the ones before it wrote. Nothing is sent inside the transaction,
 * so no lock waits on the mail vendor.
 */

export interface PostgresSupportSubmissions extends SupportSubmissions {
  close(): Promise<void>
}

/** Two classes, so an Admin and a network can never be the same lock. */
const ADMIN_LOCKS = 7_325_101
const NETWORK_LOCKS = 7_325_102

/** SHA-256, so the table holds no network address. */
const networkDigestOf = (network: string | null): string =>
  createHash('sha256').update(`network:${network ?? 'unknown'}`).digest('hex')

interface SubmissionRow {
  id: string
  kind: SupportKind
  message: string
  reply_to: string
  page_address: string | null
  browser: string | null
  church_name: string | null
}

const submissionFrom = (row: SubmissionRow): SupportSubmission => ({
  id: row.id,
  kind: row.kind,
  message: row.message,
  replyTo: row.reply_to as EmailAddress,
  pageAddress: row.page_address,
  browser: row.browser,
  churchName: row.church_name,
})

export const createPostgresSupportSubmissions = (connectionString: string): PostgresSupportSubmissions => {
  const pool = new pg.Pool({ connectionString })

  const inTransaction = async <T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    let connectionIsSuspect: Error | undefined
    try {
      await client.query('begin')
      const result = await work(client)
      await client.query('commit')
      return result
    } catch (error) {
      try {
        await client.query('rollback')
      } catch (rollbackError) {
        // A connection that could not roll back may still hold the transaction and
        // its locks, so it is destroyed rather than handed to the next borrower.
        connectionIsSuspect =
          rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
      }
      throw error
    } finally {
      client.release(connectionIsSuspect)
    }
  }

  return {
    keepFromAChurch({ fields, ministryId, submittedBy, at, limit }) {
      return inTransaction(async (client) => {
        // Both reset at commit or rollback, so neither can leak to the next borrower.
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministryId])
        await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [ADMIN_LOCKS, submittedBy])

        const { rows: counted } = await client.query<{ recent: number }>(
          `select count(*)::int as recent from support_submission
            where submitted_by = $1 and submitted_at > $2`,
          [submittedBy, limit.since],
        )
        if ((counted[0]?.recent ?? 0) >= limit.most) return null

        const { rows } = await client.query<{ id: string }>(
          `insert into support_submission
             (ministry_id, submitted_by, kind, message, reply_to, page_address, browser, submitted_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           returning id`,
          [ministryId, submittedBy, fields.kind, fields.message, fields.replyTo, fields.pageAddress, fields.browser, at],
        )
        return rows[0]!.id
      })
    },

    keepSignedOut({ fields, network, at, limit }) {
      const networkDigest = networkDigestOf(network)

      return inTransaction(async (client) => {
        await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [NETWORK_LOCKS, networkDigest])

        const { rows: counted } = await client.query<{ recent: number }>(
          `select count(*)::int as recent from signed_out_support_submission
            where network_digest = $1 and submitted_at > $2`,
          [networkDigest, limit.since],
        )
        if ((counted[0]?.recent ?? 0) >= limit.most) return null

        const { rows } = await client.query<{ id: string }>(
          `insert into signed_out_support_submission
             (network_digest, kind, message, reply_to, page_address, browser, submitted_at)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning id`,
          [networkDigest, fields.kind, fields.message, fields.replyTo, fields.pageAddress, fields.browser, at],
        )
        return rows[0]!.id
      })
    },

    async markEmailed(id, at) {
      await pool.query(`update support_submission set emailed_at = $2 where id = $1`, [id, at])
      await pool.query(`update signed_out_support_submission set emailed_at = $2 where id = $1`, [id, at])
    },

    async waitingForEmail(most) {
      const { rows } = await pool.query<SubmissionRow>(
        `select id, kind, message, reply_to, page_address, browser, church_name
           from (
             select s.id, s.kind, s.message, s.reply_to, s.page_address, s.browser,
                    m.name as church_name, s.submitted_at
               from support_submission s
               join ministry m on m.id = s.ministry_id
              where s.emailed_at is null
             union all
             select o.id, o.kind, o.message, o.reply_to, o.page_address, o.browser,
                    null, o.submitted_at
               from signed_out_support_submission o
              where o.emailed_at is null
           ) waiting
          order by submitted_at, id
          limit $1`,
        [most],
      )
      return rows.map(submissionFrom)
    },

    async deleteSubmittedBefore(before) {
      const { rowCount: church } = await pool.query(`delete from support_submission where submitted_at < $1`, [before])
      const { rowCount: signedOut } = await pool.query(
        `delete from signed_out_support_submission where submitted_at < $1`,
        [before],
      )
      return (church ?? 0) + (signedOut ?? 0)
    },

    async close() {
      await pool.end()
    },
  }
}
