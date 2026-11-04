import { createHash } from 'node:crypto'
import pg from 'pg'
import type { Clock } from '~/domain/clock'
import { SIGN_IN_WINDOW_MINUTES, signInIsHeldBack } from '~/domain/sign-in-limit'
import type { SignInAccount, SignInLimit } from '~/service/ports'

/**
 * The sign-in guessing limit, counted in `sign_in_attempt` on the trusted
 * connection (Exponential launch, ticket 13).
 *
 * The trusted connection and not a session, because a sign-in has none yet, and
 * the table is operator-only for the reason `ministry_setup` is: it belongs to no
 * Ministry, and no API role may read or write it.
 *
 * A try is written *before* Supabase Auth is asked, under a lock on its account
 * and one on its network, and only after both counts allowed it. So the counting
 * and the reserving are one step: a thousand guesses sent at the same instant
 * queue on the lock, each sees the rows the ones before it wrote, and ten go
 * through. Counting first and recording a failure afterwards would let every one
 * of them read *nine* at once.
 */

export interface PostgresSignInLimit extends SignInLimit {
  close(): Promise<void>
}

/**
 * How long a row is kept, which is far longer than it counts for. Rows are swept
 * by the tries themselves, and a sweep measured by the window would let a clock
 * that runs ahead -- a test's, which is how the window is tested -- delete the
 * fresh rows a test beside it is counting.
 */
const KEPT_FOR_MS = 24 * 60 * 60 * 1000

const WINDOW_MS = SIGN_IN_WINDOW_MINUTES * 60 * 1000

/** SHA-256, so the table holds no number and no address; see the migration. */
const digestOf = (key: string): string => createHash('sha256').update(key).digest('hex')

/**
 * The count an address belongs to: the phone of the account holding it, so ten tries
 * by email and ten by phone are ten tries and not twenty (Exponential launch, ticket
 * 21). An address nobody holds, or an account with no phone, counts under its own key.
 *
 * Asked every time, before any lock, so an address somebody holds costs the same as
 * one nobody does.
 *
 * Supabase Auth keeps a phone without its `+`, and a number read from the sign-in box
 * has one. Left as it comes, the two would be different counts for the one account.
 *
 * A NUL is taken out because Postgres refuses one in text. Only a hand-made request
 * can hold one, and it should be told what any other wrong address is told rather than
 * getting a 500.
 */
const emailKey = async (email: string, client: pg.PoolClient): Promise<string> => {
  const address = email.toLowerCase().replaceAll('\0', '')
  const { rows } = await client.query<{ phone: string | null }>(
    `select phone from auth.users where email = $1 and is_sso_user = false limit 1`,
    [address],
  )
  const phone = rows[0]?.phone
  return phone ? `phone:+${phone.replace(/^\+/, '')}` : `email:${address}`
}

/**
 * Namespaced, so a phone number, an address and a user id can never be one account
 * by accident. A sign-in counts against what was typed and a change of password
 * against the session's account: those two are counted apart, each held to ten.
 */
const accountKey = async (account: SignInAccount, client: pg.PoolClient): Promise<string> => {
  if ('phone' in account) return `phone:${account.phone}`
  if ('email' in account) return emailKey(account.email, client)
  return `user:${account.userId}`
}

/**
 * The advisory lock a key's count is taken under. Two classes, so an account and
 * a network can never be the same lock, and always taken account first, so two
 * tries waiting on each other's second lock is a state that cannot arise.
 */
const ACCOUNT_LOCKS = 7_313_001
const NETWORK_LOCKS = 7_313_002

export const createPostgresSignInLimit = (
  connectionString: string,
  clock: Clock,
): PostgresSignInLimit => {
  const pool = new pg.Pool({ connectionString })

  return {
    async attempt(account, network) {
      const networkDigest = network === null ? null : digestOf(`network:${network}`)
      const at = clock.now()

      const client = await pool.connect()
      let id: string | null = null
      try {
        const accountDigest = digestOf(await accountKey(account, client))

        await client.query('begin')

        // Account first, then network, in one statement and in that order every
        // time, so two tries can never each hold the lock the other is waiting on.
        await client.query(
          networkDigest === null
            ? 'select pg_advisory_xact_lock($1, hashtext($2))'
            : `select pg_advisory_xact_lock($1, hashtext($2)),
                      pg_advisory_xact_lock($3, hashtext($4))`,
          networkDigest === null
            ? [ACCOUNT_LOCKS, accountDigest]
            : [ACCOUNT_LOCKS, accountDigest, NETWORK_LOCKS, networkDigest],
        )

        // The sweep rides along with the count, so a try costs one statement more
        // than the lock rather than two. It touches only rows a day old, which
        // nothing below counts.
        const { rows } = await client.query<{ for_account: number; for_network: number }>(
          `with swept as (delete from sign_in_attempt where attempted_at < $4)
           select count(*) filter (where account_digest = $1)::int as for_account,
                  count(*) filter (where network_digest = $2)::int as for_network
             from sign_in_attempt
            where attempted_at > $3
              and (account_digest = $1 or network_digest = $2)`,
          [
            accountDigest,
            networkDigest,
            new Date(at.getTime() - WINDOW_MS),
            new Date(at.getTime() - KEPT_FOR_MS),
          ],
        )
        const counts = rows[0] ?? { for_account: 0, for_network: 0 }

        if (!signInIsHeldBack({ forAccount: counts.for_account, forNetwork: counts.for_network })) {
          const { rows: written } = await client.query<{ id: string }>(
            `insert into sign_in_attempt (account_digest, network_digest, attempted_at)
             values ($1, $2, $3) returning id`,
            [accountDigest, networkDigest, at],
          )
          id = written[0]!.id
        }

        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }

      if (id === null) return null
      const reserved = id

      return {
        async notAFailure() {
          await pool.query('delete from sign_in_attempt where id = $1', [reserved])
        },
      }
    },

    async close() {
      await pool.end()
    },
  }
}
