import pg from 'pg'
import { billingStateOf, type BillingFact, type StripeInboxEntry } from '~/domain/billing'
import type { PlantDecision } from '~/domain/church-plant'
import { ministryId, type MinistryId } from '~/domain/ids'
import { isBillingCycle, type TrialOffer } from '~/domain/offers'
import type {
  BillingRecords,
  BillingUnit,
  ChurchBilling,
  StripeEventEnding,
  StripeEventInbox,
  TrialOpening,
} from '~/service/ports'

/**
 * Billing's two kinds of record, on the trusted connection (Exponential launch,
 * ticket 03).
 *
 * The inbox belongs to no church, so like `ministry_setup` it is read and written
 * without `set local role discipler_command`. The records are the opposite: every
 * write drops into that role and names its church first, so row-level security holds
 * it to that church whatever the code asks for, and `service_role` is never involved.
 */
export interface PostgresBilling {
  readonly inbox: StripeEventInbox
  readonly records: BillingRecords
  close(): Promise<void>
}

interface InboxRow {
  readonly id: string
  readonly type: string
  readonly livemode: boolean
  readonly occurred_at: Date
  readonly stripe_customer_id: string | null
  readonly stripe_subscription_id: string | null
  readonly stripe_invoice_id: string | null
  readonly stripe_charge_id: string | null
  readonly named_churches: readonly string[]
}

const entryOf = (row: InboxRow): StripeInboxEntry => ({
  id: row.id,
  type: row.type,
  livemode: row.livemode,
  occurredAt: row.occurred_at,
  customerId: row.stripe_customer_id,
  subscriptionId: row.stripe_subscription_id,
  invoiceId: row.stripe_invoice_id,
  chargeId: row.stripe_charge_id,
  namedChurches: row.named_churches,
})

const TRIAL_OFFERS: readonly TrialOffer[] = ['none', 'exponential', 'referral']

const openingOf = (row: Readonly<Record<string, unknown>>): TrialOpening => {
  const offer = TRIAL_OFFERS.find((known) => known === row.offer)
  if (!offer || !isBillingCycle(row.billing_cycle)) {
    throw new Error('A trial opening holds a cycle or an offer this reader does not know')
  }
  return {
    subscriptionId: String(row.stripe_subscription_id),
    cycle: row.billing_cycle,
    offer,
    settled: row.settled_at !== null,
  }
}

const unitFor = (client: pg.PoolClient): BillingUnit => ({
  async record(fact: BillingFact, at: Date) {
    const { subscription } = fact

    const appended = await client.query(
      `insert into billing_event
         (ministry_id, stripe_event_id, stripe_event_type, stripe_event_at, recorded_at, livemode,
          stripe_customer_id, stripe_invoice_id, stripe_charge_id, stripe_subscription_id,
          subscription_status, stripe_price_id, stripe_latest_invoice_id,
          trial_ends_at, current_period_ends_at, cancels_at, awaiting_payment_method)
       values (app.command_ministry_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict (stripe_event_id) do nothing`,
      [
        fact.eventId,
        fact.eventType,
        fact.eventOccurredAt,
        at,
        fact.livemode,
        fact.customerId,
        fact.invoiceId,
        fact.chargeId,
        subscription?.id ?? null,
        subscription?.status ?? null,
        subscription?.priceId ?? null,
        subscription?.latestInvoiceId ?? null,
        subscription?.trialEndsAt ?? null,
        subscription?.currentPeriodEndsAt ?? null,
        subscription?.cancelsAt ?? null,
        subscription?.awaitingPaymentMethod ?? false,
      ],
    )

    // Pointers to look things up by, moved only by an event that was recorded, and
    // left alone by one that found no Subscription: nothing is forgotten by asking.
    if (appended.rowCount === 0 || !subscription) return

    await client.query(
      `update ministry_billing
          set stripe_subscription_id = $1, stripe_latest_invoice_id = $2,
              stripe_price_id = $3, livemode = $4
        where ministry_id = app.command_ministry_id()`,
      [subscription.id, subscription.latestInvoiceId, subscription.priceId, fact.livemode],
    )
  },

  async recordOpening(opening, at) {
    await client.query(
      `insert into trial_opening
         (stripe_subscription_id, ministry_id, billing_cycle, offer, opened_at)
       values ($1, app.command_ministry_id(), $2, $3, $4)
       on conflict (stripe_subscription_id) do nothing`,
      [opening.subscriptionId, opening.cycle, opening.offer, at],
    )
  },

  async openingOf(subscriptionId) {
    const { rows } = await client.query(
      `select * from trial_opening
        where stripe_subscription_id = $1 and ministry_id = app.command_ministry_id()`,
      [subscriptionId],
    )
    return rows[0] ? openingOf(rows[0]) : null
  },

  async settleOpening(subscriptionId, settledAs, at) {
    await client.query(
      `update trial_opening set settled_at = $2, settled_as = $3
        where stripe_subscription_id = $1 and settled_at is null`,
      [subscriptionId, at, settledAs],
    )
  },

  async claimFingerprint(fingerprint, grant, at) {
    const { rows } = await client.query<{ claimed: boolean }>(
      `select app.claim_payment_fingerprint($1, $2, $3) as claimed`,
      [fingerprint, grant, at],
    )
    return rows[0]!.claimed
  },

  async plantDecisionOf(applicationId) {
    const { rows } = await client.query<{ decision: PlantDecision | null }>(
      `select decision from church_plant_application where id::text = lower($1)`,
      [applicationId],
    )
    return rows[0]?.decision ?? null
  },

  async recordPlantDecision(applicationId, decision, at) {
    await client.query(
      `update church_plant_application set decision = $2, decided_at = $3
        where id::text = lower($1) and decision is null`,
      [applicationId, decision, at],
    )
  },
})

