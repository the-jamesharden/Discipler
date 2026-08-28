import type { Command } from './commands'
import type { Clock } from './clock'
import {
  appendHistory,
  createPerson,
  createRelationship,
  enqueueMessage,
  recordIntake,
  type Effect,
} from './effects'
import { IntakeRefused, PairingRefused } from './errors'
import { readIntakeForm } from './intake'
import { welcomeMessage } from './outbound-copy'
import { CONSENT_VERSION } from './consent'
import {
  personId,
  relationshipId,
  type IdSource,
  type MinistryId,
  type PersonId,
} from './ids'
import { kindForParticipantCount, type NewMembership } from './relationships'
import { rosterKey, type RosterKey, type RowRejection } from './roster'
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
   * need nothing loaded -- the tick, pairing -- leave it out, and `person.import`
   * refuses to run without it rather than treating its absence as an empty Roster.
   * The two readings differ by a whole congregation being imported a second time.
   */
  readonly roster?: RosterSnapshot
  /**
   * The Ministry in whose voice the command speaks. Loaded on the command's behalf
   * because every message carries the Ministry name as a prefix, and a domain that
   * fetched it would no longer be a pure function of its inputs.
   */
  readonly ministryName?: string
}

/**
 * Everyone the Ministry already holds, by `rosterKey` -- their name and number --
 * against the identifier that name and number belong to. `person.import` asks only
 * whether a key is present; Intake needs the Person behind it, because somebody
 * completing the form is usually already on an imported Roster.
 */
export interface RosterSnapshot {
  readonly people: ReadonlyMap<RosterKey, PersonId>
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
      // Absent rather than empty. An empty Roster and an unloaded one are the same
      // value and opposite facts, and the second one silently re-imports everybody.
      if (!context.roster) {
        throw new Error('person.import was handed no Roster to compare against')
      }

      const { people, rejected } = readRosterFile(command.csv)
      const alreadyOnTheRoster = context.roster.people
      const now = context.clock.now()

      const effects: Effect[] = []
      const rejections: RowRejection[] = [...rejected]

      for (const row of people) {
        // A row for someone already on the Roster is reported and left alone: a
        // stale export must not overwrite a name or an email the Person themselves
        // gave at Intake. Recognised by name and number together, so the second
        // person on a shared phone is a person and not a duplicate.
        if (alreadyOnTheRoster.has(rosterKey(row))) {
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

    case 'intake.submit': {
      if (!context.roster) {
        throw new Error('intake.submit was handed no Roster to look the Person up in')
      }
      if (!context.ministryName) {
        throw new Error('intake.submit was handed no Ministry to speak for')
      }

      const reading = readIntakeForm(command.form)
      if ('refusals' in reading) throw new IntakeRefused(reading.refusals)

      const { submission } = reading
      const now = context.clock.now()
      const effects: Effect[] = []

      // Usually they are already here: an Admin imported the congregation and then
      // sent the link. A QR code at a leaders' meeting reaches people who are not,
      // and Intake is a way onto the Roster as much as a way through it.
      const key = rosterKey(submission)
      const existing = context.roster.people.get(key)
      const id = existing ?? personId(context.ids.next())

      if (!existing) {
        effects.push(
          createPerson({
            id,
            ministryId: command.ministryId,
            fullName: submission.fullName,
            phone: submission.phone,
            email: submission.email,
            createdAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.joined_at_intake',
            subjectType: 'person',
            subjectId: id,
            payload: { fullName: submission.fullName },
          }),
        )
      }

      effects.push(
        recordIntake({
          ministryId: command.ministryId,
          personId: id,
          submittedAt: now,
          ageBand: submission.ageBand,
          gender: submission.gender,
          goalId: submission.goalId,
          availability: submission.availability,
          email: submission.email,
          consentVersion: CONSENT_VERSION,
          source: submission.source,
          // Only what was granted. The send-time check asks whether a consent
          // exists, so a record standing for a refusal would answer yes.
          grantedConsents: submission.contactSharingConsent
            ? ['sms', 'contact_sharing']
            : ['sms'],
        }),
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'intake.submitted',
          subjectType: 'person',
          subjectId: id,
          payload: {
            source: submission.source,
            consentVersion: CONSENT_VERSION,
            contactSharingConsent: submission.contactSharingConsent,
            availabilitySlots: submission.availability.length,
          },
        }),
        // The one message that goes out before anybody has been paired. It reaches
        // a Person who has just given SMS consent on this form, which is the thing
        // *no SMS before pairing approval* exists to protect -- so that rule governs
        // relationship messaging and not this. Settled in docs/open-questions.md.
        enqueueMessage({
          ministryId: command.ministryId,
          personId: id,
          toPhone: submission.phone,
          body: welcomeMessage({
            ministryName: context.ministryName,
            fullName: submission.fullName,
          }),
          enqueuedAt: now,
        }),
      )

      return { effects, rejections: [] }
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
