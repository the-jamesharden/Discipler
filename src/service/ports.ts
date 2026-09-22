import type {
  IntendedPairingClosure,
  IntendedPairingSnapshot,
  NewIntendedPairing,
  OpenIntendedPairing,
} from '~/domain/intended-pairing'
import type { IntendedPairingId } from '~/domain/ids'
import type { PairingRefusal } from '~/domain/errors'
import type { AccountCreationRefusal, PasswordChangeRefusal } from '~/domain/accounts'
import type {
  HeldImportRow,
  ImportRowAnswer,
  NameOnTheNumber,
} from '~/domain/roster'
import type { AvailabilityOverlay } from '~/domain/availability-overlay'
import type {
  IntakeLinkSnapshot,
  InvitationHeld,
  InvitationSnapshot,
  PausedRelationship,
  PersonContact,
  OpenJoinRequest,
  RelationshipSnapshot,
  UnacceptedRelationship,
} from '~/domain/boundary'
import type { CheckInSnapshot, Satisfaction } from '~/domain/check-in'
import type { CheckInCounts } from '~/domain/overview'
import type { IsoWeek } from '~/domain/week'
import type { ConcernResolution, ConcernViewing, NewConcern } from '~/domain/concerns'
import type {
  CheckInAnswer,
  CheckInClarification,
  CheckInReminder,
  CheckInSequenceClosure,
  DiscipleshipGoalOrder,
  DiscipleshipGoalRemoval,
  DiscipleshipGoalRenaming,
  ImportRowResolution,
  IntakeRecord,
  InvitationWithdrawal,
  LeaderAcceptance,
  MaterialAssignment,
  MaterialEdit,
  MaterialRemoval,
  NewMaterial,
  KeywordExchangeClarification,
  KeywordExchangeClosure,
  KeywordExchangeTarget,
  NewCheckInPrompt,
  NewCheckInSequence,
  NewDiscipleshipGoal,
  NewKeywordExchange,
  OutboundMessageDraft,
  OutstandingReplyClosure,
  OutstandingReplySweep,
  ParticipantDeparture,
  NewLeaderMembership,
  NewParticipantMembership,
  GroupConfiguration,
  PersonOptIn,
  PersonOptOut,
  PersonRenaming,
  RelationshipCancellation,
  RelationshipEnding,
} from '~/domain/effects'
import type {
  FollowUpPayload,
  FollowUpResolution,
  NewFollowUpItem,
} from '~/domain/follow-up'
import type { OfferedGoal, StatedGoal } from '~/domain/discipleship-goals'
import type { MaterialOnOffer } from '~/domain/materials'
import type { MinistrySettings, MinistryVoice } from '~/domain/ministry-settings'
import type { IntakeLinkState, IntakeLinkToken, NewIntakeLink } from '~/domain/intake-link'
import type { InboundSnapshot } from '~/domain/keywords'
import type {
  OutboundMessageKind,
  SerialisationOfAMessage,
} from '~/domain/outstanding-reply'
import type { InvitationToken, NewInvitation } from '~/domain/invitations'
import type { MinistrySetupState, NewMinistrySetup } from '~/domain/ministry-setup'
import type { MinistrySetupRefusal } from '~/domain/errors'
import type { HistoryEvent, NewHistoryEvent } from '~/domain/history'
import type { AgeBand, DeclaredSide, DiscipleshipGoalId, Gender } from '~/domain/intake'
import type {
  ConcernId,
  FollowUpItemId,
  ImportRowId,
  MaterialId,
  MinistryId,
  OutboundMessageId,
  PersonId,
  RelationshipId,
} from '~/domain/ids'
import type { ParticipationStatus } from '~/domain/participation'
import type { Suggestions } from '~/domain/suggestions'
import type { NewRelationship } from '~/domain/relationships'
import type { CareReason, RelationshipState, SettledRelationshipState } from '~/domain/relationship-state'
import type { InvitationState } from '~/domain/invitations'
import type { MemberRole } from '~/domain/relationships'
import type { NewPerson, PhoneNumber, RosterKey } from '~/domain/roster'

/**
 * Everything the application service needs from the outside world. The domain
 * knows none of these; they exist so the command boundary can stay pure.
 */

/**
 * One command's unit of work: the reads it needs and the writes it makes, on one
 * connection inside one transaction.
 *
 * It reads as well as writes, which is why it is not called a sink. The Roster is
 * read in order to decide what to write to it, and doing that before the
 * transaction opens would let two Admins importing the same spreadsheet at once
 * both find the Roster empty.
 */
/**
 * One read of the Roster, answering the two questions anything writing to it has:
 * have I seen this exact line before, and do I already hold this number.
 */
export interface RosterReadback {
  readonly people: ReadonlyMap<RosterKey, PersonId>
  readonly namesByNumber: ReadonlyMap<PhoneNumber, readonly string[]>
}

