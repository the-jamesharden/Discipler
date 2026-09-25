import type {
  IntendedPairingClosure,
  IntendedPairingSnapshot,
  NewIntendedPairing,
  OpenIntendedPairing,
} from '~/domain/intended-pairing'
import type {
  IntakeLinkSnapshot,
  InvitationHeld,
  InvitationSnapshot,
  PausedRelationship,
  PersonContact,
  RelationshipSnapshot,
  UnacceptedRelationship,
} from '~/domain/boundary'
import type { CheckInSnapshot } from '~/domain/check-in'
import type { OfferedGoal, StatedGoal } from '~/domain/discipleship-goals'
import type { MaterialOnOffer } from '~/domain/materials'
import type { MaterialRecipient } from '~/domain/material-notices'
import type { InboundSnapshot } from '~/domain/keywords'
import type { ConcernResolution, ConcernViewing, NewConcern } from '~/domain/concerns'
import type {
  CheckInAnswer,
  CheckInClarification,
  CheckInReminder,
  CheckInSequenceClosure,
  DiscipleshipGoalOrder,
  DiscipleshipGoalRemoval,
  DiscipleshipGoalRenaming,
  IntakeRecord,
  ImportRowResolution,
  InvitationWithdrawal,
  LeaderAcceptance,
  MaterialAssignment,
  MaterialEdit,
  MaterialNoticeRecord,
  MaterialRemoval,
  NewMaterialLink,
  NewMaterial,
  KeywordExchangeClarification,
  KeywordExchangeClosure,
  KeywordExchangeTarget,
  NewCheckInPrompt,
  NewCheckInSequence,
  NewDiscipleshipGoal,
  NewKeywordExchange,
  OutstandingReplyClosure,
  OutstandingReplySweep,
  PersonOptIn,
  PersonOptOut,
  PersonRenaming,
  ParticipantDeparture,
  NewLeaderMembership,
  NewParticipantMembership,
  GroupConfiguration,
  RelationshipCancellation,
  RelationshipEnding,
} from '~/domain/effects'
import type { FollowUpResolution, NewFollowUpItem } from '~/domain/follow-up'
import type { NewIntakeLink } from '~/domain/intake-link'
import type { PersonRemoval, PersonRestoration, PersonToRemove } from '~/domain/removal'
import type { InvitationToken, NewInvitation } from '~/domain/invitations'
import { eventId, type MinistryId, type PersonId } from '~/domain/ids'
import {
  DEFAULT_AGE_BAND_GAP,
  roleNoun,
  type MinistryLanguage,
  type MinistrySettings,
} from '~/domain/ministry-settings'
import type { HistoryEvent, NewHistoryEvent } from '~/domain/history'
import type { NewRelationship } from '~/domain/relationships'
import type { SettledMessage } from '~/domain/rates-line'
import {
  rosterKey,
  type HeldImportRow,
  type NewPerson,
  type PhoneNumber,
  type RosterKey,
} from '~/domain/roster'
import type { EffectStore, UnitOfWork } from '~/service/ports'

