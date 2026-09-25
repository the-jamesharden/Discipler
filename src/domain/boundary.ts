import type { Command, TypedLink } from './commands'
import { days, daysSince, type Clock } from './clock'
import {
  acceptInvitation,
  addDiscipleshipGoal,
  appendHistory,
  askCheckInQuestion,
  assignMaterial,
  clarifyCheckInQuestion,
  clarifyKeywordExchange,
  closeCheckInSequence,
  closeKeywordExchange,
  openCheckInSequence,
  openKeywordExchange,
  optPersonIn,
  optPersonOut,
  cancelRelationship,
  createPerson,
  holdImportRow,
  renamePerson,
  resolveImportRow,
  departFromRelationship,
  endRelationship,
  closeIntendedPairing,
  createRelationship,
  configureGroup,
  createMaterial,
  editMaterial,
  addLeader,
  joinRelationship,
  closeOutstandingReply,
  enqueueMessage,
  issueInvitationLink,
  reissueInvitationLink,
  recordIntakeLink,
  planIntendedPairing,
  raiseFollowUpItem,
  recordCheckInAnswer,
  recordIntake,
  remindCheckInQuestion,
  resolveFollowUpItem,
  raiseConcern,
  recordConcernViewing,
  removeDiscipleshipGoal,
  removeMaterial,
  removePerson,
  renameDiscipleshipGoal,
  reorderDiscipleshipGoals,
  resolveConcern,
  restorePerson,
  saveMinistrySettings,
  setKeywordExchangeTarget,
  sweepOutstandingReplies,
  withdrawInvitation,
  type Effect,
  type KeywordExchangeOutcome,
  type NewCheckInPrompt,
} from './effects'
import {
  fulfilmentDecision,
  type IntendedPairingSnapshot,
  type OpenIntendedPairing,
} from './intended-pairing'
import {
  LAST_WEEKS_QUESTION,
  outstandingReplyCutoffs,
  WHATEVER_WAS_ASKED,
  type OutboundMessageKind,
} from './outstanding-reply'
import {
  CancellationRefused,
  DepartureRefused,
  EndingRefused,
  GoalRefused,
  GroupJoinRefused,
  GroupRefused,
  ImportRowResolutionRefused,
  IntakeRefused,
  InvitationRefused,
  MaterialAssignmentRefused,
  MaterialRefused,
  MinistrySettingsRefused,
  PairingRefused,
  PasswordResetRefused,
  PauseRefused,
  ReinvitationRefused,
  RemovalRefused,
  type PairingRefusal,
} from './errors'
import type { PersonToRemove } from './removal'
import {
  CLARIFICATIONS_PER_QUESTION,
  PASSED_OVER,
  advanceCheckIn,
  checkInDueThisWeek,
  checkInPromptId,
  checkInSequenceId,
  lapseOfOpenQuestion,
  readCheckInReply,
  isAskedAbout,
  relationshipsToAskAbout,
  type CheckInAdvance,
  type CheckInQuestion,
  type CheckInReply,
  type CheckInRelationship,
  type CheckInResolution,
  type CheckInSequenceId,
  type CheckInSnapshot,
  type OpenPrompt,
  type OpenSequence,
} from './check-in'
import {
  eligibleFor,
  exchangeHasExpired,
  exchangeIsLive,
  keywordExchangeId,
  leadsAnything,
  mayAcknowledge,
  mayClarify,
  otherPeriodsThan,
  otherSideOf,
  readExchangeReply,
  readKeyword,
  type InboundSnapshot,
  type Keyword,
  type KeywordRelationship,
  type OpenKeywordExchange,
  type RelationshipKeyword,
} from './keywords'
import type { RatesLineOccasion } from './rates-line'
import {
  alreadyOffered,
  asShown,
  nextPosition,
  offeredGoal,
  namesTheWholeList,
  orderAfterDragging,
  orderAfterMoving,
  readGoalWording,
  type GoalWording,
  type OfferedGoal,
  type StatedGoal,
} from './discipleship-goals'
import { passwordResetRefusal } from './accounts'
import {
  carriesSomething,
  materialOnOffer,
  MOST_ITEMS,
  readMaterialBody,
  readMaterialLink,
  readMaterialTitle,
  readStoredFile,
  titleAlreadyHeld,
  type MaterialFile,
  type MaterialItem,
  type MaterialOnOffer,
  type MaterialTitle,
} from './materials'
import {
  discipleshipGoalId,
  GROUP_PATH,
  readIntakeForm,
  type DiscipleshipGoalId,
  type Gender,
} from './intake'
import {
  intakeLinkState,
  intakeLinkToken,
  issueIntakeLink,
  type IntakeLinkToken,
} from './intake-link'
import {
  acceptanceReminderMessage,
  acknowledgedMessage,
  checkInClarification,
  checkInSubject,
  groupJoinedMessage,
  leaderDashboardLink,
  checkInThankYou,
  concernDetailRequest,
  invitationLink,
  meetingQuestion,
  satisfactionQuestion,
  helpMessage,
  invitationMessage,
  keywordClarification,
  keywordMenu,
  keywordPassedOn,
  nothingEligible,
  pauseApplied,
  pauseConfirmation,
  resumedMessage,
  swapRecorded,
  starterMessageToLeader,
  starterMessageToParticipant,
  welcomeMessage,
} from './outbound-copy'
import { CONSENT_VERSION } from './consent'
import {
  type FollowUpItemId,
  concernId,
  importRowId,
  intendedPairingId,
  materialId,
  materialItemId,
  personId,
  relationshipId,
  type IdSource,
  type MaterialId,
  type MinistryId,
  type PersonId,
  type RelationshipId,
} from './ids'
import {
  hasRunOut,
  invitationState,
  invitationToken,
  issueInvitation,
  type InvitationToken,
  type WithdrawnAs,
} from './invitations'
import {
  ACCEPTANCE_ESCALATION_DAYS,
  ACCEPTANCE_REMINDER_DAYS,
  isRelationshipOutcome,
  kindFor,
  needsAGenderDeclaration,
  needsAName,
  readGroupName,
  type MemberRole,
  type NewMembership,
  type NewRelationship,
} from './relationships'
import {
  DEFAULT_PAUSE_PERIOD_WEEKS,
  isPausePeriod,
  pauseExpiresAt,
  pauseHasExpired,
  type PausePeriodWeeks,
  type StandingPause,
} from './pause'
import {
  readMinistrySettings,
  type MinistryLanguage,
  type MinistrySettings,
} from './ministry-settings'
import {
  namesOnTheNumber,
  rosterKey,
  type HeldImportRow,
  type PhoneNumber,
  type RosterKey,
  type RowRejection,
} from './roster'
import { readRosterFile } from './roster-csv'
import { classifyImport, type SideRef } from './roster-import'

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
   * The held row an answer is about, as the database found it, loaded on
   * `import_row.resolve`'s behalf. It carries `resolvedAt` rather than a *still
   * open* flag, because whether somebody answered first is a question about time
   * and every one of those is answered here against the injected clock.
   */
  readonly importRow?: HeldImportRow
  /**
   * The Ministry in whose voice the command speaks. Loaded on the command's behalf
   * because every message carries the Ministry name as a prefix, and a domain that
   * fetched it would no longer be a pure function of its inputs.
   *
   * Already the *speaking* name: `from_name` where a Ministry has set one, its
   * display name otherwise. The fallback happens once, at the store, so nothing
   * here has to remember which of the two a message carries.
   */
  readonly ministryName?: string
  /**
   * What this Ministry calls its two roles, loaded on the behalf of the commands
   * whose messages say one. A Ministry's people are called what that Ministry
   * calls them, which is the same rule its Discipleship Goal options follow.
   *
   * Absent on every command that composes no message naming a role, rather than
   * defaulted to Discipler's own words: a message that quietly said *mentor* to a
   * Ministry that had asked for *coach* would be the one failure a preview exists
   * to make impossible.
   */
  readonly language?: MinistryLanguage
  /**
   * This Ministry's settings as they stand, loaded on `settings.update`'s behalf
   * so that history can record what each field used to be. Absent on everything
   * else.
   */
  readonly settings?: MinistrySettings
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
   * The Intake link a re-submission arrived through, as the database found it.
   * Absent on the Ministry-wide link, which names nobody.
   *
   * It carries the Person and the window rather than a *live* flag, because
   * whether a link has run out is a question about time and every one of those is
   * answered here against the injected clock.
   */
  readonly intakeLink?: IntakeLinkSnapshot
  /**
   * The link this Person already holds, loaded on `intake.reopen`'s behalf, or
   * `null` where they hold none.
   *
   * Null rather than absent for *none*, and absent rather than null for *not
   * loaded*. The two are the same value and opposite facts here: a Person holding
   * no link and a read that never happened would both mint a second one, and one of
   * those quietly stops the link the Admin sent last week from working.
   */
  readonly intakeLinkHeld?: IntakeLinkSnapshot | null
  /**
   * The account the Person a reset names holds, loaded on
   * `person.reset_password`'s behalf. `null` covers both *this Ministry's Roster
   * does not hold that Person* and *they hold no account*, which are one refusal
   * because from the acting Admin's side they are one fact: there is nothing on
   * this Roster to reset.
   *
   * Null rather than absent for *nothing to reset*, and absent rather than null
   * for *not loaded* -- the distinction `intakeLinkHeld` above makes, for the same
   * reason. Read as the same value, an unloaded snapshot would refuse every reset
   * in the product as a race.
   */
  readonly accountToReset?: string | null
  /**
   * The Person `person.remove` names, read inside its transaction after their
   * pairings were ended. `null` is *nobody on this Roster answers to that Person*
   * -- never here, or already removed -- and absent is *not loaded*, which the
   * removal refuses to run on for the reason `accountToReset` does.
   */
  readonly personToRemove?: PersonToRemove | null
  /**
   * What the Person a re-invitation names holds to the relationship it names,
   * loaded on `invitation.copy_link`'s behalf.
   */
  readonly invitationHeld?: InvitationHeld
  /**
   * Every relationship in this Ministry that nobody has accepted yet, loaded on
   * the tick's behalf. Absent rather than empty, for the same reason the Roster
   * is: an unloaded snapshot and a Ministry with nothing outstanding are the same
   * value and opposite facts, and one of them silently reminds nobody.
   */
  readonly unaccepted?: readonly UnacceptedRelationship[]
  /**
   * Every relationship in this Ministry a Pause currently stands on, loaded on
   * the tick's behalf. Absent rather than empty, for the same reason the Roster
   * and the unaccepted relationships are: an unloaded snapshot and a Ministry
   * with nothing paused are the same value and opposite facts, and one of them
   * silently lets every pause run out unnoticed.
   */
  readonly paused?: readonly PausedRelationship[]
  /**
   * The one relationship an Admin command names, as the database holds it now.
   * Absent when the command names none.
   */
  readonly relationship?: RelationshipSnapshot
  /**
   * The relationships `material.assign_to_relationships` names, as the database
   * holds them now and locked, loaded on its behalf and on nobody else's. One
   * named that is not here is not this Ministry's, or no longer exists; absent
   * altogether is *not loaded*, which the command refuses to run on.
   */
  readonly relationshipsToAssign?: readonly RelationshipToAssign[]
  /**
   * The group a submission on the group path named, loaded on `intake.submit`'s
   * behalf when the form carries one -- as the database holds it now, locked, so
   * two people joining at once cannot both read a door that has since closed.
   * `null` is *no such group*: it does not exist, has ended, or was never a group.
   * Absent is *not loaded*, which a submission naming a group refuses to run on.
   *
   * Loaded for `group.add_participant` too, and never null there: the service
   * refuses an id that names no group before the domain is asked anything.
   */
  readonly groupToJoin?: RelationshipSnapshot | null
  /**
   * The plan being settled, loaded under its own row lock; null where the id
   * names none. Loaded for `intended_pairing.fulfil` and `.refuse` only.
   */
  readonly intendedPairing?: IntendedPairingSnapshot | null
  /**
   * Every plan still standing, so an Admin pairing two people by hand fulfils the
   * plan an import made for them. Loaded for `relationship.create`.
   */
  readonly openPlans?: readonly OpenIntendedPairing[]
  /**
   * The open request an admission names, loaded on `relationship.admit`'s behalf,
   * with the group it is about arriving as `relationship` and the Person who asked
   * in `contacts`. `null` is *no open request of that kind by that id*; absent is
   * *not loaded*.
   *
   * Loaded for `group.add_participant` too, as the open request the Person being
   * added has for that same group, which the act resolves; `null` is *they have
   * none*. There is at most one: a request dedupes while it stands open.
   */
  readonly joinRequest?: OpenJoinRequest | null
  /**
   * The open `group_placement_wanted` item of the Person `group.add_participant`
   * puts into a group, or `relationship.admit` admits to one, which either act
   * resolves (Group form exits, ticket 01).
   * `null` is *they have none*; absent is *not loaded*. At most one: the item
   * names only the Person.
   */
  readonly placementWanted?: FollowUpItemId | null
  /**
   * Where a link points. The shape of the path is a copy decision and lives in
   * `outbound-copy`; the host it hangs off is configuration and arrives here.
   */
  readonly appBaseUrl?: string
  /**
   * The Person a check-in command acts on: what they lead, whether a conversation
   * is already open with them, and when they were last asked. Loaded around the
   * command like every other snapshot here, so the rules stay drivable with no
   * database in the room.
   */
  readonly checkIn?: CheckInSnapshot
  /**
   * Every Leader in this Ministry the cadence could make due, loaded on the
   * tick's behalf with their cadence already resolved by
   * `coalesce(r.checkin_day, ms.checkin_day)`.
   *
   * *Could*, not *is*. Which of them a new ISO week has actually come due for is
   * a rule about time, and every one of those is decided here against the
   * injected clock rather than in SQL -- otherwise a cadence edit and a week
   * boundary would be untestable without a database and a fortnight.
   *
   * Absent rather than empty, like the Roster and the unaccepted relationships:
   * an unloaded snapshot and a Ministry with nobody to ask are the same value and
   * opposite facts, and one of them silently checks in with nobody.
   */
  readonly checkInsDue?: readonly CheckInSnapshot[]
  /**
   * Every Discipleship Goal option this Ministry currently offers, with how many
   * people's answer each one holds. Loaded on the four `goal.*` commands' behalf.
   *
   * Absent rather than empty, for the reason the Roster is: a list that did not
   * load and a Ministry offering nothing are the same value and opposite facts,
   * and here one of them would wave a duplicate through and refuse a removal that
   * was perfectly safe. A Ministry offering nothing cannot exist -- the database
   * seeds every new one and refuses the removal that would empty it.
   */
  readonly goals?: readonly OfferedGoal[]
  /**
   * Every submission pointing at the option a `goal.remove` names, read before the
   * delete blanks them. Loaded on that one command's behalf and on no other's: it
   * is the only edit that destroys anything, and reading it for a rename would be
   * a table scan to answer a question nobody asked.
   *
   * Absent rather than empty, like `goals`. *Nobody ever chose this* and *the read
   * did not happen* are opposite facts, and confusing them here would have a
   * removal record that it cost nothing while blanking a congregation's answers.
   */
  readonly goalAnswers?: readonly StatedGoal[]
  /**
   * Every live Material this Ministry holds, each with how many accepted, unended
   * relationships are working through it. Loaded on the three `material.*`
   * commands' behalf, and absent rather than empty for the reason `goals` is: a
   * list that did not load and a Ministry holding nothing are the same value and
   * opposite facts, and one of them waves a duplicate title through.
   *
   * Loaded as well for the two ends of a Material chosen at pairing, and only
   * where there is a choice to judge: a `relationship.create` naming one, and a
   * `relationship.accept` whose invitation still carries one.
   */
  readonly materials?: readonly MaterialOnOffer[]
  /**
   * What the Person an inbound text came from holds, what they last asked for, and
   * whether Discipler may still text them. Loaded on `sms.inbound`'s behalf,
   * alongside `checkIn` and not inside it: the two answer different questions, and a
   * Participant has this one and never that one.
   */
  readonly inbound?: InboundSnapshot
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

/**
 * An Intake link as the database holds it. Possession of it is the whole of the
 * authentication, exactly as it is for an Invitation Link -- so what it names is
 * who a submission is about, and the name and number on the form are what that
 * Person is correcting rather than how they are recognised.
 *
 * It carries the window rather than a *live* flag, because whether a link has run
 * out is a question about time and every one of those is answered against the
 * injected clock.
 */
export interface IntakeLinkSnapshot {
  readonly personId: PersonId
  readonly token: IntakeLinkToken
  readonly expiresAt: Date
}

/**
 * The invitations one Person has held to one relationship, as *Copy link to
 * re-invite leader* reads them (Manual pairing, recut ticket 06).
 */
export interface InvitationHeld {
  /** When the live invitation they hold runs out, or null where they hold none. */
  readonly liveExpiresAt: Date | null
  /**
   * Whether an invitation of theirs to this relationship was ever withdrawn. It is
   * what makes this a re-invitation: the button must not become a second way to
   * add anybody at all to a relationship as its Leader.
   */
  readonly everWithdrawn: boolean
}

export interface UnacceptedRelationship {
  readonly relationshipId: RelationshipId
  /**
   * Both thresholds are measured from here. For a relationship nobody has
   * activated it is when the relationship was formed, never when any one Leader
   * was invited, so its Leaders share one clock. For one that was already
   * running when a Leader was added to it (Manual pairing, ticket 22), formation
   * may be a year ago and means nothing: it is when the earliest Leader still to
   * answer was added.
   */
  readonly waitingSince: Date
  /**
   * Whether it had activated before the Leaders it waits on were added. The
   * Unaccepted flag is raised only where it had not (Manual pairing, recut ticket
   * 06; decided by James on 2026-09-21): a relationship nobody has started holds
   * its Disciples out of Suggested Pairs until somebody acts, and a group already
   * running holds nobody up, so its Admin hears about a co-leader once, when the
   * invitation is withdrawn at two weeks. The reminder is sent either way.
   */
  readonly alreadyRunning: boolean
  readonly awaiting: readonly AwaitingLeader[]
  /**
   * Whether a `relationship_unaccepted` item about it is *open* right now. The
   * partial unique index refuses a second open row anyway; this is what keeps the
   * tick from appending a history event a day for a condition an Admin is already
   * looking at.
   *
   * Deliberately not "has ever been raised". An Admin who resolves the item
   * without cancelling has closed a record, not made the relationship accepted --
   * and a relationship that can never be raised again is one nobody is ever told
   * about, which is the invisibility this ticket exists to end.
   */
  readonly itemStandsOpen: boolean
}

/**
 * One member of the relationship an Admin command names, as the database holds
 * them now: who they are, which side of the relationship they are on, and how to
 * reach them. No invitation link -- the Participant still holds one, but nothing a
 * command composes puts it in a message, so nothing here needs to read it.
 *
 * `acceptedAt` is a Leader's own agreement, and null on every Participant, who
 * accepts nothing. The relationship's own date is activation and is not the same
 * fact: a group still awaiting one of two Leaders has one who agreed and one who
 * did not, and a Leader who has not accepted is sent nothing but their invitation
 * (Manual pairing, ticket 22).
 */
export interface RelationshipMember {
  readonly personId: PersonId
  readonly role: MemberRole
  readonly fullName: string
  readonly phone: string | null
  readonly acceptedAt: Date | null
}

/**
 * One paused relationship, as the tick needs it: when the Pause was taken, for
 * how long, and whether an Admin is already looking at an item saying it has run
 * out.
 *
 * `itemStandsOpen` is *open right now*, deliberately not *has ever been raised*.
 * The partial unique index refuses a second open row anyway; this is what keeps
 * the tick from appending a history event a day for a condition nobody has acted
 * on. An Admin who resolves the item without resuming has closed a record, not
 * restarted anybody's check-ins -- so the condition is true again and is raised
 * again, exactly as an unaccepted relationship's is.
 */
export interface PausedRelationship {
  readonly relationshipId: RelationshipId
  readonly pausedAt: Date
  readonly periodWeeks: PausePeriodWeeks
  readonly itemStandsOpen: boolean
}

/**
 * A relationship as the database holds it now. `acceptedAt` is activation and
 * `endedAt` is the end of its life; between them they say which of the things an
 * Admin may do to it are still available, and `pause` says whether it is
 * currently stopped.
 */
export interface RelationshipSnapshot {
  readonly relationshipId: RelationshipId
  readonly createdAt: Date
  readonly acceptedAt: Date | null
  readonly endedAt: Date | null
  /** What the Ministry calls it, or null where nobody has named it. */
  readonly name: string | null
  /** Whether joining it through the Intake link asks rather than joins. */
  readonly joinRequiresApproval: boolean
  /** What it declared at formation, or null for mixed and for a one-to-one. */
  readonly declaredGender: Gender | null
  /**
   * The Pause standing on it right now, or null. Read back from the
   * `relationship.paused` and `relationship.resumed` events rather than from a
   * column, because a Pause is a dated fact like every other thing that happens
   * to a relationship and history is the one source they are all derived from.
   */
  readonly pause: StandingPause | null
  /** Everyone holding an open membership, whatever their role. */
  readonly members: readonly RelationshipMember[]
}

/**
 * What assigning a Material decides from, and nothing more: when the
 * relationship was activated and whether it has ended. A snapshot of its own
 * rather than a whole `RelationshipSnapshot` per relationship, because assigning
 * to many reads them all in one statement, and the members, the Pause and the
 * rest would be reads the rule never consults (Richer materials, ticket 02).
 */
export type RelationshipToAssign = Pick<
  RelationshipSnapshot,
  'relationshipId' | 'acceptedAt' | 'endedAt'
>

/**
 * One open `group_join_requested` item, as an admission reads it: who asked and
 * for which group. Read off the item inside the transaction rather than taken
 * from the request, so an admission cannot name a different Person or group from
 * the item it closes.
 */