export interface UnitOfWork {
  /**
   * Everyone already on this Ministry's Roster: by `rosterKey` against the
   * identifier behind it, and by number against the names it holds. Intake needs
   * the Person behind a key, because whoever is filling the form in is usually
   * already on a Roster somebody uploaded; an import needs both, because a number
   * it already holds under another name is neither a duplicate nor a new Person
   * until an Admin says which.
   */
  peopleOnRoster(): Promise<RosterReadback>
  /**
   * Everyone in this Ministry with at least one Intake submission already on file.
   * Read inside the unit of work like the Roster, and for the same reason: two
   * submissions racing each other must not both read "never submitted" and both
   * enqueue a Welcome Message.
   */
  peopleWhoCompletedIntake(): Promise<ReadonlySet<PersonId>>
  /**
   * How this Ministry speaks: the name every outbound message reads as, and the
   * words it calls its two roles by. Read inside the unit of work like everything
   * else, so a command cannot compose a message for a Ministry the connection is
   * not acting for.
   *
   * One read and not two. The name and the nouns are three columns of one row and
   * every message that carries a noun carries the name as well, so asking for them
   * separately would be a second round trip for a second half of the same fact --
   * and two answers that could, briefly, disagree about which Ministry is speaking.
   */
  ministryVoice(): Promise<MinistryVoice>
  /**
   * Refuses with a `RosterImportRefused` when one of these people is already on the
   * Roster -- the case the read above is meant to catch, left to the database as the
   * backstop against two imports racing each other.
   */
  createPeople(people: readonly NewPerson[]): Promise<void>
  /**
   * The rows the import would not guess about, kept so an Admin can answer them.
   * Written with the people rather than instead of them: an import that files four
   * congregants and holds a fifth row has done both, and one transaction is what
   * makes the report it redirects with true.
   *
   * An import re-uploaded before anybody answers raises the same question again.
   * The row it lands on is the one already open rather than a second copy of it --
   * `held_import_row_one_open_question` is what says so -- and the line it points
   * at becomes the one in the file just uploaded, because that is the file the
   * Admin has in front of them.
   */
  holdImportRows(rows: readonly HeldImportRow[]): Promise<void>
  /**
   * The row an answer is about, or null for an id that names none. Read inside the
   * transaction like everything else, so two Admins working the same import report
   * cannot both find it unanswered and both act on it.
   */
  heldImportRow(row: ImportRowId): Promise<HeldImportRow | null>
  /**
   * The Admin's answer, recorded against the row it closes. Never a delete: what a
   * Ministry decided about a congregant's identity is a fact about the Ministry,
   * and the row is what carries it while ticket 07 settles whether a rename is also
   * a history event.
   */
  resolveImportRow(resolution: ImportRowResolution): Promise<void>
  /**
   * The name on file becoming the name in the file. One Person row throughout --
   * this is an update to `person.full_name` and nothing else, so `person.id` never
   * moves and every relationship, message and history event stays theirs.
   *
   * Refuses with an `ImportRowResolutionRefused` when the name is already on that
   * number, which is `person_ministry_identity_uniq` doing the job the domain check
   * above it also does. Two Admins answering at once is what gets past the first.
   */
  renamePerson(renaming: PersonRenaming): Promise<void>
  appendHistory(events: readonly NewHistoryEvent[]): Promise<readonly HistoryEvent[]>
  /**
   * The submission, its availability, the consents it granted, and the email it
   * carried. One call because they are one act, and because the outbound queue
   * refuses a message to anybody with no SMS consent on file -- so the consent has
   * to be written before the Welcome Message is enqueued, not merely in the same
   * transaction.
   */
  recordIntake(intake: IntakeRecord): Promise<void>
  enqueueMessages(messages: readonly OutboundMessageDraft[]): Promise<void>
  /**
   * Closes whatever conversation this number is holding, so the next scheduled
   * message to it may go out. Does nothing where the number holds none, and
   * nothing at all where the Person has no number.
   */
  closeOutstandingReply(closure: OutstandingReplyClosure): Promise<void>
  /**
   * Closes every conversation the clock has run out on, in one statement. The
   * cutoffs arrive already worked out -- the windows are the Check-In Rhythm's and
   * are read against the injected clock, so nothing here has to know what
   * forty-eight hours means.
   */
  sweepOutstandingReplies(sweep: OutstandingReplySweep): Promise<void>
  /**
   * Refuses with a `PairingRefused` carrying a code when a participation cap or the
   * one-role-per-relationship rule is broken. The caps can only be judged against
   * the Ministry's other relationships, so the database is the only thing in a
   * position to judge them -- and it must not do so silently.
   */
  createRelationship(relationship: NewRelationship): Promise<void>
  /**
   * The names and numbers of the people a command names. Pairing needs them
   * because it texts every Leader an Invitation Link, and a message needs a
   * recipient and a greeting.
   */
  contactsFor(ids: readonly PersonId[]): Promise<ReadonlyMap<PersonId, PersonContact>>
  /**
   * The token as the database holds it, with everyone holding an open membership
   * on the relationship it names. Null when nothing answers to it.
   *
   * An expired or consumed token still resolves. The page has to tell the
   * difference between a link that has run out and one that was never real, and
   * refusing to resolve either would make those the same screen.
   */
  resolveInvitation(token: InvitationToken): Promise<InvitationSnapshot | null>
  issueInvitation(invitation: NewInvitation): Promise<void>
  /**
   * Replaces the live invitation this Person holds to this relationship with a new
   * token and a new window. One row throughout: the partial unique index permits
   * one live invitation per person per relationship, and a dead token left beside
   * a live one is a second way in that nothing can revoke.
   */
  reissueInvitation(invitation: NewInvitation): Promise<void>
  /**
   * One Leader agreeing to lead, as one write. The token is spent, the name is
   * stored as given, the account is linked to the Person record, the membership is
   * stamped -- and the relationship itself is stamped when this was the last open
   * leader membership left to agree.
   */
  acceptInvitation(acceptance: LeaderAcceptance): Promise<void>
  /**
   * One invitation ended without being accepted, as one write: the link is marked
   * withdrawn, its Leader's unaccepted membership gains an end date and is never
   * deleted, and the relationship is stamped where that leaves it with at least
   * one Leader and every one of them accepted.
   */
  withdrawInvitation(withdrawal: InvitationWithdrawal): Promise<void>
  /**
   * The unanswered invitations whose window had closed as of the instant given:
   * live, unaccepted, on a relationship that has not ended. Candidates, read with
   * no lock; each is decided again by `invitation.expire` behind the row an
   * acceptance holds. The instant is the caller's clock, never the database's.
   */
  lapsedInvitations(asOf: Date): Promise<readonly InvitationToken[]>
  /** The invitations one Person has held to one relationship, as a re-invitation reads them. */
  invitationHeldBy(relationship: RelationshipId, person: PersonId): Promise<InvitationHeld>
  /**
   * The token of the invitation one Person holds to one relationship that nobody
   * has answered and nobody has withdrawn, or null. Still theirs once its window
   * has closed, until the tick sweeps it. A candidate, read with no lock, for an
   * Admin taking it back: `invitation.withdraw` decides again behind the row an
   * acceptance holds. At most one, which the table's own index holds.
   */
  unansweredInvitationOf(relationship: RelationshipId, person: PersonId): Promise<InvitationToken | null>
  /**
   * Raising an item that already stands changes nothing. Twenty taps on "not my
   * number" is one condition, and the Admin sees one thing to act on.
   */
  /**
   * False where the store looked again and found nothing left to say, which only
   * an unanswered invitation does: the Leader accepted between the tick's read
   * and this write. True otherwise, including where the item already stood open.
   */
  raiseFollowUp(item: NewFollowUpItem): Promise<boolean>
  /**
   * The pairings an import planned (ADR-0022). Every plan still standing, read by
   * the settle and by an Admin pairing by hand; one plan under its own row lock,
   * with both people as settling it needs to know them; the plans an import
   * records; and the closing of one, as fulfilled or refused. A closure that finds
   * the plan already closed changes nothing: two settles racing is ordinary, and
   * the database refuses the duplicate pairing the loser would have formed.
   */
  openIntendedPairings(): Promise<readonly OpenIntendedPairing[]>
  intendedPairingFor(id: IntendedPairingId): Promise<IntendedPairingSnapshot | null>
  planIntendedPairings(plans: readonly NewIntendedPairing[]): Promise<void>
  closeIntendedPairing(closure: IntendedPairingClosure): Promise<void>
  /**
   * Takes the locks on the plans a command is about to close, before it writes the
   * relationship that closes them. Settling a plan locks the plan and then writes
   * the Disciple's membership; an Admin forming the same pair by hand, or a check
   * of that pairing, would otherwise write the membership and then reach for the
   * plan, and two transactions taking two locks in opposite orders is a deadlock
   * Postgres ends by killing one (Manual pairing, ticket 03; ADR-0025). One order
   * for everybody: the plan, then the membership. A plan this transaction already
   * holds is locked again at no cost, and one that has since closed is locked all
   * the same, which is harmless.
   */
  lockIntendedPairings(ids: readonly IntendedPairingId[]): Promise<void>
  /**
   * Refuses with a `FollowUpRefused` when the item is gone or already closed. Two
   * Admins clicking Resolve on the same row is ordinary, and only the database can
   * see which of them got there first.
   */
  resolveFollowUp(resolution: FollowUpResolution): Promise<void>
  /**
   * Every relationship in this Ministry that nobody has accepted, with the Leaders
   * still to agree and whether each has been reminded. Everything the tick needs to
   * decide anything, read in one place so the domain fetches nothing.
   */
  unacceptedRelationships(): Promise<readonly UnacceptedRelationship[]>
  /**
   * Every relationship in this Ministry a Pause currently stands on, with the
   * period it was taken for and whether an Admin already has an expiry item open
   * on it. Everything the tick needs to decide a Pause has run out, read in one
   * place so the domain fetches nothing.
   *
   * Whether it *has* run out is not answered here. That is a question about time,
   * and every one of those is decided at the command boundary against the
   * injected clock -- which is what lets a twelve-week pause be proven by a test
   * that runs in milliseconds.
   */
  pausedRelationships(): Promise<readonly PausedRelationship[]>
  /**
   * One relationship as the database holds it now, or null when this Ministry has
   * none by that identifier -- which is the same answer for one that belongs to
   * another Ministry, because the policy on the connection shows neither.
   */
  relationshipFor(id: RelationshipId): Promise<RelationshipSnapshot | null>
  /**
   * Withdraws a relationship nobody accepted and closes every open membership on
   * it, which is the whole of returning everyone to the suggestion pool.
   */
  cancelRelationship(cancellation: RelationshipCancellation): Promise<void>
  /**
   * Ends a relationship that ran and closes every open membership on it, in one
   * transaction and through the one database function that ends a relationship --
   * which is what keeps *no open membership outlives its relationship* true of
   * every write path rather than of this one.
   *
   * Refuses with an `EndingRefused` when the database disagrees with the snapshot
   * the domain decided from: two Admins clicking End is ordinary, and only the
   * second one is wrong.
   */
  endRelationship(ending: RelationshipEnding): Promise<void>
  /**
   * Closes one Participant's open membership and nothing else. The row is dated,
   * never deleted, so the weeks they were present for stay attached to the
   * relationship -- and a readmission later is a second row rather than this one
   * reopened.
   */
  departFromRelationship(departure: ParticipantDeparture): Promise<void>
  /**
   * The group a submission on the group path named, as the database holds it now
   * and locked, or null for an identifier that names no group this Ministry holds
   * -- including a relationship formed as a one-to-one, which the join path never
   * offers. Takes a string rather than an id because the value arrived in a
   * request body and has proved nothing yet.
   */
  groupToJoin(id: string): Promise<RelationshipSnapshot | null>
  /**
   * One open `group_join_requested` item, locked, or null where the id names no
   * open item of that kind. Read so an admission acts on who actually asked and
   * for which group, rather than on whatever a request body said.
   */
  joinRequest(itemId: FollowUpItemId): Promise<OpenJoinRequest | null>
  /**
   * The open `group_join_requested` item one Person has for one group, locked, or
   * null where they have none. Read so an Admin putting them into that group
   * resolves it in the same act (Manual pairing, recut ticket 03). At most one: a
   * request dedupes while it stands open. A request of theirs for another group is
   * not this one.
   */
  openJoinRequestFor(personId: PersonId, relationshipId: RelationshipId): Promise<OpenJoinRequest | null>
  /**
   * Adds one Participant to a relationship that already exists -- the mirror of a
   * departure. Refuses with a `PairingRefused` when the caps, the Intake gate or
   * the gender rule refuse the membership, exactly as formation does: the same
   * triggers judge the same insert.
   */
  joinRelationship(membership: NewParticipantMembership): Promise<void>
  /**
   * Adds one Leader, with no Acceptance, to a group that already exists, and
   * touches nothing else about it. Refuses with a `GroupJoinRefused` when they
   * already lead an open group, and with a `PairingRefused` when the Intake gate,
   * an opt-out or the group's declared gender refuses the membership, exactly as
   * formation does: the same triggers and indexes judge the same insert.
   */
  addLeaderToGroup(membership: NewLeaderMembership): Promise<void>
  /** What an Admin called a group and whether joining it asks. */
  configureGroup(configuration: GroupConfiguration): Promise<void>
  /**
   * Closes the Material period that was running and opens a new one at the same
   * instant, through the one database function that writes either -- which is what
   * keeps *periods never overlap and never leave gaps* true of every write path
   * rather than of the one that happens to be careful.
   *
   * Refuses with a `MaterialAssignmentRefused` when the database disagrees with the
   * snapshot the domain decided from, or when the Material or the Admin belongs to
   * another Ministry.
   */
  assignMaterial(assignment: MaterialAssignment): Promise<void>

  /**
   * Everything a check-in command needs about one Person: the live relationships
   * they lead, the conversation already open with them if there is one, and when
   * they were last asked anything.
   *
   * Read for the Person and never for a relationship. A Leader holding three of
   * them has one conversation, and the position in it is the only thing that says
   * which relationship a `1` is about.
   */
  checkInFor(id: PersonId): Promise<CheckInSnapshot | null>
  /**
   * Every Leader in this Ministry the cadence could make due, with the cadence
   * already resolved as `coalesce(r.checkin_day, ms.checkin_day)`.
   *
   * *Could*, not *is*. Nothing here reads a clock: which of them a new ISO week
   * has come due for is decided at the command boundary against the injected
   * one, so the whole cadence -- the day, the hour, the timezone, the week
   * boundary and what a mid-week edit does to it -- is provable by a test with no
   * database and no fortnight of waiting.
   */
  leadersDueForCheckIn(): Promise<readonly CheckInSnapshot[]>

