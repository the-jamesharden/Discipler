import pg from 'pg'
import { asEmailAddress } from '~/domain/email'
import { ministryId, type MinistryId } from '~/domain/ids'
import { isBillingCycle } from '~/domain/offers'
import type { ChurchSignup, ChurchSignups, PaymentReminderCandidate } from '~/service/ports'

/**
 * What a self-signed-up church chose, and its one reminder (Exponential launch, ticket
 * 18). A church's own row is read and written as `discipler_command` with that church
 * named first, so row-level security holds it there. Which churches are owed a reminder
 * spans every church, so that one read is on the trusted connection, as the over-200
 * watch's is.
 */
export interface PostgresChurchSignups extends ChurchSignups {
  close(): Promise<void>
}

/** One definition, which the page functions read too: `app.subscription_ever_began`. */
const BEGAN = 'app.subscription_ever_began(s.ministry_id)'

export const createPostgresChurchSignups = (connectionString: string): PostgresChurchSignups => {
  const pool = new pg.Pool({ connectionString })

  const asTheChurch = async <T>(church: MinistryId, work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    let connectionIsSuspect: Error | undefined
    try {
      await client.query('begin')
      await client.query('set local role discipler_command')
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [church])
      const result = await work(client)
      await client.query('commit')
      return result
    } catch (error) {
      try {
        await client.query('rollback')
      } catch (rollbackError) {
        connectionIsSuspect = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
      }
      throw error
    } finally {
      client.release(connectionIsSuspect)
    }
  }

  return {
    of: (church) =>
      asTheChurch(church, async (client): Promise<ChurchSignup | null> => {
        const { rows } = await client.query<{
          billing_cycle: string
          carried_code: string | null
          timezone: string
          reminders_off: boolean
          began: boolean
        }>(
          `select s.billing_cycle, s.carried_code, m.timezone,
                  s.reminders_off_at is not null as reminders_off,
                  ${BEGAN} as began
             from church_signup s
             join ministry m on m.id = s.ministry_id
            where s.ministry_id = app.command_ministry_id()`,
        )
        const row = rows[0]
        if (!row) return null
        if (!isBillingCycle(row.billing_cycle)) {
          throw new Error('A church_signup row holds a billing cycle this reader does not know')
        }
        return {
          cycle: row.billing_cycle,
          carriedCode: row.carried_code,
          timeZone: row.timezone,
          began: row.began,
          remindersOff: row.reminders_off,
        }
      }),

    async remindersToConsider(openedSince) {
      const { rows } = await pool.query<{
        ministry_id: string
        name: string
        timezone: string
        carried_code: string | null
        opened_at: Date
        email: string
        full_name: string
      }>(
        `select s.ministry_id, m.name, m.timezone, s.carried_code,
                opened.occurred_at as opened_at, u.email, p.full_name
           from church_signup s
           join ministry m on m.id = s.ministry_id
           join ministry_event opened
             on opened.ministry_id = s.ministry_id and opened.type = 'ministry.opened'
           join lateral (
             select mm.user_id
               from ministry_member mm
              where mm.ministry_id = s.ministry_id and mm.tier = 'admin'
              order by mm.created_at, mm.user_id
              limit 1
           ) admin on true
           join auth.users u on u.id = admin.user_id
           join person p on p.ministry_id = s.ministry_id and p.user_id = admin.user_id
           left join ministry_billing b on b.ministry_id = s.ministry_id
          where s.reminder_sent_at is null
            and s.reminders_off_at is null
            and not coalesce(b.billed_outside_stripe, false)
            and opened.occurred_at >= $1
            and u.email is not null
            and not ${BEGAN}
          order by opened.occurred_at, s.ministry_id`,
        [openedSince],
      )

      return rows.flatMap((row): PaymentReminderCandidate[] => {
        const to = asEmailAddress(row.email)
        return to
          ? [
              {
                church: ministryId(row.ministry_id),
                churchName: row.name,
                timeZone: row.timezone,
                carriedCode: row.carried_code,
                openedAt: row.opened_at,
                to,
                fullName: row.full_name,
              },
            ]
          : []
      })
    },

    recordReminderSent: (church, at) =>
      asTheChurch(church, async (client) => {
        await client.query(
          `update church_signup set reminder_sent_at = $1
            where ministry_id = app.command_ministry_id() and reminder_sent_at is null`,
          [at],
        )
      }),

    turnRemindersOff: (church, at) =>
      asTheChurch(church, async (client) => {
        await client.query(
          `update church_signup set reminders_off_at = $1
            where ministry_id = app.command_ministry_id() and reminders_off_at is null`,
          [at],
        )
      }),

    close: () => pool.end(),
  }
}
