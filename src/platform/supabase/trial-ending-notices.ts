import pg from 'pg'
import { asEmailAddress } from '~/domain/email'
import { ministryId } from '~/domain/ids'
import type { TrialEndingCandidate, TrialEndingNotices } from '~/service/ports'

/**
 * The trial-ending watch's reads and its one table (Exponential launch, ticket 33), on the
 * trusted connection, because the question spans every church, as the other watches' do.
 *
 * It reads `billing_event` itself and not `app.billing_state_of`, which answers only for a
 * church a caller belongs to. What it reads is the row that function reads: the last with a
 * Subscription on it. The Admins are everybody an Admin of the church now.
 */
export interface PostgresTrialEndingNotices extends TrialEndingNotices {
  close(): Promise<void>
}

interface Row {
  readonly ministry_id: string
  readonly name: string
  readonly timezone: string
  readonly stripe_customer_id: string
  readonly stripe_subscription_id: string
  readonly trial_ends_at: Date
  readonly user_id: string
  readonly email: string
  readonly full_name: string
}

export const createPostgresTrialEndingNotices = (connectionString: string): PostgresTrialEndingNotices => {
  const pool = new pg.Pool({ connectionString })

  return {
    async toConsider(now, before) {
      const { rows } = await pool.query<Row>(
        `select m.id as ministry_id, m.name, m.timezone, b.stripe_customer_id,
                e.stripe_subscription_id, e.trial_ends_at,
                mm.user_id, u.email, p.full_name
           from ministry m
           join ministry_billing b on b.ministry_id = m.id
           join lateral (
             select h.stripe_subscription_id, h.subscription_status, h.awaiting_payment_method,
                    h.trial_ends_at, h.cancels_at
               from billing_event h
              where h.ministry_id = m.id and h.subscription_status is not null
              order by h.position desc
              limit 1
           ) e on true
           join ministry_member mm on mm.ministry_id = m.id and mm.tier = 'admin'
           join auth.users u on u.id = mm.user_id
           join person p on p.ministry_id = m.id and p.user_id = mm.user_id
           left join church_plant_application plant on plant.ministry_id = m.id
          where not b.billed_outside_stripe
            and b.stripe_customer_id is not null
            and m.timezone is not null
            and e.subscription_status = 'trialing'
            and not e.awaiting_payment_method
            and e.cancels_at is null
            and e.trial_ends_at > $1
            and e.trial_ends_at <= $2
            and plant.decision is distinct from 'approved'
            and u.email is not null
            and not exists (
              select 1 from trial_ending_email t
               where t.stripe_subscription_id = e.stripe_subscription_id and t.user_id = mm.user_id
            )
          order by e.trial_ends_at, m.id, mm.created_at, mm.user_id`,
        [now, before],
      )

      const candidates = new Map<string, TrialEndingCandidate>()
      for (const row of rows) {
        const to = asEmailAddress(row.email)
        if (!to) continue
        const admin = { userId: row.user_id, to, fullName: row.full_name }
        const seen = candidates.get(row.ministry_id)
        candidates.set(
          row.ministry_id,
          seen
            ? { ...seen, admins: [...seen.admins, admin] }
            : {
                church: ministryId(row.ministry_id),
                churchName: row.name,
                timeZone: row.timezone,
                customerId: row.stripe_customer_id,
                subscriptionId: row.stripe_subscription_id,
                trialEndsAt: row.trial_ends_at,
                admins: [admin],
              },
        )
      }
      return [...candidates.values()]
    },

    async recordSent({ church, subscriptionId, userId, at }) {
      await pool.query(
        `insert into trial_ending_email (stripe_subscription_id, user_id, church, sent_at)
         values ($1, $2, $3, $4)
         on conflict (stripe_subscription_id, user_id) do nothing`,
        [subscriptionId, userId, church, at],
      )
    },

    async close() {
      await pool.end()
    },
  }
}