  openCheckInSequence(sequence: NewCheckInSequence): Promise<void>
  askCheckInQuestion(prompt: NewCheckInPrompt): Promise<void>
  recordCheckInAnswer(answer: CheckInAnswer): Promise<void>
  /** One clarification spent on the open question, against a cap of two. */
  clarifyCheckInQuestion(clarification: CheckInClarification): Promise<void>
  /** The one re-send an unanswered question gets, stamped on that same prompt. */
  remindCheckInQuestion(reminder: CheckInReminder): Promise<void>
  closeCheckInSequence(closure: CheckInSequenceClosure): Promise<void>

  /** The carrier opt-out, at the level the carrier applies it: the Person. */
  optPersonOut(optOut: PersonOptOut): Promise<void>

  /**
   * The carrier re-opt-in, `START`, which dates the standing opt-out rather than
   * deleting it. `STOP` in March and `START` in April are two facts.
   */
  optPersonIn(optIn: PersonOptIn): Promise<void>

  /**
   * What the Person an inbound text came from holds, what they last asked for, and
   * whether Discipler may still text them.
   *
   * Read alongside `checkInFor` and behind the same advisory lock it takes, so a
   * keyword and a newly-due conversation cannot both find nothing outstanding. Two
   * reads rather than one because they answer different questions: this one serves
   * a Participant, who has no check-in state at all.
   */
  inboundFor(id: PersonId): Promise<InboundSnapshot | null>

  /**
   * A Keyword Exchange, opened. Refused by a partial unique index if one already
   * stands for this Person, which is what makes *at most one open per Person* a
   * property of the data rather than of whichever path happened to write it.
   */
  openKeywordExchange(exchange: NewKeywordExchange): Promise<void>

  /**
   * A menu answered: the relationship the exchange has settled on, and the moment
   * it put its next question. Resets the clarification count, because the
   * confirmation is a new question.
   */
  setKeywordExchangeTarget(target: KeywordExchangeTarget): Promise<void>

  /** One of the two clarifications Discipler will spend on an exchange's question. */
  clarifyKeywordExchange(clarification: KeywordExchangeClarification): Promise<void>

  /** An exchange that is no longer open, and why. */
  closeKeywordExchange(closure: KeywordExchangeClosure): Promise<void>


  /**
   * This Ministry's settings as they stand, loaded on `settings.update`'s behalf.
   *
   * Read inside the unit of work like everything else, so the values history
   * records as *what these used to be* are the values that were actually there
   * when the edit was decided -- not ones a second Admin had already replaced.
   */
  ministrySettings(): Promise<MinistrySettings>

  /**
   * One Ministry's settings, saved. Every field at once, because it is one form
   * and a partial write would let two sections of it disagree about which edit
   * won.
   */
  saveMinistrySettings(settings: MinistrySettings): Promise<void>

  /**
   * Every Discipleship Goal option this Ministry offers, in the order the form
   * shows them, each with how many people's current Intake answer points at it.
   *
   * The count comes back with the options rather than being asked for separately,
   * because the one edit that needs it is the one that destroys it: after the
   * removal there is nothing left to count.
   */
  discipleshipGoals(): Promise<readonly OfferedGoal[]>

  /** One option, appended to the Ministry's list at the position it was given. */
  addDiscipleshipGoal(goal: NewDiscipleshipGoal): Promise<void>

  /**
   * One option, reworded. The row is updated rather than replaced, which is what
   * keeps every answer pointing at it: a reworded option is the same option.
   */
  renameDiscipleshipGoal(renaming: DiscipleshipGoalRenaming): Promise<void>

  /** The Ministry's whole list, renumbered into the order it was handed. */
  reorderDiscipleshipGoals(order: DiscipleshipGoalOrder): Promise<void>

  /**
   * Every submission pointing at one option, read before it is removed -- because
   * afterwards there is nothing left to read. What comes back goes into the
   * `discipleship_goal.removed` event, which is then the only record that this
   * Person's stated goal was ever this option.
   *
   * Every submission and not only the standing ones: `chosenBy` counts people and
   * the delete blanks rows, and it is the rows that have to be written down.
   */
  answersPointingAt(goalId: DiscipleshipGoalId): Promise<readonly StatedGoal[]>

  /**
   * One option, deleted. The database blanks it on every submission that chose
   * it, and refuses to delete the last option a Ministry has.
   */
  removeDiscipleshipGoal(removal: DiscipleshipGoalRemoval): Promise<void>

  /**
   * Every live Material this Ministry holds, each with how many accepted,
   * unended relationships are working through it now. Read inside the unit of
   * work, so two Admins cannot both create the same title against a list neither
   * of them can see the other's addition on.
   */
  materials(): Promise<readonly MaterialOnOffer[]>

  /** One Material, added to the Ministry's list. */
  createMaterial(material: NewMaterial): Promise<void>

  /**
   * One Material, as it will now read. The row is updated rather than replaced,
   * which is what keeps every period pointing at it.
   */
  editMaterial(edit: MaterialEdit): Promise<void>

  /** One Material, flagged as removed. Never deleted: the periods that name it stay. */
  removeMaterial(removal: MaterialRemoval): Promise<void>

  /**
   * The link that reopens one Person's Intake. Replaces whatever link that Person
   * held: one live link each is what an Admin means by *send them a new one*.
   */
  issueIntakeLink(link: NewIntakeLink): Promise<void>

  /**
   * The link a re-submission arrived on, or null where the token names nothing.
   * Answers for an expired link too: whether it has run out is decided against the
   * injected clock, and a read that refused to resolve one would make *this link
   * has expired* and *this link was never real* the same page.
   */
  resolveIntakeLink(token: IntakeLinkToken): Promise<IntakeLinkSnapshot | null>

  /**
   * The link this Person already holds, or null where they hold none. Read on
   * `intake.reopen`'s behalf so that asking for a link somebody already has does
   * not mint a second one and stop the first from working.
   */
  intakeLinkFor(person: PersonId): Promise<IntakeLinkSnapshot | null>

  /**
   * The account one Person on this Ministry's Roster holds, or null where the
   * Roster holds no such Person or they hold none. Read on
   * `person.reset_password`'s behalf, inside the transaction and on the connection
   * that has already declared which Ministry it acts for -- so a Person of
   * another's is not visible to read at all, and reaches the domain as *there is
   * nothing here to reset*.
   *
   * One value for the two cases, because they are one refusal: telling them apart
   * would disclose to an Admin that another Ministry holds that Person.
   */
  accountHeldBy(person: PersonId): Promise<string | null>

  raiseConcern(concern: NewConcern): Promise<void>
  /** One Admin opening one Concern's text, recorded before the text is handed over. */
  recordConcernViewing(viewing: ConcernViewing): Promise<void>
  /**
   * Refuses with a `ConcernRefused` when the Concern is gone or somebody else has
   * already closed it -- the second Admin's click must not overwrite the first
   * Admin's name with their own.
   */
  resolveConcern(resolution: ConcernResolution): Promise<void>
  /**
   * The Leader's words, or null when the Concern is gone or has been resolved and
   * cleared.
   *
   * Read through the command connection and nowhere else. The authenticated role
   * holds no grant on that column at all, so this read is only reachable from
   * inside a transaction that has just recorded who did it -- which is what makes
   * reading a Concern without leaving a trace unrepresentable rather than merely
   * discouraged.
   */
  concernDetailFor(id: ConcernId): Promise<string | null>
}

/**
 * Minting the account somebody signs in with. It is the one thing the application
 * needs from the outside world that creates a user rather than reading or writing
 * a row, which is why it is a port of its own rather than part of the unit of work:
 * it happens before the transaction and it cannot be rolled back with it.
 *
 * Not a Leader's alone. An Admin comes into existence through the same mint, so
 * "a phone identity with a password and no email" is decided in one place -- see
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`, which says the
 * credential is the same for every user.
 */
export interface Accounts {
  /**
   * The number is the one on file, never one that was typed -- a forwarded link
   * must not be able to re-point an account at somebody else's phone.
   */
  create(
    phone: string | null,
    password: string,
  ): Promise<{ readonly userId: string } | { readonly refusal: AccountCreationRefusal }>
  /**
   * Undoes a `create` whose acceptance did not land.
   *
   * An account is minted before the command that links it, so a failure in between
   * leaves a login belonging to no Person -- and the number it holds is the one the
   * retry needs, which is why the retry was refused rather than recovering. This
   * puts the number back.
   *
   * It refuses an account any Person already holds. That account was not made by
   * the attempt that is failing, and deleting it would sign a working Leader out of
   * their Ministry for good.
   */
  discard(userId: string): Promise<void>
  /**
   * A new password on an existing account, and every session that account holds
   * ended along with it.
   *
   * One method and not two. Ending the sessions is part of what setting a password
   * *is* here -- see
   * `docs/adr/0016-a-password-change-ends-every-session.md` -- and a `setPassword`
   * beside an `endSessions` would make *a password change that left an old session
   * alive* a state a caller could reach by forgetting the second call. That state
   * is the one the rule exists to prevent, and one method cannot be called wrong.
   *
   * It takes no refusals. Whether this account may be reset at all is decided
   * before anything reaches here -- on the Roster, against the acting Admin's own
   * Ministry -- and the password is one Discipler generated, so there is no rule
   * left for the adapter to enforce and nothing an Admin could act on if it did.
   */
  setPassword(userId: string, password: string): Promise<void>
  /**
   * A person's own change of password: the current one verified, and then exactly
   * what `setPassword` does -- the new one set and every session on the account
   * ended, the one asking included.
   *
   * One method, and not a `verifyPassword` beside `setPassword`, for the reason
   * `setPassword` is one method and not two. Sessions here run to about a year, so
   * *signed in* is a weak proof of presence, and forgetting the verify would let a
   * borrowed unlocked phone change the password unchallenged. One method cannot be
   * called wrong. `docs/adr/0016-a-password-change-ends-every-session.md` names it
   * as bound by the same rule.
   *
   * The current password is checked against the account's own phone, which the
   * adapter reads from the account and never from a caller -- a form carries no
   * number. A wrong one is a refusal and touches nothing. Too short is refused at
   * this edge for the reason `create` refuses it, so a caller that forgot the form
   * rule cannot set what the invitation form would have refused; whether the two
   * new passwords matched is the form's question alone and never reaches here.
   */
  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<
    | { readonly changed: true }
    | { readonly refusal: Exclude<PasswordChangeRefusal, 'account.passwords_differ'> }
  >
}

