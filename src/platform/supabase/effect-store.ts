import type { PoolClient } from 'pg'
import pg from 'pg'
import type { OutboundMessageDraft } from '~/domain/effects'
import { PairingRefused, RosterImportRefused, type PairingRefusal } from '~/domain/errors'
import type { HistoryEvent } from '~/domain/history'
import { eventId, type MinistryId } from '~/domain/ids'
import type { NewRelationship } from '~/domain/relationships'
import { phoneNumber, rosterKey, type NewPerson } from '~/domain/roster'
import type { EffectStore, UnitOfWork } from '~/service/ports'

/**
 * The participation caps live in indexes, because they can only be judged against
 * the Ministry's other relationships and an application-side check would hold only
 * until the first write path that forgot it. That makes the constraint name the
 * place the refusal is decided, so it is translated here rather than surfacing as a
 * Postgres error nobody upstream can read.
 */
const REFUSALS: Record<string, PairingRefusal> = {
  relationship_member_one_open_per_person: 'relationship.person_already_in_this_relationship',
  leader_one_open_group: 'relationship.leader_already_leads_a_group',
  participant_one_open_one_to_one: 'relationship.participant_already_in_a_one_to_one',
  relationship_member_person_fk: 'relationship.person_belongs_to_another_ministry',
  relationship_member_participant_has_completed_intake:
    'relationship.participant_has_not_completed_intake',
  relationship_member_participant_has_not_opted_out: 'relationship.participant_has_opted_out',
  relationship_member_leader_has_completed_intake:
    'relationship.leader_has_not_completed_intake',
  relationship_member_leader_has_not_opted_out: 'relationship.leader_has_opted_out',
}

/** The one place that knows where a driver hides the name of what it violated. */
const constraintViolated = (error: unknown): string | undefined =>
  (error as { constraint?: string } | null)?.constraint

const asRefusal = (error: unknown): PairingRefused | undefined => {
  const constraint = constraintViolated(error)
  const refusal = constraint ? REFUSALS[constraint] : undefined
  return refusal ? new PairingRefused(refusal) : undefined
}

/**
 * Command-side persistence. Writes run inside a transaction on a connection that
 * has dropped into `discipler_command` -- a role that cannot bypass row-level
 * security -- and that has declared which Ministry it is acting for. A command
 * handling one Ministry cannot write a row belonging to another, whatever the
 * application code asks for.
 */

const unitFor = (client: PoolClient): UnitOfWork => ({
  async peopleOnRoster() {
    // Scoped by the policy on `person`, not by a ministry_id in this statement: the
    // connection has already declared which Ministry it acts for, and the database
    // refuses to show it any other.
    const { rows } = await client.query<{ full_name: string; phone: string }>(
      `select full_name, phone from person where phone is not null`,
    )
    return new Set(
      rows.map((row) =>
        rosterKey({ fullName: row.full_name, phone: phoneNumber(row.phone) }),
      ),
    )
  },

  async createPeople(people: readonly NewPerson[]) {
    for (const person of people) {
      try {
        await client.query(
          `insert into person (id, ministry_id, full_name, phone, email, created_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            person.id,
            person.ministryId,
            person.fullName,
            person.phone,
            person.email,
            person.createdAt,
          ],
        )
      } catch (error) {
        // A name and a number is unique per Ministry, so this is the read above
        // having been overtaken by another write. Refused whole, not partly applied.
        if (constraintViolated(error) === 'person_ministry_identity_uniq') {
          throw new RosterImportRefused('roster.changed_during_the_import')
        }
        throw error
      }
    }
  },

  async appendHistory(events) {
    const inserted: HistoryEvent[] = []

    for (const event of events) {
      const { rows } = await client.query<{ id: string; recorded_at: Date }>(
        `insert into ministry_event
           (ministry_id, occurred_at, type, subject_type, subject_id, payload)
         values ($1, $2, $3, $4, $5, $6)
         returning id, recorded_at`,
        [
          event.ministryId,
          event.occurredAt,
          event.type,
          event.subjectType,
          event.subjectId,
          JSON.stringify(event.payload),
        ],
      )

      const row = rows[0]
      if (!row) throw new Error('History append returned no row')

      inserted.push({ ...event, id: eventId(row.id), recordedAt: row.recorded_at })
    }

    return inserted
  },

  async createRelationship(relationship: NewRelationship) {
    try {
      await client.query(
        `insert into relationship (id, ministry_id, kind, created_at)
         values ($1, $2, $3, $4)`,
        [relationship.id, relationship.ministryId, relationship.kind, relationship.createdAt],
      )

      for (const member of relationship.members) {
        await client.query(
          `insert into relationship_member
             (ministry_id, relationship_id, kind, person_id, role, started_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            relationship.ministryId,
            relationship.id,
            relationship.kind,
            member.personId,
            member.role,
            member.startedAt,
          ],
        )
      }
    } catch (error) {
      throw asRefusal(error) ?? error
    }
  },

  async enqueueMessages(messages: readonly OutboundMessageDraft[]) {
    for (const message of messages) {
      await client.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at)
         values ($1, $2, $3, $4, $5)`,
        [
          message.ministryId,
          message.personId,
          message.toPhone,
          message.body,
          message.enqueuedAt,
        ],
      )
    }
  },
})

export interface PostgresEffectStore extends EffectStore {
  close(): Promise<void>
}

export const createPostgresEffectStore = (connectionString: string): PostgresEffectStore => {
  const pool = new pg.Pool({ connectionString })

  return {
    async transact<T>(ministryId: MinistryId, work: (unit: UnitOfWork) => Promise<T>) {
      const client = await pool.connect()
      // A connection that died mid-transaction cannot be rolled back and must not
      // go back into the pool, or the next command to borrow it fails for a reason
      // that has nothing to do with itself.
      let connectionIsSuspect: Error | undefined

      try {
        await client.query('begin')
        // Both reset at commit or rollback, so they cannot leak to the next
        // command that borrows this connection from the pool.
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministryId])

        const result = await work(unitFor(client))
        await client.query('commit')
        return result
      } catch (error) {
        try {
          await client.query('rollback')
        } catch (rollbackError) {
          // Swallowed on purpose: the rollback failing is a symptom, and throwing
          // it here would replace the error that actually explains the failure.
          connectionIsSuspect =
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
        }
        throw error
      } finally {
        client.release(connectionIsSuspect)
      }
    },
    close: () => pool.end(),
  }
}
