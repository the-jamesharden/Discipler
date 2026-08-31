import pg from 'pg'
import {
  outboundMessageId,
  personId,
  type MinistryId,
  type OutboundMessageId,
  type PersonId,
} from '~/domain/ids'
import { phoneNumber } from '~/domain/roster'
import type {
  ClaimOutcome,
  ContactDetails,
  OutboundQueue,
  QueuedMessage,
  WithholdingReason,
} from '~/service/ports'
import type {
  OutboundMessageKind,
  SerialisationOfAMessage,
} from '~/domain/outstanding-reply'

/**
 * The queue as the sending layer sees it. It reads and writes on the same trusted
 * connection the command boundary uses, because draining the queue is not something
 * a browser session ever does.
 */
export interface PostgresOutboundQueue extends OutboundQueue {
  close(): Promise<void>
}

/**
 * The unique partial index refusing a second open conversation on one number. Read
 * by name rather than by error class, because `23505` alone would also match an
 * index this queue has no business swallowing.
 */
const isDuplicateOpenReply = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: string }).code === '23505' &&
  (error as { constraint?: string }).constraint ===
    'outbound_message_one_open_reply_per_number'

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
          message_kind: OutboundMessageKind
        }>(
          `select id, person_id, to_phone, body, discloses_person_id, message_kind
             from outbound_message
            where ministry_id = $1 and sent_at is null and withheld_at is null
            -- Insertion order breaks the tie, and the tie is the ordinary case:
            -- one command reads the clock once and enqueues everything it produces
            -- at that instant. Left to the planner, two questions to one number
            -- would be held in whichever order the rows happened to come back.
            order by enqueued_at, created_at`,
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
            kind: row.message_kind,
          }),
        )
      })
    },

    async sendingNumber(ministryId: MinistryId) {
      return inMinistry(ministryId, async (client) => {
        const { rows } = await client.query<{ sending_number: string | null }>(
          `select sending_number from ministry where id = $1`,
          [ministryId],
        )

        // No row and a null column are the same answer to the sending layer -- there
        // is no number to send as -- and neither is a fact about any recipient, so
        // neither is a withholding. `dispatchQueue` refuses the drain on both.
        return rows[0]?.sending_number ?? null
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

    async claim(
      ministryId: MinistryId,
      id: OutboundMessageId,
      message: SerialisationOfAMessage,
      at: Date,
    ): Promise<ClaimOutcome> {
      // Which messages take a number and which wait for one is the domain's answer,
      // arrived at before this was called. Nothing here reads `message_kind`: the
      // transaction's whole job is to make the decision atomic, not to make it.
      try {
        return await inMinistry(ministryId, async (client): Promise<ClaimOutcome> => {
          // The row this worker is about to send, locked. `skip locked` rather than
          // a wait, because a row another worker already holds is that worker's to
          // send and blocking on it would serialise two drains that never needed to
          // meet.
          const { rows } = await client.query<{ prompt_key: string | null }>(
            `select prompt_key
               from outbound_message
              where id = $1 and ministry_id = $2
                and sent_at is null and withheld_at is null
              for update skip locked`,
            [id, ministryId],
          )

          const row = rows[0]
          if (!row) return 'held'

          // Nothing to serialise on. A message with no number is bound for an
          // Admin, or is about to be withheld for having no recipient.
          const key = row.prompt_key
          if (!key) return 'claimed'

          if (message.waitsForAnOpenReply) {
            // `id <> $1` because a message can be here twice: the vendor refused it
            // on an earlier drain and it is being retried. Its own conversation is
            // not one it should be waiting behind.
            const { rows: busy } = await client.query(
              `select 1 from outbound_message
                where ministry_id = $2 and prompt_key = $3
                  and prompt_state = 'open' and id <> $1
                limit 1`,
              [id, ministryId, key],
            )
            if (busy.length > 0) return 'held'
          }

          if (message.opensAnOutstandingReply) {
            // The later prompt owns the next reply, so whatever was open on this
            // number stops owning it. Only a keyword question ever reaches this with
            // something to supersede: a scheduled one would have waited above.
            await client.query(
              `update outbound_message set prompt_state = 'superseded'
                where ministry_id = $2 and prompt_key = $3
                  and prompt_state = 'open' and id <> $1`,
              [id, ministryId, key],
            )
            await client.query(
              `update outbound_message
                  set prompt_state = 'open', reply_opened_at = $2
                where id = $1`,
              [id, at],
            )
          }

          return 'claimed'
        })
      } catch (error) {
        // Another worker took this number between the read above and the write. The
        // unique index is what caught it -- the row locks could not, because two
        // workers holding two different rows share nothing but the key -- and the
        // answer is the same one a busy number gets: leave it for the next drain.
        if (isDuplicateOpenReply(error)) return 'held'
        throw error
      }
    },

    async release(ministryId: MinistryId, id: OutboundMessageId) {
      // The vendor refused it, so it never reached anybody and has no reply coming.
      // Without this, a number Twilio cannot deliver to would hold its owner's
      // conversation for two days over a message that does not exist.
      //
      // What it does not undo is the supersession this claim may have caused. The
      // question that lost the number does not get it back: a Leader mid-keyword is
      // mid-keyword whether or not the confirmation reached them, and re-opening a
      // question they have moved on from would be the worse of the two wrongs.
      await inMinistry(ministryId, (client) =>
        client.query(
          `update outbound_message set prompt_state = null, reply_opened_at = null
            where id = $1 and ministry_id = $2 and prompt_state = 'open'`,
          [id, ministryId],
        ),
      )
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