/**
 * Which Ministry an inbound text belongs to, and who on it sent it. The one
 * question that cannot be answered inside a Ministry-scoped unit of work, because
 * a text message arrives with a phone number and no session, no URL and no token.
 *
 * A number held by more than one Person resolves to nobody rather than to a
 * guess: filing one congregant's answer against another's relationship is worse
 * than not reading the message. Ticket 26 is what makes a shared number
 * resolvable.
 */
export interface InboundSender {
  readonly ministryId: MinistryId
  readonly personId: PersonId
}

export interface InboundReader {
  resolveSender(fromPhone: string): Promise<InboundSender | null>
}

export interface EffectStore {
  /**
   * A command's effects land together or not at all. A half-applied command would
   * leave history claiming something that never reached anyone, or a message
   * reaching someone with no record that it did.
   *
   * The Ministry is named up front rather than inferred from each row, so the
   * store can scope the whole unit of work to it and let the database refuse
   * anything that falls outside.
   */
  transact<T>(ministryId: MinistryId, work: (unit: UnitOfWork) => Promise<T>): Promise<T>
}

/**
 * Every Ministry there is, by id alone.
 *
 * The one read in Discipler that is not scoped to a Ministry, and it is separate
 * from `EffectStore` for that reason: that port's contract is that the Ministry is
 * named up front, and a method here that answered *all of them* would contradict
 * the sentence it is written under.
 *
 * It exists because the scheduled tick is per-Ministry and the scheduler is not.
 * Something has to turn *it is nine o'clock* into *it is nine o'clock for each of
 * these*, and this is the smallest thing that can: ids, no names, no rows, nothing
 * a caller could render or leak across a boundary.
 */
export interface MinistryDirectory {
  everyMinistry(): Promise<readonly MinistryId[]>
}

/**
 * The Leader Dashboard's ports.
 *
 * One relationship as the Leader who leads it sees it: the availability overlay,
 * the Material assigned to it, and the name and number of everyone in it. Three
 * things and nothing else -- no message history, no analytics, and nothing about
 * anybody the Leader does not lead.
 */

/** The Material a relationship is working through, or null where none is assigned. */
export interface AssignedMaterial {
  readonly materialId: MaterialId
  readonly title: string
  /** The Ministry's own typed content. Null where the Material is a PDF alone. */
  readonly body: string | null
  /** What the Admin's file was called, kept so a link can carry its own name. */
  readonly pdfFilename: string | null
  /**
   * A short-lived link to the PDF, or null where there is none to link to. Minted
   * per render rather than stored: a URL that outlived the assignment would be a
   * Material readable by a Leader it was taken away from.
   */
  readonly pdfUrl: string | null
}

/**
 * One person in the relationship, as the Leader's screen shows them.
 *
 * The name is always there and the number is not. Contact-sharing consent is
 * checked at the moment of display, never assumed from enrolment, so `phone` is
 * null for a Person who declined it, withdrew it, was never asked, or has no number
 * on file -- four states the screen deliberately cannot tell apart, because a
 * Leader who could would be reading a consent decision by inference.
 */
export interface RelationshipContact {
  readonly personId: PersonId
  readonly fullName: string
  readonly role: MemberRole
  /**
   * Whether this is the Leader reading the page. Not the same question as `role`:
   * a group may hold several Leaders, and only one of them is signed in.
   */
  readonly isYou: boolean
  readonly phone: PhoneNumber | null
}

export interface RelationshipLed {
  readonly relationshipId: RelationshipId
  readonly ministryId: MinistryId
  readonly ministryName: string
  /**
   * Whether a Pause currently stands on it. The one thing about a relationship's
   * condition this surface carries: a Pause is the Leader's own act and the reason
   * their weekly check-ins have stopped arriving. How a relationship is *doing* --
   * Healthy, Stalled, Needs Care -- is the Admin's reading and lives on Care Needed.
   */
  readonly paused: boolean
  readonly overlay: AvailabilityOverlay
  readonly material: AssignedMaterial | null
  /** Everyone in it, in the order the overlay draws them: the reader, then the rest. */
  readonly contacts: readonly RelationshipContact[]
}

export interface LeaderDashboardReader {
  /**
   * Every relationship the signed-in user currently holds an open leader membership
   * on, across every Ministry they hold a Person record in.
   *
   * No Ministry argument, and that is the point rather than an omission. Every other
   * reader here names the Ministry it acts for because an Admin surface is scoped by
   * a tier the session already carries; this list is a live query for open leader
   * memberships and nothing else, so an Admin who leads two relationships sees them
   * without a second account, and a Leader whose last relationship ends stops seeing
   * the surface without anybody revoking anything.
   */
  readRelationshipsPage(): Promise<RelationshipsPage>
}

/**
 * What the Leader Dashboard derives from its document: the session verdict, for
 * the links the header offers an Admin who leads, and the relationships led. A
 * session that administers nothing still gets its list; only no session at all
 * gets none.
 */
export interface RelationshipsPage {
  readonly resolution: AdminResolution
  readonly led: readonly RelationshipLed[]
}

/**
 * One open relationship a Person holds a membership in, from that Person's side:
 * what they are in it, and who else is.
 *
 * The role is what makes the row legible. A Person leading two relationships and a
 * Person being discipled in two are the same list of names and opposite situations,
 * and it is the first of them that reads `Ready to Pair` -- the status an Admin
 * takes for a bug unless the row says why.
 */
export interface RosterRelationship {
  /**
   * Named so the row can act on it. Every act an Admin takes about a relationship
   * from the Roster is about one of *these* relationships rather than about the
   * Person, and without the id the row can describe them and do nothing.
   */
  readonly relationshipId: RelationshipId
  readonly role: MemberRole
  /** Everyone else in it, whatever their role. A group shows all of them. */
  readonly withNames: readonly string[]
  /**
   * The same people, split by what they are in it. The Roster names the other
   * side -- a Discipler's row names who they disciple, a Disciple's row names who
   * disciples them -- and the count is what says *group* on a row, from the live
   * memberships and never from the relationship's kind (ADR-0004).
   */
  readonly leaderNames: readonly string[]
  readonly participantNames: readonly string[]
  /** Open participant memberships, this Person's included where they are one. */
  readonly participantCount: number
  /**
   * Which of the two participation caps this counts against: a Discipler leads one
   * open group at a time and any number of one-to-ones, and a Disciple is in one
   * open one-to-one and any number of groups. Declared when it was formed and never
   * changed, so a group that has fallen to one Disciple is still a group here
   * (ADR-0004, and James on 2026-09-20), whatever `participantCount` says.
   *
   * For showing the caps before the click and for nothing else. What a row is
   * called, and every state, still follows the live count.
   */
  readonly countsAsAGroup: boolean
  /**
   * What the Ministry calls it, or null where nobody has named it, which is every
   * one-to-one. For a person's page to say which group a line is about.
   */
  readonly name: string | null
  /**
   * Derived from `relationship.accepted_at`, never stored as a status. It is the
   * absence of an acceptance rather than a state anybody sets, which is why it
   * belongs on the relationship and not beside the Participation Status.
   *
   * Both sides of a relationship read it the same way, with one exception: a
   * Discipler an Admin added to a group that was already running (Manual
   * pairing, ticket 22). The group is accepted and they have not, so it is true
   * on their row, from their own membership, and false on everybody else's.
   */
  readonly awaitingAcceptance: boolean
}

export interface RosterEntry {
  readonly personId: PersonId
  readonly fullName: string
  /**
   * Derived, never stored, and it answers one question: is this Person being
   * discipled. Leading a relationship does not set it. Computed by one SQL function
   * over Intake, consent and open participant memberships.
   */
  readonly participationStatus: ParticipationStatus
  /** Every open relationship they are in, each with their role in it. */
  readonly relationships: readonly RosterRelationship[]
  /**
   * Which side this Person last offered to stand on at Intake, and null where no
   * form has ever asked them.
   *
   * Derived from the latest consent record that asked, so a Person who reopens
   * Intake and answers the other side changes what their row says -- and a form
   * that asked nothing changes nothing, because null there means *not asked* and
   * never *withdrawn*.
   *
   * A preference the Person stated, and one of the three facts that put them on
   * the Disciplers list (ticket 36): leading somebody, having offered to on the
   * form, or an import having paired them as one. Nothing an Admin sets stands
   * beside it any more; pairing them is the acceptance.
   */
  readonly declaredSide: DeclaredSide | null
  /**
   * Whether their latest submission said this is their first time. Null where the
   * submission predates the question.
   *
   * Read by the pairing surface, which shows it per candidate and does nothing else
   * with it: it ranks nobody and filters nobody out. That screen already declines
   * to filter its candidates, because pastoral judgment is never subordinate to a
   * filtered list.
   */
  readonly firstTime: boolean | null
  /**
   * Whether this Person holds an account -- a Leader who accepted their Invitation
   * Link, or an Admin who was provisioned. Derived from `person.user_id`, never
   * stored beside it.
   *
   * One boolean and not the identifier. It decides whether the row offers to reset
   * their password, and a Roster carrying every account identifier on it would be
   * handing out the argument to the one call that can change any of those
   * credentials.
   */
  readonly holdsAnAccount: boolean
  /**
   * Their contact details, as the Roster shows them to an Admin (ADR-0021). Read
   * through the Roster's own function and its Admin test, never through a column
   * grant: a Leader session holds no path to a number but the consent check.
   */
  readonly phone: PhoneNumber | null
  readonly email: string | null
  /**
   * The gender on their most recent Intake submission. Null is *never asked*,
   * never a mismatch: the database's own gender checks step aside for a Person
   * with no gender on file, and whatever reads this shows the same restraint.
   *
   * Read by the pairing surface, to grey rows against what a relationship
   * declares, and by nothing else. It leaves the database by the Roster
   * function's Admin test, as the contact details above do.
   */
  readonly gender: Gender | null
  /**
   * The pairings an import planned for this Person that are still worth showing:
   * the ones waiting on Intake, and the refused ones whose Follow-Up Item an Admin
   * has not yet resolved. Each says which side of it this Person is.
   */
  readonly intendedPairings: readonly RosterIntendedPairing[]
}

