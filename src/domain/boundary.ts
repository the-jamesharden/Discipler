import type { Command } from './commands'
import type { Clock } from './clock'
import { appendHistory, createRelationship, type Effect } from './effects'
import { PairingRefused } from './errors'
import { relationshipId, type IdSource, type MinistryId, type PersonId } from './ids'
import { kindForParticipantCount, type NewMembership } from './relationships'

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
}

export interface CommandResult {
  readonly effects: readonly Effect[]
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
      return { effects: [] }

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