export interface OpenJoinRequest {
  readonly itemId: FollowUpItemId
  readonly personId: PersonId
  readonly relationshipId: RelationshipId
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
  /**
   * How it was withdrawn without being accepted, or null where it has not been:
   * its holder declined, or nobody answered before it ran out (Manual pairing,
   * recut ticket 06).
   */
  readonly withdrawnAs: WithdrawnAs | null
  /**
   * When the relationship activated, or null while it still awaits a Leader. An
   * Admin may add a Leader to a group that is already running, so a token can
   * name one: that Leader's acceptance is theirs alone and activates nothing.
   */
  readonly relationshipAcceptedAt: Date | null
  /**
   * The open `relationship_unaccepted` item about this relationship, or null
   * where the tick has raised none. There is at most one: it is the
   * relationship's and not one Leader's, and the tick raises none while one
   * stands open.
   */
  readonly unansweredItemId: FollowUpItemId | null
  /**
   * The Material an Admin chose while forming this relationship, or null where
   * none was or it has been spent. As the column holds it: whether that Material
   * is still on the Ministry's list is decided at the boundary against
   * `CommandContext.materials`, not here.
   */
  readonly intendedMaterialId: MaterialId | null
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
  /**
   * Who an Admin has removed from the Roster and has not come back (Remove from
   * the Roster, ticket 01). They are still in `people`, because a removal deletes
   * nothing and an Intake from them has to find the same Person; this is what
   * says they are not on the Roster now.
   */
  readonly removed: ReadonlySet<PersonId>
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

/**
 * The words this Ministry calls its two roles by.
 *
 * Thrown for rather than defaulted, like every other snapshot here. Discipler's
 * own words standing in for a Ministry's would be a message going out saying
 * *mentor* to a Ministry that had asked for *coach* -- which is the one failure
 * the settings preview exists to make impossible, and it would be invisible.
 */
const theWordFor = (context: CommandContext): MinistryLanguage => {
  if (!context.language) {
    throw new Error('This command was handed no words for the roles it names')
  }
  return context.language
}

/**
 * The Ministry's own list of Discipleship Goal options, or a loud failure rather
 * than an empty one. See `CommandContext.goals`: absent and empty are opposite
 * facts, and a read that silently became *this Ministry offers nothing* would
 * change what every rule below decides.
 */
const theOptionsOnOffer = (context: CommandContext): readonly OfferedGoal[] => {
  if (!context.goals) {
    throw new Error('No list of Discipleship Goal options was loaded for this edit')
  }
  return context.goals
}

/**
 * The answers a removal is about to blank, or a loud failure rather than an empty
 * list. See `CommandContext.goalAnswers`: a read that silently became *nobody ever
 * chose this* would have the removal event record a loss of nothing, which is the
 * one record that cannot be gone back for.
 */
const theAnswersAboutToGo = (context: CommandContext): readonly StatedGoal[] => {
  if (!context.goalAnswers) {
    throw new Error('No answers were loaded for the Discipleship Goal being removed')
  }
  return context.goalAnswers
}

/**
 * The Ministry's own list of Materials, or a loud failure rather than an empty
 * one. See `CommandContext.materials`.
 */
const theMaterialsHeld = (context: CommandContext): readonly MaterialOnOffer[] => {
  if (!context.materials) {
    throw new Error('No list of Materials was loaded for this command')
  }
  return context.materials
}

/**
 * Whether a Material may be put on this relationship, or taken off it, at all:
 * refused where it has ended or nobody has accepted it, naming it. One rule for a
 * single card and for many at once, so the two cannot come to disagree about
 * which relationships can be assigned (Richer materials, ticket 02).
 */
const refuseUnlessAssignable = (relationship: RelationshipToAssign): void => {
  // Terminal first, as everywhere else. A relationship that is over has no
  // further week to attribute, and a period opened after its ending would be
  // one no report could ever ask about.
  if (relationship.endedAt !== null) {
    throw new MaterialAssignmentRefused('material.relationship_ended', relationship.relationshipId)
  }
  // The period with no Material starts at acceptance. Before that there is
  // nothing to close, and a period opened now would start after the one
  // acceptance is about to open -- which is the gap the opening period exists
  // to prevent, written by the very act that was supposed to fill it.
  if (relationship.acceptedAt === null) {
    throw new MaterialAssignmentRefused(
      'material.relationship_not_accepted',
      relationship.relationshipId,
    )
  }

  // A Pause is not checked, deliberately. It suspends this relationship's
  // check-ins and nothing else, and deciding what a Leader will pick up when
  // they come back is exactly the sort of thing an Admin does during one. The
  // weeks a Pause covers are dropped from `relationship_weeks` anyway, so the
  // period spanning it attributes nothing either way.
}

/**
 * What one assignment writes: the period, then the event saying so. The same
 * two effects whichever act asked for it, so a relationship's history reads the
 * same whether it was put on its Material from its card or with many others.
 *
 * The Material this relationship is already on is refused by
 * `app.assign_material`, as `material.already_running`: it reads the running
 * period under the lock it writes the next one under, which a snapshot read here
 * could not promise.
 */
const assigning = (
  relationship: RelationshipToAssign,
  act: {
    readonly ministryId: MinistryId
    readonly materialId: MaterialId | null
    readonly assignedBy: string
  },
  now: Date,
): Effect[] => [
  assignMaterial({
    ministryId: act.ministryId,
    relationshipId: relationship.relationshipId,
    materialId: act.materialId,
    assignedAt: now,
    assignedBy: act.assignedBy,
  }),
  appendHistory({
    ministryId: act.ministryId,
    occurredAt: now,
    type: 'relationship.material_assigned',
    subjectType: 'relationship',
    subjectId: relationship.relationshipId,
    // Append-only, so this is the record that survives the Admin leaving the
    // Ministry and `assigned_by` being nulled with them. The period that ended is
    // deliberately absent: it is a row with a date on it, and a second copy of
    // that date here would be an answer waiting to disagree with the first.
    payload: { materialId: act.materialId, assignedBy: act.assignedBy },
  }),
]

/**
 * Whether the Material an Admin chose is on the Ministry's live list as this
 * command decides. Asked when a relationship is formed with one, when it is
 * accepted, and when one is assigned (Materials, ticket 03), and answered one
 * way: a removed Material is off the list.
 */
const isStillOnTheList = (context: CommandContext, id: MaterialId): boolean =>
  materialOnOffer(theMaterialsHeld(context), id) !== undefined

/**
 * The live Material an edit names, or a refusal. A refusal rather than a
 * failure, for the reason `theOptionNamed` refuses: an Admin acting from a page
 * somebody else has since removed the Material from is an ordinary thing to
 * happen. A removed Material is off the list, so it is not found here either.
 */
const theMaterialNamed = (
  materials: readonly MaterialOnOffer[],
  id: MaterialOnOffer['id'],
): MaterialOnOffer => {
  const material = materialOnOffer(materials, id)
  if (!material) throw new MaterialRefused('material.not_on_the_list')
  return material
}

/**
 * The title a Material will carry, checked against the two things that make a
 * list unusable: a Material with nothing on the title, and two folders an Admin
 * could not tell apart.
 */
const theTitleFor = (
  materials: readonly MaterialOnOffer[],
  raw: string,
  except?: MaterialOnOffer['id'],
): MaterialTitle => {
  const title = readMaterialTitle(raw)
  if (!title) throw new MaterialRefused('material.needs_title')
  if (titleAlreadyHeld(materials, title, except)) throw new MaterialRefused('material.title_taken')
  return title
}

/**
 * The files and links being added, each checked, and given an id and a place
 * after everything the Material keeps. Files before links, which is the order
 * the form lists its two boxes in.
 */
const theItemsAdded = (
  context: CommandContext,
  files: readonly MaterialFile[],
  links: readonly TypedLink[],
  after: readonly MaterialItem[],
): readonly MaterialItem[] => {
  for (const file of files) {
    const refusal = readStoredFile(file)
    if (refusal) throw new MaterialRefused(refusal)
  }
  const read = links.map((typed) => {
    const link = readMaterialLink(typed)
    if (!link) throw new MaterialRefused('material.link_unreadable')
    return link
  })
  const next = after.reduce((largest, item) => Math.max(largest, item.position + 1), 0)
  return [...files, ...read].map((content, index) => ({
    ...content,
    id: materialItemId(context.ids.next()),
    position: next + index,
  }))
}

/**
 * The text a Material will carry, checked against its items: one of them, or
 * both, and no more items than a Material may hold.
 */
const theContentOf = (raw: string | null, items: readonly MaterialItem[]): string | null => {
  const body = readMaterialBody(raw)
  if (!carriesSomething(body, items)) throw new MaterialRefused('material.needs_content')
  if (items.length > MOST_ITEMS) throw new MaterialRefused('material.too_many_items')
  return body
}

/** What history remembers an item by: its filename, or its address. */
const asRemembered = (item: MaterialItem) =>
  item.kind === 'file'
    ? { kind: 'file', filename: item.filename }
    : { kind: 'link', url: item.url, label: item.label }

/**
 * The option an edit names, or a refusal. A refusal rather than a failure,
 * because an Admin acting from a page somebody else has since edited is an
 * ordinary thing to happen rather than a defect.
 */
const theOptionNamed = (
  goals: readonly OfferedGoal[],
  id: DiscipleshipGoalId,
): OfferedGoal => {
  const goal = offeredGoal(goals, id)
  if (!goal) throw new GoalRefused('goal.not_found')
  return goal
}

/**
 * The wording an option will carry, checked against the two things that make a
 * list unusable: an option with nothing on it, and two options a Person reading
 * the form could not tell apart.
 */
const theWordingFor = (
  goals: readonly OfferedGoal[],
  raw: string,
  except?: DiscipleshipGoalId,
): GoalWording => {
  const wording = readGoalWording(raw)
  if (!wording) throw new GoalRefused('goal.needs_wording')
  if (alreadyOffered(goals, wording, except)) throw new GoalRefused('goal.already_offered')
  return wording
}

/**
 * The text a group's Leaders get when somebody joins, whichever way they joined.
 * One per Leader with a number; a Leader without one is skipped here the way the
 * queue would skip them, and a Leader who has opted out is refused at the queue.
 *
 * Only a Leader who has accepted. Until then they have agreed to nothing and hold
 * no dashboard for the link to open, and Awaiting Leader Acceptance sends them
 * their invitation and nothing else. A self-join and an admission only ever meet
 * a group every Leader has accepted; an Admin's own way in also reaches one still
 * awaiting its Leader, which is told nothing (Manual pairing, ticket 22).
 *
 * The name is null on a group formed before groups were named and not named
 * since. An Admin may still put somebody into it, so the message has words for
 * it rather than the command a refusal.
 */
const tellTheLeadersSomebodyJoined = (
  context: CommandContext,
  group: RelationshipSnapshot,
  joinerFullName: string,
  now: Date,
): readonly Effect[] => {
  const ministryName = context.ministryName
  if (!ministryName) throw new Error('A join was handed no Ministry to speak for')
  const dashboardLink = leaderDashboardLink(theHost(context))
  const groupName = group.name

  return group.members
    .filter(
      (member) =>
        member.role === 'leader' && member.acceptedAt !== null && member.phone !== null,
    )
    .map((leader) =>
      enqueueMessage({
        ministryId: context.ministryId,
        personId: leader.personId,
        toPhone: leader.phone,
        body: groupJoinedMessage({
          ministryName,
          joinerFullName,
          groupName,
          dashboardLink,
        }),
        enqueuedAt: now,
        // A first name and a link. The numbers are on the page the link opens,
        // behind sign-in and behind each Person's contact-sharing decision.
        disclosesPersonId: null,
        kind: 'no_reply',
        ratesLine: 'once_a_month',
      }),
    )
}

/**
 * What putting somebody into a group that already exists decides from, in either
 * role (Manual pairing, ticket 22): the group, open, and a Person this Ministry
 * holds who is not already in it.
 *
 * The service refuses an id that names no group of this Ministry, and one that
 * names a one-to-one, before anything reaches here: telling those two apart
 * takes a second read, and only it can make one.
 */
const theGroupAndWhoIsAdded = (
  context: CommandContext,
  command: { readonly type: string; readonly personId: PersonId },
): { readonly group: RelationshipSnapshot; readonly person: PersonContact } => {
  const group = context.groupToJoin
  if (!group) throw new Error(`${command.type} was handed no group to add to`)
  if (group.endedAt !== null) throw new GroupJoinRefused('joining.group_has_ended')

  // Read on the connection acting for this Ministry, so a Person of another
  // Ministry's is missing here rather than merely unmatched.
  const person = context.contacts?.people.get(command.personId)
  if (!person) throw new GroupJoinRefused('joining.person_not_found')

  // In either role. Somebody leading the group is not made a Disciple of it, nor
  // a Disciple of it its Leader, and the database's one-open-membership rule
  // would refuse them anyway, in the pairing's words rather than in these.
  if (group.members.some((member) => member.personId === command.personId)) {
    throw new GroupJoinRefused('joining.already_in_the_group')
  }

  return { group, person }
}

/**
 * Where links point, or a loud failure rather than a link to nowhere. The
 * service passes it on every command; a test that composes a message with a link
 * in it has to say where.
 */
const theHost = (context: CommandContext): string => {
  if (!context.appBaseUrl) {
    throw new Error('This command was handed nowhere for its links to point')
  }
  return context.appBaseUrl
}

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

/** What every question in a conversation needs in order to be sent and recorded. */
interface Asking {
  readonly ministryId: MinistryId
  readonly ministryName: string
  readonly sequenceId: CheckInSequenceId
  readonly personId: PersonId
  readonly phone: string | null
  readonly now: Date
  readonly ids: IdSource
  /**
   * The cadence instant that made this conversation due, or null when nothing
   * scheduled it -- a reply advancing the sequence, or `checkin.start` opening
   * one directly. Stamped on the message and never rewritten.
   */
  readonly scheduledFor: Date | null
}

/**
 * One question, as the two things it always is: a text to the Leader and a row
 * saying what was asked, of which relationship, in which role. They are produced
 * together because a prompt with no message is a question nobody was asked, and a
 * message with no prompt is a reply with nothing to bind to.
 */
/**
 * One text to the Leader this conversation belongs to. Every message a check-in
 * sends is this shape -- the questions and the closing thank-you alike -- so the
 * envelope is written once and only the body differs.
 */
const sayToLeader = (
  asking: Asking,
  body: string,
  kind: OutboundMessageKind,
  ratesLine: RatesLineOccasion,
): Effect =>
  enqueueMessage({
    ministryId: asking.ministryId,
    personId: asking.personId,
    toPhone: asking.phone,
    body,
    enqueuedAt: asking.now,
    scheduledFor: asking.scheduledFor,
    // No message to a Leader contains a phone number, and a check-in question
    // names the people they already meet with.
    disclosesPersonId: null,
    // Named at every call rather than defaulted here, because the four messages
    // this composes are not all the same kind: a question takes the Leader's
    // number, and the reminder that re-sends it, the clarification that restates
    // it and the thank-you that ends the conversation do not.
    kind,
    ratesLine,
  })

const ask = (
  asking: Asking,
  prompt: Omit<NewCheckInPrompt, 'id' | 'ministryId' | 'sequenceId' | 'askedAt'>,
  body: string,
  ratesLine: RatesLineOccasion,
): readonly Effect[] => [
  askCheckInQuestion({
    id: checkInPromptId(asking.ids.next()),
    ministryId: asking.ministryId,
    sequenceId: asking.sequenceId,
    askedAt: asking.now,
    ...prompt,
  }),
  // The one message in the rhythm that takes the Leader's number: it is a
  // question, and the reply it is owed is what the next one waits for.
  sayToLeader(asking, body, 'scheduled_question', ratesLine),
]

/**
 * The words of one question, wherever it is being sent from -- asked the first
 * time, or the same question re-sent as a reminder a day later. One place, so a
 * reminder cannot drift into being a differently-worded second question.
 *
 * `discloseOptOut` is only ever true on the message that opens a conversation.
 * That is the check-in that may carry the rates line, once a month (Text wording,
 * ticket 01), and a reminder is not another one: it is that same message again.
 */
const bodyOfQuestion = (
  asking: Asking,
  question: CheckInQuestion,
  relationship: CheckInRelationship,
  discloseOptOut: boolean,
): string => {
  const { ministryName } = asking
  if (question === 'met') {
    return meetingQuestion({
      ministryName,
      // A named group is asked about by name; everything else by the people in
      // it. A fact about the row and never about its kind.
      subject: relationship.name ?? checkInSubject(relationship.participantNames),
      discloseOptOut,
    })
  }
  return question === 'satisfaction'
    ? satisfactionQuestion({ ministryName })
    : concernDetailRequest({ ministryName })
}

/**
 * The question that opens a conversation. It may carry the rates line, and does
 * where the Leader has not been queued it on any text yet this month -- a Starter
 * Message the same week takes it off (Text wording, ticket 01). That is decided
 * once the command's texts are all known, in `rates-line.ts`, so it is composed
 * here as it reads when it does.
 */
const askWhetherTheyMet = (
  asking: Asking,
  relationship: CheckInRelationship,
  position: number,
): readonly Effect[] =>
  ask(
    asking,
    {
      relationshipId: relationship.relationshipId,
      role: relationship.role,
      position,
      question: 'met',
    },
    bodyOfQuestion(asking, 'met', relationship, true),
    'once_a_month',
  )

/**
 * Whatever the ladder said comes next, sent. Reached from a reply that advanced
 * the conversation and from a question given up on, which move it identically --
 * that identity is what *converting abandonment into ordinary unanswered
 * questions with no special case* actually means in code.
 *
 * Never carries the rates line: it may have gone out on the message that opened
 * this conversation, and this is the same conversation.
 */
const askNext = (
  asking: Asking,
  advance: Extract<CheckInAdvance, { kind: 'ask' }>,
): readonly Effect[] =>
  ask(
    asking,
    {
      relationshipId: advance.relationship.relationshipId,
      role: advance.relationship.role,
      position: advance.position,
      question: advance.question,
    },
    bodyOfQuestion(asking, advance.question, advance.relationship, false),
    'never',
  )

/**
 * A reply as it is stored. The three columns are exclusive by question -- a
 * `met` answer has no rating and a rating has no prose -- and the letters the
 * message advertised are nowhere in it: `C` is stored as `concern`, so renaming a
 * token in copy can never re-tokenise a Ministry's history.
 */
const recorded = (reply: CheckInReply) => ({
  met: reply.kind === 'met' ? reply.met : null,
  satisfaction: reply.kind === 'satisfaction' ? reply.satisfaction : null,
  detail: reply.kind === 'concern_detail' ? reply.detail : null,
})

/**
 * The same reply as history records it, which is the same three facts minus the
 * prose. `ministry_event` is append-only, so a payload carrying the Leader's words
 * would outlive the resolution that cleared them -- exactly what `concern.raised`
 * already refuses, and for the same reason. That a Concern was raised is the fact
 * worth keeping; the words live in `concern` and are cleared from there.
 */
const withoutTheProse = (reply: CheckInReply) => ({
  met: reply.kind === 'met' ? reply.met : null,
  satisfaction: reply.kind === 'satisfaction' ? reply.satisfaction : null,
  raisedConcern: reply.kind === 'concern_detail',
})

/**
 * Ending a conversation the Leader did not finish. Four things end one -- a new
 * week displacing it, a `STOP`, a Pause withdrawing the last question it had left
 * to ask, and its last question reminded once and given up on -- and all four
 * close it `abandoned`, because they are one fact.
 *
 * The reason is a parameter rather than a caller's choice to include: it lives
 * only on the history event, so an ending that omitted it would be unreadable to
 * ticket 10, and going through here is the only way to write one.
 */
const abandonSequence = (abandonment: {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly sequenceId: CheckInSequenceId
  readonly at: Date
  readonly reason: 'displaced' | 'unanswered' | 'opted_out' | NotAskedAboutBecause
}): readonly Effect[] => {
  const { ministryId, personId, sequenceId, at, reason } = abandonment
  return [
    closeCheckInSequence({ ministryId, sequenceId, closedAt: at, outcome: 'abandoned' }),
    appendHistory({
      ministryId,
      occurredAt: at,
      type: 'checkin.sequence_abandoned',
      subjectType: 'person',
      subjectId: personId,
      payload: { sequenceId, reason },
    }),
  ]
}

/**
 * A question a Pause took back, as history records it.
 *
 * Withdrawn is not passed over. A passed-over question is a silence the Leader
 * owns and ticket 10 counts; this one is Discipler's to take back, so nothing
 * about the relationship-week it belongs to may read as unanswered --
 * `relationship_weeks` drops that week on the strength of this event and nothing
 * else. Which is why every route that stops asking a question because of a Pause
 * comes through here, and there are two of them: the tick that notices mid-week,
 * and a new week displacing the conversation before any tick did.
 */
const withdrawQuestion = (withdrawal: {
  readonly ministryId: MinistryId
  readonly at: Date
  readonly sequenceId: CheckInSequenceId
  readonly relationshipId: RelationshipId
  readonly awaiting: OpenPrompt
  readonly reason: NotAskedAboutBecause
}): Effect =>
  appendHistory({
    ministryId: withdrawal.ministryId,
    occurredAt: withdrawal.at,
    type: 'checkin.question_withdrawn',
    subjectType: 'relationship',
    subjectId: withdrawal.relationshipId,
    payload: {
      sequenceId: withdrawal.sequenceId,
      promptId: withdrawal.awaiting.promptId,
      question: withdrawal.awaiting.question,
      reason: withdrawal.reason,
    },
  })

/**
 * Why a conversation stops asking about a relationship it covers: a Pause stands
 * on it, or it is no longer this Leader's to be asked about (it ended, or they left
 * it). Said on the event, because `relationship_weeks` drops a week only for a
 * Pause: a question taken back because a pairing ended leaves that week as it
 * was, and a group's other Leader answers for its week.
 */
type NotAskedAboutBecause = 'paused' | 'no_longer_led'

const whyNotAskedAbout = (relationship: CheckInRelationship): NotAskedAboutBecause =>
  relationship.paused ? 'paused' : 'no_longer_led'

/**
 * The ladder, minus every relationship a Pause reached before its turn did.
 *
 * `covering` is fixed when the conversation opens, so that a Pause halfway
 * through does not renumber the questions still to come -- which means a Pause
 * taken since is in nobody's list, and every place the conversation moves
 * forward has to step over it. There are three, and together they are the whole
 * of *pausing suppresses that relationship's check-ins*: a reply, a question
 * given up on, and a question a Pause took back. A rule that held only for the
 * question which happened to be open would send the next one a minute later.
 *
 * Nothing is recorded for the ones stepped over. Their turn was never reached,
 * so there is no question to withdraw, and `relationship_weeks` already reads a
 * covered relationship with no prompt as nothing having been asked.
 */
const advancePastPaused = (
  sequence: OpenSequence,
  awaiting: OpenPrompt,
  resolution: CheckInResolution,
): CheckInAdvance => {
  let advance = advanceCheckIn(sequence, awaiting, resolution)

  // `PASSED_OVER` from the position reached, which is what moves the ladder on
  // without recording anything. It always advances, so the walk terminates even
  // where the first step was a follow-up question on the relationship just
  // paused -- a Leader who answered *yes we met* an hour before the Pause is not
  // then asked how it went.
  while (advance.kind === 'ask' && !isAskedAbout(advance.relationship)) {
    advance = advanceCheckIn(sequence, { ...awaiting, position: advance.position }, PASSED_OVER)
  }

  return advance
}

/**
 * *A pause takes back the question that was out*, and wherever the conversation goes
 * next.
 *
 * **One rule, written once.** Ticket 12 settled it as general -- it belongs to the
 * Pause rather than to the route the Pause arrived by -- and two routes reach it: the
 * tick noticing a Pause it was handed, and a keyword applying one this instant. They
 * differ only in what the caller establishes before calling, which is why that is
 * left to the caller and nothing here asks how the Pause happened:
 *
 * - **When.** The tick notices at its next run; a keyword takes the question back
 *   immediately, because the Leader is holding their phone and Discipler must not
 *   ask about a relationship it has just been told to stop asking about.
 * - **Which covering list to walk.** The tick is handed a snapshot that already knows
 *   the relationship is paused. A keyword's snapshot was loaded before the Pause
 *   existed, so its caller patches one that knows -- without which the walk would
 *   step straight back onto the relationship it is stepping over.
 *
 * Withdrawn rather than passed over is `withdrawQuestion`'s, and the walk is
 * `advancePastPaused`'s. What is here is only the shape the two share: take the
 * question back, then either ask the next thing or close a conversation with nothing
 * left in it.
 */
const takeBackTheQuestion = (
  asking: Asking,
  /** The covering list to walk, which must already read the relationship as paused. */
  walking: OpenSequence,
  awaiting: OpenPrompt,
  paused: RelationshipId,
  /** A Pause, unless the caller says the relationship is no longer this Leader's. */
  reason: NotAskedAboutBecause = 'paused',
): readonly Effect[] => {
  const withdrawn = withdrawQuestion({
    ministryId: asking.ministryId,
    at: asking.now,
    sequenceId: asking.sequenceId,
    relationshipId: paused,
    awaiting,
    reason,
  })

  const onward = advancePastPaused(walking, awaiting, PASSED_OVER)

  if (onward.kind === 'finish') {
    return [
      withdrawn,
      ...abandonSequence({
        ministryId: asking.ministryId,
        personId: asking.personId,
        sequenceId: asking.sequenceId,
        at: asking.now,
        reason,
      }),
    ]
  }

  return [withdrawn, ...askNext(asking, onward)]
}

/**
 * What opening one Leader's conversation comes to, wherever the decision to open
 * it was made. Two callers: the cadence dispatcher inside the tick, and
 * `checkin.start`, the direct trigger 08a was built against and which nothing in
 * production routes to.
 *
 * It is the same conversation either way -- the ticket that owns the cadence does
 * not get to own a second kind of check-in -- so the only thing the caller varies
 * is the moment, and whether a cadence is what produced it.
 */
const openConversationWith = (
  checkIn: CheckInSnapshot,
  opening: {
    readonly ministryId: MinistryId
    readonly ministryName: string
    readonly now: Date
    readonly ids: IdSource
    readonly scheduledFor: Date | null
  },
): readonly Effect[] => {
  const { ministryId, ministryName, now, ids, scheduledFor } = opening
  const effects: Effect[] = []

  // Two sequences never run for one Leader at once. The displaced one's
  // unanswered questions stay unanswered rather than being tidied away: they
  // are what ticket 10's Stalled rule reads, and answering them on the
  // Leader's behalf is the one thing that would hide a Leader going quiet.
  //
  // All but one. A question whose relationship was paused while it was out is a
  // question Discipler has stopped asking, and a new week displacing the
  // conversation is not the Leader answering it -- so it is withdrawn here on
  // the way past, exactly as the tick would have withdrawn it. Narrow, and real:
  // an Admin who pauses between the last tick and the cadence hour is the one
  // Admin whose Pause is displaced before any tick notices it, and without this
  // the week Discipler stopped asking about still reads as their Leader's
  // silence -- one week closer to `Stalled` for a question nobody was owed.
  const displaced = checkIn.openSequence
  if (displaced) {
    const awaiting = displaced.awaiting
    const askedAbout = awaiting ? displaced.covering[awaiting.position - 1] : undefined

    if (awaiting && askedAbout && !isAskedAbout(askedAbout)) {
      effects.push(
        withdrawQuestion({
          ministryId,
          at: now,
          sequenceId: displaced.sequenceId,
          relationshipId: askedAbout.relationshipId,
          awaiting,
          reason: whyNotAskedAbout(askedAbout),
        }),
      )
    }

    effects.push(
      ...abandonSequence({
        ministryId,
        personId: checkIn.personId,
        sequenceId: displaced.sequenceId,
        at: now,
        reason: 'displaced',
      }),
    )
  }

  const covering = relationshipsToAskAbout(checkIn.leads)

  // A Participant leads nothing, and a Leader whose every relationship is
  // paused has nothing to be asked about. An empty conversation would be one
  // nobody can finish, and ticket 10 would read its relationship-weeks as
  // unanswered -- so none is opened.
  if (covering.length === 0) return effects

  // Last week's question stops being worth answering the moment this week's
  // conversation opens, and it has to stop *here* rather than at forty-eight hours:
  // the first question below is a scheduled question, and a Leader asked late on
  // Saturday still holds their number when Monday's cadence comes round. Held
  // behind it, the new week would wait on a question the new week has already
  // replaced.
  //
  // After the empty-conversation guard, deliberately. A Leader whose every
  // relationship is paused opens no sequence, so there is no new question to make
  // room for and nothing that would go unanswered by making it.
  effects.push(
    closeOutstandingReply({
      ministryId,
      phone: checkIn.phone,
      as: 'timed_out',
      closing: LAST_WEEKS_QUESTION,
    }),
  )

  const sequenceId = checkInSequenceId(ids.next())
  const asking: Asking = {
    ministryId,
    ministryName,
    sequenceId,
    personId: checkIn.personId,
    phone: checkIn.phone,
    now,
    ids,
    scheduledFor,
  }

  effects.push(
    openCheckInSequence({
      id: sequenceId,
      ministryId,
      personId: checkIn.personId,
      startedAt: now,
      covering: covering.map((each) => each.relationshipId),
    }),
    appendHistory({
      ministryId,
      occurredAt: now,
      type: 'checkin.sequence_opened',
      subjectType: 'person',
      subjectId: checkIn.personId,
      // What this week's conversation covers, recorded at the moment it
      // opened. Ticket 10 counts a relationship-week unanswered when it was
      // covered and no reply arrived -- whether or not its question was ever
      // reached -- so the coverage has to survive the sequence.
      payload: {
        sequenceId,
        relationshipIds: covering.map((each) => each.relationshipId),
      },
    }),
    // Only the first. The sequence advances in response to a reply and never
    // otherwise, so a Leader with three relationships is asked one question
    // and not three.
    ...askWhetherTheyMet(asking, covering[0]!, 1),
  )

  return effects
}

/**
 * What the tick does about a question that has been sitting unanswered.
 *
 * The whole rule, in the order it happens: nothing for a day, then the question
 * again, then nothing for another day, then the conversation moves on without it.
 * After that this Leader has no open question and there is nothing left to chase
 * -- the sequence either has another relationship to ask about or is closed.
 *
 * Called only when the cadence has *not* opened a new conversation this run. A
 * new week abandons the old sequence outright, and chasing a question that no
 * longer belongs to anything would send a Leader last week's question and this
 * week's in the same minute.
 */
const chaseTheOpenQuestion = (
  checkIn: CheckInSnapshot,
  chasing: {
    readonly ministryId: MinistryId
    readonly ministryName: string
    readonly now: Date
    readonly ids: IdSource
  },
): readonly Effect[] => {
  const { ministryId, ministryName, now, ids } = chasing

  const sequence = checkIn.openSequence
  const awaiting = sequence?.awaiting
  if (!sequence || !awaiting) return []

  const relationship = sequence.covering[awaiting.position - 1]
  if (!relationship) return []

  const asking: Asking = {
    ministryId,
    ministryName,
    sequenceId: sequence.sequenceId,
    personId: checkIn.personId,
    phone: checkIn.phone,
    now,
    ids,
    // A lapse produced this, not a cadence. The stamp records which Monday sent a
    // conversation's opening message, and no Monday sent this.
    scheduledFor: null,
  }

  // A Pause taken since this question went out withdraws it, and withdraws it
  // *now* rather than at the next lapse: the reminder is a text to a Leader who
  // has just stepped back, which is the one message a Pause exists to stop.
  //
  // The snapshot this was handed already reads the relationship as paused -- the
  // tick loaded it after the fact -- so `sequence` is walked as it stands.
  //
  // And the same for one that is no longer this Leader's to be asked about: an
  // Admin ended it, or took them out of a group that goes on (Unpair, James
  // 2026-09-21). A reminder about a pairing that is over is the one text an ending
  // must not be followed by.
  if (!isAskedAbout(relationship)) {
    return takeBackTheQuestion(
      asking,
      sequence,
      awaiting,
      relationship.relationshipId,
      whyNotAskedAbout(relationship),
    )
  }

  const lapse = lapseOfOpenQuestion(awaiting, now)
  if (!lapse) return []

  if (lapse === 'remind') {
    return [
      remindCheckInQuestion({ ministryId, promptId: awaiting.promptId, remindedAt: now }),
      appendHistory({
        ministryId,
        occurredAt: now,
        type: 'checkin.question_reminded',
        subjectType: 'relationship',
        subjectId: relationship.relationshipId,
        payload: {
          sequenceId: sequence.sequenceId,
          promptId: awaiting.promptId,
          question: awaiting.question,
        },
      }),
      // The same question, not a new one. No prompt row is created, so nothing
      // downstream can read one silence as two unanswered questions.
      // The same question again, and not a second one -- so it takes nothing. The
      // number is already held by the question this re-sends, and a reminder that
      // waited for it could only ever be released by the timeout that makes it
      // pointless.
      sayToLeader(
        asking,
        bodyOfQuestion(asking, awaiting.question, relationship, false),
        'no_reply',
        'never',
      ),
    ]
  }

  const passedOver = appendHistory({
    ministryId,
    occurredAt: now,
    type: 'checkin.question_passed_over',
    subjectType: 'relationship',
    subjectId: relationship.relationshipId,
    payload: {
      sequenceId: sequence.sequenceId,
      promptId: awaiting.promptId,
      question: awaiting.question,
    },
  })

  const advance = advancePastPaused(sequence, awaiting, PASSED_OVER)

  // The last relationship, given up on. There is nothing left to ask and no
  // thank-you to send: the Leader did not finish this conversation, and thanking
  // them for it would be Discipler telling them they had.
  //
  // `abandoned` rather than `completed`, which is the same distinction a new week
  // displacing a sequence makes -- and for the same reason. Its unanswered
  // questions stay unanswered, because that silence is what ticket 10 reads.
  if (advance.kind === 'finish') {
    return [
      passedOver,
      ...abandonSequence({
        ministryId,
        personId: checkIn.personId,
        sequenceId: sequence.sequenceId,
        at: now,
        reason: 'unanswered',
      }),
    ]
  }

  return [passedOver, ...askNext(asking, advance)]
}

/**
 * The keyword routes, and everything they need in order to speak and to write.
 *
 * One inbound message consults two snapshots, and the split is not arbitrary: the
 * check-in snapshot answers *which question is this Person's conversation waiting
 * on*, and the inbound snapshot answers *what do they hold, and what did they ask
 * for*. A Participant has the second and never the first.
 */
interface Keywording {
  readonly ministryId: MinistryId
  readonly ministryName: string
  readonly personId: PersonId
  readonly phone: string | null
  readonly now: Date
  readonly ids: IdSource
}

/**
 * One text to the Person a keyword arrived from. Nothing a keyword route sends
 * discloses anybody's number: a menu names the people on the other side of a
 * relationship the reader is already in, and the confirmation names the same ones
 * back. `disclosesPersonId` is null on every one of them, so the send-time
 * contact-sharing check has nothing to withhold.
 *
 * No cadence produced any of this, so nothing carries a `scheduledFor`. A keyword
 * reply travels back in seconds.
 */
const sayToSender = (
  keywording: Keywording,
  body: string,
  kind: OutboundMessageKind,
  // Named at every call like `kind`. Only `HELP` carries the rates line, and it
  // always does; nothing else a keyword route answers with composes it.
  ratesLine: RatesLineOccasion,
): Effect =>
  enqueueMessage({
    ministryId: keywording.ministryId,
    personId: keywording.personId,
    toPhone: keywording.phone,
    body,
    enqueuedAt: keywording.now,
    scheduledFor: null,
    disclosesPersonId: null,
    // A keyword route sends two kinds of message: the menu and the confirmation,
    // which are questions, and everything else, which is an answer. Neither ever
    // waits -- see `waitsForAnOpenReply` -- so a Leader who texts `PAUSE` is
    // answered now rather than after the check-in they are trying to pause.
    kind,
    ratesLine,
  })

/** Who a menu line and a confirmation name: the other side, as a sentence. */
const otherSideNamed = (relationship: KeywordRelationship): string =>
  checkInSubject(otherSideOf(relationship, relationship.role))

/**
 * The exchange a Person is holding, closed, because something has happened that
 * ends it. Empty where they hold none, so every route can call it unconditionally
 * rather than each remembering to.
 *
 * Nothing is appended to history for an expiry and nothing is sent. *Expiry raises
 * and changes nothing* -- this closes the row so it stops occupying the one open
 * slot a Person has, and that is the whole of it.
 */
const closeStandingExchange = (
  keywording: Keywording,
  exchange: OpenKeywordExchange | null,
  outcome: KeywordExchangeOutcome,
): readonly Effect[] =>
  exchange
    ? [
        closeKeywordExchange({
          ministryId: keywording.ministryId,
          exchangeId: exchange.exchangeId,
          closedAt: keywording.now,
          // A second keyword replaces the first, but one that had already run out
          // was replaced by nothing -- it was over before this message arrived, and
          // recording it as replaced would date the end of it wrongly.
          outcome: exchangeHasExpired(exchange, keywording.now) ? 'expired' : outcome,
        }),
      ]
    : []

/**
 * A numbered menu, opened and sent. Reached only where more than one relationship
 * is eligible: one applies directly, and none is answered plainly.
 *
 * The options are stored in the order they were printed, which is what makes the
 * numbers mean the same thing when the reply lands tomorrow. A menu re-derived at
 * reply time would renumber itself the moment a fourth relationship was formed.
 */
const openMenu = (
  keywording: Keywording,
  keyword: RelationshipKeyword,
  options: readonly KeywordRelationship[],
): readonly Effect[] => [
  openKeywordExchange({
    id: keywordExchangeId(keywording.ids.next()),
    ministryId: keywording.ministryId,
    personId: keywording.personId,
    keyword,
    options,
    // Nothing is chosen yet, which is the whole reason this menu exists.
    target: null,
    openedAt: keywording.now,
  }),
  sayToSender(
    keywording,
    keywordMenu({
      ministryName: keywording.ministryName,
      keyword,
      options: options.map(otherSideNamed),
    }),
    'keyword_question',
    'never',
  ),
]

/**
 * The `PAUSE` confirmation: target and duration in one message, which is the
 * accidental-tap protection and the only thing standing between a pocket and a
 * fortnight of silence.
 *
 * The default period is the domain's own constant rather than a number written into
 * copy, so the Admin surface and this exchange cannot default differently.
 */
const openPauseConfirmation = (
  keywording: Keywording,
  target: KeywordRelationship,
  options: readonly KeywordRelationship[],
): readonly Effect[] => [
  openKeywordExchange({
    id: keywordExchangeId(keywording.ids.next()),
    ministryId: keywording.ministryId,
    personId: keywording.personId,
    keyword: 'PAUSE',
    options,
    target,
    openedAt: keywording.now,
  }),
  askHowLongToPause(keywording, target),
]

/**
 * *Pause check-ins with Emily for 2 weeks?* -- composed in one place.
 *
 * Two routes reach it: a `PAUSE` resolving straight to one relationship, and a menu
 * answered for a pause, where naming the target is only half the request. Both ask
 * the identical question, so both ask it from here.
 */
const askHowLongToPause = (keywording: Keywording, target: KeywordRelationship): Effect =>
  sayToSender(
    keywording,
    pauseConfirmation({
      ministryName: keywording.ministryName,
      subject: otherSideNamed(target),
      periodWeeks: DEFAULT_PAUSE_PERIOD_WEEKS,
      otherPeriods: [...otherPeriodsThan(DEFAULT_PAUSE_PERIOD_WEEKS)],
    }),
    'keyword_question',
    'never',
  )

/**
 * The keyword route into *a pause takes back the question that was out*.
 *
 * All this establishes is what `takeBackTheQuestion` needs and cannot work out for
 * itself: that the question currently out is about the relationship just paused, and
 * a covering list that knows about a Pause taken a moment ago. The rule itself is
 * shared with the tick and lives there.
 *
 * Empty when the open question is about something else. That relationship's turn
 * has not come round, so there is nothing to withdraw -- `advancePastPaused` steps
 * over it when it does, and `relationship_weeks` already reads a covered
 * relationship with no prompt as nothing having been asked.
 */
const pauseTakesBackTheOpenQuestion = (
  checkIn: CheckInSnapshot,
  paused: RelationshipId,
  keywording: Keywording,
): readonly Effect[] => {
  const sequence = checkIn.openSequence
  const awaiting = sequence?.awaiting
  if (!sequence || !awaiting) return []

  const askedAbout = sequence.covering[awaiting.position - 1]
  if (!askedAbout || askedAbout.relationshipId !== paused) return []

  // The Pause this command has just taken is not in the snapshot the command was
  // handed -- it was loaded before the pause existed -- so the conversation is
  // advanced against a covering list that knows about it. Without this the walk
  // would step straight back onto the relationship it is stepping over.
  const withThePause: OpenSequence = {
    ...sequence,
    covering: sequence.covering.map((each) =>
      each.relationshipId === paused ? { ...each, paused: true } : each,
    ),
  }

  return takeBackTheQuestion(
    {
      ministryId: keywording.ministryId,
      ministryName: keywording.ministryName,
      sequenceId: sequence.sequenceId,
      personId: checkIn.personId,
      phone: keywording.phone,
      now: keywording.now,
      ids: keywording.ids,
      // A keyword produced this, not a cadence. The stamp records which Monday
      // sent a conversation's opening message, and no Monday sent this.
      scheduledFor: null,
    },
    withThePause,
    awaiting,
    paused,
  )
}

/**
 * A Leader's pause, applied.
 *
 * The same fact the Admin route writes and through the same rules -- eligibility
 * has already established that the relationship is accepted, live and not already
 * paused, which is exactly what `relationship.pause` refuses on. What differs is
 * `route`, and `pausedBy` being null: there was no Admin, and putting the Leader's
 * own identifier in a field that means *an Admin account* would be two id spaces in
 * one column waiting to be read as one.
 *
 * **The Participant is told nothing.** Their relationship has not changed, they have
 * never received a check-in, and a message explaining the absence of something they
 * never knew existed is worse than the silence. That is deliberate, and it is why
 * only one message comes out of here.
 */
const applyPause = (
  keywording: Keywording,
  checkIn: CheckInSnapshot,
  target: KeywordRelationship,
  periodWeeks: PausePeriodWeeks,
): readonly Effect[] => [
  appendHistory({
    ministryId: keywording.ministryId,
    occurredAt: keywording.now,
    type: 'relationship.paused',
    subjectType: 'relationship',
    subjectId: target.relationshipId,
    payload: { periodWeeks, pausedBy: null, route: 'keyword' },
  }),
  ...pauseTakesBackTheOpenQuestion(checkIn, target.relationshipId, keywording),
  sayToSender(
    keywording,
    pauseApplied({
      ministryName: keywording.ministryName,
      subject: otherSideNamed(target),
      periodWeeks,
    }),
    'no_reply',
    'never',
  ),
]

/**
 * A Leader's resume, applied immediately.
 *
 * Everyone in the relationship hears that it is running again, which is what
 * *releases the Resume Message* comes to -- including the Leader who asked, so no
 * separate acknowledgement is composed. Two messages saying the same thing to the
 * same phone would be Discipler talking over itself.
 *
 * Nothing here reaches expiry. A relationship resumed early has no standing pause
 * for the tick to find, so no `pause_expired` item is ever raised for it -- which is
 * the rule falling out of the model rather than being enforced by a second check.
 */
const applyResume = (
  keywording: Keywording,
  target: KeywordRelationship,
): readonly Effect[] => {
  const leaders = target.members.filter((member) => member.role === 'leader')
  const participants = target.members.filter((member) => member.role === 'participant')

  return [
    appendHistory({
      ministryId: keywording.ministryId,
      occurredAt: keywording.now,
      type: 'relationship.resumed',
      subjectType: 'relationship',
      subjectId: target.relationshipId,
      payload: {
        resumedBy: null,
        route: 'keyword',
        // A Leader coming back early is the ordinary case for this route, and it is
        // the fact worth keeping: the Week-by-Week History is where the difference
        // between coming back early and acting on an expiry item lives.
        expired: false,
      },
    }),
    // Everyone the Ministry may still text. Somebody who replied `STOP` is
    // deliberately still a member -- opting out ends no relationship -- so they are
    // named in the other side's message and sent none of their own. Composing one
    // for them would be refused by the outbound queue, and the refusal would take
    // the resume down with it.
    ...target.members
      .filter((member) => member.reachable)
      .map((member) =>
      enqueueMessage({
        ministryId: keywording.ministryId,
        personId: member.personId,
        toPhone: member.phone,
        body: resumedMessage({
          ministryName: keywording.ministryName,
          withNames: (member.role === 'leader' ? participants : leaders).map(
            (other) => other.fullName,
          ),
        }),
        enqueuedAt: keywording.now,
        disclosesPersonId: null,
        kind: 'no_reply',
        ratesLine: 'once_a_month',
      }),
    ),
  ]
}

/**
 * A swap request, recorded.
 *
 * **It changes no state.** Nobody moves, nothing ends, and it coexists with
 * `Paused` -- a Leader who stepped back in March and asked for a different
 * Participant in April has said two things, and neither cancels the other. The
 * relationship stays exactly as it was until an Admin decides otherwise, and the
 * item never clears itself.
 *
 * `requestedBy` is the role the asker holds in *this* relationship, because the
 * Admin's next move differs: unpair and re-pair the Participant, or release the
 * Leader from the relationship. A Leader asking is not the same request as the
 * person they disciple asking.
 */
const applySwap = (
  keywording: Keywording,
  target: KeywordRelationship,
): readonly Effect[] => [
  raiseFollowUpItem({
    ministryId: keywording.ministryId,
    kind: 'swap_requested',
    relationshipId: target.relationshipId,
    personId: keywording.personId,
    raisedAt: keywording.now,
    requestedBy: target.role,
  }),
  appendHistory({
    ministryId: keywording.ministryId,
    occurredAt: keywording.now,
    type: 'relationship.swap_requested',
    subjectType: 'relationship',
    subjectId: target.relationshipId,
    // The item dedupes while it stands open and this does not, so how many times a
    // Leader asked survives even though the Admin sees one thing to act on.
    payload: { requestedBy: target.role, personId: keywording.personId },
  }),
  sayToSender(
    keywording,
    swapRecorded({
      ministryName: keywording.ministryName,
      subject: otherSideNamed(target),
    }),
    'no_reply',
    'never',
  ),
]

/**
 * A recognized keyword from somebody who leads nothing, put in front of an Admin.
 *
 * `PAUSE` and `RESUME` are a Leader's to use -- a Participant receives no check-ins,
 * so there is nothing of theirs to suspend -- but dropping the message is the one
 * outcome that clearly fails them. Somebody texting `PAUSE` with no relationship
 * they lead is most often somebody who wants out and has no other route, and this is
 * where they reach a human.
 *
 * The item names the Person and no relationship. Which of theirs they meant is
 * exactly what nobody knows, and guessing it here would be the inference the whole
 * eligibility rule exists to avoid.
 */
const passKeywordToAnAdmin = (
  keywording: Keywording,
  keyword: Keyword,
): readonly Effect[] => [
  raiseFollowUpItem({
    ministryId: keywording.ministryId,
    kind: 'participant_keyword',
    relationshipId: null,
    personId: keywording.personId,
    raisedAt: keywording.now,
    keyword,
  }),
  appendHistory({
    ministryId: keywording.ministryId,
    occurredAt: keywording.now,
    type: 'inbound.keyword_passed_on',
    subjectType: 'person',
    subjectId: keywording.personId,
    payload: { keyword },
  }),
]

/**
 * What a relationship keyword comes to, from the word to the effects.
 *
 * The order is the whole rule: whatever exchange was standing is replaced, then the
 * eligible set is computed for *this* keyword, and then one of three things happens
 * -- apply, ask which, or say there is nothing.
 */
const routeRelationshipKeyword = (
  keyword: RelationshipKeyword,
  keywording: Keywording,
  inbound: InboundSnapshot,
  checkIn: CheckInSnapshot,
): readonly Effect[] => {
  const effects: Effect[] = [
    ...closeStandingExchange(keywording, inbound.exchange, 'replaced'),
  ]

  // Somebody who leads nothing cannot pause or resume anything, and is not told to
  // go away: their text reaches an Admin. `SWAP` is not here, because either side
  // may ask for one -- a Participant asking to be matched with somebody else is the
  // same request a Leader makes, reaching an Admin as a request rather than a state
  // change.
  if (keyword !== 'SWAP' && !leadsAnything(inbound.holds)) {
    return [
      ...effects,
      ...passKeywordToAnAdmin(keywording, keyword),
      sayToSender(
        keywording,
        keywordPassedOn({ ministryName: keywording.ministryName }),
        'no_reply',
        'never',
      ),
    ]
  }

  const eligible = eligibleFor(keyword, inbound.holds)

  // Nothing to act on, said plainly and changing nothing. Not an item: a Leader
  // texting `RESUME` with nothing paused has made a mistake, not raised a concern.
  if (eligible.length === 0) {
    return [
      ...effects,
      sayToSender(
        keywording,
        nothingEligible({ ministryName: keywording.ministryName, keyword }),
        'no_reply',
        'never',
      ),
    ]
  }

  if (eligible.length > 1) return [...effects, ...openMenu(keywording, keyword, eligible)]

  const only = eligible[0]!

  // One eligible relationship applies directly, with no menu -- **except a pause**,
  // which always confirms. The confirmation is not disambiguation, so having nothing
  // to disambiguate does not remove it: it is what stands between a pocket and a
  // fortnight of silence, and a Leader with one relationship has the same pocket.
  if (keyword === 'PAUSE') return [...effects, ...openPauseConfirmation(keywording, only, eligible)]
  if (keyword === 'RESUME') return [...effects, ...applyResume(keywording, only)]
  return [...effects, ...applySwap(keywording, only)]
}

/**
 * A reply inside a live Keyword Exchange, which owns it because it is the most
 * recent thing Discipler asked.
 *
 * The check-in question it may have arrived alongside is left exactly where it was:
 * still unanswered, with its next-day reminder clock still running. That is what
 * *the most recent prompt owns the next reply* costs, and it costs nothing else --
 * the sequence resumes its ordinary handling the moment this exchange is done.
 */
const replyInsideExchange = (
  exchange: OpenKeywordExchange,
  body: string,
  keywording: Keywording,
  checkIn: CheckInSnapshot,
): readonly Effect[] => {
  const reply = readExchangeReply(exchange, body)

  if (reply.kind === 'unreadable') {
    const effects: Effect[] = [
      // Recorded whether or not Discipler answers it, including past the cap. This
      // is the record the enumerated forms grow from -- from what Leaders actually
      // typed, never from what somebody imagined they might.
      appendHistory({
        ministryId: keywording.ministryId,
        occurredAt: keywording.now,
        type: 'keyword.reply_unreadable',
        subjectType: 'person',
        subjectId: keywording.personId,
        payload: {
          exchangeId: exchange.exchangeId,
          keyword: exchange.keyword,
          body,
          clarified: mayClarify(exchange),
        },
      }),
    ]

    // Two, and then Discipler stops talking -- not listening. The exchange stays
    // open and a correct reply nineteen hours later still gets the Leader their
    // pause: they asked for it and never withdrew the request.
    if (mayClarify(exchange)) {
      effects.push(
        clarifyKeywordExchange({
          ministryId: keywording.ministryId,
          exchangeId: exchange.exchangeId,
          clarifiedAt: keywording.now,
        }),
        sayToSender(
          keywording,
          keywordClarification({
            ministryName: keywording.ministryName,
            // The replies the step that is open offered, never the whole set, for
            // the reason the check-in clarification names them one question at a
            // time: offering a menu number at the confirmation would invite an
            // answer to a question already settled.
            options: exchange.target ? null : exchange.options.map(otherSideNamed),
          }),
          // A clarification restates the question already out, exactly as a
          // check-in reminder re-sends rather than re-asks. The exchange is still
          // the thing holding the number.
          'no_reply',
          'never',
        ),
      )
    }

    return effects
  }

  const target = reply.kind === 'select' ? reply.relationship : exchange.target!

  // Readable, so the question this exchange had out is answered and the number is
  // free again -- on every route below, including the two that then ask something
  // else on it. A `RESUME` that left it held would keep this Leader's next check-in
  // waiting on an exchange that finished the moment they replied.
  const numberIsFree = closeOutstandingReply({
    ministryId: keywording.ministryId,
    phone: keywording.phone,
    as: 'answered',
    closing: WHATEVER_WAS_ASKED,
  })

  // The world may have moved while this exchange sat unanswered: an Admin pausing
  // the same relationship, or ending it. Re-checked against the one eligibility rule
  // rather than a second copy of it, so the answer here and the answer that opened
  // the exchange cannot drift.
  if (eligibleFor(exchange.keyword, [target]).length === 0) {
    return [
      numberIsFree,
      ...closeStandingExchange(keywording, exchange, 'overtaken'),
      sayToSender(
        keywording,
        nothingEligible({ ministryName: keywording.ministryName, keyword: exchange.keyword }),
        'no_reply',
        'never',
      ),
    ]
  }

  // A menu answered for a pause is only half the request. The other half -- how long
  // -- is the confirmation, which is a new question and so a fresh clarification
  // budget.
  if (reply.kind === 'select' && exchange.keyword === 'PAUSE') {
    return [
      numberIsFree,
      setKeywordExchangeTarget({
        ministryId: keywording.ministryId,
        exchangeId: exchange.exchangeId,
        relationshipId: target.relationshipId,
        promptedAt: keywording.now,
      }),
      askHowLongToPause(keywording, target),
    ]
  }

  const applied: readonly Effect[] =
    reply.kind === 'confirm'
      ? applyPause(keywording, checkIn, target, reply.periodWeeks)
      : exchange.keyword === 'RESUME'
        ? applyResume(keywording, target)
        : applySwap(keywording, target)

  return [
    numberIsFree,
    ...closeStandingExchange(keywording, exchange, 'applied'),
    ...applied,
  ]
}

/**
 * Which of two outstanding prompts owns the next reply: the exchange, or the
 * check-in question.
 *
 * **The most recent one.** A numbered reply could answer either, and the Leader is
 * answering whichever they were last asked -- which is usually the exchange, because
 * they opened it seconds ago mid-sequence, and is sometimes the check-in question,
 * because a tick re-sent it after the exchange went out.
 *
 * A reminder counts as the check-in question having been asked again, since that is
 * exactly what a reminder is: the same question, put again, and the Leader is
 * looking at it. A clarification inside an exchange does not count, for the mirror
 * reason -- it restates the question already out rather than asking a new one.
 */
const exchangeOwnsTheReply = (
  exchange: OpenKeywordExchange,
  awaiting: OpenPrompt | null,
): boolean =>
  !awaiting ||
  exchange.promptedAt.getTime() >= (awaiting.remindedAt ?? awaiting.askedAt).getTime()

/**
 * What forming a relationship comes to, wherever the decision to form it was made.
 * Two callers: an Admin in the Pair popup, and a plan an import made being settled
 * once both people have completed Intake. It is the same pairing either way -- the
 * same refusals, the same kind and declaration rules, the same invitation to every
 * Discipler -- so the ticket that made imported pairs possible does not get to own
 * a second way of forming one (ADR-0022).
 */
const formRelationship = (
  context: CommandContext,
  forming: {
    readonly ministryId: MinistryId
    readonly leaderIds: readonly PersonId[]
    readonly participantIds: readonly PersonId[]
    readonly declaredGender: Gender | null | undefined
    readonly name: string | null | undefined
    readonly joinRequiresApproval: boolean | undefined
    readonly materialId: MaterialId | undefined
  },
  now: Date,
): { readonly relationship: NewRelationship; readonly effects: Effect[] } => {
  const { leaderIds, participantIds, declaredGender } = forming
  const ministryName = context.ministryName
  const baseUrl = context.appBaseUrl
  if (!ministryName) {
    throw new Error('Forming a relationship was handed no Ministry to speak for')
  }
  if (!baseUrl) {
    throw new Error('Forming a relationship was handed nowhere for its links to point')
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
  // A group says what it is, once, and there is no default to fall back on: a
  // silent *mixed* would be the product deciding a safeguarding question on the
  // Admin's behalf, and a silent binding would bind people to something nobody
  // chose. `undefined` is nobody answered; `null` is somebody answered mixed.
  //
  // Refused here rather than by the form's `required`, for the reason the leader
  // checkboxes drop theirs: the browser cannot know which shape is being formed
  // until the boxes are ticked, and half-enforcing it there would leave the real
  // rule in two places.
  if (
    needsAGenderDeclaration(leaderIds.length, participantIds.length) &&
    declaredGender === undefined
  ) {
    throw new PairingRefused('relationship.needs_a_gender_declaration')
  }
  // A group is called something, because the group Intake link offers it by
  // name and the weekly check-in asks about it by name. A one-to-one has no
  // name: it is called by the two people in it, and a name typed for one is
  // dropped rather than kept -- unlike the declaration above, which binds the
  // same way whatever the shape, a name on a pair would change what the weekly
  // question calls two people.
  const isAGroup = needsAName(leaderIds.length, participantIds.length)
  const name = isAGroup ? readGroupName(forming.name) : null
  if (isAGroup && name === null) {
    throw new PairingRefused('relationship.needs_a_name')
  }
  // The Material chosen on the form, checked against the live list read in this
  // transaction. A removed Material is off that list, so one refusal covers a
  // Material somebody has since removed and one this Ministry never held. Only a
  // relationship formed with one reads the list at all.
  if (forming.materialId !== undefined && !isStillOnTheList(context, forming.materialId)) {
    throw new PairingRefused('relationship.material_is_not_on_the_list')
  }

  const relationship: NewRelationship = {
    id: relationshipId(context.ids.next()),
    ministryId: forming.ministryId,
    // Derived once, from the shape being paired, and frozen. The counts are the
    // fact; the kind is a record of what they were at formation, kept so the
    // participation caps and the gender rule can be expressed in the database.
    kind: kindFor(leaderIds.length, participantIds.length),
    // What the Admin declared, or nothing where nobody was asked. A one-to-one
    // reaching here with a declaration keeps it: it binds identically and
    // weakens nothing, since the absolute match between its two people holds
    // whatever is on the column.
    declaredGender: declaredGender ?? null,
    name,
    // Off unless the Admin said otherwise, and off for a one-to-one whatever
    // was said, since the group link never offers one. The default is a
    // product decision and lives in the ADR, not in a form's initial state.
    joinRequiresApproval: isAGroup && (forming.joinRequiresApproval ?? false),
    // Kept whatever the shape. A name on a pair would change what the weekly
    // question calls two people; a Material binds a one-to-one exactly as it
    // binds a group, which is the reasoning the declaration above carries.
    intendedMaterialId: forming.materialId ?? null,
    createdAt: now,
    members: membersOf(leaderIds, participantIds, now),
  }

  // Creating a relationship does not activate it: `accepted_at` stays null and
  // it reads as awaiting acceptance. Every Leader is invited, and nothing at all
  // reaches a Participant -- they hear nothing until *every* Leader has agreed to
  // lead them, because nobody co-leads something they did not agree to.
  const effects: Effect[] = [
    createRelationship(relationship),
    appendHistory({
      ministryId: forming.ministryId,
      occurredAt: now,
      type: 'relationship.created',
      subjectType: 'relationship',
      subjectId: relationship.id,
      payload: {
        leaderIds: [...leaderIds],
        participantIds: [...participantIds],
        participantCount: participantIds.length,
        name,
        joinRequiresApproval: relationship.joinRequiresApproval,
        // Here as well as on the column. The column is spent at acceptance and
        // cleared; this is history, and is what still says afterwards which
        // Material the Admin chose and that an Admin chose it.
        materialId: relationship.intendedMaterialId,
      },
    }),
  ]

  for (const leaderId of leaderIds) {
    effects.push(...inviteToLead(context, forming.ministryId, relationship.id, leaderId, now))
  }

  return { relationship, effects }
}

/**
 * One Leader's Invitation Link, issued and texted to them. Written once, so a
 * Leader added to a group that already exists is invited by the same link and the
 * same words as one invited when it was formed (Manual pairing, ticket 22).
 */
const inviteToLead = (
  context: CommandContext,
  ministry: MinistryId,
  relationship: RelationshipId,
  leaderId: PersonId,
  now: Date,
): readonly Effect[] => {
  const ministryName = context.ministryName
  if (!ministryName) throw new Error('An invitation was handed no Ministry to speak for')
  const leader = whoIs(context, leaderId)

  // Individualised: one token per Leader, so a co-leader's link is not a way
  // into anybody else's acceptance.
  const invitation = issueInvitation({
    ministryId: ministry,
    relationshipId: relationship,
    personId: leaderId,
    token: invitationToken(context.ids.next()),
    at: now,
  })

  return [
    issueInvitationLink(invitation),
    enqueueMessage({
      ministryId: ministry,
      personId: leaderId,
      toPhone: leader.phone,
      body: invitationMessage({
        ministryName,
        fullName: leader.fullName,
        leaderNoun: theWordFor(context).leaderNoun,
        link: invitationLink(theHost(context), invitation.token),
      }),
      enqueuedAt: now,
      // No message to a Leader contains a phone number.
      disclosesPersonId: null,
      kind: 'no_reply',
      ratesLine: 'never',
    }),
  ]
}

/**
 * A plan the pairing rules refused, closed with its reason, and never silent: the
 * Follow-Up Item is raised on the Disciple, so the Admin who opens it is looking
 * at the person waiting to be discipled, and stands until they pair by hand or
 * let it go. A closed plan is never retried (ADR-0022).
 */
const refuseIntendedPairing = (
  context: CommandContext,
  plan: IntendedPairingSnapshot,
  refusal: PairingRefusal,
  now: Date,
): Effect[] => [
  closeIntendedPairing({
    ministryId: context.ministryId,
    id: plan.id,
    outcome: 'refused',
    closedAt: now,
    relationshipId: null,
    refusal,
  }),
  raiseFollowUpItem({
    ministryId: context.ministryId,
    kind: 'intended_pairing_refused',
    relationshipId: null,
    personId: plan.participant.personId,
    raisedAt: now,
    intendedPairingId: plan.id,
    refusal,
  }),
  appendHistory({
    ministryId: context.ministryId,
    occurredAt: now,
    type: 'intended_pairing.refused',
    subjectType: 'intended_pairing',
    subjectId: plan.id,
    payload: { leaderId: plan.leader.personId, participantId: plan.participant.personId, refusal },
  }),
  appendHistory({
    ministryId: context.ministryId,
    occurredAt: now,
    type: 'follow_up.intended_pairing_refused',
    subjectType: 'person',
    subjectId: plan.participant.personId,
    payload: { intendedPairingId: plan.id, refusal },
  }),
]

/**
 * The *Awaiting acceptance* item, closed by what it was waiting for and not by an
 * Admin: the acceptance that leaves nobody still to answer, or the withdrawal
 * that does. It carries no Admin, because no Admin performed it; the event says
 * what did.
 */
const closedByWhatItWaitedFor = (
  ministry: MinistryId,
  itemId: FollowUpItemId,
  now: Date,
  by: 'acceptance' | 'decline' | 'expiry' | 'withdrawal',
): Effect[] => [
  resolveFollowUpItem({ ministryId: ministry, itemId, resolvedBy: null, resolvedAt: now }),
  appendHistory({
    ministryId: ministry,
    occurredAt: now,
    type: 'follow_up.resolved',
    subjectType: 'follow_up_item',
    subjectId: itemId,
    payload: { resolvedBy: null, by },
  }),
]

/**
 * The Leader's Starter Message, which names nobody and sends them to the page
 * that does. A Leader who just accepted typed a name, not a number: the number
 * was displayed and refused as input, so `phone` is still the one on file.
 */
const starterToLeader = (
  context: CommandContext,
  ministry: MinistryId,
  ministryName: string,
  leader: InvitedMember,
  now: Date,
): Effect =>
  enqueueMessage({
    ministryId: ministry,
    personId: leader.personId,
    toPhone: leader.phone,
    body: starterMessageToLeader({
      ministryName,
      dashboardLink: leaderDashboardLink(theHost(context)),
    }),
    enqueuedAt: now,
    disclosesPersonId: null,
    // *You have been paired* asks nothing, so it takes nobody's number --
    // and a Starter Message that did would block its own relationship's
    // first check-in.
    kind: 'no_reply',
    ratesLine: 'once_a_month',
  })

/**
 * A relationship leaving Awaiting Leader Acceptance: the event, the Material
 * history opening, and the one Starter Message. Said once, because two things
 * bring it about and they must not come to differ: the last Leader accepting, and
 * a Leader's invitation being withdrawn where every Leader left has accepted
 * (Manual pairing, recut ticket 06). `leaders` is who leads it from this instant.
 */
const activationOf = (
  context: CommandContext,
  {
    ministryId: ministry,
    ministryName,
    invitation,
    leaders,
    participants,
    now,
  }: {
    readonly ministryId: MinistryId
    readonly ministryName: string
    readonly invitation: InvitationSnapshot
    readonly leaders: readonly InvitedMember[]
    readonly participants: readonly InvitedMember[]
    readonly now: Date
  },
): Effect[] => {
  const effects: Effect[] = []

  // The Material an Admin chose while pairing, and whether it is still on the
  // Ministry's list as this activation decides. The column holding it is
  // cleared at activation either way, so the event below is the one record of
  // what became of the choice -- and the only one at all where it was skipped,
  // since a skip writes no period.
  const intended = invitation.intendedMaterialId
  const assignsIntended = intended !== null && isStillOnTheList(context, intended)

  effects.push(
    appendHistory({
      ministryId: ministry,
      occurredAt: now,
      type: 'relationship.activated',
      subjectType: 'relationship',
      subjectId: invitation.relationshipId,
      payload: {
        participantCount: participants.length,
        ...(intended !== null
          ? {
              intendedMaterial: {
                materialId: intended,
                outcome: assignsIntended ? 'assigned' : 'skipped_as_removed',
              },
            }
          : {}),
      },
    }),
    // The Material history opens here, with a period that has no Material in
    // it. *Periods never leave gaps* includes the time before a Ministry has
    // assigned anything, and a row saying *none* is a fact a later report can
    // answer with -- where no row at all is indistinguishable from a defect,
    // in exactly the history this ticket exists because nobody can
    // reconstruct.
    //
    // At activation rather than at creation, and at this instant rather than
    // `createdAt`: no check-in week exists before every Leader has agreed, so
    // a period covering time no meeting could be reported in is noise. It
    // carries no Admin, because no Admin performed it.
    assignMaterial({
      ministryId: ministry,
      relationshipId: invitation.relationshipId,
      materialId: null,
      assignedAt: now,
      assignedBy: null,
    }),
  )

  // The Material an Admin chose while pairing, spent here. A second period at
  // this same instant, after the opening one, which must stay first: the
  // opening period closes at its own start, covers nothing and leaves no gap,
  // which is the zero-length period the Material history permits by name.
  //
  // Not `relationship.assign_material`, which is an Admin's act, carries that
  // Admin and refuses an unaccepted relationship. No Admin performed this one;
  // the Admin who chose it is on the `relationship.created` event.
  //
  // A Material removed since pairing is skipped and nothing is refused.
  // Acceptance is a Leader's act and never fails on an Admin's stale choice.
  if (intended !== null && assignsIntended) {
    effects.push(
      assignMaterial({
        ministryId: ministry,
        relationshipId: invitation.relationshipId,
        materialId: intended,
        assignedAt: now,
        assignedBy: null,
      }),
    )
  }

  // **No link for a Participant, and there is nothing for one to do.** An
  // Invitation Link is how somebody is asked a question they have not yet
  // answered, and a Participant has already answered theirs: they completed
  // Intake and consented to be paired, which is the agreement a Leader's
  // acceptance is the other half of. Only the Leader is sent one.
  //
  // So a Participant does not decline. A match that is not working is a
  // pastoral matter and reaches Discipler as a swap -- the Admin unpairs and
  // re-pairs -- rather than as a Participant refusing the relationship on a
  // web page. Somebody who stops meeting or stops replying says so by the
  // silence the care rules already read, and an Admin acts on that.

  // The Starter Message. The Participants' names the Leaders, the Leaders'
  // names nobody, and neither carries a number -- so this message discloses
  // nobody and one goes to each Participant however many Leaders a group has.
  const leaderNames = leaders.map((leader) => leader.fullName)

  for (const leader of leaders) {
    effects.push(starterToLeader(context, ministry, ministryName, leader, now))
  }

  for (const participant of participants) {
    effects.push(
      enqueueMessage({
        ministryId: ministry,
        personId: participant.personId,
        toPhone: participant.phone,
        body: starterMessageToParticipant({ ministryName, leaderNames }),
        enqueuedAt: now,
        disclosesPersonId: null,
        kind: 'no_reply',
        ratesLine: 'once_a_month',
      }),
    )
  }

  return effects
}

/**
 * One invitation ended without being accepted, by its Leader declining or by its
 * fortnight running out (Manual pairing, recut ticket 06; decided by James on
 * 2026-09-21). The same act either way, and only the item that tells the Admin
 * differs.
 *
 * Nobody is sent anything by it: not the Person, not the relationship's other
 * Leaders, not its Participants. On a relationship already running nothing else
 * about it changes. The one message there can be is the Starter Message, where
 * this is what activates a relationship nobody had activated.
 */
/** The event each way of withdrawing an invitation is recorded as. */
const WITHDRAWN_AS_AN_EVENT: Record<WithdrawnAs, string> = {
  declined: 'relationship.leader_declined',
  expired: 'relationship.invitation_expired',
  withdrawn: 'relationship.invitation_withdrawn',
}

/** What an *Awaiting acceptance* item closed by a withdrawal says closed it. */
const WITHDRAWN_AS_WHAT_CLOSED_IT: Record<WithdrawnAs, 'decline' | 'expiry' | 'withdrawal'> = {
  declined: 'decline',
  expired: 'expiry',
  withdrawn: 'withdrawal',
}

const withdrawalOf = (
  context: CommandContext,
  command: { readonly ministryId: MinistryId; readonly token: InvitationToken },
  {
    me,
    withdrawnAs,
    now,
    withdrawnBy = null,
  }: {
    readonly me: InvitedMember
    readonly withdrawnAs: WithdrawnAs
    readonly now: Date
    /** The Admin who took it back, where one did. Nobody, for a decline and for the two weeks. */
    readonly withdrawnBy?: string | null
  },
): Effect[] => {
  const { invitation, ministryName } = tokenContext(context)

  const remaining = invitation.members.filter(
    (member) => member.role === 'leader' && member.personId !== me.personId,
  )
  const participants = invitation.members.filter((member) => member.role === 'participant')
  const everyoneLeftHasAccepted = remaining.every((leader) => leader.acceptedAt !== null)

  // Activation is every Leader it has agreeing, and it has to have one. Where
  // this was its only Leader it is left with none and stays as it is, for an
  // Admin to cancel or pair again: it does not cancel itself.
  const activatesRelationship =
    invitation.relationshipAcceptedAt === null && remaining.length > 0 && everyoneLeftHasAccepted

  // Whether anybody is still to answer. A relationship nobody has activated goes
  // on waiting until it activates, with or without a Leader; one already running
  // waits only on the Leaders added since.
  const nobodyIsLeftToAnswer =
    invitation.relationshipAcceptedAt === null ? activatesRelationship : everyoneLeftHasAccepted

  const effects: Effect[] = [
    withdrawInvitation({
      ministryId: command.ministryId,
      relationshipId: invitation.relationshipId,
      personId: me.personId,
      token: command.token,
      withdrawnAt: now,
      withdrawnAs,
      activatesRelationship,
    }),
    // An event of its own type each way. No Admin is on a decline or on the two
    // weeks, because none performed them; the one who took an invitation back is
    // on theirs, and history is the record of that which survives them leaving.
    appendHistory({
      ministryId: command.ministryId,
      occurredAt: now,
      type: WITHDRAWN_AS_AN_EVENT[withdrawnAs],
      subjectType: 'relationship',
      subjectId: invitation.relationshipId,
      payload: {
        personId: me.personId,
        activated: activatesRelationship,
        ...(withdrawnAs === 'withdrawn' ? { withdrawnBy } : {}),
      },
    }),
  ]

  // How the Admin is told, and the only way: about the Person, on the
  // relationship, so their page and another invitation are one press away. Not
  // where an Admin took it back: the one who would be told is the one who did it.
  if (withdrawnAs !== 'withdrawn') {
    effects.push(
      raiseFollowUpItem({
        ministryId: command.ministryId,
        kind: withdrawnAs === 'declined' ? 'match_declined' : 'invitation_expired',
        personId: me.personId,
        relationshipId: invitation.relationshipId,
        raisedAt: now,
      }),
    )
  }

  // The *Awaiting acceptance* item about the same relationship, closed by the
  // same act where nobody is left to answer, so the Admin has one thing to read
  // and not two. Exactly as an acceptance closes it, and with no Admin on it.
  // Left open where the relationship still waits: it is what offers Cancel.
  if (nobodyIsLeftToAnswer && invitation.unansweredItemId !== null) {
    effects.push(
      ...closedByWhatItWaitedFor(
        command.ministryId,
        invitation.unansweredItemId,
        now,
        WITHDRAWN_AS_WHAT_CLOSED_IT[withdrawnAs],
      ),
    )
  }

  if (activatesRelationship) {
    effects.push(
      ...activationOf(context, {
        ministryId: command.ministryId,
        ministryName,
        invitation,
        leaders: remaining,
        participants,
        now,
      }),
    )
  }

  return effects
}

export const handleCommand = (command: Command, context: CommandContext): CommandResult => {
  switch (command.type) {
    case 'scheduled.tick': {
      // The tick is a command like any other: it enters through this boundary, it
      // reads the injected clock, and it returns effects. It never reads system
      // time, which is the only reason a fortnight of waiting can be tested in a
      // few milliseconds.
      //
      // It carries the Acceptance thresholds, the cadence, the twenty-four hour
      // sequence timeout, the next-day reminder, and Pause expiry. Every one of
      // them reads the same clock, because two schedulers would be two answers to
      // *what time is it*.
      const { unaccepted, checkInsDue, paused, ministryName, appBaseUrl } = context
      if (!unaccepted) throw new Error('scheduled.tick was handed no state to evaluate')
      if (!checkInsDue) throw new Error('scheduled.tick was handed nobody to check in with')
      if (!paused) throw new Error('scheduled.tick was handed no pauses to evaluate')
      if (!ministryName) throw new Error('scheduled.tick was handed no Ministry to speak for')
      if (!appBaseUrl) {
        throw new Error('scheduled.tick was handed nowhere for its links to point')
      }

      const now = context.clock.now()
      const effects: Effect[] = []

      // Every number still holding a conversation nobody can change any more. It
      // runs first, and before the cadence below, so that a question whose
      // forty-eight hours ran out overnight is not still holding the number when
      // this week's is composed.
      effects.push(
        sweepOutstandingReplies({
          ministryId: command.ministryId,
          cutoffs: outstandingReplyCutoffs(now),
        }),
      )

      // The check-in cadence. This is what makes a Leader due -- the direct
      // trigger 08a was built against is now the Admin's *send one additional
      // check-in* and nothing else.
      //
      // Safe to run as often as the scheduler likes, and safe to miss: a Leader
      // is due at most once per ISO week and stays due for the rest of the week
      // once their hour has passed, so an hourly tick asks once and a tick that
      // never ran on Monday evening asks on Tuesday rather than skipping a week.
      for (const leader of checkInsDue) {
        const due = checkInDueThisWeek(leader, now)

        if (due) {
          effects.push(
            ...openConversationWith(leader, {
              ministryId: command.ministryId,
              ministryName,
              now,
              ids: context.ids,
              // The cadence as it was read at this moment, stamped on the message.
              // Not `now`: the two differ by however long the tick took to reach
              // this Leader, and it is the cadence that has to be recoverable from
              // the row -- that is what makes an edit demonstrably future-only.
              scheduledFor: due,
            }),
          )
          // A new week has just abandoned whatever was open and asked its first
          // question. There is nothing of last week's left to chase.
          continue
        }

        // Mid-week, with a question already out. The reminder and the giving-up
        // live here rather than in their own tick because they are the same
        // clock the cadence is read against, and two schedulers would be two
        // answers to *what time is it*.
        effects.push(
          ...chaseTheOpenQuestion(leader, {
            ministryId: command.ministryId,
            ministryName,
            now,
            ids: context.ids,
          }),
        )
      }

      for (const relationship of unaccepted) {
        // One clock per relationship, not one per Leader: from formation while
        // nobody has activated it, and from when a Leader was added for one that
        // was already running. Which of the two is the read's to say.
        const waited = now.getTime() - relationship.waitingSince.getTime()

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
                  link: invitationLink(appBaseUrl, leader.token),
                }),
                enqueuedAt: now,
                // No message to a Leader contains a phone number.
                disclosesPersonId: null,
                kind: 'no_reply',
                ratesLine: 'never',
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

        // It stops being the Leader's to solve and becomes the Admin's. One open
        // item at a time: raising it again on days six and seven would tell the
        // Admin nothing they are not already looking at, and the history event
        // beside it would become a row a day for a condition nobody had acted on.
        // The partial unique index refuses the second open row regardless.
        //
        // Once the Admin resolves it and the relationship is *still* unaccepted,
        // the condition is true again and is raised again. Resolving records that
        // an Admin acted; it does not make a Leader agree.
        //
        // Not for a Leader added to a relationship already running, *so the Admin
        // does not get spammed with non-essential things* (James, 2026-09-21):
        // they are told once, when the invitation is withdrawn at two weeks.
        if (
          waited >= days(ACCEPTANCE_ESCALATION_DAYS) &&
          !relationship.itemStandsOpen &&
          !relationship.alreadyRunning
        ) {
          effects.push(
            raiseFollowUpItem({
              ministryId: command.ministryId,
              kind: 'relationship_unaccepted',
              relationshipId: relationship.relationshipId,
              // The condition is the relationship's, not any one Leader's: a group
              // waiting on two of them is one thing for an Admin to act on.
              personId: null,
              raisedAt: now,
            },
            // Written with the item or not at all: the store looks again before it
            // raises this one, and a Leader who accepted since this read is not
            // recorded as unanswered a moment after they are recorded as accepting.
            {
              ministryId: command.ministryId,
              occurredAt: now,
              type: 'follow_up.relationship_unaccepted',
              subjectType: 'relationship',
              subjectId: relationship.relationshipId,
              // How long it had waited when it was raised. What the Admin is shown
              // is read live off `created_at`, because this number is true of the
              // moment it was written and stops being true the next day.
              payload: { waitedDays: daysSince(relationship.waitingSince, now) },
            },
          ),
          )
        }
      }

      // A Pause running out. **It resumes nothing.** It changes no state, sends
      // nothing, and raises an item saying which period was selected, that it has
      // run out, and that the relationship has not resumed -- because nobody's
      // check-ins should restart on a date they have forgotten. The relationship
      // stays `Paused` until an Admin resumes or ends it.
      //
      // Which is why this is not a state and not a care condition derived from
      // check-in history. Like a Concern it sits beside the relationship,
      // coexists with any state including `Paused`, and clears only when an Admin
      // resolves it.
      for (const pause of paused) {
        if (!pauseHasExpired(pause, now)) continue
        // One open item at a time. Raising it again tomorrow would tell the Admin
        // nothing they are not already looking at, and the history event beside it
        // would become a row a day for a condition nobody had acted on.
        if (pause.itemStandsOpen) continue

        effects.push(
          raiseFollowUpItem({
            ministryId: command.ministryId,
            kind: 'pause_expired',
            relationshipId: pause.relationshipId,
            // The condition is the relationship's. A group whose Pause has run out
            // is one thing for an Admin to act on, not one per Leader in it.
            personId: null,
            // The period is carried because the Admin is being asked to review a
            // decision somebody made, and *a fortnight has run out* and *a summer
            // has run out* are different reviews.
            periodWeeks: pause.periodWeeks,
            raisedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'follow_up.pause_expired',
            subjectType: 'relationship',
            subjectId: pause.relationshipId,
            payload: {
              periodWeeks: pause.periodWeeks,
              // When it ran out, which is not when this ran: a tick that fires
              // hourly raises this on the first run after the instant, and a
              // Ministry whose scheduler was down for a day raises it late.
              expiredAt: pauseExpiresAt(pause).toISOString(),
            },
          }),
        )
      }

      return { effects, rejections: [] }
    }

    case 'checkin.start': {
      const { checkIn, ministryName } = context
      if (!checkIn) throw new Error('checkin.start was handed nobody to check in with')
      if (!ministryName) {
        throw new Error('checkin.start was handed no Ministry to speak for')
      }

      // The direct trigger. It asks *now* and does not consult the cadence,
      // which is what lets 08a prove the conversation with no scheduler near it.
      // In production `scheduled.tick` is the only thing that opens one -- and
      // nothing scheduled this one, so its message carries no stamp.
      return {
        effects: openConversationWith(checkIn, {
          ministryId: command.ministryId,
          ministryName,
          now: context.clock.now(),
          ids: context.ids,
          scheduledFor: null,
        }),
        rejections: [],
      }
    }

    case 'sms.inbound': {
      const { checkIn, inbound, ministryName } = context
      if (!checkIn) throw new Error('sms.inbound was handed nobody it could be from')
      if (!inbound) {
        throw new Error('sms.inbound was handed nothing about what its sender holds')
      }
      if (!ministryName) {
        throw new Error('sms.inbound was handed no Ministry to speak for')
      }

      const now = context.clock.now()

      const keywording: Keywording = {
        ministryId: command.ministryId,
        ministryName,
        personId: checkIn.personId,
        phone: checkIn.phone,
        now,
        ids: context.ids,
      }

      // Keywords are read before a reply is interpreted as anything else. A `STOP`
      // arriving while the satisfaction question is open is somebody asking to be
      // left alone, and reading it as an unreadable rating would keep texting them
      // -- and a `PAUSE` arriving during the Concern detail step is a request to
      // step back, not the text of somebody's hardest week. The Concern and its
      // badge are already recorded by then, so nothing is lost by treating it as
      // the keyword it plainly is; the detail request ages out normally.
      const keyword = readKeyword(command.body)

      // The carrier opt-out. It opts the Person out and not one of their
      // relationships: that is the level a carrier applies it at, and it is what
      // stops every message rather than the ones about one relationship.
      //
      // Any open conversation ends with it, as abandoned. Not a second rule: a
      // Person Discipler may no longer text has no conversation left to have, and
      // leaving one open would mean the next question it tried to send was refused
      // by the outbound queue -- a reply from them failing outright rather than
      // being heard. Abandoned rather than completed, because its unanswered
      // questions stay unanswered: they are what ticket 10 reads, and an opt-out is
      // not an answer. An open Keyword Exchange goes the same way, and for the same
      // reason: it has nothing left to say to them.
      if (keyword === 'STOP') {
        const effects: Effect[] = [
          optPersonOut({
            ministryId: command.ministryId,
            personId: checkIn.personId,
            startedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.opted_out',
            subjectType: 'person',
            subjectId: checkIn.personId,
            payload: { keyword: 'STOP' },
          }),
          ...closeStandingExchange(keywording, inbound.exchange, 'replaced'),
        ]

        if (checkIn.openSequence) {
          effects.push(
            ...abandonSequence({
              ministryId: command.ministryId,
              personId: checkIn.personId,
              sequenceId: checkIn.openSequence.sequenceId,
              at: now,
              reason: 'opted_out',
            }),
          )
        }

        return { effects, rejections: [] }
      }

      // The carrier-level re-opt-in, and **nothing else**. It restores permission to
      // be texted; it resumes no relationship, releases no Resume Message, and
      // reaches nobody but the Person who sent it. A `START` that resumed a
      // relationship would tell third parties they were meeting again as a side
      // effect of somebody fixing their own opt-out.
      //
      // Nothing is sent back. The carrier answers `START` itself, before this
      // webhook is consulted, and a second confirmation from the Ministry would be
      // Discipler talking over the network it depends on.
      //
      // From somebody who never opted out it is a word with nothing to reverse, so
      // it changes nothing rather than writing a re-opt-in nobody asked for.
      if (keyword === 'START') {
        return {
          rejections: [],
          effects: inbound.optedOut
            ? [
                optPersonIn({
                  ministryId: command.ministryId,
                  personId: checkIn.personId,
                  endedAt: now,
                }),
                appendHistory({
                  ministryId: command.ministryId,
                  occurredAt: now,
                  type: 'person.opted_in',
                  subjectType: 'person',
                  subjectId: checkIn.personId,
                  payload: { keyword: 'START' },
                }),
              ]
            : [],
        }
      }

      // **Discipler may not text everybody who can text Discipler.** A text arrives
      // with no session and no consent test in front of it -- `app.sender_of_inbound`
      // resolves any Person by their number -- so this webhook is reachable by
      // somebody with a standing opt-out and by somebody imported onto the Roster who
      // never completed Intake. The outbound queue refuses a message to either at the
      // floor, and the whole command is one transaction: a reply composed for them
      // would abort it, their message would fail outright rather than reach nobody
      // quietly, and the delivery vendor would retry the identical failure.
      //
      // Nothing is lost by stopping here. `STOP` and `START` above are the two things
      // such a Person can say that Discipler can act on, and both send nothing; every
      // route below needs an answer it is not allowed to give -- a menu nobody would
      // receive, a confirmation that could never be confirmed, an acknowledgement to
      // somebody who asked not to be acknowledged.
      if (!inbound.mayBeTexted) return { effects: [], rejections: [] }

      // `HELP` answers itself and changes nothing, so it replaces no exchange and
      // withdraws no question -- a Leader who asks what the words are in the middle
      // of choosing a relationship has not abandoned the choosing.
      //
      // From somebody who leads nothing it also reaches an Admin. A Participant
      // asking for help is asking a human for something, and the words Discipler can
      // send back are not it.
      if (keyword === 'HELP') {
        return {
          rejections: [],
          effects: [
            sayToSender(keywording, helpMessage({ ministryName }), 'no_reply', 'always'),
            ...(leadsAnything(inbound.holds)
              ? []
              : passKeywordToAnAdmin(keywording, keyword)),
          ],
        }
      }

      if (keyword) {
        return {
          rejections: [],
          effects: routeRelationshipKeyword(keyword, keywording, inbound, checkIn),
        }
      }

      // Not a keyword, so it is an answer to whatever was last asked. **The most
      // recent prompt owns it**: an exchange opened mid-sequence takes the reply,
      // and the check-in question stays unanswered with its reminder clock still
      // running.
      //
      // An exchange whose twenty-four hours have run out owns nothing. It is closed
      // here rather than by a scheduled sweep, because expiry raises nothing and
      // changes nothing -- there is no condition for anybody to be told about, only
      // a row that should stop occupying this Person's one open slot.
      if (exchangeIsLive(inbound.exchange, now)) {
        if (exchangeOwnsTheReply(inbound.exchange, checkIn.openSequence?.awaiting ?? null)) {
          return {
            rejections: [],
            effects: replyInsideExchange(inbound.exchange, command.body, keywording, checkIn),
          }
        }
      }

      const expired = inbound.exchange && exchangeHasExpired(inbound.exchange, now)
      const tidied: readonly Effect[] = expired
        ? closeStandingExchange(keywording, inbound.exchange, 'expired')
        : []

      // Resolution stops here when there is no open conversation. Nothing falls
      // back to *the Person's relationship*: a Leader may hold several, and the
      // position in the sequence is the only thing that says which one a `1` is
      // about.
      //
      // **No inbound message falls through to silence.** A Participant has no
      // dashboard and no account, so texting back is the only channel they have, and
      // a message that reached nobody and was answered by nobody is the one outcome
      // that clearly fails them. It raises nothing -- an item for every *thanks!*
      // would bury the Care Needed view and train an Admin to ignore it -- and it is
      // rate-limited, so a Participant in a back-and-forth with their Leader is not
      // auto-replied to on every message.
      //
      // A Leader with no open question is answered the same way, though the spec
      // names only a Participant. The rule it is under is *no inbound message falls
      // through to silence*, and a Leader texting their Ministry's number is as
      // unheard as anybody else.
      const sequence = checkIn.openSequence
      const awaiting = sequence?.awaiting
      if (!sequence || !awaiting) {
        return {
          rejections: [],
          effects: mayAcknowledge(inbound.lastAcknowledgedAt, now)
            ? [
                ...tidied,
                sayToSender(keywording, acknowledgedMessage({ ministryName }), 'no_reply', 'never'),
                appendHistory({
                  ministryId: command.ministryId,
                  occurredAt: now,
                  type: 'inbound.acknowledged',
                  subjectType: 'person',
                  subjectId: checkIn.personId,
                  // **The message itself is deliberately absent.** All this event
                  // is for is the rate limit, which needs an instant and nothing
                  // else -- and what a congregant texts a number that cannot
                  // answer them is as likely to be *my dad is in hospital* as
                  // *thanks!*. `ministry_event` is append-only, so prose written
                  // here could never be cleared, which is exactly what
                  // `concern.raised` refuses to write for the same reason.
                  payload: {},
                }),
              ]
            : [...tidied],
        }
      }

      const reply = readCheckInReply(awaiting.question, command.body)
      const answered = sequence.covering[awaiting.position - 1]

      const asking: Asking = {
        ministryId: command.ministryId,
        ministryName,
        sequenceId: sequence.sequenceId,
        personId: checkIn.personId,
        phone: checkIn.phone,
        now,
        ids: context.ids,
        // A reply is what produced this, not a cadence. Only the message that
        // opens a conversation carries the cadence that made it due; the rest of
        // the thread travels back in seconds and nothing scheduled any of it.
        scheduledFor: null,
      }

      // A reply that resolves to no token, or to two. The question stays open and
      // the conversation stays exactly where it was: nothing is recorded as
      // answered, because a guess here is the one failure the whole matching rule
      // exists to prevent.
      if (reply.kind === 'unreadable') {
        const clarifying = awaiting.clarificationsSent < CLARIFICATIONS_PER_QUESTION

        const effects: Effect[] = [
          ...tidied,
          // Recorded whether or not it is answered, including the ones past the
          // cap. This is the record the enumerated list of synonyms and typos
          // grows from -- from what Leaders actually typed, never from what
          // somebody imagined they might.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'checkin.reply_unreadable',
            subjectType: 'relationship',
            subjectId: answered?.relationshipId ?? null,
            payload: {
              sequenceId: sequence.sequenceId,
              promptId: awaiting.promptId,
              personId: checkIn.personId,
              question: awaiting.question,
              body: command.body,
              clarified: clarifying,
            },
          }),
        ]

        // Two, and then Discipler stops talking -- not listening. The question is
        // still open, and a valid reply is still accepted right up until the
        // sequence advances past it. Only Discipler's side is capped.
        if (clarifying) {
          effects.push(
            clarifyCheckInQuestion({
              ministryId: command.ministryId,
              promptId: awaiting.promptId,
              clarifiedAt: now,
            }),
            sayToLeader(
              asking,
              checkInClarification({ ministryName, question: awaiting.question }),
              // The valid replies to the question already out, said again. It asks
              // nothing new, so the question it restates keeps the number.
              'no_reply',
              'never',
            ),
          )
        }

        return { effects, rejections: [] }
      }