/** One planned pairing as a Roster row shows it, from one side. */
export interface RosterIntendedPairing {
  readonly id: IntendedPairingId
  /** This Person's side of it. */
  readonly role: MemberRole
  readonly withPersonId: PersonId
  readonly withName: string
  readonly state: 'awaiting_intake' | 'refused'
  readonly refusal: PairingRefusal | null
}

/** The account one Person holds, for the Admin who is about to reset it. */
export interface AccountOnTheRoster {
  readonly personId: PersonId
  readonly fullName: string
  readonly userId: string
}

/**
 * One import row waiting on an Admin, as the Roster shows it.
 *
 * No phone number, deliberately. The Roster shows no contact details -- a number is
 * reached through `public.contact_to_share` and nowhere else -- and the line, the
 * name the file carried and the names already on the number are between them enough
 * for an Admin to know which row this is.
 */
export interface UnansweredImportRow {
  readonly rowId: ImportRowId
  /** 1-based and counting the header, exactly as the import report said it. */
  readonly line: number
  /** The name in the file: what either answer is about to put on a Person. */
  readonly fullName: string
  /**
   * The number the row is held over. Shown to the Admin since ticket 36
   * (ADR-0021): the question is whether this is the same person or somebody else
   * on this number, and it is answered by an Admin who can see which number.
   */
  readonly phone: PhoneNumber
  readonly importedAt: Date
  /**
   * Everyone the Roster already holds on this row's number, and what it holds them
   * under. One answer each, because a number may reach two people and *the same
   * Person* has as many answers as there are names on it.
   *
   * Empty only where the Roster has moved out from under the row. The question is
   * still shown: a row that disappeared from the screen would be the silent expiry
   * this whole surface exists to prevent.
   */
  readonly onThisNumber: readonly NameOnTheNumber[]
}

/** The live Intake link one Person holds, for the Admin who is about to send it. */
export interface IssuedIntakeLink {
  readonly token: IntakeLinkToken
  readonly expiresAt: Date
}

/**
 * One of the Ministry's live groups, as the Admin's Groups panel shows it: what
 * it is called -- or that it is not called anything yet -- what it declared,
 * whether its door is open, whether its Leaders have accepted, and who is in it.
 */
export interface MinistryGroup {
  readonly relationshipId: RelationshipId
  readonly name: string | null
  readonly declaredGender: Gender | null
  readonly joinRequiresApproval: boolean
  readonly accepted: boolean
  readonly leaderNames: readonly string[]
  readonly participantNames: readonly string[]
  /**
   * The group's running Material period, or null on a group nobody has accepted,
   * which has no Material history yet (Materials, ticket 03). `materialId` is null
   * while the running period is on no Material.
   */
  readonly running: { readonly materialId: MaterialId | null; readonly since: Date } | null
}

/**
 * Somebody waiting to be admitted to a group that requires approval, with what an
 * Admin decides on: who they are, what they answered about themselves, which group
 * they named, and when they asked. The item the Admin acts on is named so the
 * admission can name it back.
 */
export interface JoinRequestOnTheRoster {
  readonly itemId: FollowUpItemId
  readonly personId: PersonId
  readonly fullName: string
  readonly relationshipId: RelationshipId
  readonly groupName: string | null
  readonly gender: Gender | null
  readonly ageBand: AgeBand | null
  readonly raisedAt: Date
}

/** One live Material as the pairing form's select offers it. */
export interface MaterialOption {
  readonly materialId: MaterialId
  readonly title: string
}

/** Somebody leading a group an Admin could put a Person into. */
export interface GroupLeader {
  readonly personId: PersonId
  readonly fullName: string
}

/**
 * One group an Admin could put somebody into, as the Pair surface lists it: an
 * open relationship with two or more Disciples, a 1:2 pair included.
 */
export interface GroupToJoin {
  readonly relationshipId: RelationshipId
  /**
   * What the Ministry calls it, or null where nobody has named it. Never
   * backfilled or guessed in the read: how an unnamed row is labelled is the
   * popup's.
   */
  readonly name: string | null
  readonly leaders: readonly GroupLeader[]
  /** The live count of open participant memberships, never the relationship's kind (ADR-0004). */
  readonly discipleCount: number
  /** What the group declared at formation. Null is *mixed*, as it is everywhere a declaration is carried. */
  readonly declaredGender: Gender | null
  /**
   * Null while it is running. Two of the settled Relationship States and never
   * the third: an ended group is not listed. Which wins is `settledStateOf`'s.
   */
  readonly state: Exclude<SettledRelationshipState, 'ended'> | null
  /**
   * Everybody in it, in either role, so the surface can leave out a group the
   * Person is already in without a second read.
   */
  readonly memberIds: readonly PersonId[]
}

/**
 * What the Roster derives from its document. The person page reads the same
 * document, and the Pair popup reads it with three keys of its own beside it; each
 * takes what it needs.
 */
export interface RosterPage {
  /** Scoped to the Admin's Ministry, and enforced as such in the database, not here. */
  readonly roster: readonly RosterEntry[]
  /**
   * The import rows still waiting on an answer, oldest import first. Read with the
   * Roster on every load rather than only after an upload: the report is a redirect
   * and outlives nothing, and a question that appeared only on the redirect would
   * expire the moment an Admin navigated away.
   */
  readonly held: readonly UnansweredImportRow[]
  readonly followUpCount: number
  /**
   * Whether the Ministry enforces the absolute gender match on a one-to-one.
   * Read by the Pair surface only, to decide whether Mixed may be offered for a
   * one-to-one. True wherever the document did not say, which is every surface
   * but that one: the safe default for a safeguarding constraint is enforced,
   * which is the reason the column itself defaults true.
   */
  readonly suggestGenderMatch: boolean
  /**
   * The Ministry's live Materials, in title order. Read by the Pair surface
   * only, and empty on every other. A removed one is not on the list.
   */
  readonly materials: readonly MaterialOption[]
  /**
   * The groups an Admin could put somebody into: running, paused or still
   * awaiting their leader, never ended or cancelled. Read by the Pair surface
   * only, and empty on every other.
   */
  readonly groups: readonly GroupToJoin[]
}

/** The three surfaces that draw from the Roster's document, each read under its own name. */
export type RosterSurface = 'roster' | 'person' | 'pair'

export interface RosterReader {
  readRosterPage(surface: RosterSurface): Promise<AdminPage<RosterPage>>

  /**
   * The link this Person currently holds, or null where they hold none and where
   * the one on file has run out. Live is the whole of what this promises: the
   * caller is an Admin about to send it, and a token that no longer opens anything
   * is worse to them than no token at all.
   *
   * Read one at a time and never with the Roster. Every Person's token on one page
   * would be a page full of credentials, most of them for rows nobody is acting on;
   * this answers for the one an Admin has just asked about.
   */
  liveIntakeLink(
    ministryId: MinistryId,
    person: PersonId,
  ): Promise<IssuedIntakeLink | null>

  /**
   * The account this one Person holds, or null where the Roster holds no such
   * Person or they hold none.
   *
   * Read one at a time and never with the Roster, for the reason the Intake link
   * beside it is: the caller is an Admin who has asked about this Person, and every
   * account identifier on one page would be a page of arguments to the call that
   * changes a credential.
   *
   * The name comes back with it because the reset surface has to say whose password
   * is about to change, and reading it a second time would be a second answer that
   * could disagree with this one about who this row is.
   */
  accountOnTheRoster(
    ministryId: MinistryId,
    person: PersonId,
  ): Promise<AccountOnTheRoster | null>
}

/**
 * The sending layer's ports. They live here with every other port rather than
 * beside `dispatchQueue`, so that the one place naming what the application needs
 * from the outside world stays the one place.
 */

/**
 * Whether the queue may send this row on this drain. `held` is not a failure and
 * not a refusal: `claim` says what each of its causes is.
 */
export type ClaimOutcome = 'claimed' | 'held'

/** Why the sending layer refused a message. Codes, never prose. */
export type WithholdingReason =
  | 'recipient_opted_out'
  | 'recipient_has_no_sms_consent'
  | 'recipient_has_no_phone'

export interface QueuedMessage {
  readonly id: OutboundMessageId
  readonly personId: PersonId | null
  readonly toPhone: string | null
  readonly body: string
  /**
   * What serialisation reads, and the only thing that says whether this message
   * takes the recipient's number or waits for it. The rules are
   * `~/domain/outstanding-reply`'s; the queue holds none of them.
   */
  readonly kind: OutboundMessageKind
  /**
   * Whose contact details this message would include. Resolved at send time,
   * because contact-sharing consent is checked when a message is sent and never
   * assumed from enrolment -- and a body that already carried the number would
   * leave nothing to withhold.
   */
  readonly disclosesPersonId: PersonId | null
}

