import pg from 'pg'
import { personId, type MinistryId, type PersonId } from '~/domain/ids'
import { phoneNumber } from '~/domain/roster'
import type {
  ContactDetails,
  OutboundQueue,
  QueuedMessage,
  WithholdingReason,
} from '~/service/outbound-dispatch'

/**
 * The queue as the sending layer sees it. It reads and writes on the same trusted
 * connection the command boundary uses, because draining the queue is not something
 * a browser session ever does.
 */
export interface PostgresOutboundQueue extends OutboundQueue {
  close(): Promise<void>
}

export const createPostgresOutboundQueue = (
  connectionString: string,
): PostgresOutboundQueue => {
  const pool = new pg.Pool({ connectionString })

  return {
    async due(ministryId: MinistryId) {
      const { rows } = await pool.query<{
        id: string
        person_id: string | null
        to_phone: string | null
        body: string
        discloses_person_id: string | null
      }>(
        `select id, person_id, to_phone, body, discloses_person_id
           from outbound_message
          where ministry_id = $1 and sent_at is null and withheld_at is null
          order by enqueued_at`,
        [ministryId],
      )

      return rows.map(
        (row): QueuedMessage => ({
          id: row.id,
          personId: row.person_id ? personId(row.person_id) : null,
          toPhone: row.to_phone,
          body: row.body,
          disclosesPersonId: row.discloses_person_id
            ? personId(row.discloses_person_id)
            : null,
        }),
      )
    },

    async mayReceive(person: PersonId): Promise<WithholdingReason | null> {
      const { rows } = await pool.query<{ opted_out: boolean; consented: boolean }>(
        `select
            exists (
              select 1 from person_opt_out o
               where o.person_id = $1 and o.ended_at is null
            ) as opted_out,
            exists (
              select 1 from consent_record c
               where c.person_id = $1 and c.consent = 'sms'
            ) as consented`,
        [person],
      )

      const state = rows[0]
      if (!state) return 'recipient_has_no_sms_consent'
      // Opting out is the more recent decision and the one to report: a Person who
      // consented and then said STOP is not the same as one who never agreed.
      if (state.opted_out) return 'recipient_opted_out'
      if (!state.consented) return 'recipient_has_no_sms_consent'
      return null
    },

    async contactToShare(person: PersonId): Promise<ContactDetails | null> {
      const { rows } = await pool.query<{ full_name: string; phone: string | null }>(
        `select p.full_name, p.phone
           from person p
          where p.id = $1
            and p.phone is not null
            and exists (
              select 1 from consent_record c
               where c.person_id = p.id and c.consent = 'contact_sharing'
            )`,
        [person],
      )

      const row = rows[0]
      return row?.phone ? { fullName: row.full_name, phone: phoneNumber(row.phone) } : null
    },

    async markSent(id: string, at: Date) {
      await pool.query(`update outbound_message set sent_at = $2 where id = $1`, [id, at])
    },

    async withhold(id: string, reason: WithholdingReason, at: Date) {
      await pool.query(
        `update outbound_message set withheld_at = $2, withheld_reason = $3 where id = $1`,
        [id, at, reason],
      )
    },

    close: () => pool.end(),
  }
}
