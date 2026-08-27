import type { Command } from './commands'
import type { Clock } from './clock'
import { appendHistory, createPerson, createRelationship, type Effect } from './effects'
import { PairingRefused } from './errors'
import {
  personId,
  relationshipId,
  type IdSource,
  type MinistryId,
  type PersonId,
} from './ids'
import { kindForParticipantCount, type NewMembership } from './relationships'
import { rosterKey, type RowRejection } from './roster'
import { readRosterFile } from './roster-csv'

/**
 * The single command boundary. It is a pure function: the same command against the
 * same context yields the same effects, every time, with no I/O in between.
 *
 * The context is what the application service has already loaded on the command's
 * behalf. Today that is the clock, the source of new identifiers, and the Ministry
 * the command acts within; as later tickets add rules that read history, the state
 * they need joins it here rather than being fetched from inside the domain.
 */
export interface CommandContext {
  readonly ministryId: MinistryId
  readonly clock: Clock
  readonly ids: IdSource
  /**
   * Who is already on the Roster, loaded on `person.import`'s behalf. Commands that
   * need nothing loaded -- the tick, pairing -- leave it out.
   */
  readonly roster?: RosterSnapshot
}

/** Everyone the Ministry already holds, by `rosterKey` -- their name and number. */
export interface RosterSnapshot {
  readonly people: ReadonlySet<string>
}

export interface CommandResult {
  readonly effects: readonly Effect[]
  /**
   * Rows the command declined, in the order they appeared in whatever the Admin
   * supplied. Empty for a command that takes no rows. A row that cannot be read is
   * reported back with its line number rather than silently dropped, which is the
   * whole difference between an import an Admin can trust and one they cannot.
   */
  readonly rejections: readonly RowRejection[]
}

const membersOf = (
  leaderId: PersonId,
  participantIds: readonly PersonId[],
  startedAt: Date,
): readonly NewMembership[] => [
  { personId: leaderId, role: 'leader', startedAt },
  ...participantIds.map(
    (personId): NewMembership => ({ personId, role: 'participant', startedAt }),
  ),
]

export const handleCommand = (command: Command, context: CommandContext): CommandResult => {
  switch (command.type) {
    case 'scheduled.tick':
      // The tick is the seam the care rules land on: Acceptance reminders, the
      // twenty-four hour sequence timeout, the next-day reminder, Pause expiry.
      // Every one of those reads context.clock rather than system time. None of
      // them exists yet, so a tick presently changes nothing.
      return { effects: [], rejections: [] }

    case 'person.import': {
      const { people, rejected } = readRosterFile(command.csv)
      const alreadyOnFile = context.roster?.people ?? new Set<string>()
      const now = context.clock.now()

      const effects: Effect[] = []
      const rejections: RowRejection[] = [...rejected]

      for (const row of people) {
        // A row for someone already on the Roster is reported and left alone: a
        // stale export must not overwrite a name or an email the Person themselves
        // gave at Intake. Recognised by name and number together, so the second
        // person on a shared phone is a person and not a duplicate.
        if (alreadyOnFile.has(rosterKey(row))) {
          rejections.push({ line: row.line, problem: 'already_on_the_roster' })
          continue
        }

        const person = {
          id: personId(context.ids.next()),
          ministryId: command.ministryId,
          fullName: row.fullName,
          phone: row.phone,
          email: row.email,
          createdAt: now,
        }

        // No message of any kind. Being on a Roster is not consent and is not a wish
        // to participate, and Intake is the only thing that grants either.
        effects.push(
          createPerson(person),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.imported',
            subjectType: 'person',
            subjectId: person.id,
            payload: { fullName: person.fullName },
          }),
        )
      }

      return {
        effects,
        rejections: rejections.sort((first, second) => first.line - second.line),
      }
    }

    case 'relationship.create': {
      const { leaderId, participantIds } = command

      if (participantIds.length === 0) {
        throw new PairingRefused('relationship.needs_a_participant')
      }
      if (participantIds.includes(leaderId)) {
        throw new PairingRefused('relationship.leader_cannot_be_a_participant')
      }
      if (new Set(participantIds).size !== participantIds.length) {
        throw new PairingRefused('relationship.person_listed_twice')
      }

      const now = context.clock.now()
      const relationship = {
        id: relationshipId(context.ids.next()),
        ministryId: command.ministryId,
        // Derived once, from how many Participants are being paired, and frozen. The
        // count is the fact; the kind is a record of what that count was at
        // formation, kept only so the participation caps can be indexed.
        kind: kindForParticipantCount(participantIds.length),
        createdAt: now,
        members: membersOf(leaderId, participantIds, now),
      }

      // Creating a relationship does not activate it: `accepted_at` stays null, so
      // it reads as Awaiting Leader Acceptance, and nothing is enqueued to anybody.
      // Nothing reaches a Participant before their Leader has agreed to lead them,
      // and the Leader's Invitation Link is ticket 06's to send.
      return {
        rejections: [],
        effects: [
          createRelationship(relationship),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.created',
            subjectType: 'relationship',
            subjectId: relationship.id,
            payload: {
              leaderId,
              participantIds: [...participantIds],
              participantCount: participantIds.length,
            },
          }),
        ],
      }
    }
  }
}