export interface InMemoryStore extends EffectStore {
  readonly history: readonly HistoryEvent[]
  readonly outbox: readonly SettledMessage[]
  readonly relationships: readonly NewRelationship[]
  readonly people: readonly NewPerson[]
  /** Every row an import held for an Admin to answer, in the order it held them. */
  readonly heldRows: readonly HeldImportRow[]
  readonly renamings: readonly PersonRenaming[]
  readonly importRowAnswers: readonly ImportRowResolution[]
  /** What `heldImportRow` answers with for an id nothing staged has. */
  heldImportRow?: HeldImportRow | null
  readonly intakes: readonly IntakeRecord[]
  readonly invitations: readonly NewInvitation[]
  readonly acceptances: readonly LeaderAcceptance[]
  readonly withdrawals: readonly InvitationWithdrawal[]
  /** Seeded: the tokens `lapsedInvitations` answers with, and what a re-invitation finds held. */
  lapsed?: readonly InvitationToken[]
  invitationHeld?: InvitationHeld
  /** Seeded: the token an Admin taking an invitation back finds. */
  unanswered?: InvitationToken | null
  readonly followUps: readonly NewFollowUpItem[]
  /** Every plan an import recorded, and every closing of one, in the order the effects made them. */
  readonly plans: readonly NewIntendedPairing[]
  readonly planClosures: readonly IntendedPairingClosure[]
  /** Seeded: the plan a settle finds under its lock, and the plans still standing. */
  intendedPairing?: IntendedPairingSnapshot | null
  openPlans: readonly OpenIntendedPairing[]
  readonly resolutions: readonly FollowUpResolution[]
  readonly cancellations: readonly RelationshipCancellation[]
  readonly endings: readonly RelationshipEnding[]
  readonly departures: readonly ParticipantDeparture[]
  /** Every Participant added to a relationship after formation, in order. */
  readonly joins: readonly NewParticipantMembership[]
  /** Every Leader added to a group after formation, in order. */
  readonly addedLeaders: readonly NewLeaderMembership[]
  readonly groupConfigurations: readonly GroupConfiguration[]
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
  /** Every settings form this store saved, in the order the effects saved them. */
  readonly settingsSaved: readonly MinistrySettings[]
  /** Every option added, reworded, reordered or removed, in the order it happened. */
  readonly addedGoals: readonly NewDiscipleshipGoal[]
  readonly renamedGoals: readonly DiscipleshipGoalRenaming[]
  readonly goalOrders: readonly DiscipleshipGoalOrder[]
  readonly removedGoals: readonly DiscipleshipGoalRemoval[]
  /** Every Material created, edited or removed, in the order it happened. */
  readonly createdMaterials: readonly NewMaterial[]
  readonly editedMaterials: readonly MaterialEdit[]
  readonly removedMaterials: readonly MaterialRemoval[]
  /** What people were recorded as told about their Materials (Richer materials, ticket 03). */
  readonly materialNotices: readonly MaterialNoticeRecord[]
  /** Disciples' page links minted (Richer materials, ticket 04). */
  readonly materialLinks: readonly NewMaterialLink[]
  /** Every number whose conversation an effect closed, in order. */
  readonly outstandingReplyClosures: readonly OutstandingReplyClosure[]
  readonly outstandingReplySweeps: readonly OutstandingReplySweep[]
  readonly intakeLinks: readonly NewIntakeLink[]
  /**
   * The link both Intake-link reads answer with: the one a re-submission came in
   * on, and the one a Person already holds when an Admin asks for theirs.
   */
  intakeLink: IntakeLinkSnapshot | null
  /**
   * The account `accountHeldBy` answers with. Null is a real answer -- no such
   * Person here, or one holding no account -- so it is set rather than defaulted.
   */
  accountHeld: string | null
  /**
   * The Person `personToRemove` answers with. Null is a real answer -- nobody on
   * this Roster by that id, or already removed -- so it is set rather than
   * defaulted.
   */
  personToRemove: PersonToRemove | null
  /** Who `peopleOnRoster` says was removed from the Roster and has not come back. */
  removedFromTheRoster: Set<PersonId>
  readonly removals: readonly PersonRemoval[]
  readonly restorations: readonly PersonRestoration[]
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
  /** Who the tick may tell about a Material change. Nobody until a test says otherwise. */
  materialRecipients: readonly MaterialRecipient[]
  /** The timezone a Material text's day is counted in. */
  timeZoneForMaterialTexts: string
  /**
   * The Leaders the tick considers for a check-in. Empty until a test says
   * otherwise -- a Ministry with nobody to ask, which is what most tests are.
   */
  checkInsDue: readonly CheckInSnapshot[]
  /** What `relationship.cancel` finds, or null for one this Ministry does not hold. */
  relationship?: RelationshipSnapshot
  /**
   * The Discipleship Goal options this store answers with. Empty until a test says
   * otherwise -- which is a Ministry the database could not produce, so the tests
   * that edit the list set it.
   */
  goals: readonly OfferedGoal[]
  /** The submissions a removal would blank. Set by the tests that remove one. */
  goalAnswers: readonly StatedGoal[]
  /** The live Materials this store answers with. Empty until a test says otherwise. */
  materials: readonly MaterialOnOffer[]
  /** The Ministry every command in this store speaks for. */
  ministryName: string
  /**
   * The words this store's Ministry calls its two roles by. Discipler's own
   * defaults, so that a test about pairing does not have to say anything about
   * language -- and the tests that *are* about language set them.
   */
  language: MinistryLanguage
  /**
   * The settings `settings.update` decides against: what they were before the
   * form was saved.
   */
  settings: MinistrySettings
  /** The real store looked again and the unanswered invitation had been answered. */
  nothingLeftToRaise?: boolean
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
  const outbox: SettledMessage[] = []
  const relationships: NewRelationship[] = []
  const people: NewPerson[] = []
  const heldRows: HeldImportRow[] = []
  const renamings: PersonRenaming[] = []
  const importRowAnswers: ImportRowResolution[] = []
  const intakes: IntakeRecord[] = []
  const invitations: NewInvitation[] = []
  const acceptances: LeaderAcceptance[] = []
  const withdrawals: InvitationWithdrawal[] = []
  const followUps: NewFollowUpItem[] = []
  const plans: NewIntendedPairing[] = []
  const planClosures: IntendedPairingClosure[] = []
  const sequences: NewCheckInSequence[] = []
  const prompts: NewCheckInPrompt[] = []
  const checkInAnswers: CheckInAnswer[] = []
  const outstandingReplyClosures: OutstandingReplyClosure[] = []
  const outstandingReplySweeps: OutstandingReplySweep[] = []
  const clarifications: CheckInClarification[] = []
  const reminders: CheckInReminder[] = []
  const closures: CheckInSequenceClosure[] = []
  const optOuts: PersonOptOut[] = []
  const removals: PersonRemoval[] = []
  const restorations: PersonRestoration[] = []
  const optIns: PersonOptIn[] = []
  const keywordExchanges: NewKeywordExchange[] = []
  const keywordTargets: KeywordExchangeTarget[] = []
  const keywordClarifications: KeywordExchangeClarification[] = []
  const keywordClosures: KeywordExchangeClosure[] = []
  const settingsSaved: MinistrySettings[] = []
  const addedGoals: NewDiscipleshipGoal[] = []
  const renamedGoals: DiscipleshipGoalRenaming[] = []
  const goalOrders: DiscipleshipGoalOrder[] = []
  const removedGoals: DiscipleshipGoalRemoval[] = []
  const createdMaterials: NewMaterial[] = []
  const editedMaterials: MaterialEdit[] = []
  const removedMaterials: MaterialRemoval[] = []
  const materialNotices: MaterialNoticeRecord[] = []
  const materialLinks: NewMaterialLink[] = []
  const intakeLinks: NewIntakeLink[] = []
  const resolutions: FollowUpResolution[] = []
  const cancellations: RelationshipCancellation[] = []
  const endings: RelationshipEnding[] = []
  const departures: ParticipantDeparture[] = []
  const joins: NewParticipantMembership[] = []
  const addedLeaders: NewLeaderMembership[] = []
  const groupConfigurations: GroupConfiguration[] = []
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
    get heldRows() {
      return [...heldRows]
    },
    get renamings() {
      return [...renamings]
    },
    get importRowAnswers() {
      return [...importRowAnswers]
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
    get withdrawals() {
      return [...withdrawals]
    },
    get followUps() {
      return [...followUps]
    },
    get plans() {
      return [...plans]
    },
    get planClosures() {
      return [...planClosures]
    },
    openPlans: [],
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
    get addedLeaders() {
      return [...addedLeaders]
    },
    get joins() {
      return [...joins]
    },
    get groupConfigurations() {
      return [...groupConfigurations]
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
    get outstandingReplyClosures() {
      return [...outstandingReplyClosures]
    },
    get outstandingReplySweeps() {
      return [...outstandingReplySweeps]
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
    get settingsSaved() {
      return [...settingsSaved]
    },
    get addedGoals() {
      return [...addedGoals]
    },
    get renamedGoals() {
      return [...renamedGoals]
    },
    get goalOrders() {
      return [...goalOrders]
    },
    get removedGoals() {
      return [...removedGoals]
    },
    get createdMaterials() {
      return [...createdMaterials]
    },
    get editedMaterials() {
      return [...editedMaterials]
    },
    get materialNotices() {
      return [...materialNotices]
    },
    get materialLinks() {
      return [...materialLinks]
    },
    get removedMaterials() {
      return [...removedMaterials]
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
    accountHeld: null,
    personToRemove: null,
    removedFromTheRoster: new Set<PersonId>(),
    get removals() {
      return [...removals]
    },
    get restorations() {
      return [...restorations]
    },
    goals: [],
    goalAnswers: [],
    materials: [],
    unaccepted: [],
    paused: [],
    materialRecipients: [],
    timeZoneForMaterialTexts: 'UTC',
    checkInsDue: [],
    contacts: new Map<PersonId, PersonContact>(),
    ministryName: 'Riverside Chapel',
    language: {
      leaderNoun: roleNoun('mentor'),
      participantNoun: roleNoun('mentee'),
    },
    settings: {
      name: 'Riverside Chapel',
      fromName: null,
      timezone: 'UTC',
      leaderNoun: roleNoun('mentor'),
      participantNoun: roleNoun('mentee'),
      suggestGenderMatch: true,
      suggestMaxAgeBandGap: DEFAULT_AGE_BAND_GAP,
      cadence: { day: 1, hour: 9 },
    },
    async transact(_ministryId: MinistryId, work) {
      const stagedHistory: HistoryEvent[] = []
      const stagedOutbox: SettledMessage[] = []
      const stagedRelationships: NewRelationship[] = []
      const stagedPeople: NewPerson[] = []
      const stagedIntakes: IntakeRecord[] = []
      const stagedInvitations: NewInvitation[] = []
      const stagedAcceptances: LeaderAcceptance[] = []
      const stagedWithdrawals: InvitationWithdrawal[] = []
      const stagedFollowUps: NewFollowUpItem[] = []
      const stagedResolutions: FollowUpResolution[] = []
      const stagedCancellations: RelationshipCancellation[] = []
      const stagedEndings: RelationshipEnding[] = []
      const stagedDepartures: ParticipantDeparture[] = []
      const stagedJoins: NewParticipantMembership[] = []
      const stagedAddedLeaders: NewLeaderMembership[] = []
      const stagedGroupConfigurations: GroupConfiguration[] = []
      const stagedMaterialAssignments: MaterialAssignment[] = []
      const stagedSequences: NewCheckInSequence[] = []
      const stagedPrompts: NewCheckInPrompt[] = []
      const stagedCheckInAnswers: CheckInAnswer[] = []
      const stagedOutstandingReplyClosures: OutstandingReplyClosure[] = []
      const stagedOutstandingReplySweeps: OutstandingReplySweep[] = []
      const stagedClarifications: CheckInClarification[] = []
      const stagedReminders: CheckInReminder[] = []
      const stagedClosures: CheckInSequenceClosure[] = []
      const stagedOptOuts: PersonOptOut[] = []
      const stagedRemovals: PersonRemoval[] = []
      const stagedRestorations: PersonRestoration[] = []
      const stagedOptIns: PersonOptIn[] = []
      const stagedKeywordExchanges: NewKeywordExchange[] = []
      const stagedKeywordTargets: KeywordExchangeTarget[] = []
      const stagedKeywordClarifications: KeywordExchangeClarification[] = []
      const stagedKeywordClosures: KeywordExchangeClosure[] = []
      const stagedPlans: NewIntendedPairing[] = []
      const stagedPlanClosures: IntendedPairingClosure[] = []
      const stagedSettings: MinistrySettings[] = []
      const stagedAddedGoals: NewDiscipleshipGoal[] = []
      const stagedRenamedGoals: DiscipleshipGoalRenaming[] = []
      const stagedGoalOrders: DiscipleshipGoalOrder[] = []
      const stagedRemovedGoals: DiscipleshipGoalRemoval[] = []
      const stagedCreatedMaterials: NewMaterial[] = []
      const stagedEditedMaterials: MaterialEdit[] = []
      const stagedRemovedMaterials: MaterialRemoval[] = []
      const stagedMaterialNotices: MaterialNoticeRecord[] = []
      const stagedMaterialLinks: NewMaterialLink[] = []
      const stagedIntakeLinks: NewIntakeLink[] = []
      const stagedConcerns: NewConcern[] = []
      const stagedViewings: ConcernViewing[] = []
      const stagedConcernResolutions: ConcernResolution[] = []
      const stagedHeldRows: HeldImportRow[] = []
      const stagedRenamings: PersonRenaming[] = []
      const stagedImportRowAnswers: ImportRowResolution[] = []

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
        async discipleshipGoals() {
          return store.goals
        },
        async addDiscipleshipGoal(goal) {
          stagedAddedGoals.push(goal)
        },
        async renameDiscipleshipGoal(renaming) {
          stagedRenamedGoals.push(renaming)
        },
        async reorderDiscipleshipGoals(order) {
          stagedGoalOrders.push(order)
        },
        async answersPointingAt() {
          return store.goalAnswers
        },
        async removeDiscipleshipGoal(removal) {
          stagedRemovedGoals.push(removal)
        },
        async materials() {
          return store.materials
        },
        async materialPathsNamed(paths) {
          const named = new Set(
            store.materials.flatMap((material) =>
              material.items.flatMap((item) => (item.kind === 'file' ? [item.path] : [])),
            ),
          )
          return new Set(paths.filter((path) => named.has(path)))
        },
        async createMaterial(material) {
          stagedCreatedMaterials.push(material)
        },
        async editMaterial(edit) {
          stagedEditedMaterials.push(edit)
        },
        async removeMaterial(removal) {
          stagedRemovedMaterials.push(removal)
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
        async accountHeldBy() {
          return store.accountHeld
        },
        async personToRemove() {
          return store.personToRemove
        },
        async removePerson(removal) {
          stagedRemovals.push(removal)
        },
        async restorePerson(restoration) {
          stagedRestorations.push(restoration)
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
        // Replaces rather than appends, like the real one: what the database keeps
        // is one live invitation per person per relationship, and a fake that let
        // two accumulate would make a test pass on a shape the index refuses.
        async reissueInvitation(invitation) {
          const supersedes = (candidate: NewInvitation) =>
            candidate.relationshipId === invitation.relationshipId
            && candidate.personId === invitation.personId
          const at = invitations.findIndex(supersedes)
          if (at >= 0) invitations.splice(at, 1)
          for (let i = stagedInvitations.length - 1; i >= 0; i -= 1) {
            if (supersedes(stagedInvitations[i]!)) stagedInvitations.splice(i, 1)
          }
          stagedInvitations.push(invitation)
        },
        async acceptInvitation(acceptance) {
          stagedAcceptances.push(acceptance)
        },
        async withdrawInvitation(withdrawal) {
          stagedWithdrawals.push(withdrawal)
        },
        async lapsedInvitations() {
          return store.lapsed ?? []
        },
        async invitationHeldBy() {
          return store.invitationHeld ?? { liveExpiresAt: null, everWithdrawn: false }
        },
        async unansweredInvitationOf() {
          return store.unanswered ?? null
        },
        async raiseFollowUp(item) {
          if (store.nothingLeftToRaise) return false
          stagedFollowUps.push(item)
          return true
        },
        async openIntendedPairings() {
          return [...store.openPlans, ...stagedPlans.map((plan) => ({ id: plan.id, leaderId: plan.leaderId, participantId: plan.participantId, plannedAt: plan.plannedAt }))]
        },
        async intendedPairingFor() {
          return store.intendedPairing ?? null
        },
        async planIntendedPairings(planned) {
          stagedPlans.push(...planned)
        },
        async lockIntendedPairings() {
          // Nothing to lock: one command at a time is all this store ever runs.
        },
        async closeIntendedPairing(closure) {
          stagedPlanClosures.push(closure)
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
        async materialRecipients() {
          return { timeZone: store.timeZoneForMaterialTexts, recipients: store.materialRecipients }
        },
        async recordMaterialNotices(notices) {
          stagedMaterialNotices.push(...notices)
        },
        async issueMaterialLinks(links) {
          stagedMaterialLinks.push(...links)
        },
        async leadersDueForCheckIn() {
          return store.checkInsDue
        },
        async relationshipFor() {
          return store.relationship ?? null
        },
        async relationshipsToAssign(ids) {
          // The one relationship this store holds, where it is among those named:
          // the database's answer for a Ministry of one.
          const held = store.relationship
          return held && ids.includes(held.relationshipId) ? [held] : []
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
        async groupToJoin() {
          return store.relationship ?? null
        },
        async joinRequest() {
          return null
        },
        async openJoinRequestFor() {
          return null
        },
        async openPlacementWantedFor() {
          return null
        },
        async joinRelationship(membership) {
          stagedJoins.push(membership)
        },
        async addLeaderToGroup(membership) {
          stagedAddedLeaders.push(membership)
        },
        async configureGroup(configuration) {
          stagedGroupConfigurations.push(configuration)
        },
        async assignMaterials(assignments) {
          stagedMaterialAssignments.push(...assignments)
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
            removed: new Set(store.removedFromTheRoster),
          }
        },
        async peopleWhoCompletedIntake() {
          return new Set<PersonId>(
            [...intakes, ...stagedIntakes].map((intake) => intake.personId),
          )
        },
        async ministryVoice() {
          return { name: store.ministryName, ...store.language }
        },
        async ministrySettings() {
          return store.settings
        },
        async saveMinistrySettings(settings) {
          stagedSettings.push(settings)
        },
        async recordIntake(intake) {
          if (store.failOn === 'recordIntake') throw new Error('Intake unavailable')
          stagedIntakes.push(intake)
        },
        async createPeople(imported) {
          if (store.failOn === 'createPeople') throw new Error('the Roster is unavailable')
          stagedPeople.push(...imported)
        },
        async holdImportRows(rows) {
          stagedHeldRows.push(...rows)
        },
        async heldImportRow(row) {
          return (
            [...heldRows, ...stagedHeldRows].find((held) => held.id === row) ??
            store.heldImportRow ??
            null
          )
        },
        async resolveImportRow(resolution) {
          stagedImportRowAnswers.push(resolution)
        },
        async renamePerson(renaming) {
          stagedRenamings.push(renaming)
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
        async ratesLineHistory(asked) {
          // Nothing here is ever withheld, so every text that carried the line counts.
          const lastCarriedAt = new Map<PersonId, Date>()
          for (const message of [...outbox, ...stagedOutbox]) {
            if (!message.carriesRatesLine || !message.personId) continue
            if (!asked.includes(message.personId)) continue
            const before = lastCarriedAt.get(message.personId)
            if (!before || before < message.enqueuedAt) {
              lastCarriedAt.set(message.personId, message.enqueuedAt)
            }
          }
          return { timeZone: store.settings.timezone, lastCarriedAt }
        },
        async enqueueMessages(messages) {
          if (store.failOn === 'enqueueMessages') throw new Error('outbound queue unavailable')
          stagedOutbox.push(...messages)
        },
        async closeOutstandingReply(closure) {
          stagedOutstandingReplyClosures.push(closure)
        },
        async sweepOutstandingReplies(sweep) {
          stagedOutstandingReplySweeps.push(sweep)
        },
      }

      const result = await work(unit)

      people.push(...stagedPeople)
      heldRows.push(...stagedHeldRows)
      renamings.push(...stagedRenamings)
      importRowAnswers.push(...stagedImportRowAnswers)
      intakes.push(...stagedIntakes)
      relationships.push(...stagedRelationships)
      history.push(...stagedHistory)
      outbox.push(...stagedOutbox)
      invitations.push(...stagedInvitations)
      acceptances.push(...stagedAcceptances)
      withdrawals.push(...stagedWithdrawals)
      followUps.push(...stagedFollowUps)
      resolutions.push(...stagedResolutions)
      concerns.push(...stagedConcerns)
      viewings.push(...stagedViewings)
      concernResolutions.push(...stagedConcernResolutions)
      cancellations.push(...stagedCancellations)
      endings.push(...stagedEndings)
      departures.push(...stagedDepartures)
      joins.push(...stagedJoins)
      addedLeaders.push(...stagedAddedLeaders)
      groupConfigurations.push(...stagedGroupConfigurations)
      materialAssignments.push(...stagedMaterialAssignments)
      sequences.push(...stagedSequences)
      prompts.push(...stagedPrompts)
      checkInAnswers.push(...stagedCheckInAnswers)
      outstandingReplyClosures.push(...stagedOutstandingReplyClosures)
      outstandingReplySweeps.push(...stagedOutstandingReplySweeps)
      clarifications.push(...stagedClarifications)
      reminders.push(...stagedReminders)
      closures.push(...stagedClosures)
      optOuts.push(...stagedOptOuts)
      removals.push(...stagedRemovals)
      restorations.push(...stagedRestorations)
      optIns.push(...stagedOptIns)
      keywordExchanges.push(...stagedKeywordExchanges)
      keywordTargets.push(...stagedKeywordTargets)
      keywordClarifications.push(...stagedKeywordClarifications)
      keywordClosures.push(...stagedKeywordClosures)
      plans.push(...stagedPlans)
      planClosures.push(...stagedPlanClosures)
      settingsSaved.push(...stagedSettings)
      addedGoals.push(...stagedAddedGoals)
      renamedGoals.push(...stagedRenamedGoals)
      goalOrders.push(...stagedGoalOrders)
      removedGoals.push(...stagedRemovedGoals)
      createdMaterials.push(...stagedCreatedMaterials)
      editedMaterials.push(...stagedEditedMaterials)
      removedMaterials.push(...stagedRemovedMaterials)
      materialNotices.push(...stagedMaterialNotices)
      materialLinks.push(...stagedMaterialLinks)
      intakeLinks.push(...stagedIntakeLinks)
      return result
    },
  }

  return store
}