      const effects: Effect[] = [
        ...tidied,
        // The reply arrived, so the number is free -- and it has to be freed here
        // rather than at the timeout, because the very next thing this command does
        // is ask the next question on the same number. Left open, a conversation
        // would advance one question every forty-eight hours.
        closeOutstandingReply({
          ministryId: command.ministryId,
          phone: checkIn.phone,
          as: 'answered',
          closing: WHATEVER_WAS_ASKED,
        }),
        recordCheckInAnswer({
          ministryId: command.ministryId,
          promptId: awaiting.promptId,
          // The Person who sent it, never the relationship alone. A relationship
          // is not assumed to have one respondent, which is what lets Participant
          // check-ins be added without migrating what a Leader already answered.
          personId: checkIn.personId,
          answeredAt: now,
          ...recorded(reply),
        }),
        appendHistory({
          ministryId: command.ministryId,
          occurredAt: now,
          type: 'checkin.answered',
          subjectType: 'relationship',
          subjectId: answered?.relationshipId ?? null,
          payload: {
            sequenceId: sequence.sequenceId,
            personId: checkIn.personId,
            role: answered?.role ?? null,
            question: awaiting.question,
            ...withoutTheProse(reply),
          },
        }),
      ]

      // The Leader's words become a Concern of their own. Not the same record as
      // the reply they arrived in: this one is reached one Person at a time,
      // audited when it is *read*, cleared when it is resolved, and counted when
      // several stand open -- none of which the prompt row is or does. It carries
      // that row's id so the resolution can clear both copies at once.
      if (reply.kind === 'concern_detail' && answered) {
        effects.push(
          raiseConcern({
            id: concernId(context.ids.next()),
            ministryId: command.ministryId,
            relationshipId: answered.relationshipId,
            raisedBy: checkIn.personId,
            raisedAt: now,
            promptId: awaiting.promptId,
            detail: reply.detail,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'concern.raised',
            subjectType: 'relationship',
            subjectId: answered.relationshipId,
            // The prose is deliberately absent. History is append-only, so a
            // payload carrying the text would survive the resolution that cleared
            // it -- which would make clear-on-resolve a gesture rather than a rule.
            payload: { sequenceId: sequence.sequenceId, raisedBy: checkIn.personId },
          }),
        )
      }

