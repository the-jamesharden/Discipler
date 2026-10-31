import pg from 'pg'
import type { MinistryId } from '~/domain/ids'
import type { PhoneCheckAttempt, PhoneCheckEnding } from '~/domain/phone-check'
import { phoneNumber, type PhoneNumber } from '~/domain/roster'
import type { PhoneChecks, PhoneCheckUnit } from '~/service/ports'

/**
 * Phone checks, on the trusted connection and nothing else (Exponential launch,
 * ticket 09).
 *
 * `phone_check` and `phone_check_code` are operator-only: a check belongs to an
 * Admin's account and to no single Ministry, so this runs without `set local role
 * discipler_command`, as `ministry-setup.ts` does. Every statement names the
 * account and the phone it is about, which the service takes from the session.
 */

export interface PostgresPhoneChecks extends PhoneChecks {
  close(): Promise<void>
}

interface AttemptRow {
  id: string
  last_code_at: Date
  verification_sid: string | null
  codes_tried: number
  ended_by: PhoneCheckEnding | null
}

export const createPostgresPhoneChecks = (connectionString: string): PostgresPhoneChecks => {
  const pool = new pg.Pool({ connectionString })

  const unitFor = (client: pg.PoolClient, userId: string, phone: PhoneNumber): PhoneCheckUnit => ({
    async latestAttempt(): Promise<PhoneCheckAttempt | null> {
      // The open attempt where there is one, which is also the latest; a code's
      // time is when it was asked for, and an attempt with none yet counts from
      // when it began.
      const { rows } = await client.query<AttemptRow>(
        `select pc.id,
                greatest(pc.started_at, max(c.requested_at)) as last_code_at,
                pc.verification_sid,
                pc.codes_tried,
                pc.ended_by
           from phone_check pc
           left join phone_check_code c on c.phone_check_id = pc.id
          where pc.user_id = $1 and pc.phone = $2
          group by pc.id
          order by (pc.ended_at is null) desc, pc.started_at desc, pc.id desc
          limit 1`,
        [userId, phone],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        lastCodeAt: row.last_code_at,
        verificationSid: row.verification_sid,
        codesTried: row.codes_tried,
        ending: row.ended_by,
      }
    },

    async recentCodeRequests(since) {
      const { rows } = await client.query<{ requested_at: Date; by_admin: boolean; to_phone: boolean }>(
        `select c.requested_at, pc.user_id = $1 as by_admin, pc.phone = $2 as to_phone
           from phone_check_code c
           join phone_check pc on pc.id = c.phone_check_id
          where c.requested_at > $3
            and (pc.user_id = $1 or pc.phone = $2)`,
        [userId, phone, since],
      )
      return {
        byAdmin: rows.filter((row) => row.by_admin).map((row) => row.requested_at),
        toPhone: rows.filter((row) => row.to_phone).map((row) => row.requested_at),
      }
    },

    async startAttempt(at) {
      const { rows } = await client.query<{ id: string }>(
        `insert into phone_check (user_id, phone, started_at) values ($1, $2, $3) returning id`,
        [userId, phone, at],
      )
      return rows[0]!.id
    },

    async recordCodeRequest(attemptId, at) {
      await client.query(
        `insert into phone_check_code (phone_check_id, requested_at)
         select id, $4 from phone_check where id = $1 and user_id = $2 and phone = $3`,
        [attemptId, userId, phone, at],
      )
    },

    async recordVerificationSid(attemptId, verificationSid) {
      await client.query(
        `update phone_check set verification_sid = $4
          where id = $1 and user_id = $2 and phone = $3`,
        [attemptId, userId, phone, verificationSid],
      )
    },

    async recordTry(attemptId) {
      await client.query(
        `update phone_check set codes_tried = codes_tried + 1
          where id = $1 and user_id = $2 and phone = $3`,
        [attemptId, userId, phone],
      )
    },

    async returnTry(attemptId) {
      await client.query(
        `update phone_check set codes_tried = greatest(codes_tried - 1, 0)
          where id = $1 and user_id = $2 and phone = $3`,
        [attemptId, userId, phone],
      )
    },

    async end(attemptId, ending, at) {
      await client.query(
        `update phone_check set ended_at = $4, ended_by = $5
          where id = $1 and user_id = $2 and phone = $3 and ended_at is null`,
        [attemptId, userId, phone, at, ending],
      )
    },
  })

  return {
    async adminPhone(ministryId: MinistryId, userId: string) {
      const { rows } = await pool.query<{ phone: string }>(
        `select phone from person where ministry_id = $1 and user_id = $2 limit 1`,
        [ministryId, userId],
      )
      return rows[0] ? phoneNumber(rows[0].phone) : null
    },

    async isVerified(userId, phone) {
      const { rows } = await pool.query(
        `select 1 from phone_check
          where user_id = $1 and phone = $2 and ended_by = 'verified'
          limit 1`,
        [userId, phone],
      )
      return rows.length > 0
    },

    async transact(userId, phone, work) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        // The Admin's lock and then the phone's, always in that order, so two
        // requests can never each hold the one the other is waiting for.
        await client.query(`select pg_advisory_xact_lock(hashtextextended('phone_check:account:' || $1, 0))`, [
          userId,
        ])
        await client.query(`select pg_advisory_xact_lock(hashtextextended('phone_check:phone:' || $1, 0))`, [
          phone,
        ])
        const result = await work(unitFor(client, userId, phone))
        await client.query('commit')
        return result
      } catch (error) {
        await client.query('rollback').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },

    async close() {
      await pool.end()
    },
  }
}