export interface ContactDetails {
  readonly fullName: string
  readonly phone: PhoneNumber
}

/**
 * Every method names the Ministry it acts for. The queue is drained on a trusted
 * connection with no session behind it, so nothing else is in a position to say
 * which Ministry a read belongs to -- and a port that took only a `PersonId` would
 * be asking the database to answer across all of them.
 */
export interface OutboundQueue {
  /**
   * Runs `drain` as the only drain of this Ministry: a second caller waits for the
   * first to finish and then runs. Two callers exist -- the scheduler on the hour,
   * and the webhook the moment a reply arrives -- and the row lock inside `claim`
   * keeps them off one row only for as long as the claim's own transaction. The
   * vendor is called after that commits, so a drain that lists the queue during
   * the round trip finds a row neither sent nor withheld and sends it again. What
   * keeps a congregant from two copies of one text is that two drains of one
   * Ministry never overlap at all. See ADR 0020.
   *
   * Per Ministry and not global, for the reason every other method here names the
   * Ministry: one congregation's slow vendor call must not hold another's replies.
   */
  whileDraining<T>(ministryId: MinistryId, drain: () => Promise<T>): Promise<T>
  /** Everything enqueued for this Ministry and neither sent nor withheld. */
  due(ministryId: MinistryId): Promise<readonly QueuedMessage[]>
  /**
   * The number this Ministry sends from, or null where none is provisioned yet.
   *
   * Read here rather than taken from configuration because sending identity is a
   * property of the Ministry: a number in the environment is one congregation's
   * people receiving texts from another's the first time a second Ministry is
   * onboarded, and by then it is a migration against live message history.
   */
  sendingNumber(ministryId: MinistryId): Promise<string | null>
  /** Whether this Person may be sent to *right now*, not when they were queued. */
  mayReceive(ministryId: MinistryId, personId: PersonId): Promise<WithholdingReason | null>
  /** The details to disclose, or null where the Person has not agreed to share. */
  contactToShare(ministryId: MinistryId, personId: PersonId): Promise<ContactDetails | null>
  /**
   * Takes the row and, where the message expects a reply, the recipient's number
   * with it. **Asking and taking are one transaction**, because the question two
   * workers must not both answer yes to is *is this number free* -- and a check
   * made before the write is a check both of them pass.
   *
   * The row lock stops two workers picking up the same row. It cannot stop them
   * taking the same *number*, because there they hold two different rows and share
   * nothing but the key: what refuses the second of them is the unique index on
   * `(ministry_id, prompt_key) where prompt_state = 'open'`. See ADR 0013.
   *
   * `claimed` -- send it. `held` -- not on this drain: the number is holding a
   * conversation, or another worker has the row, or another worker took the number
   * between the check and the write. All three come back the same way because all
   * three mean the same thing to a dispatcher: leave the row alone and let the next
   * drain try it.
   *
   * A claim that takes the number takes it *before* the vendor is called rather
   * than after. That is the only ordering in which two workers cannot both decide
   * the number is free, and it is paid for by `release`.
   */
  claim(
    ministryId: MinistryId,
    id: OutboundMessageId,
    message: SerialisationOfAMessage,
    at: Date,
  ): Promise<ClaimOutcome>
  /**
   * Gives the number back after the vendor refused the message. Without it a
   * message Twilio could not deliver would hold its recipient's conversation for
   * two days over nothing.
   */
  release(ministryId: MinistryId, id: OutboundMessageId): Promise<void>
  markSent(ministryId: MinistryId, id: OutboundMessageId, at: Date): Promise<void>
  withhold(
    ministryId: MinistryId,
    id: OutboundMessageId,
    reason: WithholdingReason,
    at: Date,
  ): Promise<void>
}

/** Twilio lives behind this and nowhere else. It is not a domain concept. */
export interface MessageTransport {
  /**
   * `from` is passed rather than held, because one transport serves every Ministry
   * and each of them sends as itself. A transport that closed over a number would
   * make the identity a property of the deployment, which is the thing the spec
   * rules out.
   *
   * Throws when the vendor refuses. The row stays neither sent nor withheld, so the
   * next drain picks it up again -- see `dispatchQueue`, which keeps one refusal
   * from taking the rest of the queue down with it.
   */
  deliver(from: string, to: string, body: string): Promise<void>
}

export interface DiscipleshipGoalOption {
  readonly id: DiscipleshipGoalId
  readonly label: string
}

/** What the Intake form needs to render itself, for a visitor with no session. */
export interface IntakePage {
  readonly ministryId: MinistryId
  readonly ministryName: string
  readonly goals: readonly DiscipleshipGoalOption[]
}

/**
 * The same page, reopened by the one Person a token names, with what they last
 * told this Ministry already in it.
 *
 * The link state travels with it rather than being resolved into a refusal here.
 * A link that has run out and a token that was never real reach their holder as
 * different pages: one sends them back to whoever issued it, the other is a URL
 * that means nothing.
 */
export interface ReopenedIntakePage extends IntakePage {
  readonly personId: PersonId
  readonly state: IntakeLinkState
  readonly prefill: IntakePrefill
}

/**
 * What a Person already told this Ministry, as the form takes it back. Every field
 * is nullable: an Admin may send the link to somebody who has never submitted, and
 * a blank form is the right thing to show them.
 */
export interface IntakePrefill {
  readonly fullName: string | null
  readonly phone: string | null
  readonly email: string | null
  readonly ageBand: AgeBand | null
  readonly gender: Gender | null
  readonly goalId: DiscipleshipGoalId | null
  /**
   * Slot keys as the grid submits them -- `monday:08`. Deliberately the form's
   * own wire shape rather than `AvailabilitySlot`, because this is what the form
   * takes back: `IntakeFormFields.availability` is the same list of strings, and a
   * prefill in a different shape would be parsed on the way in and re-encoded on
   * the way out for no reader's benefit.
   */
  readonly availability: readonly string[]
  /**
   * The decision that currently stands, never merely the last one recorded. A
   * Person who granted contact sharing and later declined it sees `declined`,
   * because that is what the form has to let them change back.
   */
  readonly contactSharing: 'granted' | 'declined' | null
}

/**
 * What the goals card on Intake forms needs to show a Ministry its own list.
 * Read through the signed-in Admin's session, so the policies are what scope it
 * -- an Admin sees their Ministry's options and no other Ministry's, and goals
 * are never shared or compared across Ministries.
 *
 * `OfferedGoal` and not a shape of this surface's own. One option is one concept
 * whichever side of the seam is looking at it, and the goals card warning an
 * Admin and the command boundary writing the number into history read the same
 * `discipleship_goal_options` definition -- so a second type here would only be
 * two names for one row, waiting to disagree about what `chosenBy` counts.
 */
/** What Intake forms derives from its document. */
export interface IntakeFormsPage {
  /**
   * Every group the Ministry holds that has not ended, named or not, for the panel
   * an Admin names them from and switches approval on.
   */
  readonly groups: readonly MinistryGroup[]
  /** Everybody waiting to be admitted, oldest request first. */
  readonly joinRequests: readonly JoinRequestOnTheRoster[]
  readonly goals: readonly OfferedGoal[]
  /** Everyone on the Roster by name, for saying who a query string refers to. */
  readonly nameOf: ReadonlyMap<PersonId, string>
  /** The live Materials, in title order, for each accepted group's dropdown. */
  readonly materials: readonly MaterialOption[]
  /** The Ministry's IANA zone, which "Working through it since" is printed in. */
  readonly timeZone: string | null
}

export interface IntakeFormsReader {
  readIntakeFormsPage(): Promise<AdminPage<IntakeFormsPage>>
}

/**
 * What the settings surface needs to show a Ministry its own settings. Read
 * through the signed-in Admin's session, so `ministry_settings` is what scopes it
 * -- and that function answers an Admin of the Ministry and nobody else, because
 * what hour a whole Ministry is texted at and whether the gender rule is enforced
 * are the coordinator's to see.
 *
 * `MinistrySettings` and not a shape of this surface's own, for the reason the
 * Discipleship Goal reader gives: the screen an Admin edits from and the boundary
 * that decides the edit read one definition, so they cannot come to disagree about
 * what this Ministry's settings are.
 */
export interface MinistrySettingsReader {
  readSettingsPage(): Promise<AdminPage<{ readonly settings: MinistrySettings }>>
}

/**
 * One group the group Intake link offers: what it is called, what it declared,
 * whether picking it asks or joins, and who leads it by first name. The whole of
 * what an unauthenticated page is told about a group.
 */
export interface JoinableGroup {
  readonly relationshipId: RelationshipId
  readonly name: string
  readonly declaredGender: Gender | null
  readonly joinRequiresApproval: boolean
  readonly leaderFirstNames: readonly string[]
  /**
   * The title of the Material the group's running period is on, or null where it
   * is on none. Shown beneath the group's name on the form (Materials, ticket 03);
   * nobody picking a group is asked which Material they want.
   */
  readonly materialTitle: string | null
}

/** What the group Intake form needs to render itself, for a visitor with no session. */
export interface GroupIntakePage {
  readonly ministryId: MinistryId
  readonly ministryName: string
  /**
   * Every group the link offers, unfiltered by gender. The form asks gender before
   * it asks which group and filters this list against the answer at the screen;
   * the submission checks the same thing again in the domain.
   */
  readonly groups: readonly JoinableGroup[]
}

export interface IntakeReader {
  /** Null when the link names no Ministry this Discipler holds. */
  readIntakePage(id: string): Promise<IntakePage | null>

  /** The same Ministry's group form. Null for the same reason. */
  readGroupIntakePage(id: string): Promise<GroupIntakePage | null>

  /** Null when the token names nobody. Expired links still answer. */
  readReopenedIntakePage(token: string): Promise<ReopenedIntakePage | null>
}