      const advance = advancePastPaused(sequence, awaiting, reply)

      if (advance.kind === 'finish') {
        effects.push(
          sayToLeader(asking, checkInThankYou({ ministryName }), 'no_reply', 'never'),
          closeCheckInSequence({
            ministryId: command.ministryId,
            sequenceId: sequence.sequenceId,
            closedAt: now,
            outcome: 'completed',
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'checkin.sequence_completed',
            subjectType: 'person',
            subjectId: checkIn.personId,
            payload: { sequenceId: sequence.sequenceId },
          }),
        )
        return { effects, rejections: [] }
      }

      // Whatever the ladder said comes next: the rest of this relationship's
      // turn, or the next relationship's opening question sent where a closing
      // thank-you would otherwise have fallen.
      effects.push(...askNext(asking, advance))

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

      const memberIds = relationship.members.map((member) => member.personId)

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
            cancelledBy: command.cancelledBy,
            memberIds,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.cancelled',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: {
              memberIds,
              waitedDays: daysSince(relationship.createdAt, now),
              // Append-only, so this is the record that survives the Admin
              // leaving the Ministry and `ended_by` being nulled with them.
              cancelledBy: command.cancelledBy,
            },
          }),
        ],
      }
    }

    case 'relationship.end': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.end was handed no relationship to act on')
      }

      const now = context.clock.now()

      // Terminal, and the first thing checked. A second ending would overwrite the
      // outcome and the reason the first one recorded, which is the one part of an
      // ending that cannot be reconstructed afterwards.
      if (relationship.endedAt !== null) throw new EndingRefused('ending.already_ended')
      // Nobody agreed to it, so it never ran and cannot have completed. Withdrawing
      // one is `relationship.cancel`, and letting this command do both would put an
      // outcome on a relationship that never had one.
      if (relationship.acceptedAt === null) {
        throw new EndingRefused('ending.relationship_not_accepted')
      }

      const reason = command.reason.trim()
      // Both checked rather than trusted, for the reason the pause period is: this
      // command is built from a request body. The database refuses each of these
      // too -- a check constraint on the reason, an enum on the outcome -- and
      // hitting either of those is a Postgres error where a surface needs a code.
      if (reason.length === 0) throw new EndingRefused('ending.reason_is_required')
      if (!isRelationshipOutcome(command.outcome)) {
        throw new EndingRefused('ending.outcome_not_recognised')
      }

      const memberIds = relationship.members.map((member) => member.personId)

      // Nobody is told. No Admin action sends a message, and an Admin who wants to
      // say something to the people in a relationship they have just ended picks up
      // the phone -- which is the whole of Discipler's position on admin sending.
      //
      // A Pause standing on it is not resumed first and is not cleared. `Ended`
      // outranks `Paused` in the derivation, and ending is the decision the Pause
      // existed to defer.
      return {
        rejections: [],
        effects: [
          endRelationship({
            ministryId: command.ministryId,
            relationshipId: relationship.relationshipId,
            endedAt: now,
            endedBy: command.endedBy,
            reason,
            outcome: command.outcome,
            memberIds,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.ended',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: {
              memberIds,
              reason,
              outcome: command.outcome,
              // Append-only, so this is the record that survives the Admin leaving
              // the Ministry and `ended_by` being nulled with them.
              endedBy: command.endedBy,
              // How long it ran is deliberately absent. It is `accepted_at` to
              // `ended_at`, both of them stored, and a third copy of the same
              // number is a second answer waiting to disagree with them.
            },
          }),
        ],
      }
    }

    case 'relationship.depart': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.depart was handed no relationship to act on')
      }

      const now = context.clock.now()

      if (relationship.endedAt !== null) {
        throw new DepartureRefused('departure.relationship_ended')
      }

      // Whether anybody has accepted it is not asked. One nobody has activated has
      // sent nothing to anybody, and its Starter Message is written from whoever is
      // in it when it starts, so a Participant taken out of a group that still waits
      // takes nothing back (James, 2026-09-21). Withdrawing the whole of it is
      // `relationship.cancel`, and what is left below still refuses its last
      // Participant, so a departure never does a cancellation's work.

      // Open memberships only, which is what the snapshot holds: somebody who has
      // already left is not in this relationship to leave it a second time.
      const leaving = relationship.members.find(
        (member) => member.personId === command.personId,
      )
      if (!leaving) {
        throw new DepartureRefused('departure.person_is_not_in_this_relationship')
      }

      if (leaving.role === 'leader') {
        // Invited and not yet leading. There is no leading to stop, only an
        // invitation, and taking that back is `invitation.withdraw`.
        if (leaving.acceptedAt === null) {
          throw new DepartureRefused('departure.leader_has_not_accepted')
        }
        // A relationship without a Leader does not continue with whoever remains.
        // That is a relationship that is over, and ending one records an outcome --
        // which a departure has nowhere to put. Only a Leader who has accepted is
        // somebody it can be left with: one still to answer leads nothing yet.
        const goesOnLeading = relationship.members.some(
          (member) =>
            member.role === 'leader' &&
            member.personId !== command.personId &&
            member.acceptedAt !== null,
        )
        if (!goesOnLeading) throw new DepartureRefused('departure.would_leave_no_leader')
      } else {
        const remaining = relationship.members.filter(
          (member) => member.role === 'participant' && member.personId !== command.personId,
        )
        // The same refusal in its other shape. Three Participants becoming one is a
        // relationship carrying on with fewer people in it; one becoming none is a
        // relationship with nobody being discipled, and there is no check-in question
        // to ask about nobody.
        if (remaining.length === 0) {
          throw new DepartureRefused('departure.would_leave_no_participants')
        }
      }

      // One membership closed, and nothing else. The relationship is untouched, the
      // weeks this Person was present for stay attached to it exactly as they were
      // recorded, and the check-in copy follows the Participants who remain without
      // anything here telling it to -- `checkInSubject` reads the open memberships,
      // so there is no group-versus-one-to-one branch to keep in step. A Leader who
      // leaves falls out of every read the same way, because each of them reads
      // open memberships, and a conversation of theirs already under way steps over
      // what they no longer lead (`notAskedAbout`, in `./check-in`).
      //
      // Nobody is told, for the reason an ending tells nobody.
      return {
        rejections: [],
        effects: [
          departFromRelationship({
            ministryId: command.ministryId,
            relationshipId: relationship.relationshipId,
            personId: command.personId,
            departedAt: now,
            departedBy: command.departedBy,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            // A fact of its own for each: history is append-only, and a Leader
            // leaving is not a Participant leaving.
            type:
              leaving.role === 'leader'
                ? 'relationship.leader_departed'
                : 'relationship.participant_departed',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: { personId: command.personId, departedBy: command.departedBy },
          }),
        ],
      }
    }

    case 'relationship.assign_material': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.assign_material was handed no relationship to act on')
      }

      refuseUnlessAssignable(relationship)

      // A Material, checked against the live list read in this transaction: a
      // removed one is off it, so a stale dropdown cannot put a relationship on a
      // Material no folder shows (Materials, ticket 03). A null is the un-assign
      // and names nothing to check.
      if (command.materialId !== null && !isStillOnTheList(context, command.materialId)) {
        throw new MaterialAssignmentRefused('material.not_found')
      }

      return {
        rejections: [],
        effects: assigning(relationship, command, context.clock.now()),
      }
    }

    case 'material.assign_to_relationships': {
      const relationships = context.relationshipsToAssign
      if (!relationships) {
        throw new Error('material.assign_to_relationships was handed no relationships to act on')
      }
      // Once, in the page's order, however the form came to repeat one: a second
      // assignment of the same relationship would be refused as the Material
      // already running, and refuse the lot over nothing.
      const named = [...new Set(command.relationshipIds)]
      // The route refuses an empty list before it gets here, with a sentence of
      // its own. Reaching here without one is a caller composing the command
      // wrong, and an act that assigns nobody is not something to record.
      if (named.length === 0) {
        throw new Error('material.assign_to_relationships was handed no relationship to act on')
      }

      // The Material first, and once: it is the one reason that is nobody's in
      // particular, and it is the same answer for every relationship named.
      if (!isStillOnTheList(context, command.materialId)) {
        throw new MaterialAssignmentRefused('material.not_found')
      }

      const now = context.clock.now()
      const effects = named.flatMap((id) => {
        // Not loaded is not this Ministry's, or gone since the page was drawn:
        // the same refusal a single card gets for it, naming which.
        const relationship = relationships.find((each) => each.relationshipId === id)
        if (!relationship) throw new MaterialAssignmentRefused('material.relationship_not_found', id)
        refuseUnlessAssignable(relationship)
        return assigning(relationship, command, now)
      })

      // Nothing here is decided that one card would not decide, and the first
      // refusal ends the act with nothing written, which is what makes it one act
      // rather than several presses in a row. The Material one of them is already
      // on is refused by `app.assign_material` for it, as for a single card.
      return { rejections: [], effects }
    }

    case 'relationship.pause': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.pause was handed no relationship to act on')
      }

      const now = context.clock.now()

      // Terminal first. Ending is the one thing a Pause is not a lighter version
      // of, and pausing something that has ended would append a fact about a
      // relationship that no longer has a present tense.
      if (relationship.endedAt !== null) throw new PauseRefused('pause.relationship_ended')
      // Nothing has been sent and no week has been covered, so there is nothing to
      // suspend. `Awaiting Leader Acceptance` is what it should still read as, and
      // `Paused` masking it would hide a relationship the acceptance escalation is
      // still counting the days on.
      if (relationship.acceptedAt === null) {
        throw new PauseRefused('pause.relationship_not_accepted')
      }
      // A second pause would silently move the first one's expiry, so a fortnight
      // away would become a fortnight from whenever somebody last clicked.
      if (relationship.pause !== null) throw new PauseRefused('pause.already_paused')

      const periodWeeks: PausePeriodWeeks =
        command.periodWeeks ?? DEFAULT_PAUSE_PERIOD_WEEKS

      // Checked, not trusted. `PausePeriodWeeks` is a compile-time union and this
      // command is built from a request body, so nothing between the two has
      // actually looked at the number. A three-week pause written into history is
      // a row `readStandingPause` refuses -- on the tick and on Care Needed both --
      // so the cheapest place to stop it is here, before it is a fact.
      if (!isPausePeriod(periodWeeks)) {
        throw new PauseRefused('pause.period_not_selectable')
      }

      // One event and nothing else. Membership is untouched -- which is the whole
      // of *nobody returns to the suggestion pool*, because `participation_status`
      // and the participation caps both read open memberships -- and nobody is
      // told: Discipler stops asking, it does not announce that it has stopped.
      //
      // The expiry date is deliberately not in the payload. It is
      // `pauseExpiresAt` of the two facts that are, and a third copy of the same
      // number is a second answer waiting to disagree with them.
      return {
        rejections: [],
        effects: [
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.paused',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: { periodWeeks, pausedBy: command.pausedBy },
          }),
        ],
      }
    }

    case 'relationship.resume': {
      const relationship = context.relationship
      if (!relationship) {
        throw new Error('relationship.resume was handed no relationship to act on')
      }
      const { ministryName } = context
      if (!ministryName) {
        throw new Error('relationship.resume was handed no Ministry to speak for')
      }

      const now = context.clock.now()

      if (relationship.endedAt !== null) throw new PauseRefused('pause.relationship_ended')

      const pause = relationship.pause
      if (!pause) throw new PauseRefused('pause.not_paused')

      // The Leaders who lead it: a Leader added to the group since, who has not
      // accepted, is told nothing but their invitation, and is not yet somebody the
      // Participants are meeting with (Manual pairing, ticket 22).
      const leaders = relationship.members.filter(
        (member) => member.role === 'leader' && member.acceptedAt !== null,
      )
      const participants = relationship.members.filter(
        (member) => member.role === 'participant',
      )

      // Resuming restores nothing by itself: it removes the mask, and the state
      // underneath is whatever the history yields. **It never sets `Healthy`** --
      // a relationship that was `Stalled` when it was paused is `Stalled` again
      // and clears only on an answered check-in, because setting `Healthy` here
      // would silently erase a live care signal.
      //
      // Nor does it close the `pause_expired` item, if one stands. A Follow-Up
      // Item closes when an Admin resolves it and at no other time, exactly as
      // cancelling a relationship does not close the item that surfaced it.
      return {
        rejections: [],
        effects: [
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.resumed',
            subjectType: 'relationship',
            subjectId: relationship.relationshipId,
            payload: {
              periodWeeks: pause.periodWeeks,
              resumedBy: command.resumedBy,
              // Whether the Admin was acting on an expiry item or coming back
              // early. Both are ordinary; the Week-by-Week History is where the
              // difference is worth keeping.
              expired: pauseHasExpired(pause, now),
            },
          }),
          // Everyone in the relationship hears that it is running again --
          // which is what *releases the Starter Message* comes to, and expiry
          // never does it. Not the Starter Message itself: *you have been
          // paired* is true on the day the match is made and would be a Ministry
          // telling somebody they had been matched to the person they have been
          // meeting all year.
          //
          // Each side is told the other side's names, like the Starter Message,
          // and neither carries a number.
          ...[...leaders, ...participants].map((member) =>
            enqueueMessage({
              ministryId: command.ministryId,
              personId: member.personId,
              toPhone: member.phone,
              body: resumedMessage({
                ministryName,
                withNames: (member.role === 'leader' ? participants : leaders).map(
                  (other) => other.fullName,
                ),
              }),
              enqueuedAt: now,
              disclosesPersonId: null,
              kind: 'no_reply',
              ratesLine: 'once_a_month',
            }),
          ),
        ],
      }
    }

    case 'group.configure': {
      const group = context.relationship
      if (!group) throw new Error('group.configure was handed no relationship to configure')
      if (group.endedAt !== null) throw new GroupRefused('group.relationship_ended')

      const name = readGroupName(command.name)
      if (name === null) throw new GroupRefused('group.name_missing')

      const now = context.clock.now()
      return {
        rejections: [],
        effects: [
          configureGroup({
            ministryId: command.ministryId,
            relationshipId: group.relationshipId,
            name,
            joinRequiresApproval: command.joinRequiresApproval,
          }),
          // A label and a switch, neither of them a ministry event -- but who
          // changed what a group is called and whether its door is open is worth
          // being able to answer later, so it is recorded with its actor.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.group_configured',
            subjectType: 'relationship',
            subjectId: group.relationshipId,
            payload: {
              name,
              joinRequiresApproval: command.joinRequiresApproval,
              changedBy: command.changedBy,
            },
          }),
        ],
      }
    }

    case 'relationship.admit': {
      if (context.joinRequest === undefined) {
        throw new Error('relationship.admit was handed nothing about the request it names')
      }
      const request = context.joinRequest
      if (request === null) throw new GroupRefused('group.request_not_found')

      // The group the request named, as the database holds it now. Gone, or
      // ended since the Person asked, is a refusal rather than a membership on a
      // relationship that is over -- and the Admin closes the item by hand, the
      // way any item about a relationship that no longer exists is closed.
      const group = context.relationship
      if (!group || group.endedAt !== null) throw new GroupRefused('group.request_group_ended')

      const joiner = whoIs(context, request.personId)
      const now = context.clock.now()

      // Their open item asking to be placed in a group, from the group link with
      // no group in mind, is answered by being admitted to one, as it is by
      // `group.add_participant` (Group form exits, ticket 01). Silently.
      if (context.placementWanted === undefined) {
        throw new Error('relationship.admit was not told whether they are waiting to be placed in a group')
      }
      const placement = context.placementWanted

      const effects: Effect[] = [
        // Admitting is an Admin's recorded act, so the item is resolved inside it
        // rather than left for a second click. The resolution carries the Admin;
        // the event below carries the Person and the item.
        resolveFollowUpItem({
          ministryId: command.ministryId,
          itemId: request.itemId,
          resolvedBy: command.admittedBy,
          resolvedAt: now,
        }),
        ...(placement === null
          ? []
          : [
              resolveFollowUpItem({
                ministryId: command.ministryId,
                itemId: placement,
                resolvedBy: command.admittedBy,
                resolvedAt: now,
              }),
            ]),
      ]

      // Already in it -- admitted from a second item, or through the open door
      // after the switch was turned off -- resolves the item and joins nothing.
      const alreadyIn = group.members.some((member) => member.personId === request.personId)
      if (!alreadyIn) {
        effects.push(
          joinRelationship({
            ministryId: command.ministryId,
            relationshipId: group.relationshipId,
            personId: request.personId,
            startedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.participant_admitted',
            subjectType: 'relationship',
            subjectId: group.relationshipId,
            payload: {
              personId: request.personId,
              admittedBy: command.admittedBy,
              itemId: request.itemId,
              ...(placement === null ? {} : { placementItemId: placement }),
            },
          }),
          ...tellTheLeadersSomebodyJoined(context, group, joiner.fullName, now),
        )
      }

      return { rejections: [], effects }
    }

    case 'group.add_participant': {
      const { group, person: joiner } = theGroupAndWhoIsAdded(context, command)

      // Nothing else is decided here. Intake completed, not opted out and the
      // group's declared gender are refused by the insert, by the triggers that
      // refuse them at formation; and whether the group is running, paused or
      // still awaiting its Leader is left exactly as it was, because nothing
      // below touches the relationship's own row.
      const now = context.clock.now()

      // An open Join Request of theirs for this group is resolved by the same act,
      // as an admitted one ends, so it leaves Intake forms (Manual pairing, recut
      // ticket 03; decided by James on 2026-09-20). Silently: the join is still a
      // join, so its Leaders get the one text below and no other, and the Disciple
      // gets nothing. A request of theirs for another group is never read here.
      if (context.joinRequest === undefined) {
        throw new Error('group.add_participant was not told whether they have an open Join Request for the group')
      }
      const request = context.joinRequest
      if (
        request !== null &&
        (request.personId !== command.personId || request.relationshipId !== group.relationshipId)
      ) {
        throw new Error('group.add_participant was handed a Join Request about another Person or group')
      }

      // Their open item asking to be placed in a group, from the group link with
      // no group in mind, is answered by this act wherever the Admin did it from:
      // Follow-Up's **Place in this group** or the Roster (Group form exits,
      // ticket 01). Resolved by the same act, as a Join Request is, and silently.
      if (context.placementWanted === undefined) {
        throw new Error('group.add_participant was not told whether they are waiting to be placed in a group')
      }
      const placement = context.placementWanted

      return {
        rejections: [],
        effects: [
          ...(request === null
            ? []
            : [
                // The resolution carries the Admin, and the event below carries
                // the item, as an admission's do.
                resolveFollowUpItem({
                  ministryId: command.ministryId,
                  itemId: request.itemId,
                  resolvedBy: command.addedBy,
                  resolvedAt: now,
                }),
              ]),
          ...(placement === null
            ? []
            : [
                resolveFollowUpItem({
                  ministryId: command.ministryId,
                  itemId: placement,
                  resolvedBy: command.addedBy,
                  resolvedAt: now,
                }),
              ]),
          joinRelationship({
            ministryId: command.ministryId,
            relationshipId: group.relationshipId,
            personId: command.personId,
            startedAt: now,
          }),
          // A type of its own, beside the self-join's and the admission's: who
          // acted is what the event is, not a flag on it.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.participant_added',
            subjectType: 'relationship',
            subjectId: group.relationshipId,
            payload: {
              personId: command.personId,
              addedBy: command.addedBy,
              ...(request === null ? {} : { itemId: request.itemId }),
              ...(placement === null ? {} : { placementItemId: placement }),
            },
          }),
          ...tellTheLeadersSomebodyJoined(context, group, joiner.fullName, now),
        ],
      }
    }

    case 'group.add_leader': {
      const { group } = theGroupAndWhoIsAdded(context, command)

      // Whether they already lead an open group is not decided here, because
      // nothing this command read can see their other relationships:
      // `leader_one_open_group` refuses the insert, and the store says so in this
      // act's own code. Intake completed, not opted out and the group's declared
      // gender are refused by the same insert, as they are at formation.
      //
      // The relationship's own row is not touched. A running group stays running
      // and a paused one paused; one still awaiting its Leader waits for this one
      // too, because activation is every open leader membership accepting.
      const now = context.clock.now()
      return {
        rejections: [],
        effects: [
          addLeader({
            ministryId: command.ministryId,
            relationshipId: group.relationshipId,
            personId: command.personId,
            startedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.leader_added',
            subjectType: 'relationship',
            subjectId: group.relationshipId,
            payload: { personId: command.personId, addedBy: command.addedBy },
          }),
          // The invitation, and nothing to anybody else: not the group's Disciples,
          // and not its existing Leaders, who are told by hand if they are told
          // (decided by James on 2026-09-20, Manual pairing, ticket 11).
          ...inviteToLead(context, command.ministryId, group.relationshipId, command.personId, now),
        ],
      }
    }

    case 'follow_up.resolve': {
      const now = context.clock.now()

      // No note, deliberately. Resolving is one click on a surface designed not to
      // have a writing task on it, and what the Admin actually did -- cancelled,
      // ended -- is recorded as a fact of its own rather than retyped here.
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

    case 'concern.view': {
      const now = context.clock.now()

      // Reading it is the act being recorded, and it is recorded per viewing
      // rather than as a flag: the second Admin to open a Concern is a fact as
      // much as the first was. The text itself is nowhere in here -- the unit of
      // work returns it to the caller, and history keeps only that it was read.
      return {
        rejections: [],
        effects: [
          recordConcernViewing({
            ministryId: command.ministryId,
            concernId: command.concernId,
            viewedBy: command.viewedBy,
            viewedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'concern.viewed',
            subjectType: 'concern',
            subjectId: command.concernId,
            payload: { viewedBy: command.viewedBy },
          }),
        ],
      }
    }

    case 'concern.resolve': {
      const now = context.clock.now()

      return {
        rejections: [],
        effects: [
          resolveConcern({
            ministryId: command.ministryId,
            concernId: command.concernId,
            resolvedBy: command.resolvedBy,
            resolvedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'concern.resolved',
            subjectType: 'concern',
            subjectId: command.concernId,
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
      if (!context.openPlans) {
        throw new Error('person.import was handed no plans to compare against')
      }

      // Read, then decided in one place: `classifyImport` is the same function the
      // import dialog runs in the browser for its review, over the same reader, so
      // what the Admin was shown is what happens here (ticket 36).
      const reading = readRosterFile(command.text, command.mode)
      const classified = classifyImport(reading, {
        people: context.roster.people,
        namesByNumber: context.roster.namesByNumber,
        removed: context.roster.removed,
        openPlans: context.openPlans,
      })
      const now = context.clock.now()

      const effects: Effect[] = []
      /** The Person each row became, where it became one; a row already on the Roster is that Person. */
      const personOfRow: (PersonId | null)[] = []

      for (const row of classified.rows) {
        // A row for someone already on the Roster is reported and left alone: a
        // stale export must not overwrite a name or an email the Person themselves
        // gave at Intake.
        if (row.outcome === 'already_on_the_roster') {
          personOfRow.push(row.existingId)
          continue
        }

        // Somebody an Admin removed. Reported and filed nowhere: a new Intake from
        // them is the one way back (Remove from the Roster, ticket 01), and a
        // pairing this file gave them is refused on its own line.
        if (row.outcome === 'removed') {
          personOfRow.push(null)
          continue
        }

        // The number is on the Roster under another name. Discipler will not guess
        // whether that is a rename or the second person on a shared phone, because
        // both are ordinary in a congregation and each guess loses the other one.
        // Reported, never dropped and never silently filed twice.
        //
        // Kept as well as reported. The report is a redirect and outlives nothing;
        // the row it points at has to survive so an Admin can answer it without
        // re-uploading the file, which is exactly the manual work this product
        // exists to remove. What is kept is the row as the file had it, because the
        // file is gone by the time anybody reads it and both answers need the name.
        // Not kept: who it was paired with. Answer the row, then paste the line
        // again (ticket 36, decision 13).
        if (row.outcome === 'held') {
          personOfRow.push(null)
          effects.push(
            holdImportRow({
              id: importRowId(context.ids.next()),
              ministryId: command.ministryId,
              line: row.line,
              fullName: row.fullName,
              phone: row.phone,
              email: row.email,
              importedAt: now,
              resolvedAt: null,
            }),
          )
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
        personOfRow.push(person.id)

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

      // What the rows said about who disciples whom is recorded as a plan and
      // nothing more: no relationship forms until both have completed Intake, and
      // then by the pairing rules (ADR-0022).
      const personOf = (side: SideRef): PersonId | null =>
        side.kind === 'row' ? (personOfRow[side.index] ?? null) : side.personId
      for (const pairing of classified.pairings) {
        if (pairing.outcome !== 'planned' || !pairing.leader || !pairing.participant) continue
        const leaderId = personOf(pairing.leader)
        const participantId = personOf(pairing.participant)
        // Both sides resolved to a Person above; the classifier planned nothing
        // against a held row.
        if (!leaderId || !participantId) continue
        const plan = {
          id: intendedPairingId(context.ids.next()),
          ministryId: command.ministryId,
          leaderId,
          participantId,
          plannedAt: now,
        }
        effects.push(
          planIntendedPairing(plan),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'intended_pairing.planned',
            subjectType: 'intended_pairing',
            subjectId: plan.id,
            payload: { leaderId, participantId, line: pairing.line },
          }),
        )
      }

      return { effects, rejections: classified.rejections }
    }

    case 'import_row.resolve': {
      // Absent rather than defaulted, like the Roster beside it. A row that was
      // never loaded and a row nobody has answered are the same value and opposite
      // facts, and the second of them renames a Person on no evidence at all.
      const row = context.importRow
      if (!row) throw new Error('import_row.resolve was handed no row to answer')
      if (!context.roster) {
        throw new Error('import_row.resolve was handed no Roster to answer against')
      }

      // Somebody answered first. Two Admins working the same import report is
      // ordinary, and the second must not rename a Person on the strength of a
      // question the first one closed -- their answer may have been the other one.
      if (row.resolvedAt) {
        throw new ImportRowResolutionRefused('import_row.already_answered')
      }

      const now = context.clock.now()
      const held = namesOnTheNumber(context.roster, row.phone)

      // That name is on that number now, whoever put it there -- a second Admin
      // answering a duplicate row, or an import that landed in between. Both
      // answers would make the duplicate `person_ministry_identity_uniq` refuses,
      // and the Admin is told what happened rather than shown a constraint.
      if (context.roster.people.has(rosterKey({ fullName: row.fullName, phone: row.phone }))) {
        throw new ImportRowResolutionRefused('import_row.name_is_already_on_this_number')
      }

      const answer = command.answer
      if (answer.kind === 'same_person') {
        // The Person named has to be one of the people that number reaches. The
        // report offers only those names, so anything else is a form post that did
        // not come from it -- and an unchecked one would rename any Person in the
        // Ministry from a screen about a spreadsheet row.
        const renamed = held.find((person) => person.personId === answer.personId)
        if (!renamed) {
          throw new ImportRowResolutionRefused('import_row.person_is_not_on_this_number')
        }

        // A rename and not a merge: one Person row throughout, `person.id` never
        // moves, and their history, relationships and messages all stay theirs.
        //
        // No history event. Ticket 26 leaves *whether a rename appends one* open,
        // to be settled with ticket 07's history work rather than by inventing an
        // event kind here -- and the row below records who answered, what they
        // answered and when, so nothing is lost while the question is open.
        return {
          effects: [
            renamePerson({
              ministryId: command.ministryId,
              personId: renamed.personId,
              fullName: row.fullName,
              renamedAt: now,
            }),
            resolveImportRow({
              ministryId: command.ministryId,
              rowId: row.id,
              answer: 'same_person',
              personId: renamed.personId,
              // The name this Ministry called them by until now. `person.full_name`
              // is about to be overwritten in place, so this is the only thing that
              // keeps it -- and a past fact overwritten with a current value is the
              // one thing the working rules say not to do.
              renamedFrom: renamed.fullName,
              resolvedBy: command.resolvedBy,
              resolvedAt: now,
            }),
          ],
          rejections: [],
        }
      }

      // The second person on a shared phone, which ADR-0005 has always allowed:
      // two people on one number are two Person rows, and the identity index is
      // keyed on the name as well as the number precisely so this is representable.
      const person = {
        id: personId(context.ids.next()),
        ministryId: command.ministryId,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        createdAt: now,
      }

      return {
        effects: [
          // No message of any kind, for the reason the import sends none: being on
          // a Roster is not consent and is not a wish to participate.
          createPerson(person),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            // They arrived in a spreadsheet and reached the Roster from it. The
            // answer is what unblocked the row, not a second way of joining a
            // Ministry, so this is the event every other imported Person gets.
            type: 'person.imported',
            subjectType: 'person',
            subjectId: person.id,
            payload: { fullName: person.fullName },
          }),
          resolveImportRow({
            ministryId: command.ministryId,
            rowId: row.id,
            answer: 'someone_else',
            personId: person.id,
            // Nobody was renamed, so there is no previous name to keep.
            renamedFrom: null,
            resolvedBy: command.resolvedBy,
            resolvedAt: now,
          }),
        ],
        rejections: [],
      }
    }

    case 'intake.submit': {
      if (!context.roster) {
        throw new Error('intake.submit was handed no Roster to look the Person up in')
      }
      if (!context.ministryName) {
        throw new Error('intake.submit was handed no Ministry to speak for')
      }

      const now = context.clock.now()

      // Before the form is read at all, because it is not a problem with anything
      // on the form. A link that has run out is refused on its own, so the Person
      // is told to ask for a new one rather than being handed a list of fields to
      // check that would not have helped.
      //
      // Bound here rather than re-read below, so the Person the token names and the
      // check that it still opens anything are the same narrowing. Reaching for
      // `context.intakeLink` again further down would have to assert what this
      // block already proved, across enough lines that the assertion is a claim
      // about code out of sight rather than about the guard above it.
      const link = command.token ? context.intakeLink : null
      if (command.token) {
        if (!link) {
          throw new Error('intake.submit was handed a token and no link to resolve it')
        }
        if (intakeLinkState(link.expiresAt, now) === 'expired') {
          throw new IntakeRefused(['intake.link_expired'])
        }
      }

      const reading = readIntakeForm(command.form)
      if ('refusals' in reading) throw new IntakeRefused(reading.refusals)

      const { submission } = reading
      const effects: Effect[] = []

      // Two ways of knowing who this is, and the link is the stronger of them.
      //
      // Without one, a Person is recognised by the name and number they typed --
      // which is right for a Ministry-wide link, where the form has to ask who is
      // filling it in because the URL cannot say. Usually they are already here: an
      // Admin imported the congregation and then sent the link. A QR code at a
      // leaders' meeting reaches people who are not, and Intake is a way onto the
      // Roster as much as a way through it.
      //
      // With one, the token names them. That is the whole of what makes a
      // correction possible: a Person changing the number Discipler holds no longer
      // matches the key they were recognised by, so recognising them that way would
      // file a second Person rather than fix the first.
      const key = rosterKey(submission)
      const existing = link ? link.personId : context.roster.people.get(key)
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

      // Somebody an Admin removed, filling in Intake again: the one way back onto
      // the Roster (Remove from the Roster, ticket 01; James, 2026-09-22). They come
      // back as the same Person, with everything they were part of still theirs,
      // and the submission below lands on them as any re-submission does.
      if (existing && context.roster.removed.has(existing)) {
        effects.push(
          restorePerson({ ministryId: command.ministryId, personId: existing, restoredAt: now }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.restored',
            subjectType: 'person',
            subjectId: existing,
            payload: { through: link ? 'intake_link' : 'ministry_intake_link' },
          }),
        )
      }

      // Their first submission, or a repeat. Everything below is recorded either
      // way -- a re-submission is a real act and leaves a real trail -- but only the
      // first one is greeted.
      const isFirstSubmission = !context.roster.whoCompletedIntake.has(id)

      // The group path's one question, answered against the group as the database
      // holds it now. Every refusal here is thrown before anything is written, like
      // the form's own: a Person who named a group that has since closed keeps
      // their answers and is told, rather than landing on the Roster with nothing
      // joined and no word why.
      const joining: Effect[] = []
      if (submission.groupId !== null) {
        if (context.groupToJoin === undefined) {
          throw new Error('intake.submit named a group and was handed nothing about it')
        }
        const group = context.groupToJoin
        if (
          group === null
          || group.acceptedAt === null
          || group.endedAt !== null
          || group.name === null
        ) {
          throw new IntakeRefused(['intake.group_unavailable'])
        }
        // The dropdown filtered on this before it was offered; the trigger on
        // `relationship_member` checks it again at the insert. Said here as well
        // so a changed list or a crafted body reaches the Person as a sentence
        // rather than as a constraint name.
        if (group.declaredGender !== null && group.declaredGender !== submission.gender) {
          throw new IntakeRefused(['intake.group_not_open_to_you'])
        }

        // Somebody already in the group they asked for gets the done page and no
        // write: there is nothing to join and nothing to decide.
        const alreadyIn = group.members.some((member) => member.personId === id)
        if (!alreadyIn && group.joinRequiresApproval) {
          joining.push(
            raiseFollowUpItem({
              ministryId: command.ministryId,
              kind: 'group_join_requested',
              personId: id,
              relationshipId: group.relationshipId,
              raisedAt: now,
            }),
            // The item dedupes while it stands open and this does not, so how
            // many times a Person asked survives.
            appendHistory({
              ministryId: command.ministryId,
              occurredAt: now,
              type: 'relationship.join_requested',
              subjectType: 'relationship',
              subjectId: group.relationshipId,
              payload: { personId: id },
            }),
          )
        } else if (!alreadyIn) {
          joining.push(
            joinRelationship({
              ministryId: command.ministryId,
              relationshipId: group.relationshipId,
              personId: id,
              startedAt: now,
            }),
            // The Person is the actor, because they are. An admission is a
            // different event with an Admin in it, so an audit can tell the two
            // apart by type rather than by a flag.
            appendHistory({
              ministryId: command.ministryId,
              occurredAt: now,
              type: 'relationship.participant_joined',
              subjectType: 'relationship',
              subjectId: group.relationshipId,
              payload: { personId: id },
            }),
            ...tellTheLeadersSomebodyJoined(context, group, submission.fullName, now),
          )
        }
      } else if (submission.intakePath === GROUP_PATH) {
        // No group in mind (Group form exits, ticket 01). They land on the Roster
        // with no group named and an Admin is asked to place them, so the
        // decision cannot scroll out of view. Nobody is texted about it.
        joining.push(
          raiseFollowUpItem({
            ministryId: command.ministryId,
            kind: 'group_placement_wanted',
            personId: id,
            relationshipId: null,
            raisedAt: now,
          }),
          // The item dedupes while it stands open and this does not, so how many
          // times a Person asked survives, as a Join Request's does.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.group_placement_wanted',
            subjectType: 'person',
            subjectId: id,
            payload: {},
          }),
        )
      }

      effects.push(
        recordIntake({
          ministryId: command.ministryId,
          personId: id,
          submittedAt: now,
          // Only where the token named them. On the Ministry-wide form the name and
          // number are how this Person was recognised a few lines above, so writing
          // them back could only overwrite the pair with a differently-cased copy
          // of itself; through a link an Admin sent, they are what the Person came
          // to change.
          corrections: command.token
            ? { fullName: submission.fullName, phone: submission.phone }
            : null,
          ageBand: submission.ageBand,
          gender: submission.gender,
          goalId: submission.goalId,
          availability: submission.availability,
          email: submission.email,
          firstTime: submission.firstTime,
          consentVersion: CONSENT_VERSION,
          source: submission.source,
          // What they were answering and which side they said they were on, on
          // every consent record this submission writes. Null where the form did
          // not ask, which is what the single-page form still is.
          intakePath: submission.intakePath,
          declaredSide: submission.declaredSide,
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
            // The option they picked, for the same reason the name below is here:
            // `intake_submission.discipleship_goal_id` is blanked if the Ministry
            // ever removes this option, and without this the fact that they chose
            // it would be gone from the whole system. The id and not the wording --
            // the wording is the option's own and changes under a rename, and
            // `discipleship_goal.renamed` and `.removed` are what resolve an id to
            // the words that stood on any given date.
            goalId: submission.goalId,
            // The name they gave on this submission, the same way
            // `person.joined_at_intake` records the one they joined under. A
            // correction overwrites `person.full_name`, and without this the name
            // they had before would be gone from the whole system.
            //
            // The number is deliberately not here. History is a ministry-wide
            // record an Admin surface reads, and the numbers Discipler actually
            // used are already recoverable from `outbound_message.to_phone`.
            fullName: submission.fullName,
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
              // On the group path the Person has already said where they are
              // going, and hears nothing about it by text: this is the receipt.
              promises: submission.intakePath === GROUP_PATH ? 'nothing' : 'a_match',
            }),
            enqueuedAt: now,
            // Nothing. There is no relationship yet, so there is nobody to
            // introduce -- and this is the message that reaches them before one
            // exists.
            disclosesPersonId: null,
            kind: 'no_reply',
            ratesLine: 'always',
          }),
        )
      }

      // After the Intake, which is what makes them somebody the membership's own
      // rules will admit, and after the Welcome, which is theirs before anything
      // about a group is. The service applies these by kind rather than in this
      // order, so this is legibility and not sequencing.
      effects.push(...joining)

      return { effects, rejections: [] }
    }

    case 'intake.reopen': {
      // Nothing about the Person is consulted. A link reveals their own answers to
      // whoever holds it; whether they have completed Intake, whether they are
      // paired, whether they have opted out are all questions the form answers when
      // it is opened, and none of them is a reason to refuse an Admin the link. A
      // Person who has opted out is the clearest case: they still have a number that
      // may be wrong on the Roster.
      if (context.intakeLinkHeld === undefined) {
        throw new Error('intake.reopen was not told which link this Person already holds')
      }

      const now = context.clock.now()

      // Asking for a link somebody already has is not issuing one. The Admin who
      // closed the tab and came back is the ordinary case, and minting a second
      // token there would stop the link they sent last week from working -- so this
      // act is *give me this Person's link*, and it is idempotent while one stands.
      const held = context.intakeLinkHeld
      if (held && intakeLinkState(held.expiresAt, now) === 'live') {
        return { effects: [], rejections: [] }
      }

      const link = issueIntakeLink({
        ministryId: command.ministryId,
        personId: command.personId,
        token: intakeLinkToken(context.ids.next()),
        at: now,
      })

      return {
        effects: [
          recordIntakeLink(link),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'intake.link_issued',
            subjectType: 'person',
            subjectId: command.personId,
            // The window, and not the token. History is read on an Admin surface,
            // and recording the credential there would put a way into somebody's
            // own form into the ministry's permanent record.
            payload: { expiresAt: link.expiresAt.toISOString() },
          }),
        ],
        rejections: [],
      }
    }

    case 'invitation.reissue': {
      const { unaccepted, ministryName, appBaseUrl } = context
      if (!unaccepted) {
        throw new Error('invitation.reissue was not told which relationships are unaccepted')
      }
      if (!ministryName) throw new Error('invitation.reissue was not told the Ministry name')
      if (!appBaseUrl) throw new Error('invitation.reissue was not told where links point')

      const now = context.clock.now()

      // Absence is the whole of the guard, and it covers every case that should do
      // nothing in one read: a relationship already accepted is not in this list, a
      // Leader who has agreed is not in its `awaiting`, and a relationship in
      // another Ministry was never loaded because the snapshot is scoped to this
      // one. None of them is a refusal -- the Admin is looking at a screen that was
      // true when it rendered, and a relationship that got accepted underneath them
      // is a race they won by losing.
      const relationship = unaccepted.find(
        (candidate) => candidate.relationshipId === command.relationshipId,
      )
      const leader = relationship?.awaiting.find(
        (candidate) => candidate.personId === command.personId,
      )
      if (!relationship || !leader) return { effects: [], rejections: [] }

      // Nowhere to send it. A Leader with no number on file cannot be texted a link
      // at all, and enqueuing one would be refused by the outbound queue rather
      // than telling the Admin what is actually wrong: the Roster row is missing a
      // phone number.
      if (!leader.phone) return { effects: [], rejections: [] }

      // Every re-issue mints, and the link it replaces stops opening the door.
      //
      // This read `intake.reopen`'s rule first -- re-send a link that is still live,
      // because the commonest reason to ask is a Leader who lost the text and a
      // second token would break the one already on their phone. That reasoning
      // holds for the lost text and fails the condition this ticket calls its
      // highest-stakes: a link sent to the wrong number. An Invitation Link
      // authenticates by possession alone, `invitation.dispute_number` records that
      // a stranger holds a live one and changes nothing else, and with no mint here
      // nothing in the product could ever take it back. So re-issuing is also the
      // revocation, and the cost is carried by the lost-text case instead: the
      // newest text is the one that works, which is a thing an Admin can say.
      const invitation = issueInvitation({
        ministryId: command.ministryId,
        relationshipId: command.relationshipId,
        personId: command.personId,
        token: invitationToken(context.ids.next()),
        at: now,
      })

      return {
        effects: [
          reissueInvitationLink(invitation),
          enqueueMessage({
            ministryId: command.ministryId,
            personId: command.personId,
            toPhone: leader.phone,
            // The reminder's words, not a fourth near-identical invitation string.
            // What an Admin is doing here is what the tick does automatically until
            // the link runs out, and one Leader should not be able to tell from the
            // text which of the two sent it.
            body: acceptanceReminderMessage({
              ministryName,
              fullName: leader.fullName,
              link: invitationLink(appBaseUrl, invitation.token),
            }),
            enqueuedAt: now,
            // No message to a Leader contains a phone number.
            disclosesPersonId: null,
            kind: 'no_reply',
            ratesLine: 'never',
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'invitation.reissued',
            subjectType: 'relationship',
            subjectId: command.relationshipId,
            // Which Leader, and both ends of the window that was replaced --
            // `reissueInvitation` overwrites the row in place, so without them the
            // issuance this superseded is gone rather than recorded. The windows and
            // never the token: history is read on an Admin surface, and writing the
            // credential there keeps a way into somebody's acceptance in the
            // Ministry's permanent record.
            //
            // `replacedTheLink` is not written any more. It distinguished a re-send
            // from a mint and every re-issue is now a mint, so it could only ever say
            // `true`. Rows written before this carry it and keep it: a `false` there
            // is the record of a link that was re-sent rather than replaced, which is
            // a past fact and not a defect to correct.
            payload: {
              personId: command.personId,
              supersededExpiresAt: leader.linkExpiresAt.toISOString(),
              expiresAt: invitation.expiresAt.toISOString(),
            },
          }),
          // The tick counts *this* as the one reminder that Leader gets. Without
          // it the re-issue leaves `remindedAt` null against a link that is now
          // live again, and the next tick sends the identical sentence a second
          // time -- the Admin's chase and the automatic one arriving as two texts
          // nobody meant to send twice.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'relationship.acceptance_reminded',
            subjectType: 'relationship',
            subjectId: command.relationshipId,
            payload: { personId: command.personId },
          }),
        ],
        rejections: [],
      }
    }

    case 'invitation.copy_link': {
      const { relationship, invitationHeld } = context
      if (!relationship) throw new Error('invitation.copy_link was handed no relationship')
      if (!invitationHeld) {
        throw new Error('invitation.copy_link was not told what invitations they have held')
      }
      if (relationship.endedAt !== null) {
        throw new ReinvitationRefused('reinvite.relationship_has_ended')
      }
      // Read on the connection acting for this Ministry, so a Person of another
      // Ministry's is missing here rather than merely unmatched.
      if (!context.contacts?.people.get(command.personId)) {
        throw new ReinvitationRefused('reinvite.not_found')
      }

      const now = context.clock.now()
      const member = relationship.members.find(
        (candidate) => candidate.personId === command.personId,
      )
      if (member?.role === 'participant') throw new ReinvitationRefused('reinvite.already_in_it')
      // They accepted since the item was raised: an Admin invited them again, or
      // they were put back another way. There is nobody left to invite.
      if (member && member.acceptedAt !== null) {
        throw new ReinvitationRefused('reinvite.already_accepted')
      }
      if (!member && !invitationHeld.everWithdrawn) {
        throw new ReinvitationRefused('reinvite.never_invited')
      }

      // Every copy mints, for the reason every re-issue does: the link is the
      // whole credential, and the one it replaces stops opening the door. So the
      // link an Admin is handed always works, and for another fortnight.
      const invitation = issueInvitation({
        ministryId: command.ministryId,
        relationshipId: command.relationshipId,
        personId: command.personId,
        token: invitationToken(context.ids.next()),
        at: now,
      })

      return {
        rejections: [],
        effects: [
          // Back on the relationship as somebody invited, where the two weeks took
          // them off it. A membership of its own and never the old one reopened,
          // which would rewrite the time they were not on it. Intake, an opt-out,
          // gender and the group they may lead since are the insert's to refuse, as
          // they are when a Leader is first added.
          ...(member
            ? []
            : [
                addLeader({
                  ministryId: command.ministryId,
                  relationshipId: command.relationshipId,
                  personId: command.personId,
                  startedAt: now,
                }),
              ]),
          // The withdrawn invitation stays as the record of itself, so a new one
          // is issued beside it; a live one is replaced in place.
          invitationHeld.liveExpiresAt === null
            ? issueInvitationLink(invitation)
            : reissueInvitationLink(invitation),
          // **No message.** The Admin carries the link by hand, to somebody a
          // fortnight of texts did not reach.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'invitation.link_copied',
            subjectType: 'relationship',
            subjectId: command.relationshipId,
            // The Admin and the Person, because today an Admin never sees a
            // Leader's link and the link alone is what lets its holder set the
            // account's password. The window and never the token, as a re-issue
            // records it: history is read on an Admin surface.
            payload: {
              personId: command.personId,
              copiedBy: command.copiedBy,
              reinvited: !member,
              expiresAt: invitation.expiresAt.toISOString(),
              ...(invitationHeld.liveExpiresAt === null
                ? {}
                : { supersededExpiresAt: invitationHeld.liveExpiresAt.toISOString() }),
            },
          }),
        ],
      }
    }

    case 'person.reset_password': {
      // The password is already set by the time this runs. Setting it is Supabase
      // Auth's and cannot be rolled back with a transaction, so the order is
      // deliberate and stated in ticket 28: the credential first, the record
      // second, and a record that fails to land is reported rather than swallowed.
      // History claiming a credential change that never happened is the worse lie
      // -- it is the record a Ministry consults precisely when it is asking
      // whether somebody's account was touched.
      //
      // Which is why the refusals below are the screen's guard restated rather
      // than the guard itself: the route re-reads the target immediately before it
      // touches the password, and reaching either of these means losing a race
      // against a Roster that moved in between.
      const { accountToReset } = context
      if (accountToReset === undefined) {
        throw new Error('person.reset_password was handed no account to reset')
      }

      // The same rule the screen and the route asked, from the one place it lives.
      const refusal = passwordResetRefusal(accountToReset, command.resetBy)
      if (refusal) throw new PasswordResetRefused(refusal)

      const now = context.clock.now()

      // The event and nothing else. No row is written about a reset: the password
      // lives in Supabase Auth and the account is the account, so there is no
      // Discipler-side state for this to change -- only a fact worth being able to
      // answer for later, which is the same argument `concern.viewed` makes about
      // an Admin's act of access.
      //
      // The payload carries who did it and nothing more. Not the password, not a
      // hash of it, not its length: a password is not ministry content and this
      // record is read by whoever is asking who touched an account.
      return {
        rejections: [],
        effects: [
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.password_reset',
            subjectType: 'person',
            subjectId: command.personId,
            payload: { resetBy: command.resetBy },
          }),
        ],
      }
    }

    case 'person.remove': {
      const { personToRemove } = context
      if (personToRemove === undefined) {
        throw new Error('person.remove was handed no Person to remove')
      }
      const person = theRemovable(personToRemove)
      const now = context.clock.now()

      // Nobody is told, as no Admin act tells anybody. What was already queued for
      // them is withheld by the store with the removal, and nothing composes a
      // message to them afterwards: they hold no relationship to be asked about.
      return {
        rejections: [],
        effects: [
          removePerson({
            ministryId: command.ministryId,
            personId: person.personId,
            removedAt: now,
            removedBy: command.removedBy,
          }),
          // Resolved by the Admin who removed them, like any resolution: an item
          // about somebody no longer on the Roster is a row nobody could act on.
          ...person.openFollowUpItems.map((itemId) =>
            resolveFollowUpItem({
              ministryId: command.ministryId,
              itemId,
              resolvedBy: command.removedBy,
              resolvedAt: now,
            }),
          ),
          // A plan has two ends and no withdrawal (ADR-0022), so it closes refused,
          // in the same words the database would refuse forming it with. No item is
          // raised for it: the Admin who would read one is the one who removed them.
          ...person.openPlans.map((plan) =>
            closeIntendedPairing({
              ministryId: command.ministryId,
              id: plan.id,
              outcome: 'refused',
              closedAt: now,
              relationshipId: null,
              refusal:
                plan.side === 'leader'
                  ? 'relationship.leader_was_removed'
                  : 'relationship.participant_was_removed',
            }),
          ),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'person.removed',
            subjectType: 'person',
            subjectId: person.personId,
            payload: {
              fullName: person.fullName,
              // Append-only, so this is the record that survives the Admin leaving
              // the Ministry and `removed_by` being nulled with them.
              removedBy: command.removedBy,
              heldAnAccount: person.holdsAnAccount,
              resolvedItemIds: person.openFollowUpItems,
              closedPlanIds: person.openPlans.map((plan) => plan.id),
            },
          }),
        ],
      }
    }

    case 'settings.update': {
      const were = context.settings
      if (!were) throw new Error('settings.update was handed no settings to change')

      const reading = readMinistrySettings(command.fields)
      // Every problem at once, and the whole save refused. One form, one
      // transaction: a Ministry never ends up with a timezone from this attempt
      // and a cadence from the last.
      if ('refusals' in reading) throw new MinistrySettingsRefused(reading.refusals)

      const settings = reading.settings

      // What actually moved, field by field, and nothing that did not. An Admin
      // who opened the form, corrected a typo in one noun and pressed save has
      // changed one thing, and a record claiming they set eight would make the
      // one that matters -- the day a Ministry turned the gender rule off --
      // impossible to find by reading.
      const changes = Object.fromEntries(
        (
          [
            ['name', were.name, settings.name],
            ['fromName', were.fromName, settings.fromName],
            ['timezone', were.timezone, settings.timezone],
            ['leaderNoun', were.leaderNoun, settings.leaderNoun],
            ['participantNoun', were.participantNoun, settings.participantNoun],
            ['suggestGenderMatch', were.suggestGenderMatch, settings.suggestGenderMatch],
            [
              'suggestMaxAgeBandGap',
              were.suggestMaxAgeBandGap,
              settings.suggestMaxAgeBandGap,
            ],
            ['checkinDay', were.cadence.day, settings.cadence.day],
            ['checkinHour', were.cadence.hour, settings.cadence.hour],
          ] as const
        ).flatMap(([field, from, to]) => (from === to ? [] : [[field, { from, to }]])),
      )

      // Nothing moved: an Admin opened the form, changed their mind and pressed
      // save. That is not an edit, so nothing is written and history says nothing
      // -- the same answer `goal.move` gives the Admin who pressed *up* on the top
      // option. A `ministry.settings_changed` event recording no change would be a
      // diary entry in a record that exists to be read for the changes that matter.
      if (Object.keys(changes).length === 0) return { effects: [], rejections: [] }

      const now = context.clock.now()

      return {
        effects: [
          saveMinistrySettings({ ministryId: command.ministryId, settings }),
          // The values as they stood, which the update is about to overwrite and
          // which nothing else keeps. A cadence edit affects future periods only,
          // so a Ministry reading its own record has to be able to see which
          // cadence sent the messages it is looking at.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'ministry.settings_changed',
            subjectType: 'ministry',
            subjectId: command.ministryId,
            payload: { changedBy: command.changedBy, changes },
          }),
        ],
        rejections: [],
      }
    }

    case 'material.create': {
      const materials = theMaterialsHeld(context)
      // The title first, then the content: an Admin who typed nothing at all is
      // told about the title, which is the first box on the form.
      const title = theTitleFor(materials, command.title)
      const items = theItemsAdded(context, command.files, command.links, [])
      const body = theContentOf(command.body, items)
      const now = context.clock.now()
      const id = materialId(context.ids.next())

      return {
        effects: [
          createMaterial({
            id,
            ministryId: command.ministryId,
            title,
            body,
            items,
            createdAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'material.created',
            subjectType: 'material',
            subjectId: id,
            payload: {
              title,
              body,
              items: items.map(asRemembered),
              createdBy: command.createdBy,
            },
          }),
        ],
        rejections: [],
      }
    }

    case 'material.edit': {
      const materials = theMaterialsHeld(context)
      const material = theMaterialNamed(materials, command.materialId)
      // Compared against every other Material and never against itself, which
      // is what lets an Admin correct a title's own capitalisation.
      const title = theTitleFor(materials, command.title, material.id)
      // An id the Material no longer holds is ignored: another Admin removed it
      // first, and the page this one pressed Save on was simply older.
      const removing = new Set(command.removeItems)
      const removed = material.items.filter((item) => removing.has(item.id))
      const kept = material.items.filter((item) => !removing.has(item.id))
      // After everything it has ever held, not just what it keeps: a new item
      // never takes the place of one removed in the same press.
      // A file the Material already holds is not added twice: Save pressed twice
      // posts the same upload again, and the second press should land as the
      // first did rather than trip the database's one-item-per-object rule.
      const held = new Set(material.items.flatMap((item) => (item.kind === 'file' ? [item.path] : [])))
      const files = command.files.filter((file) => !held.has(file.path))
      const added = theItemsAdded(context, files, command.links, material.items)
      // Removing the last item from a Material with no text is what the content
      // rule refuses.
      const body = theContentOf(command.body, [...kept, ...added])
      const now = context.clock.now()

      return {
        effects: [
          editMaterial({
            ministryId: command.ministryId,
            materialId: material.id,
            title,
            body,
            removed,
            added,
            discarded: removed.flatMap((item) => (item.kind === 'file' ? [item] : [])),
          }),
          // What it used to say, which the edit is about to overwrite and which
          // nothing else keeps: a period points at the row, so the row as it
          // stood is history's alone to remember.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'material.edited',
            subjectType: 'material',
            subjectId: material.id,
            payload: {
              from: {
                title: material.title,
                body: material.body,
                items: material.items.map(asRemembered),
              },
              to: { title, body, items: [...kept, ...added].map(asRemembered) },
              changedBy: command.changedBy,
            },
          }),
        ],
        rejections: [],
      }
    }

    case 'material.remove': {
      const materials = theMaterialsHeld(context)
      const material = theMaterialNamed(materials, command.materialId)

      // The rule, and not the screen's disabled button: a relationship working
      // through it would otherwise be on a Material nobody can see on the tab.
      // The count travels with the refusal so the screen says the number the
      // rule decided on.
      if (material.inUseBy > 0) throw new MaterialRefused('material.in_use', material.inUseBy)

      const now = context.clock.now()

      return {
        effects: [
          removeMaterial({
            ministryId: command.ministryId,
            materialId: material.id,
            removedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'material.removed',
            subjectType: 'material',
            subjectId: material.id,
            payload: { title: material.title, removedBy: command.removedBy },
          }),
        ],
        rejections: [],
      }
    }

    case 'goal.add': {
      const goals = theOptionsOnOffer(context)
      const label = theWordingFor(goals, command.label)
      const now = context.clock.now()
      const id = discipleshipGoalId(context.ids.next())

      return {
        effects: [
          addDiscipleshipGoal({
            id,
            ministryId: command.ministryId,
            label,
            position: nextPosition(goals),
            createdAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'discipleship_goal.added',
            subjectType: 'discipleship_goal',
            subjectId: id,
            payload: { label },
          }),
        ],
        rejections: [],
      }
    }

    case 'goal.rename': {
      const goals = theOptionsOnOffer(context)
      const goal = theOptionNamed(goals, command.goalId)
      // Compared against every other option and never against itself, which is
      // what lets an Admin correct an option's own capitalisation.
      const label = theWordingFor(goals, command.label, goal.id)
      const now = context.clock.now()

      return {
        effects: [
          renameDiscipleshipGoal({
            ministryId: command.ministryId,
            goalId: goal.id,
            label,
          }),
          // The wording it used to carry, which the update is about to overwrite
          // and which nothing else keeps. A Ministry that reworded an option
          // mid-semester can otherwise no longer read its own older reports.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'discipleship_goal.renamed',
            subjectType: 'discipleship_goal',
            subjectId: goal.id,
            payload: { from: goal.label, to: label },
          }),
        ],
        rejections: [],
      }
    }

    case 'goal.move': {
      const goals = theOptionsOnOffer(context)
      const goal = theOptionNamed(goals, command.goalId)
      const order = orderAfterMoving(goals, goal, command.direction)

      // Already where it was asked to go: the top option, sent up. Nothing
      // happened, so nothing is written and history says nothing -- an Admin has
      // asked for the list they are already looking at, which is not an error to
      // invent a refusal for.
      if (!order) return { effects: [], rejections: [] }

      const now = context.clock.now()

      return {
        effects: [
          reorderDiscipleshipGoals({ ministryId: command.ministryId, order }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'discipleship_goal.moved',
            subjectType: 'discipleship_goal',
            subjectId: goal.id,
            payload: { direction: command.direction, order: [...order] },
          }),
        ],
        rejections: [],
      }
    }

    case 'goal.reorder': {
      const goals = theOptionsOnOffer(context)

      // The list the Admin let go of has to be the list the Ministry offers now:
      // every option once, and nothing else. A page somebody else has edited since
      // it was drawn is an ordinary thing to happen, and it is refused rather than
      // applied with a position quietly dropped or invented.
      if (!namesTheWholeList(goals, command.order)) throw new GoalRefused('goal.list_changed')

      const order = orderAfterDragging(goals, command.order)

      // Dropped where it was picked up. Nothing happened, so nothing is written
      // and history says nothing, as with `goal.move` on the top option.
      if (!order) return { effects: [], rejections: [] }

      const now = context.clock.now()

      return {
        effects: [
          reorderDiscipleshipGoals({ ministryId: command.ministryId, order }),
          // About the list rather than one option, so the subject is the Ministry
          // -- and both orders, because the one being overwritten is what nothing
          // else keeps.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'discipleship_goal.reordered',
            subjectType: 'ministry',
            subjectId: command.ministryId,
            payload: { from: asShown(goals), to: [...order] },
          }),
        ],
        rejections: [],
      }
    }

    case 'goal.remove': {
      const goals = theOptionsOnOffer(context)
      const goal = theOptionNamed(goals, command.goalId)
      const blanked = theAnswersAboutToGo(context)

      // The rule, and not the screen's restraint: a Ministry with no options
      // cannot serve an Intake form at all. The database refuses this a second
      // time, because a pilot's settings get written by SQL as often as by a
      // button.
      if (goals.length <= 1) throw new GoalRefused('goal.last_one')

      const now = context.clock.now()

      return {
        effects: [
          removeDiscipleshipGoal({
            ministryId: command.ministryId,
            goalId: goal.id,
            label: goal.label,
            chosenBy: goal.chosenBy,
          }),
          // What it cost, written down at the moment it is spent. The database is
          // about to blank the answers themselves and no query recovers them from
          // there afterwards, so this event is the only thing that will ever be
          // able to say what this option said or who had chosen it.
          //
          // Two different facts, and deliberately not one number twice.
          // `answersLost` is the count an Admin was warned with: people whose
          // *current* answer points here. `blankedAnswers` is every submission the
          // delete touches, which includes the superseded ones of somebody who has
          // since answered differently -- a larger set, and the one that has to be
          // listed if the removal is to be recoverable at all. ADR-0014.
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'discipleship_goal.removed',
            subjectType: 'discipleship_goal',
            subjectId: goal.id,
            payload: {
              label: goal.label,
              answersLost: goal.chosenBy,
              blankedAnswers: blanked.map((answer) => ({
                submissionId: answer.submissionId,
                personId: answer.personId,
                submittedAt: answer.submittedAt.toISOString(),
              })),
            },
          }),
        ],
        rejections: [],
      }
    }

    case 'relationship.create': {
      const { leaderIds, participantIds, declaredGender } = command
      const now = context.clock.now()

      const { relationship, effects } = formRelationship(
        context,
        {
          ministryId: command.ministryId,
          leaderIds,
          participantIds,
          declaredGender,
          name: command.name,
          joinRequiresApproval: command.joinRequiresApproval,
          materialId: command.materialId,
        },
        now,
      )

      // A plan an import made for two people the Admin has just paired by hand is
      // fulfilled by that act. Closed here, in the same transaction, so the row
      // that said *planned* says *paired* the moment the Admin looks back at it
      // and no settle has to notice afterwards.
      for (const plan of context.openPlans ?? []) {
        if (leaderIds.includes(plan.leaderId) && participantIds.includes(plan.participantId)) {
          effects.push(
            closeIntendedPairing({
              ministryId: command.ministryId,
              id: plan.id,
              outcome: 'fulfilled',
              closedAt: now,
              relationshipId: relationship.id,
              refusal: null,
            }),
            appendHistory({
              ministryId: command.ministryId,
              occurredAt: now,
              type: 'intended_pairing.fulfilled',
              subjectType: 'intended_pairing',
              subjectId: plan.id,
              payload: { relationshipId: relationship.id, by: 'admin' },
            }),
          )
        }
      }

      return { rejections: [], effects }
    }

    case 'intended_pairing.fulfil': {
      const plan = context.intendedPairing
      if (plan === undefined) {
        throw new Error('intended_pairing.fulfil was handed nothing about the plan')
      }
      if (plan === null) {
        throw new Error('intended_pairing.fulfil was handed an id that names no plan')
      }
      // Settled already, by an earlier settle or by an Admin pairing them by hand.
      // Nothing to do and nothing to say: the settle asks about every open plan
      // it read a moment ago, and one closing in between is ordinary.
      if (plan.closedAt !== null) return { rejections: [], effects: [] }

      const now = context.clock.now()
      const decision = fulfilmentDecision(plan)

      if (decision.kind === 'wait') return { rejections: [], effects: [] }

      if (decision.kind === 'refuse') {
        return {
          rejections: [],
          effects: refuseIntendedPairing(context, plan, decision.refusal, now),
        }
      }

      // Formed by the same rules and with the same invitation as pairing by hand:
      // one Discipler, one Disciple, a one-to-one, which is asked no declaration
      // and takes no name.
      const { relationship, effects } = formRelationship(
        context,
        {
          ministryId: context.ministryId,
          leaderIds: [plan.leader.personId],
          participantIds: [plan.participant.personId],
          declaredGender: undefined,
          name: null,
          joinRequiresApproval: false,
          // A plan an import made names two people and nothing else.
          materialId: undefined,
        },
        now,
      )

      effects.push(
        closeIntendedPairing({
          ministryId: context.ministryId,
          id: plan.id,
          outcome: 'fulfilled',
          closedAt: now,
          relationshipId: relationship.id,
          refusal: null,
        }),
        appendHistory({
          ministryId: context.ministryId,
          occurredAt: now,
          type: 'intended_pairing.fulfilled',
          subjectType: 'intended_pairing',
          subjectId: plan.id,
          payload: { relationshipId: relationship.id, by: 'intake' },
        }),
      )

      return { rejections: [], effects }
    }

    case 'intended_pairing.refuse': {
      // The database refused what a fulfilment tried to form -- a cap, a race --
      // and rolled that transaction back. This one records the refusal by its
      // code, exactly as the fulfilment would have had the snapshot seen it.
      const plan = context.intendedPairing
      if (plan === undefined) {
        throw new Error('intended_pairing.refuse was handed nothing about the plan')
      }
      if (plan === null) {
        throw new Error('intended_pairing.refuse was handed an id that names no plan')
      }
      if (plan.closedAt !== null) return { rejections: [], effects: [] }

      return {
        rejections: [],
        effects: refuseIntendedPairing(context, plan, command.refusal, context.clock.now()),
      }
    }

    case 'relationship.accept': {
      const { invitation, ministryName } = tokenContext(context)
      const now = context.clock.now()

      const state = invitationState(invitation, now)
      if (state === 'expired') throw new InvitationRefused('invitation.expired')
      if (state === 'consumed') throw new InvitationRefused('invitation.already_used')
      // Said before their membership is looked for, which a decline ended: a link
      // she declined is told so, and not that nothing answers to it.
      if (state === 'declined') throw new InvitationRefused('invitation.declined')

      const me = memberHolding(invitation, invitation.personId)
      // Read off their membership, never off the token. A Participant's link opens
      // the same page and leads somewhere else entirely.
      if (me.role !== 'leader') throw new InvitationRefused('invitation.not_a_leader')

      const leaders = invitation.members.filter((member) => member.role === 'leader')
      const participants = invitation.members.filter((member) => member.role === 'participant')

      // Every other open leader membership has already accepted, so this one is the
      // last. Activation is the whole set agreeing, not the first of them.
      //
      // And it happens once (Manual pairing, recut ticket 01; decided by James on
      // 2026-09-20). A Leader an Admin added to a group already running is the
      // last to agree as well, and activates nothing: their Acceptance is recorded
      // on their own membership and that is all. The Starter Message went out at
      // activation, and a second one would introduce the Participants to a
      // relationship they are already in. The group's existing Leaders are sent
      // nothing either.
      const lastToAgree = leaders.every(
        (leader) => leader.personId === me.personId || leader.acceptedAt !== null,
      )
      const activatesRelationship = invitation.relationshipAcceptedAt === null && lastToAgree

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

      // The item the tick raised after five days of silence, closed by the answer
      // it was waiting for. It is the relationship's and not one Leader's, so it
      // stands until nobody is left to answer, whether that activates the
      // relationship or is a Leader added to one already running. Left open it
      // would tell an Admin somebody has not accepted who has, beside a Cancel the
      // relationship now refuses. It carries no Admin, because no Admin performed
      // it; the event says what did.
      if (lastToAgree && invitation.unansweredItemId !== null) {
        effects.push(
          ...closedByWhatItWaitedFor(command.ministryId, invitation.unansweredItemId, now, 'acceptance'),
        )
      }

      if (!activatesRelationship) {
        // A Leader added to a relationship already running is sent theirs, and
        // they alone (James, 2026-09-21): without it they never get the link to
        // the page that says who they are leading and how to reach them. The
        // Participants and the Leaders it already has are still sent nothing.
        if (invitation.relationshipAcceptedAt !== null) {
          effects.push(starterToLeader(context, command.ministryId, ministryName, me, now))
        }
        return { rejections: [], effects }
      }

      effects.push(
        ...activationOf(context, {
          ministryId: command.ministryId,
          ministryName,
          invitation,
          leaders,
          participants,
          now,
        }),
      )

      return { rejections: [], effects }
    }

    case 'invitation.decline': {
      const { invitation } = tokenContext(context)
      const now = context.clock.now()

      // Offered wherever Accept is, and nowhere else: a link that has run out, been
      // spent or been declined already declines nothing.
      const state = invitationState(invitation, now)
      if (state === 'expired') throw new InvitationRefused('invitation.expired')
      if (state === 'consumed') throw new InvitationRefused('invitation.already_used')
      if (state === 'declined') throw new InvitationRefused('invitation.declined')

      const me = memberHolding(invitation, invitation.personId)
      if (me.role !== 'leader') throw new InvitationRefused('invitation.not_a_leader')
      // An open invitation beside an acceptance is a state nothing produces. Fenced
      // all the same: declining must never end a membership that has begun leading.
      if (me.acceptedAt !== null) throw new InvitationRefused('invitation.already_used')

      return {
        rejections: [],
        effects: withdrawalOf(context, command, { me, withdrawnAs: 'declined', now }),
      }
    }

    case 'invitation.withdraw': {
      const { invitation } = tokenContext(context)
      const now = context.clock.now()

      // Spent or withdrawn already, it is nobody's to take back. One that has run
      // out and not been swept yet still is: their membership is still open, and
      // an Admin looking at it is not made to wait for the tick.
      if (invitation.consumedAt !== null) throw new InvitationRefused('invitation.already_used')
      if (invitation.withdrawnAs === 'declined') throw new InvitationRefused('invitation.declined')
      if (invitation.withdrawnAs !== null) throw new InvitationRefused('invitation.expired')

      const me = memberHolding(invitation, invitation.personId)
      if (me.role !== 'leader') throw new InvitationRefused('invitation.not_a_leader')
      // Fenced as a decline is: taking an invitation back must never end a
      // membership that has begun leading. That is a departure, or an ending.
      if (me.acceptedAt !== null) throw new InvitationRefused('invitation.already_used')

      return {
        rejections: [],
        effects: withdrawalOf(context, command, {
          me,
          withdrawnAs: 'withdrawn',
          now,
          withdrawnBy: command.withdrawnBy,
        }),
      }
    }

    case 'invitation.expire': {
      const { invitation } = tokenContext(context)
      const now = context.clock.now()

      // Decided again here, behind the row an acceptance holds, and not taken from
      // the tick's read of who had lapsed. An invitation accepted in the same
      // moment is found accepted, one an Admin re-sent is found live again, and
      // either way nothing is withdrawn: a Leader's acceptance never fails on the
      // product's timing. None of them is a refusal, because nobody is asking.
      if (invitation.consumedAt !== null || invitation.withdrawnAs !== null) {
        return { rejections: [], effects: [] }
      }
      if (!hasRunOut(invitation.expiresAt, now)) return { rejections: [], effects: [] }

      const me = invitation.members.find((member) => member.personId === invitation.personId)
      if (!me || me.role !== 'leader' || me.acceptedAt !== null) {
        return { rejections: [], effects: [] }
      }

      return {
        rejections: [],
        effects: withdrawalOf(context, command, { me, withdrawnAs: 'expired', now }),
      }
    }

    case 'invitation.dispute_number': {
      const invitation = context.invitation
      if (!invitation) {
        throw new Error(`${command.type} was handed no invitation to act on`)
      }

      const me = memberHolding(invitation, invitation.personId)
      const now = context.clock.now()

      // A Leader disputes the number Discipler holds for them, and only a Leader:
      // a link forwarded to somebody else cannot become theirs. Only a Leader is
      // ever sent one -- see `docs/adr/0011-only-a-leader-is-sent-a-link.md` -- so
      // this refusal is a fence around a state nothing produces rather than a
      // branch the flow reaches.
      if (me.role !== 'leader') {
        throw new InvitationRefused('invitation.not_a_leader')
      }

      // It changes nothing else. A forwarded link can never re-point an account,
      // and unpairing stays a pastoral decision an Admin makes.
      return {
        rejections: [],
        effects: [
          raiseFollowUpItem({
            ministryId: command.ministryId,
            kind: 'invitation_number_disputed',
            personId: me.personId,
            relationshipId: invitation.relationshipId,
            raisedAt: now,
          }),
          appendHistory({
            ministryId: command.ministryId,
            occurredAt: now,
            type: 'follow_up.invitation_number_disputed',
            subjectType: 'relationship',
            subjectId: invitation.relationshipId,
            payload: { personId: me.personId },
          }),
        ],
      }
    }
  }
}

/**
 * The Person a removal names, or why they are not removed. The page offers the
 * card only where none of these would refuse; reaching one is a page drawn before
 * something changed, or a form composed by hand.
 */
const theRemovable = (person: PersonToRemove | null): PersonToRemove => {
  if (person === null) throw new RemovalRefused('removal.not_on_the_roster')
  if (person.isAdmin) throw new RemovalRefused('removal.person_is_an_admin')
  if (person.openMemberships > 0) throw new RemovalRefused('removal.still_in_a_pairing')
  return person
}