export const createPostgresBilling = (connectionString: string): PostgresBilling => {
  const pool = new pg.Pool({ connectionString })

  /** One transaction as `discipler_command`, for one church or, unscoped, for none. */
  const asCommand = async <T>(
    church: MinistryId | null,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect()
    let connectionIsSuspect: Error | undefined
    try {
      await client.query('begin')
      // Both reset at commit or rollback, so neither can leak to the next borrower.
      await client.query('set local role discipler_command')
      if (church) await client.query(`select set_config('discipler.ministry_id', $1, true)`, [church])
      const result = await work(client)
      await client.query('commit')
      return result
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
  }

  const inbox: StripeEventInbox = {
    async receive(entry, at) {
      const { rowCount } = await pool.query(
        `insert into stripe_event
           (id, type, livemode, occurred_at, received_at, stripe_customer_id,
            stripe_subscription_id, stripe_invoice_id, stripe_charge_id, named_churches)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (id) do nothing`,
        [
          entry.id,
          entry.type,
          entry.livemode,
          entry.occurredAt,
          at,
          entry.customerId,
          entry.subscriptionId,
          entry.invoiceId,
          entry.chargeId,
          entry.namedChurches,
        ],
      )
      return rowCount === 1
    },

    async claim(eventId, at, heldFor) {
      const { rows } = await pool.query<InboxRow>(
        `update stripe_event
            set attempts = attempts + 1, claimed_until = $3
          where id = $1
            and processed_at is null
            and (claimed_until is null or claimed_until <= $2)
          returning *`,
        [eventId, at, new Date(at.getTime() + heldFor)],
      )
      return rows[0] ? entryOf(rows[0]) : null
    },

    async finish(eventId, ending: StripeEventEnding, at) {
      await pool.query(
        `update stripe_event
            set processed_at = $2, outcome = $3, refusal = $4, resolved_church = $5,
                claimed_until = null
          where id = $1 and processed_at is null`,
        [
          eventId,
          at,
          ending.outcome,
          ending.outcome === 'refused' ? ending.refusal : null,
          ending.outcome === 'ignored' ? null : ending.church,
        ],
      )
    },

    async unprocessed(at, limit) {
      const { rows } = await pool.query<{ id: string }>(
        `select id from stripe_event
          where processed_at is null
            and (claimed_until is null or claimed_until <= $1)
          order by attempts, received_at
          limit $2`,
        [at, limit],
      )
      return rows.map((row) => row.id)
    },
  }

  const records: BillingRecords = {
    churchOfCustomer: (customerId) =>
      asCommand(null, async (client) => {
        const { rows } = await client.query<{ church: string | null }>(
          `select app.ministry_of_stripe_customer($1) as church`,
          [customerId],
        )
        return rows[0]?.church ? ministryId(rows[0].church) : null
      }),

    rememberCustomer: (church, customerId, livemode) =>
      asCommand(church, async (client) => {
        await client.query(
          `insert into ministry_billing (ministry_id, stripe_customer_id, livemode)
           values (app.command_ministry_id(), $1, $2)
           on conflict (ministry_id) do update
             set stripe_customer_id = excluded.stripe_customer_id, livemode = excluded.livemode
             where ministry_billing.stripe_customer_id is null`,
          [customerId, livemode],
        )
        const { rows } = await client.query<{ stripe_customer_id: string }>(
          `select stripe_customer_id from ministry_billing
            where ministry_id = app.command_ministry_id()`,
        )
        return rows[0]!.stripe_customer_id
      }),

    of: (church) =>
      asCommand(church, async (client): Promise<ChurchBilling> => {
        const { rows } = await client.query<
          Readonly<Record<string, unknown>> & {
            readonly stripe_customer_id: string | null
            readonly stripe_subscription_id: string | null
            readonly stripe_latest_invoice_id: string | null
            readonly stripe_price_id: string | null
          }
        >(
          `select s.*, b.stripe_customer_id, b.stripe_subscription_id,
                  b.stripe_latest_invoice_id, b.stripe_price_id
             from app.billing_state_of(app.command_ministry_id()) s
             left join ministry_billing b on b.ministry_id = app.command_ministry_id()`,
        )
        const row = rows[0]!
        return {
          state: billingStateOf(row),
          customerId: row.stripe_customer_id,
          subscriptionId: row.stripe_subscription_id,
          latestInvoiceId: row.stripe_latest_invoice_id,
          priceId: row.stripe_price_id,
        }
      }),

    establish: (church, work) =>
      asCommand(church, async (client) => {
        // Before anything is read from Stripe: see the port for why.
        await client.query(
          `select pg_advisory_xact_lock(hashtextextended(app.command_ministry_id()::text || ':billing', 0))`,
        )
        return work(unitFor(client))
      }),
  }

  return { inbox, records, close: () => pool.end() }
}
