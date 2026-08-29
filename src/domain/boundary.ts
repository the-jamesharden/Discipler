import type { Command } from './commands'
import { days, type Clock } from './clock'
import {
  acceptInvitation,
  appendHistory,
  cancelRelationship,
  createPerson,
  createRelationship,
  enqueueMessage,
  issueInvitationLink,
  raiseFollowUpItem,
  recordIntake,
  resolveFollowUpItem,
  type Effect,
} from './effects'
import {
  CancellationRefused,
  IntakeRefused,
  InvitationRefused,
  PairingRefused,
} from './errors'
import { readIntakeForm } from './intake'
import {
  acceptanceReminderMessage,
  invitationLink,
  invitationMessage,
  starterMessageToLeader,
  starterMessageToParticipant,
  welcomeMessage,
} from './outbound-copy'
import { CONSENT_VERSION } from './consent'
import {
  personId,
  relationshipId,
  type IdSource,
  type MinistryId,
  type PersonId,
  type RelationshipId,
} from './ids'
import {
  ACCEPTANCE_ESCALATION_DAYS,
  ACCEPTANCE_REMINDER_DAYS,
  invitationState,
  invitationToken,
  issueInvitation,
  type InvitationToken,
} from './invitations'
import { kindFor, type MemberRole, type NewMembership } from './relationships'
import { rosterKey, type PhoneNumber, type RosterKey, type RowRejection } from './roster'
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
  /**
   * Who is being paired, or who is already in the relationship being accepted --
   * their names and the numbers Discipler would text. Loaded on the command's
   * behalf like the Roster, because a message needs a name and a recipient and a
   * domain that fetched either would no longer be a pure function of its inputs.
   */
  readonly contacts?: ContactsSnapshot
  /**
   * The token as the database found it, with everyone in the relationship it
   * names. Absent when the command is not one a token drives.
   */
  readonly invitation?: InvitationSnapshot
  /**
   * Every relationship in this Ministry that nobody has accepted yet, loaded on
   * the tick's behalf. Absent rather than empty, for the same reason the Roster
   * is: an unloaded snapshot and a Ministry with nothing outstanding are the same
   * value and opposite facts, and one of them silently reminds nobody.
   */
  readonly tick?: TickSnapshot
  /**
   * The one relationship an Admin command names, as the database holds it now.
   * Absent when the command names none.
   */
  readonly relationship?: RelationshipSnapshot
  /**
   * Where a link points. The shape of the path is a copy decision and lives in
   * `outbound-copy`; the host it hangs off is configuration and arrives here.
   */
  readonly appBaseUrl?: string
}

/**
 * A Leader who has not yet agreed to lead, and whom a reminder can actually
 * reach: an open leader membership with no `accepted_at`, an Invitation Link
 * nothing has spent, and standing permission to be texted at all.
 *
 * A Leader who has opted out or withdrawn SMS consent is not here. Texting them
 * is refused by the outbound queue, and the tick is one transaction -- so one
 * such Leader would roll back every reminder and every escalation in the
 * Ministry, on every run. The five-day item is raised from the relationship's own
 * age and surfaces them to an Admin regardless, which is the right remedy for
 * somebody Discipler can no longer reach.
 */
export interface AwaitingLeader {
  readonly personId: PersonId
  readonly fullName: string
  readonly phone: string | null
  readonly token: InvitationToken
  /**
   * When their link stops working. Carried here rather than filtered in SQL
   * because whether it has run out is a question about time, and every one of
   * those is answered against the injected clock.
   */
  readonly linkExpiresAt: Date
  /**
   * When this Leader was last reminded about this relationship, read back from
   * history. The tick re-evaluates every run, so without it a relationship that
   * has waited a fortnight would be four days of reminders and then ten more.
   */
  readonly remindedAt: Date | null
}

