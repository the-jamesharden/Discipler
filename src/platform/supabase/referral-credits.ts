import pg from 'pg'
import { ministryId } from '~/domain/ids'
import { REFERRAL_EVENTS } from '~/domain/referral-credit'
import type { DueReferralCredit, ReferralCreditRecords } from '~/service/ports'

/**
 * The record of referral credits (Exponential launch, ticket 32), on the trusted
 * connection and never as a church: `referral_credit` spans two, and neither may read it.
 * The events it writes go on the inviting church's own history, in the statement that
 * makes the change, so a credit cannot be applied without its event or the event written
 * twice.
 */
export interface PostgresReferralCredits extends ReferralCreditRecords {
  /** What is waiting for James, oldest first, for `scripts/referral-review.ts`. */
  underReview(): Promise<readonly CreditUnderReview[]>
  /** Marks one as settled. Asking again for one already settled keeps the first answer. */
  settleReview(creditId: string, as: ReviewSettledAs, at: Date): Promise<'settled' | 'already_settled' | 'not_under_review'>
  close(): Promise<void>
}

export type ReviewSettledAs = 'credited' | 'not_credited'

export interface CreditUnderReview {
  readonly id: string
  readonly invitingChurch: string | null
  readonly invitedChurch: string
  readonly because: string
  readonly sentAt: Date
}

interface DueRow {
  readonly id: string
  readonly referral_id: string
  readonly state: 'held' | 'applying'
  readonly inviting_church: string | null
  readonly inviting_name: string | null
  readonly invited_church: string
  readonly invited_name: string
  readonly stripe_charge_id: string | null
  readonly paid_at: Date
  readonly amount_cents: number | null
}

const dueOf = (row: DueRow): DueReferralCredit => ({
  id: row.id,
  referralId: row.referral_id,
  state: row.state,
  invitingChurch: row.inviting_church ? ministryId(row.inviting_church) : null,
  invitingChurchName: row.inviting_name,
  invitedChurch: ministryId(row.invited_church),
  invitedChurchName: row.invited_name,
  chargeId: row.stripe_charge_id,
  paidAt: row.paid_at,
  amountCents: row.amount_cents,
})

