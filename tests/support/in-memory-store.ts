import type {
  IntakeLinkSnapshot,
  InvitationSnapshot,
  PausedRelationship,
  PersonContact,
  RelationshipSnapshot,
  UnacceptedRelationship,
} from '~/domain/boundary'
import type { CheckInSnapshot } from '~/domain/check-in'
import type { InboundSnapshot } from '~/domain/keywords'
import type { ConcernResolution, ConcernViewing, NewConcern } from '~/domain/concerns'
import type {
  CheckInAnswer,
  CheckInClarification,
  CheckInReminder,
  CheckInSequenceClosure,
  IntakeRecord,
  LeadEligibility,
  LeaderAcceptance,
  MaterialAssignment,
  KeywordExchangeClarification,
  KeywordExchangeClosure,
  KeywordExchangeTarget,
  NewCheckInPrompt,
  NewCheckInSequence,
  NewKeywordExchange,
  OutboundMessageDraft,
  PersonOptIn,
  PersonOptOut,
  ParticipantDeparture,
  RelationshipCancellation,
  RelationshipEnding,
} from '~/domain/effects'
import type { FollowUpResolution, NewFollowUpItem } from '~/domain/follow-up'
import type { NewIntakeLink } from '~/domain/intake-link'
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
  readonly endings: readonly RelationshipEnding[]
  readonly departures: readonly ParticipantDeparture[]
  /** Every Material period opened, in the order the effects opened them. */
  readonly materialAssignments: readonly MaterialAssignment[]
  readonly sequences: readonly NewCheckInSequence[]
  readonly prompts: readonly NewCheckInPrompt[]
  readonly checkInAnswers: readonly CheckInAnswer[]
  readonly clarifications: readonly CheckInClarification[]
  readonly reminders: readonly CheckInReminder[]
  readonly closures: readonly CheckInSequenceClosure[]
  readonly optOuts: readonly PersonOptOut[]
  readonly optIns: readonly PersonOptIn[]
  /** Every Keyword Exchange opened, in the order the effects opened them. */
  readonly keywordExchanges: readonly NewKeywordExchange[]
  readonly keywordTargets: readonly KeywordExchangeTarget[]
  readonly keywordClarifications: readonly KeywordExchangeClarification[]
  readonly keywordClosures: readonly KeywordExchangeClosure[]
  readonly leadEligibilities: readonly LeadEligibility[]
  readonly intakeLinks: readonly NewIntakeLink[]
  /**
   * The link both Intake-link reads answer with: the one a re-submission came in
   * on, and the one a Person already holds when an Admin asks for theirs.
   */
  intakeLink: IntakeLinkSnapshot | null
  readonly concerns: readonly NewConcern[]
  readonly concernViewings: readonly ConcernViewing[]
  readonly concernResolutions: readonly ConcernResolution[]
  /** What a check-in command finds about the Person it names, or null for nobody. */
  checkIn?: CheckInSnapshot
  /** What an inbound text finds about its sender, or null for nobody. */
  inbound?: InboundSnapshot
  /** Names and numbers this store will answer `contactsFor` with. */
  contacts: Map<PersonId, PersonContact>
  /** What a token resolves to, or null for one nothing answers to. */
  invitation?: InvitationSnapshot
  /** What the tick finds outstanding. Nothing, until a test says otherwise. */
  unaccepted: readonly UnacceptedRelationship[]
  /** What the tick finds paused. Nothing, until a test says otherwise. */
  paused: readonly PausedRelationship[]
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
  const optIns: PersonOptIn[] = []
  const keywordExchanges: NewKeywordExchange[] = []
  const keywordTargets: KeywordExchangeTarget[] = []
  const keywordClarifications: KeywordExchangeClarification[] = []
  const keywordClosures: KeywordExchangeClosure[] = []
  const leadEligibilities: LeadEligibility[] = []
  const intakeLinks: NewIntakeLink[] = []
  const resolutions: FollowUpResolution[] = []
  const cancellations: RelationshipCancellation[] = []
  const endings: RelationshipEnding[] = []
  const departures: ParticipantDeparture[] = []
  const materialAssignments: MaterialAssignment[] = []
  const concerns: NewConcern[] = []
  const viewings: ConcernViewing[] = []
  const concernResolutions: ConcernResolution[] = []
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
    get endings() {
      return [...endings]
    },
    get departures() {
      return [...departures]
    },
    get materialAssignments() {
      return [...materialAssignments]
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
    get optIns() {
      return [...optIns]
    },
    get keywordExchanges() {
      return [...keywordExchanges]
    },
    get keywordTargets() {
      return [...keywordTargets]
    },
    get keywordClarifications() {
      return [...keywordClarifications]
    },
    get keywordClosures() {
      return [...keywordClosures]
    },
    get leadEligibilities() {
      return [...leadEligibilities]
    },
    get intakeLinks() {
      return [...intakeLinks]
    },
    get concerns() {
      return [...concerns]
    },
    get concernViewings() {
      return [...viewings]
    },
    get concernResolutions() {
      return [...concernResolutions]
    },
    intakeLink: null,
    unaccepted: [],
    paused: [],
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
      const stagedEndings: RelationshipEnding[] = []
      const stagedDepartures: ParticipantDeparture[] = []
      const stagedMaterialAssignments: MaterialAssignment[] = []
      const stagedSequences: NewCheckInSequence[] = []
      const stagedPrompts: NewCheckInPrompt[] = []
      const stagedCheckInAnswers: CheckInAnswer[] = []
      const stagedClarifications: CheckInClarification[] = []
      const stagedReminders: CheckInReminder[] = []
      const stagedClosures: CheckInSequenceClosure[] = []
      const stagedOptOuts: PersonOptOut[] = []
      const stagedOptIns: PersonOptIn[] = []
      const stagedKeywordExchanges: NewKeywordExchange[] = []
      const stagedKeywordTargets: KeywordExchangeTarget[] = []
      const stagedKeywordClarifications: KeywordExchangeClarification[] = []
      const stagedKeywordClosures: KeywordExchangeClosure[] = []
      const stagedLeadEligibilities: LeadEligibility[] = []
      const stagedIntakeLinks: NewIntakeLink[] = []
      const stagedConcerns: NewConcern[] = []
      const stagedViewings: ConcernViewing[] = []
      const stagedConcernResolutions: ConcernResolution[] = []

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
        async optPersonIn(optIn) {
          stagedOptIns.push(optIn)
        },
        async inboundFor() {
          return store.inbound ?? null
        },
        async openKeywordExchange(exchange) {
          stagedKeywordExchanges.push(exchange)
        },
        async setKeywordExchangeTarget(target) {
          stagedKeywordTargets.push(target)
        },
        async clarifyKeywordExchange(clarification) {
          stagedKeywordClarifications.push(clarification)
        },
        async closeKeywordExchange(closure) {
          stagedKeywordClosures.push(closure)
        },
        async setLeadEligibility(eligibility) {
          stagedLeadEligibilities.push(eligibility)
        },
        async issueIntakeLink(link) {
          stagedIntakeLinks.push(link)
        },
        async resolveIntakeLink() {
          return store.intakeLink ?? null
        },
        async intakeLinkFor() {
          return store.intakeLink ?? null
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
        async raiseConcern(concern) {
          stagedConcerns.push(concern)
        },
        async recordConcernViewing(viewing) {
          stagedViewings.push(viewing)
        },
        async resolveConcern(resolution) {
          stagedConcernResolutions.push(resolution)
        },
        async concernDetailFor(id) {
          return (
            [...concerns, ...stagedConcerns].find((concern) => concern.id === id)?.detail ??
            null
          )
        },
        async unacceptedRelationships() {
          return store.unaccepted
        },
        async pausedRelationships() {
          return store.paused
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
        async endRelationship(ending) {
          stagedEndings.push(ending)
        },
        async departFromRelationship(departure) {
          stagedDepartures.push(departure)
        },
        async assignMaterial(assignment) {
          stagedMaterialAssignments.push(assignment)
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
      concerns.push(...stagedConcerns)
      viewings.push(...stagedViewings)
      concernResolutions.push(...stagedConcernResolutions)
      cancellations.push(...stagedCancellations)
      endings.push(...stagedEndings)
      departures.push(...stagedDepartures)
      materialAssignments.push(...stagedMaterialAssignments)
      sequences.push(...stagedSequences)
      prompts.push(...stagedPrompts)
      checkInAnswers.push(...stagedCheckInAnswers)
      clarifications.push(...stagedClarifications)
      reminders.push(...stagedReminders)
      closures.push(...stagedClosures)
      optOuts.push(...stagedOptOuts)
      optIns.push(...stagedOptIns)
      keywordExchanges.push(...stagedKeywordExchanges)
      keywordTargets.push(...stagedKeywordTargets)
      keywordClarifications.push(...stagedKeywordClarifications)
      keywordClosures.push(...stagedKeywordClosures)
      leadEligibilities.push(...stagedLeadEligibilities)
      intakeLinks.push(...stagedIntakeLinks)
      return result
    },
  }

  return store
}