export interface UnacceptedRelationship {
  readonly relationshipId: RelationshipId
  /** Both thresholds are measured from here, never from when a Leader was invited. */
  readonly createdAt: Date
  readonly awaiting: readonly AwaitingLeader[]
  /**
   * Whether a `relationship_unaccepted` item has *ever* been raised against it,
   * resolved ones included. The partial unique index refuses a second open row
   * anyway; this is what keeps the tick from appending a history event a day, and
   * from re-raising an item an Admin has already dealt with -- which would make
   * resolving the one action on this surface that does not stick.
   */
  readonly alreadyRaised: boolean
}

export interface TickSnapshot {
  readonly unaccepted: readonly UnacceptedRelationship[]
}

/**
 * A relationship as the database holds it now. `acceptedAt` is activation and
 * `endedAt` is the end of its life; between them they say which of the three
 * things an Admin may do to it is still available.
 */
export interface RelationshipSnapshot {
  readonly relationshipId: RelationshipId
  readonly createdAt: Date
  readonly acceptedAt: Date | null
  readonly endedAt: Date | null
  /** Everyone holding an open membership, whatever their role. */
  readonly memberIds: readonly PersonId[]
}

export interface PersonContact {
  readonly fullName: string
  /** Null for a Person no number was ever recorded for. */
  readonly phone: string | null
}

export interface ContactsSnapshot {
  readonly people: ReadonlyMap<PersonId, PersonContact>
}

/**
 * One member of the relationship a token names, as the database holds them now.
 * `acceptedAt` is each Leader's own agreement; the relationship's own timestamp is
 * activation, and is stamped when the last of these is filled in.
 */
export interface InvitedMember {
  readonly personId: PersonId
  readonly role: MemberRole
  readonly fullName: string
  readonly phone: string | null
  readonly acceptedAt: Date | null
}

export interface InvitationSnapshot {
  readonly relationshipId: RelationshipId
  /** Whose link it is. Their role is read off `members`, never off the token. */
  readonly personId: PersonId
  readonly expiresAt: Date
  readonly consumedAt: Date | null
  /** Everyone holding an open membership, whatever their role. */
  readonly members: readonly InvitedMember[]
}

/**
 * Everyone the Ministry already holds, by `rosterKey` -- their name and number --
 * against the identifier that name and number belong to. `person.import` asks only
 * whether a key is present; Intake needs the Person behind it, because somebody
 * completing the form is usually already on an imported Roster.
 */
export interface RosterSnapshot {
  readonly people: ReadonlyMap<RosterKey, PersonId>
  /**
   * Every name the Ministry already holds against a number. The number is what
   * recognises a row; this is what says whether it came back unchanged, and it is
   * the only way to tell a rename from the second person on a shared phone
   * without guessing at one of them.
   */
  readonly namesByNumber: ReadonlyMap<PhoneNumber, readonly string[]>
  /**
   * Who has already completed Intake at least once. The Welcome Message is *first*
   * contact, so it is enqueued against this rather than against the submission: one
   * link serves a whole Ministry and nothing stops a Person opening it twice, and a
   * second Welcome would be Discipler texting somebody to welcome them to something
   * they are already in. Ticket 16 builds the deliberate re-submission path on top
   * of the same fact.
   */
  readonly whoCompletedIntake: ReadonlySet<PersonId>
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
  leaderIds: readonly PersonId[],
  participantIds: readonly PersonId[],
  startedAt: Date,
): readonly NewMembership[] => [
  ...leaderIds.map((personId): NewMembership => ({ personId, role: 'leader', startedAt })),
  ...participantIds.map(
    (personId): NewMembership => ({ personId, role: 'participant', startedAt }),
  ),
]

/** A Person the command was handed, or a loud failure rather than a blank name. */
const whoIs = (context: CommandContext, id: PersonId): PersonContact => {
  const person = context.contacts?.people.get(id)
  if (!person) throw new Error(`No name or number was loaded for person ${id}`)
  return person
}

/**
 * What every token-driven command needs before it can decide anything. Absent
 * rather than defaulted, for the same reason the Roster is: a missing Ministry
 * name would compose a message in nobody's voice, and a missing invitation would
 * make an unresolved token look like a valid one.
 */
