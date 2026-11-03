import { createHash } from 'node:crypto'
import pg from 'pg'
import type { EmailAddress } from '~/domain/email'
import type { PhoneNumber } from '~/domain/roster'
import {
  emailKeyOf,
  PENDING_SIGNUP_KEPT_HOURS,
  type PendingSignup,
  type SignUpAttemptToken,
} from '~/domain/sign-up-attempt'
import type { PendingSignups, PendingSignupSending, PendingSignupTrying } from '~/service/ports'

/**
 * Sign-up's attempts and the caps on what they send, on the trusted connection and
 * nothing else (Exponential launch, ticket 11).
 *
 * The tables are operator-only for the reason `sign_in_attempt` is: somebody signing
 * up has no session and no Ministry. Every statement names the attempt it is about,
 * by the digest of an ID only the visitor's cookie holds.
 *
 * Sending holds a lock on the address and on the network while it counts and
 * reserves, so a burst queues and sees the rows the ones before it wrote. Nothing is
 * sent inside the transaction, so no lock waits on the mail vendor.
 */

export interface PostgresPendingSignups extends PendingSignups {
  close(): Promise<void>
}

interface PendingSignupRow {
  id: string
  human_passed_at: Date
  email: string | null
  phone: string | null
  code_digest: string | null
  code_sent_at: Date | null
  code_tries: number
  verified_at: Date | null
  spent_at: Date | null
}

const COLUMNS = `id, human_passed_at, email, phone, code_digest, code_sent_at, code_tries, verified_at, spent_at`

const pendingFrom = (row: PendingSignupRow | undefined): PendingSignup | null =>
  row
    ? {
        id: row.id,
        humanPassedAt: row.human_passed_at,
        email: row.email as EmailAddress | null,
        phone: row.phone as PhoneNumber | null,
        codeDigest: row.code_digest,
        codeSentAt: row.code_sent_at,
        codeTries: row.code_tries,
        verifiedAt: row.verified_at,
        spentAt: row.spent_at,
      }
    : null

/** SHA-256, so the tables hold no attempt ID, and the caps no address or network. */
const digestOf = (key: string): string => createHash('sha256').update(key).digest('hex')

const attemptDigest = (attempt: SignUpAttemptToken): string => digestOf(`attempt:${attempt}`)

const KEPT_FOR_MS = PENDING_SIGNUP_KEPT_HOURS * 60 * 60 * 1000

/** Two classes, so an address and a network can never be the same lock. */
const EMAIL_LOCKS = 7_313_101
const NETWORK_LOCKS = 7_313_102

export const createPostgresPendingSignups = (connectionString: string): PostgresPendingSignups => {
  const pool = new pg.Pool({ connectionString })

  const inTransaction = async <T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const result = await work(client)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  const lockedAttempt = async (client: pg.PoolClient, attempt: SignUpAttemptToken) => {
    const { rows } = await client.query<PendingSignupRow>(
      `select ${COLUMNS} from pending_signup where attempt_digest = $1 for update`,
      [attemptDigest(attempt)],
    )
    return pendingFrom(rows[0])
  }

  return {
    async begin(attempt, at) {
      // The sweep rides along with a new attempt. It touches only rows a day old,
      // which nothing below reads as live.
      const keptSince = new Date(at.getTime() - KEPT_FOR_MS)
      await pool.query(
        `with swept as (delete from pending_signup where human_passed_at < $3)
         insert into pending_signup (attempt_digest, human_passed_at) values ($1, $2)`,
        [attemptDigest(attempt), at, keptSince],
      )
    },

    async read(attempt) {
      const { rows } = await pool.query<PendingSignupRow>(
        `select ${COLUMNS} from pending_signup where attempt_digest = $1`,
        [attemptDigest(attempt)],
      )
      return pendingFrom(rows[0])
    },

    sending(attempt, email, network, work) {
      const emailKey = emailKeyOf(email)
      const emailDigest = digestOf(`email:${emailKey}`)
      const networkDigest = network === null ? null : digestOf(`network:${network}`)

      return inTransaction(async (client) => {
        // The address and then the network, one statement each and always in that
        // order, then the attempt's row, so two sends cannot each hold what the
        // other is waiting for.
        await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [EMAIL_LOCKS, emailDigest])
        if (networkDigest !== null) {
          await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [NETWORK_LOCKS, networkDigest])
        }
        const pending = await lockedAttempt(client, attempt)

        const unit: PendingSignupSending = {
          pending,

          async recentSends(since) {
            const { rows } = await client.query<{ for_email: number; for_network: number }>(
              `select count(*) filter (where email_digest = $1)::int as for_email,
                      count(*) filter (where network_digest = $2)::int as for_network
                 from pending_signup_send
                where sent_at > $3
                  and (email_digest = $1 or network_digest = $2)`,
              [emailDigest, networkDigest, since],
            )
            const counts = rows[0]
            return { forEmail: counts?.for_email ?? 0, forNetwork: counts?.for_network ?? 0 }
          },

          async emailHasAccount() {
            const { rows } = await client.query(`select 1 from auth.users where email = $1 limit 1`, [emailKey])
            return rows.length > 0
          },

          async issue({ phone, codeDigest, at }) {
            const { rows } = await client.query<{ code_sends: number }>(
              `update pending_signup
                  set email = $2, phone = $3, code_digest = $4, code_sent_at = $5,
                      code_tries = 0, code_sends = code_sends + 1
                where attempt_digest = $1
                returning code_sends`,
              [attemptDigest(attempt), email, phone, codeDigest, at],
            )
            // The sweep rides along here too, on the rows only this table counts.
            await client.query(
              `with swept as (delete from pending_signup_send where sent_at < $4)
               insert into pending_signup_send (email_digest, network_digest, sent_at) values ($1, $2, $3)`,
              [emailDigest, networkDigest, at, new Date(at.getTime() - KEPT_FOR_MS)],
            )
            return rows[0]!.code_sends
          },
        }

        return work(unit)
      })
    },

    trying(attempt, work) {
      return inTransaction(async (client) => {
        const unit: PendingSignupTrying = {
          pending: await lockedAttempt(client, attempt),

          async recordWrongTry() {
            await client.query(`update pending_signup set code_tries = code_tries + 1 where attempt_digest = $1`, [
              attemptDigest(attempt),
            ])
          },

          async markVerified(at) {
            await client.query(
              `update pending_signup set verified_at = $2, code_digest = null where attempt_digest = $1`,
              [attemptDigest(attempt), at],
            )
          },
        }
        return work(unit)
      })
    },

    async codeNotSent(attempt) {
      await pool.query(
        `update pending_signup set code_digest = null, code_sent_at = null where attempt_digest = $1`,
        [attemptDigest(attempt)],
      )
    },

    async close() {
      await pool.end()
    },
  }
}

/**
 * Spends an attempt, in the same transaction that opens its church (ticket 17): the
 * caller's client, so a church is never opened on an attempt that stays live, and an
 * attempt is never spent on a church that was not made. False when it was already
 * spent, which is the second of a double click, and the caller rolls back.
 */
export const spendPendingSignup = async (client: pg.ClientBase, id: string, at: Date): Promise<boolean> => {
  const { rowCount } = await client.query(
    `update pending_signup set spent_at = $2 where id = $1 and spent_at is null and verified_at is not null`,
    [id, at],
  )
  return rowCount === 1
}
