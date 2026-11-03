import type pg from 'pg'
import { createMinistryWithAdmin, createRelationship, type MinistryFixture } from './local-supabase'

/**
 * A church with hundreds of people in it, for the over-200 follow-up (Exponential launch,
 * ticket 14). The rule is about a number no fixture reaches one person at a time, so
 * the people are written in bulk, through the same tables and past the same triggers
 * that a Person who completed Intake and joined a Group goes through.
 */
export interface LargeChurchOptions {
  readonly timeZone?: string
  /** The Stripe Price it is on. Absent is a church with no billing record to speak of. */
  readonly priceId?: string
  readonly status?: string
  /** When Discipler recorded the church as being on that price. */
  readonly onThePriceSince?: Date
  readonly billedOutsideStripe?: boolean
}

export const aLargeChurch = async (
  pool: pg.Pool,
  name: string,
  options: LargeChurchOptions = {},
): Promise<MinistryFixture> => {
  const ministry = await createMinistryWithAdmin(name)
  await pool.query(`update ministry set timezone = $2 where id = $1`, [ministry.id, options.timeZone ?? 'UTC'])

  // Upserted, and the flag said outright, whatever provisioning decided about a fixture.
  const customer = `cus_${crypto.randomUUID().replaceAll('-', '')}`
  await pool.query(
    `insert into ministry_billing (ministry_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, livemode, billed_outside_stripe)
     values ($1, $2, $3, $4, false, $5)
     on conflict (ministry_id) do update
       set stripe_customer_id = excluded.stripe_customer_id,
           stripe_subscription_id = excluded.stripe_subscription_id,
           stripe_price_id = excluded.stripe_price_id,
           livemode = excluded.livemode,
           billed_outside_stripe = excluded.billed_outside_stripe`,
    [
      ministry.id,
      customer,
      options.priceId ? `sub_${customer}` : null,
      options.priceId ?? null,
      options.billedOutsideStripe ?? false,
    ],
  )

  if (options.priceId) {
    const since = options.onThePriceSince ?? new Date('2026-01-01T00:00:00Z')
    await pool.query(
      `insert into billing_event
         (ministry_id, stripe_event_id, stripe_event_type, stripe_event_at, recorded_at, livemode,
          stripe_customer_id, stripe_subscription_id, subscription_status, stripe_price_id)
       values ($1, $2, 'customer.subscription.created', $3, $3, false, $4, $5, $6, $7)`,
      [
        ministry.id,
        `evt_${crypto.randomUUID()}`,
        since,
        customer,
        `sub_${customer}`,
        options.status ?? 'active',
        options.priceId,
      ],
    )
  }

  return ministry
}

/** A running Group of its own, accepted when it started, for the people added to it. */
export const aGroupFrom = (ministry: MinistryFixture, startedAt: Date): Promise<string> =>
  createRelationship(ministry, 'group', { createdAt: startedAt, acceptedAt: startedAt })

/** Adds `count` people who completed Intake, as Disciples of the Group, and answers who they are. */
export const peopleInAGroup = async (
  pool: pg.Pool,
  ministry: MinistryFixture,
  group: string,
  count: number,
  startedAt: Date,
  endedAt: Date | null = null,
): Promise<readonly string[]> => {
  const { rows } = await pool.query<{ id: string }>(
    `insert into person (ministry_id, full_name)
     select $1, 'Person ' || n from generate_series(1, $2::int) n
     returning id`,
    [ministry.id, count],
  )
  const people = rows.map((row) => row.id)

  await pool.query(
    `insert into intake_submission (ministry_id, person_id, submitted_at, age_band, gender, discipleship_goal_other)
     select $1, person, now(), '25-34', 'female', 'To grow'
       from unnest($2::uuid[]) person`,
    [ministry.id, people],
  )
  await pool.query(
    `insert into consent_record (ministry_id, person_id, consent, granted, version, source, decided_at)
     select $1, person, consent::text::consent_kind, true, '2026-09-v1', 'pastor_link', now()
       from unnest($2::uuid[]) person, unnest(array['sms', 'contact_sharing']) consent`,
    [ministry.id, people],
  )
  await addToAGroup(pool, ministry, group, people, startedAt, endedAt)
  return people
}

/** Memberships for people already on the Roster, as a Group's Disciples. */
export const addToAGroup = async (
  pool: pg.Pool,
  ministry: MinistryFixture,
  group: string,
  people: readonly string[],
  startedAt: Date,
  endedAt: Date | null = null,
): Promise<void> => {
  await pool.query(
    `insert into relationship_member (ministry_id, relationship_id, kind, person_id, role, started_at, ended_at)
     select $1, $2, 'group', person, 'participant', $4, $5
       from unnest($3::uuid[]) person`,
    [ministry.id, group, people, startedAt, endedAt],
  )
}