const tokenContext = (context: CommandContext) => {
  const { invitation, ministryName, appBaseUrl } = context
  if (!invitation) throw new Error('This command was handed no invitation to act on')
  if (!ministryName) throw new Error('This command was handed no Ministry to speak for')
  if (!appBaseUrl) throw new Error('This command was handed nowhere for its links to point')
  return { invitation, ministryName, baseUrl: appBaseUrl }
}

/**
 * The membership the token's holder actually has. A token that names somebody who
 * holds no open membership is a link to a relationship they have left, and there
 * is nothing here for them to act on.
 */
const memberHolding = (invitation: InvitationSnapshot, id: PersonId): InvitedMember => {
  const member = invitation.members.find((candidate) => candidate.personId === id)
  if (!member) throw new InvitationRefused('invitation.not_found')
  return member
}

export const handleCommand = (command: Command, context: CommandContext): CommandResult => {
  switch (command.type) {
    case 'scheduled.tick': {
      // The tick is a command like any other: it enters through this boundary, it
      // reads the injected clock, and it returns effects. It never reads system
      // time, which is the only reason a fortnight of waiting can be tested in a
      // few milliseconds.
      //
      // It carries the Acceptance thresholds today. The rest of the care rules --
      // the twenty-four hour sequence timeout, the next-day reminder, Pause expiry
      // -- land here as their tickets build them.
      const { tick, ministryName, appBaseUrl: baseUrl } = context
      if (!tick) throw new Error('scheduled.tick was handed no state to evaluate')
      if (!ministryName) throw new Error('scheduled.tick was handed no Ministry to speak for')
      if (!baseUrl) throw new Error('scheduled.tick was handed nowhere for its links to point')

      const now = context.clock.now()
      const effects: Effect[] = []

      for (const relationship of tick.unaccepted) {
        // From creation, not from when any one Leader was invited. Nothing adds a
        // member to a relationship after it is formed, so the two are the same
        // instant today; measuring from the relationship is what keeps them the
        // same when something does.
        const waited = now.getTime() - relationship.createdAt.getTime()

        // One reminder each, and only to the Leaders who have not agreed yet. A
        // co-leader who accepted on day one is not chased for somebody else.
        if (waited >= days(ACCEPTANCE_REMINDER_DAYS)) {
          for (const leader of relationship.awaiting) {
            if (leader.remindedAt !== null) continue
            // A reminder whose link has run out sends them to a page telling them
            // to find an Admin, which is worse than the text they never got.
            if (leader.linkExpiresAt.getTime() <= now.getTime()) continue

            effects.push(
              enqueueMessage({
                ministryId: command.ministryId,
                personId: leader.personId,
                toPhone: leader.phone,
                body: acceptanceReminderMessage({
                  ministryName,
                  fullName: leader.fullName,
                  link: invitationLink(baseUrl, leader.token),
                }),
                enqueuedAt: now,
                // No message to a Leader contains a phone number.
                disclosesPersonId: null,
              }),
              appendHistory({
                ministryId: command.ministryId,
                occurredAt: now,
                type: 'relationship.acceptance_reminded',
                subjectType: 'relationship',
                subjectId: relationship.relationshipId,
                payload: { personId: leader.personId },
              }),
            )
          }
        }

        // It stops being the Leader's to solve and becomes the Admin's. The item
        // is raised once and then stands: raising it again on days six and seven
        // would tell the Admin nothing they are not already looking at, and the
        // history event beside it would become a row a day for a condition nobody
        // had acted on. The partial unique index refuses the second row regardless.
        if (waited >= days(ACCEPTANCE_ESCALATION_DAYS) && !relationship.alreadyRaised) {
          effects.push(
            raiseFollowUpItem({
              ministryId: command.ministryId,
              kind: 'relationship_unaccepted',
              relationshipId: relationship.relationshipId,
              // The condition is the relationship's, not any one Leader's: a group
              // waiting on two of them is one thing for an Admin to act on.
              personId: null,
              raisedAt: now,
            }),
            appendHistory({
              ministryId: command.ministryId,
              occurredAt: now,
              type: 'follow_up.relationship_unaccepted',
              subjectType: 'relationship',
              subjectId: relationship.relationshipId,
              // How long it had waited when it was raised. What the Admin is shown
              // is read live off `created_at`, because this number is true of the
              // moment it was written and stops being true the next day.
              payload: { waitedDays: Math.floor(waited / days(1)) },
            }),
          )
        }
      }

      return { effects, rejections: [] }
    }

    case 'relationship.cancel': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.cancel was handed no relationship to act on')
      }

      const now = context.clock.now()

      // Cancelling twice frees nobody twice, and the second one would overwrite the
      // date the first one recorded.
      if (relationship.endedAt !== null) {
        throw new CancellationRefused('relationship.already_ended')
      }
      // Every Leader agreed and the Starter Message has gone out. Stopping it now is
      // an *ending*, it carries a required outcome, and it is ticket 13's -- so this
      // refuses rather than quietly doing two thirds of it.
      if (relationship.acceptedAt !== null) {
        throw new CancellationRefused('relationship.already_accepted')
      }

      // Nobody is told. A Leader who never answered is not chased about a decision
      // that has been reversed, and no Participant has heard anything at all --
      // nothing reaches them until every Leader has agreed.
      return {
        rejections: [],
        effects: [
          cancelRelationship({
            ministryId: command.ministryId,
            relationshipId: relationship.relationshipId,
            cancelledAt: now,
            memberIds: relationship.memberIds,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.cancelled',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: {
              memberIds: [...relationship.memberIds],
              waitedDays: Math.floor(
                (now.getTime() - relationship.createdAt.getTime()) / days(1),
              ),
            },
          }),
        ],
      }
    }

    case 'follow_up.resolve': {
      const now = context.clock.now()

      // No note, deliberately. Resolving is one click on a surface designed not to
      // have a writing task on it, and what the Admin actually did -- cancelled,
      // nudged, ended -- is recorded as a fact of its own rather than retyped here.
      return {
        rejections: [],
        effects: [
          resolveFollowUpItem({
            ministryId: command.ministryId,
            itemId: command.itemId,
            resolvedBy: command.resolvedBy,
            resolvedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'follow_up.resolved',
            subjectType: 'follow_up_item',
            subjectId: command.itemId,
            payload: { resolvedBy: command.resolvedBy },
          }),
        ],
      }
    }

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
        // gave at Intake.
        if (alreadyOnTheRoster.has(rosterKey(row))) {
          rejections.push({ line: row.line, problem: 'already_on_the_roster' })
          continue
        }

        // The number is on the Roster under another name. Discipler will not guess
        // whether that is a rename or the second person on a shared phone, because
        // both are ordinary in a congregation and each guess loses the other one.
        // Reported, never dropped and never silently filed twice.
        if (context.roster.namesByNumber.has(row.phone)) {
          rejections.push({ line: row.line, problem: 'same_number_different_name' })
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

      // Their first submission, or a repeat. Everything below is recorded either
      // way -- a re-submission is a real act and leaves a real trail -- but only the
      // first one is greeted.
      const isFirstSubmission = !context.roster.whoCompletedIntake.has(id)

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
          // Both decisions, always, including a refusal. What is current is the
          // latest record for that consent, so a decision that writes no row is a
          // decision that cannot be seen -- and on a re-submission it silently
          // leaves the previous answer standing.
          consentDecisions: [
            // Always granted: `intake.sms_consent_required` refuses a submission
            // without it. The form grants consent and never withdraws it; `STOP` is
            // the withdrawal route.
            { consent: 'sms', granted: true },
            { consent: 'contact_sharing', granted: submission.contactSharingConsent },
          ],
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
      )

      // The one message that goes out before anybody has been paired. It reaches a
      // Person who has just given SMS consent on this form, which is the thing *no
      // SMS before pairing approval* exists to protect -- so that rule governs
      // relationship messaging and not this. Settled in docs/open-questions.md.
      if (isFirstSubmission) {
        effects.push(
          enqueueMessage({
            ministryId: command.ministryId,
            personId: id,
            toPhone: submission.phone,
            body: welcomeMessage({
              ministryName: context.ministryName,
              fullName: submission.fullName,
            }),
            enqueuedAt: now,
            // Nothing. There is no relationship yet, so there is nobody to
            // introduce -- and this is the message that reaches them before one
            // exists.
            disclosesPersonId: null,
          }),
        )
      }

      return { effects, rejections: [] }
    }

    case 'relationship.create': {
      const { leaderIds, participantIds } = command
      const ministryName = context.ministryName
      const baseUrl = context.appBaseUrl
      if (!ministryName) {
        throw new Error('relationship.create was handed no Ministry to speak for')
      }
      if (!baseUrl) {
        throw new Error('relationship.create was handed nowhere for its links to point')
      }

      if (leaderIds.length === 0) {
        throw new PairingRefused('relationship.needs_a_leader')
      }
      if (participantIds.length === 0) {
        throw new PairingRefused('relationship.needs_a_participant')
      }
      if (participantIds.some((id) => leaderIds.includes(id))) {
        throw new PairingRefused('relationship.leader_cannot_be_a_participant')
      }
      // Both roles, in one check: a person named twice is named twice whether it
      // happened on one side of the relationship or on both.
      const everyone = [...leaderIds, ...participantIds]
      if (new Set(everyone).size !== everyone.length) {
        throw new PairingRefused('relationship.person_listed_twice')
      }

      const now = context.clock.now()
      const relationship = {
        id: relationshipId(context.ids.next()),
        ministryId: command.ministryId,
        // Derived once, from the shape being paired, and frozen. The counts are the
        // fact; the kind is a record of what they were at formation, kept so the
        // participation caps and the gender rule can be expressed in the database.
        kind: kindFor(leaderIds.length, participantIds.length),
        createdAt: now,
        members: membersOf(leaderIds, participantIds, now),
      }

      // Creating a relationship does not activate it: `accepted_at` stays null and
      // it reads as Awaiting Leader Acceptance. Every Leader is invited, and
      // nothing at all reaches a Participant -- they hear nothing until *every*
      // Leader has agreed to lead them, because nobody co-leads something they did
      // not agree to.
      const effects: Effect[] = [
        createRelationship(relationship),
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'relationship.created',
          subjectType: 'relationship',
          subjectId: relationship.id,
          payload: {
            leaderIds: [...leaderIds],
            participantIds: [...participantIds],
            participantCount: participantIds.length,
          },
        }),
      ]

      for (const leaderId of leaderIds) {
        const leader = whoIs(context, leaderId)

        // Individualised: one token per Leader, so a co-leader's link is not a way
        // into anybody else's acceptance.
        const invitation = issueInvitation({
          ministryId: command.ministryId,
          relationshipId: relationship.id,
          personId: leaderId,
          token: invitationToken(context.ids.next()),
          at: now,
        })

        effects.push(
          issueInvitationLink(invitation),
          enqueueMessage({
            ministryId: command.ministryId,
            personId: leaderId,
            toPhone: leader.phone,
            body: invitationMessage({
              ministryName,
              fullName: leader.fullName,
              link: invitationLink(baseUrl, invitation.token),
            }),
            enqueuedAt: now,
            // No message to a Leader contains a phone number.
            disclosesPersonId: null,
          }),
        )
      }

      return { rejections: [], effects }
    }

    case 'relationship.accept': {
      const { invitation, ministryName, baseUrl } = tokenContext(context)
      const now = context.clock.now()

      const state = invitationState(invitation, now)
      if (state === 'expired') throw new InvitationRefused('invitation.expired')
      if (state === 'consumed') throw new InvitationRefused('invitation.already_used')

      const me = memberHolding(invitation, invitation.personId)
      // Read off their membership, never off the token. A Participant's link opens
      // the same page and leads somewhere else entirely.
      if (me.role !== 'leader') throw new InvitationRefused('invitation.not_a_leader')

      const leaders = invitation.members.filter((member) => member.role === 'leader')
      const participants = invitation.members.filter((member) => member.role === 'participant')

      // Every other open leader membership has already accepted, so this one is the
      // last. Activation is the whole set agreeing, not the first of them.
      const activatesRelationship = leaders.every(
        (leader) => leader.personId === me.personId || leader.acceptedAt !== null,
      )

      const effects: Effect[] = [
        acceptInvitation({
          ministryId: command.ministryId,
          relationshipId: invitation.relationshipId,
          personId: me.personId,
          token: command.token,
          fullName: command.fullName,
          userId: command.userId,
          acceptedAt: now,
          activatesRelationship,
        }),
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'relationship.leader_accepted',
          subjectType: 'relationship',
          subjectId: invitation.relationshipId,
          payload: { personId: me.personId, activated: activatesRelationship },
        }),
      ]

      if (!activatesRelationship) return { rejections: [], effects }

      effects.push(
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'relationship.activated',
          subjectType: 'relationship',
          subjectId: invitation.relationshipId,
          payload: { participantCount: participants.length },
        }),
      )

      // The Starter Message, to everyone in the relationship. The Leaders'
      // carries no number and offers to disclose nobody.
      const participantNames = participants.map((participant) => participant.fullName)
      for (const leader of leaders) {
        effects.push(
          enqueueMessage({
            ministryId: command.ministryId,
            personId: leader.personId,
            // The Leader who just accepted typed a name, not a number: the number
            // was displayed and refused as input, so it is still the one on file.
            toPhone: leader.phone,
            body: starterMessageToLeader({ ministryName, participantNames }),
            enqueuedAt: now,
            disclosesPersonId: null,
          }),
        )
      }

      // A Participant gets a link of their own -- the same mechanism, leading to
      // declining rather than accepting -- and one Starter Message per Leader,
      // each offering to disclose that Leader. Contact sharing is one Person's
      // decision, so it cannot be answered for a group of Leaders at once, and the
      // pilot's one-to-one makes this exactly one message.
      for (const participant of participants) {
        const declining = issueInvitation({
          ministryId: command.ministryId,
          relationshipId: invitation.relationshipId,
          personId: participant.personId,
          token: invitationToken(context.ids.next()),
          at: now,
        })

        effects.push(issueInvitationLink(declining))

        for (const leader of leaders) {
          effects.push(
            enqueueMessage({
              ministryId: command.ministryId,
              personId: participant.personId,
              toPhone: participant.phone,
              body: starterMessageToParticipant({
                ministryName,
                fullName: participant.fullName,
                declineLink: invitationLink(baseUrl, declining.token),
              }),
              enqueuedAt: now,
              // Resolved at send time against contact-sharing consent as it stands
              // then. Absent consent removes the number and sends the rest.
              disclosesPersonId: leader.personId,
            }),
          )
        }
      }

      return { rejections: [], effects }
    }

    case 'invitation.dispute_number':
    case 'match.decline': {
      const invitation = context.invitation
      if (!invitation) {
        throw new Error(`${command.type} was handed no invitation to act on`)
      }

      const me = memberHolding(invitation, invitation.personId)
      const now = context.clock.now()

      // A Leader disputes the number Discipler holds for them; a Participant says
      // the match is not right. Neither is the other's, and a link forwarded to
      // somebody else cannot become one.
      if (command.type === 'invitation.dispute_number' && me.role !== 'leader') {
        throw new InvitationRefused('invitation.not_a_leader')
      }
      if (command.type === 'match.decline' && me.role !== 'participant') {
        throw new InvitationRefused('invitation.not_a_participant')
      }

      const kind =
        command.type === 'invitation.dispute_number'
          ? 'invitation_number_disputed'
          : 'match_declined'

      // It changes nothing else. A forwarded link can never re-point an account,
      // and unpairing stays a pastoral decision an Admin makes.
      return {
        rejections: [],
        effects: [
          raiseFollowUpItem({
            ministryId: command.ministryId,
            kind,
            personId: me.personId,
            relationshipId: invitation.relationshipId,
            raisedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: `follow_up.${kind}`,
            subjectType: 'relationship',
            subjectId: invitation.relationshipId,
            payload: { personId: me.personId },
          }),
        ],
      }
    }
  }
}