/**
 * What the Invitation Link's page shows before anything is asked of its holder:
 * who they have been matched with, for which Ministry, and the number Discipler
 * will text them -- displayed, never requested.
 */
export interface InvitationPage {
  readonly ministryId: MinistryId
  readonly ministryName: string
  readonly personId: PersonId
  readonly fullName: string
  /** Displayed so a Leader cannot mistype their way out of their own check-ins. */
  readonly phone: string | null
  readonly role: MemberRole
  readonly state: InvitationState
  /**
   * Whether the invitation was withdrawn without being accepted, by its holder
   * declining or by its fortnight running out (Manual pairing, recut ticket 06).
   * Its holder is no longer on the relationship, so the page offers them nothing
   * to press: what it shows is drawn from the membership that ended with it.
   */
  readonly withdrawn: boolean
  /**
   * How many people are on the other side of the relationship. On a withdrawn
   * link it is all that is kept of the reveal: `withNames` and `leadingWith` are
   * empty there, because its holder is no longer somebody they are shown to.
   */
  readonly pairedWithCount: number
  /**
   * The account this Person already holds, or null. A Leader may lead any number
   * of one-to-ones, so a second invitation reaches somebody who accepted a first
   * one -- and there is exactly one account per Person, not one per relationship.
   */
  readonly userId: string | null
  /**
   * The people on the *other* side of the relationship: the Participants to a
   * Leader, the Leaders to a Participant. This is the reveal, and it is scoped
   * because a Participant's membership grants them no sight of anyone -- the
   * other Participants included -- which is the rule the policies on
   * `relationship_member` state and which this read, on the trusted connection,
   * is not policed by.
   */
  readonly withNames: readonly string[]
  /**
   * The Leaders its holder would be leading *with*, by `countsAsLeading`: once
   * the relationship is running only those who have accepted, and until then
   * everybody it waits on. Empty for somebody leading alone, and always for a
   * Participant, who is shown their Leaders in `withNames` and nobody else.
   */
  readonly leadingWith: readonly string[]
}

export interface InvitationReader {
  /**
   * Resolving does not consume. A Leader who opens the link and is interrupted by
   * a phone call returns to the same message rather than needing a re-issue.
   *
   * Null when nothing answers to the token, which is the same answer for a token
   * that was never real and one whose relationship has been deleted -- neither
   * tells its holder anything about a Ministry they have not proved they belong to.
   */
  readInvitationPage(token: string): Promise<InvitationPage | null>
}

/**
 * What the Ministry Setup Link's page shows. Only what its holder is being asked
 * to agree to: the church they are opening and the number they will sign in with.
 */
export interface MinistrySetupPage {
  readonly ministryName: string
  /** Displayed, never requested. A forwarded link cannot re-point the account. */
  readonly adminPhone: string
  readonly state: MinistrySetupState
}

/**
 * How a Ministry comes into existence. Three acts, none of them behind a session:
 * an operator mints a link, its holder opens it, and its holder spends it opening
 * their Ministry. There is no fourth -- no sign-up -- and there is not meant to be.
 */
export interface MinistrySetup {
  /**
   * Minted by whoever runs Discipler, with the numbers read the way the product
   * reads them. A second mint for the same phone replaces the first, which is the
   * only way a link is ever taken back. Throws rather than refuses: there is an
   * operator at a terminal, not a person at a page.
   */
  issue(link: {
    readonly ministryName: string
    readonly sendingNumber: string
    readonly adminPhone: string
  }): Promise<NewMinistrySetup>
  /**
   * Resolving does not consume, like an Invitation Link. Null when nothing
   * answers to the token, which says nothing about whether one ever existed.
   */
  read(token: string): Promise<MinistrySetupPage | null>
  /**
   * The one submit: a name and a password become an account, a Ministry, its
   * first Admin's Person row and their membership, in one transaction that also
   * spends the link. A refusal is the account's or the link's, and is wording on
   * the page; anything else is a fault.
   */
  open(
    token: string,
    admin: { readonly fullName: string; readonly password: string },
  ): Promise<
    | { readonly ministryId: MinistryId }
    | { readonly refusal: MinistrySetupRefusal | AccountCreationRefusal }
  >
}

/**
 * One Follow-Up Item, as Care Needed shows it. The oldest of the three sources and
 * the only one that is a stored row an Admin closes by hand.
 */
export interface FollowUpCareItem {
  readonly id: FollowUpItemId
  readonly raisedAt: Date
  readonly relationshipId: RelationshipId | null
  readonly personId: PersonId | null
  /** The Person the item is about, when it is about one. */
  readonly personName: string | null
  /**
   * When the relationship the item is about was created. The underlying fact, kept
   * alongside the derived one: history and any later question about this item are
   * answered from the instant, never from a number somebody rounded.
   */
  readonly relationshipCreatedAt: Date | null
  /**
   * How long it has waited, in whole days, as of the moment this was read. What
   * the Care Needed view shows -- computed here off `relationshipCreatedAt` and
   * the injected clock rather than frozen into the payload, because an item raised
   * on day five is still the same item on day twenty and must not still say five.
   *
   * Null exactly when `relationshipCreatedAt` is: an item about a Person and no
   * relationship has nothing that has been waiting.
   */
  readonly waitedDays: number | null
  /**
   * For an invitation nobody has answered, and null on every other kind: the
   * Leaders still to answer, by name, and whether the relationship is running
   * meanwhile. An Admin may add a Leader to a group already running (Manual
   * pairing, ticket 22), and there the item is about somebody invited and not
   * about a relationship held up: nothing to cancel, and `waitedDays` is null,
   * because the relationship's age is not how long they have waited and the
   * history does not carry when their membership began.
   */
  readonly awaiting: { readonly names: readonly string[]; readonly running: boolean } | null
  /**
   * For a Leader whose invitation was withdrawn, by declining or at two weeks
   * (Manual pairing, recut ticket 06), and null on every other kind: what they
   * were invited to, as the relationship stands now. Whether it is a group, by
   * who is in it -- several Disciples, or anybody leading it -- and never by the
   * kind it was formed as; whether it is running; and whether it has been left
   * with nobody to lead it.
   */
  readonly invited: {
    readonly leadsAGroup: boolean
    readonly running: boolean
    readonly ledByNobody: boolean
  } | null
  /**
   * The kind and what it carries, as one value. Not a `kind` field beside a
   * payload: those are two things that can disagree, and only one of them can be
   * narrowed by the compiler at the point a screen reads the period out.
   */
  readonly payload: FollowUpPayload
}

/**
 * One person in a relationship a care item is about, with the id the reveal
 * needs. Names alone are what the sentence is written from; the id is what
 * `contactToShare` is asked with, one Person at a time.
 */
export interface CareMember {
  readonly personId: PersonId
  readonly fullName: string
  readonly role: MemberRole
}

/**
 * One relationship whose *derived* state asks for attention -- today, a Stalled
 * one. Not a stored row and nothing to close: it clears itself the moment the
 * Leader answers, which is exactly why it could never have been a Follow-Up Item.
 */
export interface RelationshipCareItem {
  readonly relationshipId: RelationshipId
  readonly state: RelationshipState
  /**
   * Which condition fired, with its own unit. *Gone silent, 23 days* and
   * *responding, not meeting, 3 weeks* are different conversations, and an Admin
   * has to know which one they are walking into before they pick up the phone.
   */
  readonly reasons: readonly CareReason[]
  /** Who to call, and who the relationship is for. */
  readonly leaderNames: readonly string[]
  readonly participantNames: readonly string[]
  /** Everyone still in it, for the one-at-a-time reveal. */
  readonly members: readonly CareMember[]
  /** Unresolved Concerns standing beside it. A Stalled relationship may have some. */
  readonly openConcerns: number
}

/** One outstanding Concern, without the words. Opening those is a command. */
export interface OutstandingConcern {
  readonly id: ConcernId
  readonly raisedAt: Date
  readonly raisedBy: PersonId
  readonly raisedByName: string | null
}

/**
 * The Concerns outstanding on one relationship, gathered into a single item so
 * that several show as a count rather than as several rows an Admin has to notice
 * are about the same people.
 *
 * The text is deliberately absent. It is reached one Person at a time through
 * `CommandService.openConcern`, which records the viewing in the same transaction
 * that returns it -- and the authenticated role holds no grant on that column, so
 * no other path to it exists.
 */
export interface ConcernCareItem {
  readonly relationshipId: RelationshipId
  /** Newest first. The count the badge shows is this length. */
  readonly concerns: readonly OutstandingConcern[]
  readonly participantNames: readonly string[]
  /** Everyone still in it, for the one-at-a-time reveal. */
  readonly members: readonly CareMember[]
}

/**
 * One thing for an Admin to look at, from whichever of the three sources raised
 * it. A tagged union rather than three lists, because Care Needed is one surface
 * and the sources are a fact about where an item came from, not about how urgent
 * it is.
 */
export type CareNeededItem =
  | ({ readonly source: 'follow_up' } & FollowUpCareItem)
  | ({ readonly source: 'relationship' } & RelationshipCareItem)
  | ({ readonly source: 'concern' } & ConcernCareItem)

/**
 * The signed-in Admin, as every Admin surface is handed them: the one Ministry
 * they administer and their own row on its Roster.
 */
export interface SignedInAdmin {
  readonly userId: string
  readonly ministryId: MinistryId
  readonly ministryName: string
  /**
   * Their own row on their own Roster, or null where they hold none.
   *
   * An Admin is a Person in their own Ministry like everybody else -- provisioning
   * creates the row, and ADR-0009 is why they are not given a second identity when
   * they are later invited to lead. The Roster needs to know which row that is,
   * because it is the one row that must not be offered a password reset.
   *
   * Null rather than absent, because it is reachable: a Ministry could hold an
   * Admin membership for somebody its Roster does not. There is no row of theirs to
   * treat specially then, which is what null says.
   */
  readonly personId: PersonId | null
}

