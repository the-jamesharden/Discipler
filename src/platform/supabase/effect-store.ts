import type { PoolClient } from 'pg'
import pg from 'pg'
import type { IntakeRecord, OutboundMessageDraft } from '~/domain/effects'
import { PairingRefused, RosterImportRefused, type PairingRefusal } from '~/domain/errors'
import type { HistoryEvent } from '~/domain/history'
import { eventId, personId, type MinistryId, type PersonId } from '~/domain/ids'
import type { NewRelationship } from '~/domain/relationships'
import { phoneNumber, rosterKey, type NewPerson, type RosterKey } from '~/domain/roster'
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
  relationship_member_gender_matches: 'relationship.gender_must_match',
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
    const { rows } = await client.query<{ id: string; full_name: string; phone: string }>(
      `select id, full_name, phone from person where phone is not null`,
    )
    return new Map<RosterKey, PersonId>(
      rows.map((row) => [
        rosterKey({ fullName: row.full_name, phone: phoneNumber(row.phone) }),
        personId(row.id),
      ]),
    )
  },

  async peopleWhoCompletedIntake() {
    // Scoped by the policy on `intake_submission`, like the Roster read above: the
    // connection has already declared which Ministry it acts for.
    const { rows } = await client.query<{ person_id: string }>(
      `select distinct person_id from intake_submission`,
    )
    return new Set<PersonId>(rows.map((row) => personId(row.person_id)))
  },

  async ministryName() {
    // Scoped by the policy on `ministry`, like everything else on this connection.
    const { rows } = await client.query<{ name: string }>(`select name from ministry`)
    const name = rows[0]?.name
    if (!name) throw new Error('This command has no Ministry to speak for')
    return name
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

  async recordIntake(intake: IntakeRecord) {
    const { rows } = await client.query<{ id: string }>(
      `insert into intake_submission
         (ministry_id, person_id, submitted_at, age_band, gender, discipleship_goal_id)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        intake.ministryId,
        intake.personId,
        intake.submittedAt,
        intake.ageBand,
        intake.gender,
        intake.goalId,
      ],
    )
    const submissionId = rows[0]?.id
    if (!submissionId) throw new Error('Recording the Intake submission returned no row')

    for (const slot of intake.availability) {
      await client.query(
        `insert into intake_availability (ministry_id, intake_submission_id, day, block)
         values ($1, $2, $3, $4)`,
        [intake.ministryId, submissionId, slot.day, slot.block],
      )
    }

    // Each decision is its own row with its own timestamp and the version of the
    // wording the Person actually saw. Nothing here is ever updated: the trigger on
    // this table refuses it, because a consent record migrated forward to newer
    // wording no longer records what anybody agreed to. A change of mind is therefore
    // a later row, and `decided_at` is what orders them.
    for (const decision of intake.consentDecisions) {
      await client.query(
        `insert into consent_record
           (ministry_id, person_id, consent, granted, version, decided_at, source)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          intake.ministryId,
          intake.personId,
          decision.consent,
          decision.granted,
          intake.consentVersion,
          intake.submittedAt,
          intake.source,
        ],
      )
    }

    // What the Person typed about themselves beats what a spreadsheet said, which
    // is the same direction the import refuses to overwrite in.
    if (intake.email !== null) {
      await client.query(`update person set email = $2 where id = $1`, [
        intake.personId,
        intake.email,
      ])
    }
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
           (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key, prompt_state)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          message.ministryId,
          message.personId,
          message.toPhone,
          message.body,
          message.enqueuedAt,
          // The phone is the unit a conversation is serialised on, so it is the key
          // whether or not this message expects a reply. A message with no number
          // -- one bound for an Admin -- serialises against nothing.
          message.toPhone,
          // Null until something sends a Response-Required Message. Nothing does
          // yet: a Welcome Message expects no reply, so it holds up nobody's queue.
          // Ticket 08 is the first to set this, and the column is already here.
          null,
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