export const createPostgresReferralCredits = (connectionString: string): PostgresReferralCredits => {
  const pool = new pg.Pool({ connectionString })

  return {
    async referralYetToEarn(invitedChurch) {
      const { rows } = await pool.query<{ id: string }>(
        `select r.id
           from referral r
          where r.invited_church = $1
            and r.inviting_church is not null
            and not exists (select 1 from referral_credit c where c.referral = r.id)`,
        [invitedChurch],
      )
      return rows[0]?.id ?? null
    },

    async earn({ referralId, invoiceId, chargeId, paidAt, heldUntil, at }) {
      const { rows } = await pool.query<{ earned: boolean }>(
        `with made as (
           insert into referral_credit
             (referral, stripe_invoice_id, stripe_charge_id, paid_at, held_until, earned_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (referral) do nothing
           returning referral
         ), told as (
           insert into ministry_event (ministry_id, occurred_at, type, subject_type, subject_id)
           select r.inviting_church, $6::timestamptz, $7, 'referral', r.id
             from made
             join referral r on r.id = made.referral
            where r.inviting_church is not null
         )
         select exists (select 1 from made) as earned`,
        [referralId, invoiceId, chargeId, paidAt, heldUntil, at, REFERRAL_EVENTS.paying],
      )
      return rows[0]!.earned
    },

    async heldForCharge(chargeId) {
      const { rows } = await pool.query<{ id: string }>(
        `select id from referral_credit where stripe_charge_id = $1 and state = 'held'`,
        [chargeId],
      )
      return rows[0]?.id ?? null
    },

    async due(at, limit) {
      const { rows } = await pool.query<DueRow>(
        `select c.id, r.id as referral_id, c.state, r.inviting_church, inviting.name as inviting_name,
                r.invited_church, invited.name as invited_name, c.stripe_charge_id, c.paid_at, c.amount_cents
           from referral_credit c
           join referral r on r.id = c.referral
           join ministry invited on invited.id = r.invited_church
           left join ministry inviting on inviting.id = r.inviting_church
          where c.state in ('held', 'applying')
            and c.held_until <= $1
            and (c.claimed_until is null or c.claimed_until <= $1)
          order by c.held_until, c.id
          limit $2`,
        [at, limit],
      )
      return rows.map(dueOf)
    },

    async lease(creditId, at, heldFor) {
      const { rowCount } = await pool.query(
        `update referral_credit
            set claimed_until = $3
          where id = $1
            and state in ('held', 'applying')
            and (claimed_until is null or claimed_until <= $2)`,
        [creditId, at, new Date(at.getTime() + heldFor)],
      )
      return rowCount === 1
    },

    async cancel(creditId, because, at) {
      await pool.query(
        `update referral_credit
            set state = 'cancelled', cancelled_at = $3, cancelled_because = $2, claimed_until = null
          where id = $1 and state = 'held'`,
        [creditId, because, at],
      )
    },

    async sendToReview(creditId, because, at) {
      await pool.query(
        `update referral_credit
            set state = 'in_review', sent_to_review_at = $3, review_because = $2, claimed_until = null
          where id = $1 and state = 'held'`,
        [creditId, because, at],
      )
    },

    async decideToApply(creditId, cents) {
      await pool.query(
        `update referral_credit set state = 'applying', amount_cents = $2
          where id = $1 and state = 'held'`,
        [creditId, cents],
      )
    },

    async markApplied(creditId, balanceTransactionId, at) {
      await pool.query(
        `with applied as (
           update referral_credit
              set state = 'applied', stripe_balance_transaction_id = $2, applied_at = $3, claimed_until = null
            where id = $1 and state = 'applying'
            returning referral
         )
         insert into ministry_event (ministry_id, occurred_at, type, subject_type, subject_id)
         select r.inviting_church, $3::timestamptz, $4, 'referral', r.id
           from applied
           join referral r on r.id = applied.referral
          where r.inviting_church is not null`,
        [creditId, balanceTransactionId, at, REFERRAL_EVENTS.creditApplied],
      )
    },

    async adminEmails(church) {
      const { rows } = await pool.query<{ email: string }>(
        `select u.email
           from ministry_member m
           join auth.users u on u.id = m.user_id
          where m.ministry_id = $1
            and m.tier = 'admin'
            and u.email is not null`,
        [church],
      )
      return rows.map((row) => row.email)
    },

    async underReview() {
      const { rows } = await pool.query<{
        id: string
        inviting_name: string | null
        invited_name: string
        review_because: string
        sent_to_review_at: Date
      }>(
        `select c.id, inviting.name as inviting_name, invited.name as invited_name,
                c.review_because, c.sent_to_review_at
           from referral_credit c
           join referral r on r.id = c.referral
           join ministry invited on invited.id = r.invited_church
           left join ministry inviting on inviting.id = r.inviting_church
          where c.state = 'in_review'
          order by c.sent_to_review_at, c.id`,
      )
      return rows.map((row) => ({
        id: row.id,
        invitingChurch: row.inviting_name,
        invitedChurch: row.invited_name,
        because: row.review_because,
        sentAt: row.sent_to_review_at,
      }))
    },

    async settleReview(creditId, as, at) {
      const { rows } = await pool.query<{ state: string; changed: boolean }>(
        `with settled as (
           update referral_credit
              set state = 'settled', settled_at = $3, settled_as = $2
            where id = $1 and state = 'in_review'
            returning id
         )
         select c.state, exists (select 1 from settled) as changed
           from referral_credit c
          where c.id = $1`,
        [creditId, as, at],
      )
      const credit = rows[0]
      if (credit?.changed) return 'settled'
      return credit?.state === 'settled' ? 'already_settled' : 'not_under_review'
    },

    close: () => pool.end(),
  }
}
