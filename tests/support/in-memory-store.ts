import type {
  InvitationSnapshot,
  PersonContact,
  RelationshipSnapshot,
  UnacceptedRelationship,
} from '~/domain/boundary'
import type { CheckInSnapshot } from '~/domain/check-in'
import type {
  CheckInAnswer,
  CheckInClarification,
  CheckInReminder,
  CheckInSequenceClosure,
  IntakeRecord,
  LeaderAcceptance,
  NewCheckInPrompt,
  NewCheckInSequence,
  OutboundMessageDraft,
  PersonOptOut,
  RelationshipCancellation,
} from '~/domain/effects'
import type { FollowUpResolution, NewFollowUpItem } from '~/domain/follow-up'
import type { NewInvitation } from '~/domain/invitations'
import { eventId, type MinistryId, type PersonId } from '~/domain/ids'
import type { HistoryEvent, NewHistoryEvent } from '~/domain/history'
import type { NewRelationship } from '~/domain/relationships'
import {
  rosterKey,
  type NewPerson,
  type PhoneNumber,
  type RosterKey,
} from '~/domain/roster'
import type { EffectStore, UnitOfWork } from '~/service/ports'

export interface InMemoryStore extends EffectStore {
  readonly history: readonly HistoryEvent[]
  readonly outbox: readonly OutboundMessageDraft[]
  readonly relationships: readonly NewRelationship[]
  readonly people: readonly NewPerson[]
  readonly intakes: readonly IntakeRecord[]
  readonly invitations: readonly NewInvitation[]
  readonly acceptances: readonly LeaderAcceptance[]
  readonly followUps: readonly NewFollowUpItem[]
  readonly resolutions: readonly FollowUpResolution[]
  readonly cancellations: readonly RelationshipCancellation[]
  readonly sequences: readonly NewCheckInSequence[]
  readonly prompts: readonly NewCheckInPrompt[]
  readonly checkInAnswers: readonly CheckInAnswer[]
  readonly clarifications: readonly CheckInClarification[]
  readonly reminders: readonly CheckInReminder[]
  readonly closures: readonly CheckInSequenceClosure[]
  readonly optOuts: readonly PersonOptOut[]
  /** What a check-in command finds about the Person it names, or null for nobody. */
  checkIn?: CheckInSnapshot
  /** Names and numbers this store will answer `contactsFor` with. */
  contacts: Map<PersonId, PersonContact>
  /** What a token resolves to, or null for one nothing answers to. */
  invitation?: InvitationSnapshot
  /** What the tick finds outstanding. Nothing, until a test says otherwise. */
  unaccepted: readonly UnacceptedRelationship[]
  /**
   * The Leaders the tick considers for a check-in. Empty until a test says
   * otherwise -- a Ministry with nobody to ask, which is what most tests are.
   */
  checkInsDue: readonly CheckInSnapshot[]
  /** What `relationship.cancel` finds, or null for one this Ministry does not hold. */
  relationship?: RelationshipSnapshot
  /** The Ministry every command in this store speaks for. */
  ministryName: string
  failOn?:
    | 'appendHistory'
    | 'enqueueMessages'
    | 'createRelationship'
    | 'createPeople'
    | 'recordIntake'
}

/**
 * A store that keeps the same append-only promise the database makes, so a test
 * that would corrupt history here fails here rather than in production.
 */
