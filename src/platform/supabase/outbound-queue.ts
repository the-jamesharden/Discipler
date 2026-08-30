import pg from 'pg'
import {
  outboundMessageId,
  personId,
  type MinistryId,
  type OutboundMessageId,
  type PersonId,
} from '~/domain/ids'
import type { OutboundMessageKind } from '~/domain/effects'
import { phoneNumber } from '~/domain/roster'
import type {
  ContactDetails,
  OutboundQueue,
  QueuedMessage,
  WithholdingReason,
} from '~/service/ports'

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

  /**
   * Ministry isolation is enforced by the database, and enforcement needs the
   * connection to say who it is acting for. Without this the sending layer would
   * read and write as the owner role, outside every policy -- the one place in
   * Discipler where a `person_id` arrives with no session behind it to bound it.
   *
   * A transaction per call rather than one around the drain: `dispatchQueue` hands
   * each message to Twilio between calls, and a transaction held open across an
   * external round trip is a connection held hostage by somebody else's latency.
   */
  const inMinistry = async <T>(
    ministryId: MinistryId,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect()
    let connectionIsSuspect: Error | undefined

    try {
      await client.query('begin')
      // Both reset at commit or rollback, so they cannot leak to whoever borrows
      // this connection next.
      await client.query('set local role discipler_command')
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministryId])

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

  return {
    async due(ministryId: MinistryId) {
      return inMinistry(ministryId, async (client) => {
        const { rows } = await client.query<{
          id: string
          person_id: string | null
          to_phone: string | null
          body: string
          discloses_person_id: string | null
          kind: OutboundMessageKind
        }>(
          `select id, person_id, to_phone, body, discloses_person_id, kind
             from outbound_message
            where ministry_id = $1 and sent_at is null and withheld_at is null
            order by enqueued_at`,
          [ministryId],
        )

        return rows.map(
          (row): QueuedMessage => ({
            id: outboundMessageId(row.id),
            personId: row.person_id ? personId(row.person_id) : null,
            toPhone: row.to_phone,
            body: row.body,
            disclosesPersonId: row.discloses_person_id
              ? personId(row.discloses_person_id)
              : null,
            kind: row.kind,
          }),
        )
      })
    },

    async mayReceive(
      ministryId: MinistryId,
      person: PersonId,
    ): Promise<WithholdingReason | null> {
      return inMinistry(ministryId, async (client) => {
        // Read through `person` so the Ministry bounds the question. `current_consent`
        // is security definer and answers about a Person wherever they are, so asking
        // it about an unscoped id would cross a Ministry boundary to do it.
        const { rows } = await client.query<{ opted_out: boolean; consented: boolean }>(
          `select
              exists (
                select 1 from person_opt_out o
                 where o.person_id = p.id
                   and o.ministry_id = p.ministry_id
                   and o.ended_at is null
              ) as opted_out,
              app.current_consent(p.id, 'sms') is true as consented
             from person p
            where p.id = $1 and p.ministry_id = $2`,
          [person, ministryId],
        )

        // No row means no such Person in this Ministry, which is refused for the
        // same reason a Person with no consent is: nothing here permits the send.
        const state = rows[0]
        if (!state) return 'recipient_has_no_sms_consent'
        // Opting out is the more recent decision and the one to report: a Person who
        // consented and then said STOP is not the same as one who never agreed.
        if (state.opted_out) return 'recipient_opted_out'
        if (!state.consented) return 'recipient_has_no_sms_consent'
        return null
      })
    },

    async timeZoneOf(ministryId: MinistryId): Promise<string> {
      return inMinistry(ministryId, async (client) => {
        const { rows } = await client.query<{ timezone: string }>(
          `select timezone from ministry where id = $1`,
          [ministryId],
        )

        // The queue is drained for a Ministry the caller has already named, so no
        // row here means the drain was asked about a Ministry that is not there --
        // which is a caller bug, not a message to withhold.
        const zone = rows[0]?.timezone
        if (!zone) throw new Error(`No Ministry ${ministryId} to read a timezone from`)
        return zone
      })
    },

    async nudgesSentTo(
      ministryId: MinistryId,
      person: PersonId,
      since: Date,
    ): Promise<readonly Date[]> {
      return inMinistry(ministryId, async (client) => {
        // Sent only, and nudges only. A withheld message never arrived and a held
        // one has not arrived yet, so neither spent any of this Person's budget.
        // Bounded by `since` because the caller knows how far back its own widest
        // window reaches and the index is built for exactly this predicate.
        const { rows } = await client.query<{ sent_at: Date }>(
          `select sent_at
             from outbound_message
            where ministry_id = $1
              and person_id = $2
              and kind = 'nudge'
              and sent_at is not null
              and sent_at >= $3
            order by sent_at desc`,
          [ministryId, person, since],
        )

        return rows.map((row) => row.sent_at)
      })
    },

    async contactToShare(
      ministryId: MinistryId,
      person: PersonId,
    ): Promise<ContactDetails | null> {
      return inMinistry(ministryId, async (client) => {
        const { rows } = await client.query<{ full_name: string; phone: string | null }>(
          `select p.full_name, p.phone
             from person p
            where p.id = $1
              and p.ministry_id = $2
              and p.phone is not null
              -- The *current* decision, not whether one was ever given. A Person who
              -- granted contact sharing and later withdrew it has two records, and the
              -- older one must not answer for them.
              and app.current_consent(p.id, 'contact_sharing') is true`,
          [person, ministryId],
        )

        const row = rows[0]
        return row?.phone
          ? { fullName: row.full_name, phone: phoneNumber(row.phone) }
          : null
      })
    },

    async markSent(ministryId: MinistryId, id: OutboundMessageId, at: Date) {
      await inMinistry(ministryId, (client) =>
        client.query(
          `update outbound_message set sent_at = $3
            where id = $1 and ministry_id = $2`,
          [id, ministryId, at],
        ),
      )
    },

    async withhold(
      ministryId: MinistryId,
      id: OutboundMessageId,
      reason: WithholdingReason,
      at: Date,
    ) {
      await inMinistry(ministryId, (client) =>
        client.query(
          `update outbound_message set withheld_at = $3, withheld_reason = $4
            where id = $1 and ministry_id = $2`,
          [id, ministryId, at, reason],
        ),
      )
    },

    close: () => pool.end(),
  }
}
