import pg from 'pg'
import { ministryId, type MinistryId } from '~/domain/ids'
import { billingStateOf, type SubscriptionStatus } from '~/domain/billing'
import type { ChurchPriceRecord } from '~/domain/over-200'
import type { CalendarMonth } from '~/domain/week'
import type { Over200Church, Over200FollowUp, Over200FollowUps } from '~/service/ports'
import { growthHistoryFrom } from './overview-reader'

/**
 * The over-200 watch's reads and its one table (Exponential launch, ticket 14).
 *
 * The table and the question of which churches to look at span every church, so they
 * are on the trusted connection, as `ministry_setup` is. One church's history is the
 * opposite: it is read as `discipler_command` with that church named first, so
 * row-level security holds the read to that church whatever the code asks for.
 */
export interface PostgresOver200FollowUps extends Over200FollowUps {
  close(): Promise<void>
}

interface ChurchRow {
  readonly id: string
  readonly name: string
  readonly timezone: string
  readonly stripe_customer_id: string
  readonly followed_up: readonly string[]
}

interface FollowUpRow {
  readonly church: string
  readonly church_name: string
  readonly stripe_customer_id: string
  readonly month: string
  readonly fewest_people: number
}

const churchOf = (row: ChurchRow): Over200Church => ({
  id: ministryId(row.id),
  name: row.name,
  timeZone: row.timezone,
  customerId: row.stripe_customer_id,
  followedUp: row.followed_up as readonly CalendarMonth[],
})

const followUpOf = (row: FollowUpRow): Over200FollowUp => ({
  church: ministryId(row.church),
  churchName: row.church_name,
  customerId: row.stripe_customer_id,
  month: row.month as CalendarMonth,
  fewestPeople: row.fewest_people,
})

export const createPostgresOver200FollowUps = (connectionString: string): PostgresOver200FollowUps => {
  const pool = new pg.Pool({ connectionString })

  return {
    async churchesToAsk(firstPrices, since, limit) {
      // Everybody with a membership open at any time since then is at least as many as were
      // ever in an active relationship at one instant, so a church at or under the limit
      // here cannot be above it, and its history is not worth reading. A church with no
      // zone has no months to be asked about, and none is guessed.
      const { rows } = await pool.query<ChurchRow>(
        `select m.id, m.name, m.timezone, b.stripe_customer_id,
                coalesce(
                  (select array_agg(f.month) from over_200_follow_up f where f.church = m.id),
                  '{}'
                ) as followed_up
           from ministry m
           join ministry_billing b on b.ministry_id = m.id
          where not b.billed_outside_stripe
            and b.stripe_customer_id is not null
            and b.stripe_price_id = any($1)
            and m.timezone is not null
            and (select count(distinct r.person_id)
                   from relationship_member r
                  where r.ministry_id = m.id
                    and (r.ended_at is null or r.ended_at > $2)) > $3
          order by m.created_at, m.id`,
        [firstPrices, since, limit],
      )
      return rows.map(churchOf)
    },

    async recordsOf(church: MinistryId) {
      const client = await pool.connect()
      let connectionIsSuspect: Error | undefined
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [church])

        const growth = await client.query<{ growth: Record<string, unknown> }>(
          `select app.growth_inputs(app.command_ministry_id()) as growth`,
        )
        // Rows that found no Subscription say nothing about the price, and
        // `app.billing_state_of` passes over them for the same reason. Nor do rows from
        // before a trial's payment method was confirmed: that church had no access yet,
        // so it was not on the price, and a trial confirmed partway through a month must
        // not count as on it from when the month opened.
        const prices = await client.query<{
          recorded_at: Date
          subscription_status: SubscriptionStatus
          stripe_price_id: string | null
        }>(
          `select recorded_at, subscription_status, stripe_price_id
             from billing_event
            where ministry_id = app.command_ministry_id()
              and subscription_status is not null
              and not awaiting_payment_method
            order by position`,
        )
        const state = await client.query<Record<string, unknown>>(
          `select * from app.billing_state_of(app.command_ministry_id())`,
        )
        await client.query('commit')

        return {
          standing: billingStateOf(state.rows[0] ?? {}).standing,
          history: growthHistoryFrom({ growth: growth.rows[0]?.growth }),
          prices: prices.rows.map(
            (row): ChurchPriceRecord => ({
              at: row.recorded_at,
              status: row.subscription_status,
              priceId: row.stripe_price_id,
            }),
          ),
        }
      } catch (error) {
        try {
          await client.query('rollback')
        } catch (rollbackError) {
          connectionIsSuspect =
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
        }
        throw error
      } finally {
        client.release(connectionIsSuspect)
      }
    },

    async record(followUp, at) {
      await pool.query(
        `insert into over_200_follow_up
           (church, month, church_name, stripe_customer_id, fewest_people, recorded_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (church, month) do nothing`,
        [followUp.church, followUp.month, followUp.churchName, followUp.customerId, followUp.fewestPeople, at],
      )
    },

    async unsent() {
      const { rows } = await pool.query<FollowUpRow>(
        `select church, church_name, stripe_customer_id, month, fewest_people
           from over_200_follow_up
          where told_at is null
          order by recorded_at, church, month`,
      )
      return rows.map(followUpOf)
    },

    async recordTold(church, month, at) {
      await pool.query(
        `update over_200_follow_up set told_at = $3
          where church = $1 and month = $2 and told_at is null`,
        [church, month, at],
      )
    },

    close: () => pool.end(),
  }
}