export const createInMemoryStore = (recordedAt = new Date('2026-01-01T00:00:00Z')): InMemoryStore => {
  const history: HistoryEvent[] = []
  const outbox: OutboundMessageDraft[] = []
  const relationships: NewRelationship[] = []
  const people: NewPerson[] = []
  const intakes: IntakeRecord[] = []
  const invitations: NewInvitation[] = []
  const acceptances: LeaderAcceptance[] = []
  const followUps: NewFollowUpItem[] = []
  const sequences: NewCheckInSequence[] = []
  const prompts: NewCheckInPrompt[] = []
  const checkInAnswers: CheckInAnswer[] = []
  const clarifications: CheckInClarification[] = []
  const reminders: CheckInReminder[] = []
  const closures: CheckInSequenceClosure[] = []
  const optOuts: PersonOptOut[] = []
  const resolutions: FollowUpResolution[] = []
  const cancellations: RelationshipCancellation[] = []
  let counter = 0

  const store: InMemoryStore = {
    get history() {
      return [...history]
    },
    get outbox() {
      return [...outbox]
    },
    get relationships() {
      return [...relationships]
    },
    get people() {
      return [...people]
    },
    get intakes() {
      return [...intakes]
    },
    get invitations() {
      return [...invitations]
    },
    get acceptances() {
      return [...acceptances]
    },
    get followUps() {
      return [...followUps]
    },
    get resolutions() {
      return [...resolutions]
    },
    get cancellations() {
      return [...cancellations]
    },
    get sequences() {
      return [...sequences]
    },
    get prompts() {
      return [...prompts]
    },
    get checkInAnswers() {
      return [...checkInAnswers]
    },
    get clarifications() {
      return [...clarifications]
    },
    get reminders() {
      return [...reminders]
    },
    get closures() {
      return [...closures]
    },
    get optOuts() {
      return [...optOuts]
    },
    unaccepted: [],
    checkInsDue: [],
    contacts: new Map<PersonId, PersonContact>(),
    ministryName: 'Riverside Chapel',
    async transact(_ministryId: MinistryId, work) {
      const stagedHistory: HistoryEvent[] = []
      const stagedOutbox: OutboundMessageDraft[] = []
      const stagedRelationships: NewRelationship[] = []
      const stagedPeople: NewPerson[] = []
      const stagedIntakes: IntakeRecord[] = []
      const stagedInvitations: NewInvitation[] = []
      const stagedAcceptances: LeaderAcceptance[] = []
      const stagedFollowUps: NewFollowUpItem[] = []
      const stagedResolutions: FollowUpResolution[] = []
      const stagedCancellations: RelationshipCancellation[] = []
      const stagedSequences: NewCheckInSequence[] = []
      const stagedPrompts: NewCheckInPrompt[] = []
      const stagedCheckInAnswers: CheckInAnswer[] = []
      const stagedClarifications: CheckInClarification[] = []
      const stagedReminders: CheckInReminder[] = []
      const stagedClosures: CheckInSequenceClosure[] = []
      const stagedOptOuts: PersonOptOut[] = []

      const unit: UnitOfWork = {
        async checkInFor() {
          return store.checkIn ?? null
        },
        async openCheckInSequence(sequence) {
          stagedSequences.push(sequence)
        },
        async askCheckInQuestion(prompt) {
          stagedPrompts.push(prompt)
        },
        async recordCheckInAnswer(answer) {
          stagedCheckInAnswers.push(answer)
        },
        async clarifyCheckInQuestion(clarification) {
          stagedClarifications.push(clarification)
        },
        async remindCheckInQuestion(reminder) {
          stagedReminders.push(reminder)
        },
        async closeCheckInSequence(closure) {
          stagedClosures.push(closure)
        },
        async optPersonOut(optOut) {
          stagedOptOuts.push(optOut)
        },
        async contactsFor(ids) {
          return new Map(
            ids.flatMap((id) => {
              const contact = store.contacts.get(id)
              return contact ? [[id, contact] as const] : []
            }),
          )
        },
        async resolveInvitation() {
          return store.invitation ?? null
        },
        async issueInvitation(invitation) {
          stagedInvitations.push(invitation)
        },
        async acceptInvitation(acceptance) {
          stagedAcceptances.push(acceptance)
        },
        async raiseFollowUp(item) {
          stagedFollowUps.push(item)
        },
        async resolveFollowUp(resolution) {
          stagedResolutions.push(resolution)
        },
        async unacceptedRelationships() {
          return store.unaccepted
        },
        async leadersDueForCheckIn() {
          return store.checkInsDue
        },
        async relationshipFor() {
          return store.relationship ?? null
        },
        async cancelRelationship(cancellation) {
          stagedCancellations.push(cancellation)
        },
        async peopleOnRoster() {
          const everyone = [...people, ...stagedPeople]
          const namesByNumber = new Map<PhoneNumber, string[]>()
          for (const person of everyone) {
            namesByNumber.set(person.phone, [
              ...(namesByNumber.get(person.phone) ?? []),
              person.fullName,
            ])
          }
          return {
            people: new Map<RosterKey, PersonId>(
              everyone.map((person) => [rosterKey(person), person.id]),
            ),
            namesByNumber,
          }
        },
        async peopleWhoCompletedIntake() {
          return new Set<PersonId>(
            [...intakes, ...stagedIntakes].map((intake) => intake.personId),
          )
        },
        async ministryName() {
          return store.ministryName
        },
        async recordIntake(intake) {
          if (store.failOn === 'recordIntake') throw new Error('Intake unavailable')
          stagedIntakes.push(intake)
        },
        async createPeople(imported) {
          if (store.failOn === 'createPeople') throw new Error('the Roster is unavailable')
          stagedPeople.push(...imported)
        },
        async appendHistory(events: readonly NewHistoryEvent[]) {
          if (store.failOn === 'appendHistory') throw new Error('history store unavailable')
          const written = events.map((event) => ({
            ...event,
            id: eventId(`event-${++counter}`),
            recordedAt,
          }))
          stagedHistory.push(...written)
          return written
        },
        async createRelationship(relationship) {
          if (store.failOn === 'createRelationship') throw new Error('relationships unavailable')
          stagedRelationships.push(relationship)
        },
        async enqueueMessages(messages) {
          if (store.failOn === 'enqueueMessages') throw new Error('outbound queue unavailable')
          stagedOutbox.push(...messages)
        },
      }

      const result = await work(unit)

      people.push(...stagedPeople)
      intakes.push(...stagedIntakes)
      relationships.push(...stagedRelationships)
      history.push(...stagedHistory)
      outbox.push(...stagedOutbox)
      invitations.push(...stagedInvitations)
      acceptances.push(...stagedAcceptances)
      followUps.push(...stagedFollowUps)
      resolutions.push(...stagedResolutions)
      cancellations.push(...stagedCancellations)
      sequences.push(...stagedSequences)
      prompts.push(...stagedPrompts)
      checkInAnswers.push(...stagedCheckInAnswers)
      clarifications.push(...stagedClarifications)
      reminders.push(...stagedReminders)
      closures.push(...stagedClosures)
      optOuts.push(...stagedOptOuts)
      return result
    },
  }

  return store
}