/**
 * The three answers a surface can get about the session, because a page that
 * must tell a visitor with no session apart from a signed-in Leader cannot do it
 * with a null.
 */
export type AdminResolution =
  | { readonly status: 'admin'; readonly admin: SignedInAdmin }
  | { readonly status: 'not-an-admin' }
  | { readonly status: 'signed-out' }

/**
 * A page's whole answer in one read: the session verdict, and what the page
 * derives from its document where there is an Admin to derive for. Every page
 * reader below returns one, because a page is one read
 * (`docs/adr/0023-a-page-is-one-read.md`): the verdict and the data come from the
 * same document, so a page does not resolve the Admin and then read.
 */
export type AdminPage<T> =
  | { readonly status: 'admin'; readonly admin: SignedInAdmin; readonly page: T }
  | { readonly status: 'not-an-admin' }
  | { readonly status: 'signed-out' }

/** What the Follow-Up tab derives from its document. */
export interface FollowUpPage {
  /**
   * Everything outstanding in the Admin's Ministry, from all three sources: open
   * Follow-Up Items, relationships whose derived state asks for attention, and
   * unresolved Concerns.
   *
   * Open items only, and enforced as such in the database rather than here. Each
   * follow-up item carries how long it has waited as of the read, which is why an
   * implementation of this needs a clock -- as does the state derivation, which
   * asks what week it is. A resolved item leaves the view and stays in the table,
   * because how fast a Ministry closes its care items is a question it should be
   * able to ask later.
   */
  readonly items: readonly CareNeededItem[]
  /**
   * The details behind `Nudge` for the one Person a reveal named: their number, so
   * the Admin can make the call themselves. Null where nobody was named and where
   * the Person has not currently agreed to share them.
   *
   * One Person at a time rather than a column on every care item. The list is read
   * to decide who needs a call; a number on every row would disclose the whole
   * Ministry's contact details to answer a question nobody asked of most of them.
   * The consent rule is reached through the definer function that checks Ministry
   * membership first, as the signed-in Admin.
   */
  readonly revealed: ContactDetails | null
}

export interface CareNeededReader {
  /** The Follow-Up tab, with the one Person a reveal names or none. */
  readFollowUpPage(reveal: PersonId | null): Promise<AdminPage<FollowUpPage>>
}

/**
 * The Suggested Pairs tab: one-to-one suggestions ranked by the pure function in
 * `src/domain/suggestions.ts`, from the Roster as it stands at the moment of the
 * read, and the number the shell's badge shows.
 */
export interface SuggestedPairsPage {
  readonly followUpCount: number
  readonly suggestions: Suggestions
}

export interface SuggestedPairsReader {
  readSuggestedPairsPage(): Promise<AdminPage<SuggestedPairsPage>>
}

/**
 * The Overview tab's ports.
 *
 * One relationship as the Overview lists it: who is in it, when it started, and
 * what its history derives -- the same derivation Care Needed runs, so the two
 * surfaces cannot disagree about which relationships are Stalled.
 */
export interface OverviewRelationship {
  readonly relationshipId: RelationshipId
  readonly leaderNames: readonly string[]
  readonly participantNames: readonly string[]
  /** Null while it is Awaiting Leader Acceptance. */
  readonly acceptedAt: Date | null
  readonly state: RelationshipState
  /** Empty unless the state is Stalled. */
  readonly reasons: readonly CareReason[]
  /** Unresolved Concerns standing beside it, whatever its state. */
  readonly openConcerns: number
}

export interface Overview {
  /**
   * Every relationship that has not ended, in a stable order. An unaccepted one
   * is included only once it has waited the five days ticket 07 surfaces it at;
   * the ones still hidden are counted beside the list because the page prints it.
   */
  readonly relationships: readonly OverviewRelationship[]
  readonly unsurfacedUnaccepted: number
  /** Accepted, not paused, not ended. */
  readonly active: number
  readonly paused: number
  /** Over every relationship-week on record. */
  readonly counts: CheckInCounts
  /** Relationship-weeks in the current ISO week, in the Ministry's timezone, with an `answeredAt`. */
  readonly completedThisWeek: number
}

/**
 * What the Overview tab derives from its document: the tab, and the Care Needed
 * list it shares with the Follow-Up badge and the flag lines on its cards.
 */
export interface OverviewPage {
  readonly overview: Overview
  readonly care: readonly CareNeededItem[]
}

export interface OverviewReader {
  /**
   * The whole tab in one read, against one reading of the clock. Read through the
   * signed-in Admin's session, so the policies are what scope it to their
   * Ministry; an empty Ministry comes back as zeros and an empty list rather than
   * as a failure.
   */
  readOverviewPage(): Promise<AdminPage<OverviewPage>>
}

/**
 * The Check-Ins tab's ports: this ISO week's relationship-weeks, one per
 * relationship a Check-In Sequence covered this week.
 */
export interface CheckInThisWeek {
  readonly relationshipId: RelationshipId
  readonly leaderNames: readonly string[]
  readonly participantNames: readonly string[]
  /**
   * When the question about this relationship went out, or null where the
   * sequence covering it has not reached it yet.
   */
  readonly sentAt: Date | null
  readonly answeredAt: Date | null
  readonly met: boolean | null
  readonly satisfaction: Satisfaction | null
  /** Whether the Concern this week's answer raised is still unresolved. */
  readonly concernOpen: boolean
}

export interface ThisWeeksCheckIns {
  readonly week: IsoWeek
  /** When this week's first sequence opened, or null where none has. */
  readonly sentAt: Date | null
  readonly checkIns: readonly CheckInThisWeek[]
}

/** What the Check-Ins tab derives from its document: the week, and the badge's number. */
export interface CheckInsPage {
  readonly week: ThisWeeksCheckIns
  readonly followUpCount: number
}

export interface CheckInsReader {
  /**
   * The current ISO week's relationship-weeks, in the Ministry's own timezone.
   * Nothing here carries Concern text: the words are reached one Person at a
   * time through `CommandService.openConcern`, and the authenticated role holds
   * no grant on that column.
   */
  readCheckInsPage(): Promise<AdminPage<CheckInsPage>>
}

/**
 * The Materials tab's ports: what the tab and its folders derive from one
 * document (`.scratch/materials/spec.md`, ticket 01).
 *
 * The tab is the Ministry's Materials as folders, each holding the accepted
 * unended relationships whose running period is on it, and a dashed folder for
 * the ones on no Material. The reader hands back the Materials and the
 * relationships; which folder each relationship sits in, and which the filter
 * keeps, is derived by the page from these -- so the tab and a folder cannot count
 * the same relationship differently.
 */

/** One Material on the Ministry's own list, as a folder names it and the edit page fills it in. */
export interface MaterialOnTheList {
  readonly materialId: MaterialId
  readonly title: string
  /** The Ministry's own typed content, or null where the Material is a PDF alone. */
  readonly body: string | null
  /**
   * The uploaded PDF, by the name it arrived under and its size in bytes, or
   * null where there is none. The size is null where no object is on the path.
   */
  readonly pdf: { readonly filename: string; readonly bytes: number | null } | null
}

/** One closed period a card lists on its "Previously" line. */
export interface ClosedMaterialPeriod {
  /** The Material's title, or null for the stretch with no Material. */
  readonly title: string | null
  readonly startedAt: Date
  readonly endedAt: Date
}

/**
 * One accepted, unended relationship as a folder's card shows it: who is in it,
 * what it is working through now and since when, what it worked through before,
 * and the state its history derives -- the same derivation the Overview runs, so
 * the pill and the flag line here say what they say there.
 */
export interface MaterialRelationship {
  readonly relationshipId: RelationshipId
  readonly leaderNames: readonly string[]
  readonly participantNames: readonly string[]
  /** The name the group was given, or null where the relationship has none. */
  readonly groupName: string | null
  /**
   * Whether the card reads as a group: named, or with more than one person being
   * discipled in it. From the live count and the name, never from the
   * relationship's kind (ADR-0004).
   */
  readonly isAGroup: boolean
  readonly acceptedAt: Date
  /** The Material the running period is on, or null on the stretch with none. */
  readonly runningMaterialId: MaterialId | null
  /** When the running period began. */
  readonly since: Date
  /** The closed periods with a length, earliest first. */
  readonly previously: readonly ClosedMaterialPeriod[]
  /**
   * Which of the two gender folders the filter files it under, or null for All
   * only: the gender the relationship declared; the Leader's own where a
   * one-to-one declared none; nothing for a group that declared none.
   */
  readonly gender: Gender | null
  readonly state: RelationshipState
}

/** What the Materials tab and its folders derive from their document. */
export interface MaterialsPage {
  /**
   * The Ministry's IANA zone, which every date on the tab is printed in, or null
   * where the caller may not see the Ministry at all -- in which case nothing
   * below is listed and no date is printed.
   */
  readonly timeZone: string | null
  /** The live Materials, in title order. A removed one is not on the list. */
  readonly materials: readonly MaterialOnTheList[]
  /** Every accepted, unended relationship, in a stable order. */
  readonly relationships: readonly MaterialRelationship[]
  /** The Care Needed list, for the badge and the cards' flag lines. */
  readonly care: readonly CareNeededItem[]
}

/** The four surfaces that draw from the tab's document, each read under its own name. */
export type MaterialsSurface = 'materials' | 'material' | 'new-material' | 'edit-material'

export interface MaterialsReader {
  /**
   * The whole tab in one read, against one reading of the clock. The filter is
   * carried to the function for the edge log and applied by the page.
   */
  readMaterialsPage(surface: MaterialsSurface, gender: Gender | null): Promise<AdminPage<MaterialsPage>>
}
