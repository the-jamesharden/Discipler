import { createHash, randomBytes } from 'node:crypto'
import pg from 'pg'
import type { EmailAddress } from '~/domain/email'
import { passwordResetLinkExpiry, type PasswordResetToken } from '~/domain/password-reset'
import { emailKeyOf, SEND_CAP_WINDOW_MINUTES, sendAllowed } from '~/domain/sign-up-attempt'
import type { PasswordResetLinks } from '~/service/ports'

/**
 * The links behind "Forgot your password?" and the caps on asking for one, on the
 * trusted connection and nothing else (Exponential launch, ticket 22).
 *
 * Operator-only for the reason `sign_in_attempt` is: somebody who has lost their
 * password has no session, and an account is not a Ministry. The token exists here
 * only between being made and being handed back: its row holds the digest, and nothing
 * here logs anything.
 *
 * **One statement for both answers.** Whether the address belongs to an Admin is asked
 * in the same statement that counts the request, so an address nobody holds costs the
 * same round trips as one somebody does, and the same work bar one row.
 */

export interface PostgresPasswordResetLinks extends PasswordResetLinks {
  close(): Promise<void>
}

/** SHA-256, so the tables hold no token, no address and no network. */
const digestOf = (key: string): string => createHash('sha256').update(key).digest('hex')

const tokenDigest = (token: PasswordResetToken): string => digestOf(`reset-link:${token}`)

const newToken = (): string => randomBytes(32).toString('base64url')

/**
 * How long a row is kept, which is far longer than it counts for: a sweep measured by
 * the window would let a clock that runs ahead, a test's, delete fresh rows a test
 * beside it is counting.
 */
const KEPT_FOR_MS = 24 * 60 * 60 * 1000

/** Two classes of their own, so these can never be sign-up's or sign-in's locks. */
const EMAIL_LOCKS = 7_313_201
const NETWORK_LOCKS = 7_313_202

export const createPostgresPasswordResetLinks = (
  connectionString: string,
  token: () => string = newToken,
): PostgresPasswordResetLinks => {
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
    ask({ email, network, at }) {
      const address = emailKeyOf(email)
      const emailDigest = digestOf(`email:${address}`)
      const networkDigest = network === null ? null : digestOf(`network:${network}`)
      const made = token() as PasswordResetToken

      return inTransaction(async (client) => {
        // The address and then the network, one statement each and always in that
        // order, so two requests cannot each hold what the other is waiting for, and a
        // burst queues and sees the rows the ones before it wrote.
        await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [EMAIL_LOCKS, emailDigest])
        if (networkDigest !== null) {
          await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [NETWORK_LOCKS, networkDigest])
        }

        const { rows: counted } = await client.query<{ for_email: number; for_network: number }>(
          `select count(*) filter (where email_digest = $1)::int as for_email,
                  count(*) filter (where network_digest = $2)::int as for_network
             from password_reset_request
            where requested_at > $3
              and (email_digest = $1 or network_digest = $2)`,
          [emailDigest, networkDigest, new Date(at.getTime() - SEND_CAP_WINDOW_MINUTES * 60_000)],
        )
        const counts = counted[0]
        if (!sendAllowed({ forEmail: counts?.for_email ?? 0, forNetwork: counts?.for_network ?? 0 })) return null

        // Rows nothing reads again. Its own statement, because a row this deleted and
        // the statement below replaced would be one row touched twice.
        const keptSince = new Date(at.getTime() - KEPT_FOR_MS)
        await client.query(
          `with swept as (delete from password_reset_request where requested_at < $1)
           delete from password_reset_link where expires_at < $1`,
          [keptSince],
        )

        // An Admin, as a session is read to be one, with an address Supabase Auth holds
        // as confirmed. A Leader, or an account with no Ministry, is nobody here.
        const { rows } = await client.query<{ id: string; email: EmailAddress }>(
          `with holder as (
             select u.id, u.email
               from auth.users u
              where u.email = $1
                and u.email_confirmed_at is not null
                and u.is_sso_user = false
                and u.deleted_at is null
                and exists (select 1 from ministry_member mm where mm.user_id = u.id and mm.tier = 'admin')
              limit 1
           ), asked as (
             insert into password_reset_request (email_digest, network_digest, requested_at)
             values ($2, $3, $4)
           ), linked as (
             insert into password_reset_link (user_id, token_digest, created_at, expires_at)
             select holder.id, $5, $4, $6 from holder
             on conflict (user_id) where spent_at is null do update
               set id = gen_random_uuid(),
                   token_digest = excluded.token_digest,
                   created_at = excluded.created_at,
                   expires_at = excluded.expires_at
             returning id
           )
           select linked.id, holder.email from linked cross join holder`,
          [address, emailDigest, networkDigest, at, tokenDigest(made), passwordResetLinkExpiry(at)],
        )

        const link = rows[0]
        return link ? { id: link.id, to: link.email, token: made } : null
      })
    },

    async isLive(candidate, at) {
      const { rows } = await pool.query(
        `select 1 from password_reset_link where token_digest = $1 and spent_at is null and expires_at > $2`,
        [tokenDigest(candidate), at],
      )
      return rows.length > 0
    },

    spending(candidate, at, work) {
      return inTransaction(async (client) => {
        // The row's lock, held across the work, so the second of two presses waits and
        // then finds the link spent, and a failure rolls back to a link still live.
        const { rows } = await client.query<{ id: string; user_id: string }>(
          `select id, user_id from password_reset_link
            where token_digest = $1 and spent_at is null and expires_at > $2
            for update`,
          [tokenDigest(candidate), at],
        )
        const link = rows[0]
        if (!link) return false

        await work(link.user_id)
        await client.query(`update password_reset_link set spent_at = $2 where id = $1`, [link.id, at])
        return true
      })
    },

    async close() {
      await pool.end()
    },
  }
}
