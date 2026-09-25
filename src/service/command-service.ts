import { handleCommand, type CommandResult, type InvitationSnapshot } from '~/domain/boundary'
import type { Clock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import { PairingRefused, type PairingRefusal } from '~/domain/errors'
import type { NewHistoryEvent } from '~/domain/history'
import type { IntendedPairingId, MinistryId } from '~/domain/ids'
import type { Effect } from '~/domain/effects'
import {
  CancellationRefused,
  CheckInRefused,
  DepartureRefused,
  EndingRefused,
  GroupJoinRefused,
  GroupRefused,
  InvitationRefused,
  ReinvitationRefused,
  MaterialAssignmentRefused,
  PauseRefused,
} from '~/domain/errors'
import type { FollowUpItemId, IdSource, ImportRowId, PersonId, RelationshipId } from '~/domain/ids'
import { answersNoGroupInMind } from '~/domain/intake'
import type { IntakeLinkToken } from '~/domain/intake-link'
import { REMOVED_FROM_THE_ROSTER, type PairingToLetGo } from '~/domain/removal'
import type { InvitationToken } from '~/domain/invitations'
import { settleRatesLine, whoseRatesLineIsAsked } from '~/domain/rates-line'
import type { EffectStore, UnitOfWork } from './ports'

export interface CommandServiceDependencies {
  readonly clock: Clock
  readonly ids: IdSource
  readonly store: EffectStore
  /**
   * Where the links Discipler texts point. Configuration, injected here rather
   * than read from the environment inside the domain, for the same reason the
   * clock is: a boundary that reached for `process.env` would stop being a pure
   * function of its inputs.
   */
  readonly appBaseUrl: string
}

/**
 * The only way into the domain. External triggers -- an HTTP handler, the inbound
 * SMS webhook, the scheduler, an Admin clicking a button -- all arrive here and
 * nowhere else.
 */
export interface CommandService {
  execute(command: Command): Promise<CommandResult>
  /**
   * An Admin opening one Concern's text.
   *
   * Separate from `execute` because it is the one act in Discipler that both
   * writes and answers: the viewing is recorded and the Leader's words come back
   * from the *same* transaction. Two calls -- record, then read -- would be a pair
   * a caller could take half of, and the half worth skipping is the audit.
   *
   * Null when the Concern is gone, or has been resolved and cleared. The
   * authenticated role holds no grant on that column, so this is the only path to
   * it that exists.
   */
  openConcern(
    command: Extract<Command, { readonly type: 'concern.view' }>,
  ): Promise<string | null>

  /**
   * Settles every plan an import made that is still standing: forms the ones both
   * people have completed Intake for, refuses the ones the rules refuse, leaves
   * the rest waiting. One transaction per plan, so one refusal never rolls back
   * another person's relationship -- and the database's own refusal of a pairing
   * (a cap, a race the snapshot could not see) is caught here and recorded by its
   * code in a transaction of its own, exactly as the Pair popup's route catches
   * the same refusal. Called after an Intake submission, after an import, and by
   * the scheduled tick (ADR-0022).
   */
  settleIntendedPairings(ministryId: MinistryId): Promise<SettledPairings>

  /**
   * Withdraws every invitation in this Ministry that nobody answered before its
   * fortnight ran out (Manual pairing, recut ticket 06), and answers how many.
   * One transaction per invitation, as plans are settled, so one failing never
   * rolls back another -- and each is decided again inside its own transaction,
   * behind the row an acceptance holds, so an invitation accepted in the same
   * moment is accepted and is not withdrawn. Called by the scheduled tick's route.
   */
  withdrawLapsedInvitations(ministryId: MinistryId): Promise<number>

  /**
   * An Admin taking back the invitation one Person holds to one relationship
   * (Unpair, James 2026-09-21), and whether there was one to take back. The token
   * is found here and never handed to a surface: it is a credential, and the act
   * is about a Person on a relationship. Decided again inside `invitation.withdraw`,
   * behind the row an acceptance holds, which throws `InvitationRefused` where the
   * invitation was answered in the same moment.
   */
  withdrawInvitationOf(
    ministryId: MinistryId,
    relationshipId: RelationshipId,
    personId: PersonId,
    withdrawnBy: string,
  ): Promise<boolean>

  /**
   * Whether forming this relationship would be refused, without forming it: the
   * `PairingRefusal` that `execute` would have thrown for the same command at this
   * moment, or null where it would have gone ahead (Manual pairing, ticket 03;
   * ADR-0025).
   *
   * It is formation itself -- the same reads, the same boundary decision, the same
   * writes -- in a transaction that is always rolled back. Not the boundary's
   * decision alone, because most of what refuses a pairing is not the boundary's:
   * gender, Intake, opt-outs and the participation caps are triggers and indexes on
   * `relationship_member`, and they answer only when a row is written. A check that
   * stopped short of the write would pass a pairing across gender, and one that
   * mirrored those rules in order to stop short would be the second copy ADR-0004
   * refuses. So the rows are written, the database has its say, and none of it is
   * kept: no relationship, membership, invitation, history event or outbound
   * message survives, whatever the answer.
   *
   * What it cannot see is anything that has not happened yet. It answers for the
   * database as it stands, so a caller checking several pairings before forming
   * any is told nothing about what forming the first does to the second, nor about
   * what anybody else does in between. Forming can still be refused after a check
   * that passed, and a caller has to be ready for that.
   *
   * Only `relationship.create`. This is not a dry run for commands in general, and
   * no other command gains one here. Anything that is not a `PairingRefused` is
   * thrown as `execute` would throw it.
   */
  checkPairing(
    command: Extract<Command, { readonly type: 'relationship.create' }>,
  ): Promise<PairingRefusal | null>

  /**
   * An Admin removing a Person from the Roster (Remove from the Roster, ticket
   * 01), their pairings with them: each pairing is let go of by the Unpair act it
   * names, then `person.remove` runs, all in one transaction. A removal happens
   * whole or not at all, so a refusal of any part of it -- a pairing that changed
   * while the Admin was looking -- leaves every pairing as it was.
   *
   * A pairing that ends records how, and nothing on the removal asks: it is
   * recorded as not having run its course, in the product's own sentence.
   */
  removePerson(removal: {
    readonly ministryId: MinistryId
    readonly personId: PersonId
    readonly removedBy: string
    readonly pairings: readonly PairingToLetGo[]
  }): Promise<CommandResult>
}

export interface SettledPairings {
  readonly fulfilled: number
  readonly refused: number
  readonly waiting: number
}

export const applyEffects = async (
  effects: readonly Effect[],
  unit: UnitOfWork,
): Promise<void> => {
  // Separate narrowings rather than one generic collector: each `flatMap`
  // below is type-safe on its own, and the generic that would replace them needs a
  // cast to convince the compiler of what the tag already proves.
  const people = effects.flatMap((effect) =>
    effect.kind === 'person.create' ? [effect.person] : [],
  )
  const relationships = effects.flatMap((effect) =>
    effect.kind === 'relationship.create' ? [effect.relationship] : [],
  )
  const intakes = effects.flatMap((effect) =>
    effect.kind === 'intake.record' ? [effect.intake] : [],
  )
  const history = effects.flatMap((effect) =>
    effect.kind === 'history.append' ? [effect.event] : [],
  )
  const messages = effects.flatMap((effect) =>
    effect.kind === 'message.enqueue' ? [effect.message] : [],
  )
  const replyClosures = effects.flatMap((effect) =>
    effect.kind === 'outstandingReply.close' ? [effect.closure] : [],
  )
  const replySweeps = effects.flatMap((effect) =>
    effect.kind === 'outstandingReply.sweep' ? [effect.sweep] : [],
  )
  const invitations = effects.flatMap((effect) =>
    effect.kind === 'invitation.issue' ? [effect.invitation] : [],
  )
  const reissues = effects.flatMap((effect) =>
    effect.kind === 'invitation.reissue' ? [effect.invitation] : [],
  )
  const acceptances = effects.flatMap((effect) =>
    effect.kind === 'invitation.accept' ? [effect.acceptance] : [],
  )
  const withdrawals = effects.flatMap((effect) =>
    effect.kind === 'invitation.withdraw' ? [effect.withdrawal] : [],
  )
  const followUps = effects.flatMap((effect) => (effect.kind === 'followUp.raise' ? [effect] : []))
  const plans = effects.flatMap((effect) =>
    effect.kind === 'intendedPairing.plan' ? [effect.plan] : [],
  )
  const planClosures = effects.flatMap((effect) =>
    effect.kind === 'intendedPairing.close' ? [effect.closure] : [],
  )
  const resolutions = effects.flatMap((effect) =>
    effect.kind === 'followUp.resolve' ? [effect.resolution] : [],
  )
  const cancellations = effects.flatMap((effect) =>
    effect.kind === 'relationship.cancel' ? [effect.cancellation] : [],
  )
  const endings = effects.flatMap((effect) =>
    effect.kind === 'relationship.end' ? [effect.ending] : [],
  )
  const departures = effects.flatMap((effect) =>
    effect.kind === 'relationship.depart' ? [effect.departure] : [],
  )
  const joins = effects.flatMap((effect) =>
    effect.kind === 'relationship.join' ? [effect.membership] : [],
  )
  const addedLeaders = effects.flatMap((effect) =>
    effect.kind === 'relationship.add_leader' ? [effect.membership] : [],
  )
  const groupConfigurations = effects.flatMap((effect) =>
    effect.kind === 'group.configure' ? [effect.configuration] : [],
  )
  const materialAssignments = effects.flatMap((effect) =>
    effect.kind === 'material.assign' ? [effect.assignment] : [],
  )
  const checkInAnswers = effects.flatMap((effect) =>
    effect.kind === 'checkin.answer' ? [effect.answer] : [],
  )
  const closures = effects.flatMap((effect) =>
    effect.kind === 'checkin.close' ? [effect.closure] : [],
  )
  const sequences = effects.flatMap((effect) =>
    effect.kind === 'checkin.open' ? [effect.sequence] : [],
  )
  const prompts = effects.flatMap((effect) =>
    effect.kind === 'checkin.ask' ? [effect.prompt] : [],
  )
  const clarifications = effects.flatMap((effect) =>
    effect.kind === 'checkin.clarify' ? [effect.clarification] : [],
  )
  const reminders = effects.flatMap((effect) =>
    effect.kind === 'checkin.remind' ? [effect.reminder] : [],
  )
  const optOuts = effects.flatMap((effect) =>
    effect.kind === 'person.opt_out' ? [effect.optOut] : [],
  )
  const removals = effects.flatMap((effect) =>
    effect.kind === 'person.remove' ? [effect.removal] : [],
  )
  const restorations = effects.flatMap((effect) =>
    effect.kind === 'person.restore' ? [effect.restoration] : [],
  )
  const optIns = effects.flatMap((effect) =>
    effect.kind === 'person.opt_in' ? [effect.optIn] : [],
  )
  const exchanges = effects.flatMap((effect) =>
    effect.kind === 'keyword.open' ? [effect.exchange] : [],
  )
  const exchangeTargets = effects.flatMap((effect) =>
    effect.kind === 'keyword.target' ? [effect.target] : [],
  )
  const exchangeClarifications = effects.flatMap((effect) =>
    effect.kind === 'keyword.clarify' ? [effect.clarification] : [],
  )
  const exchangeClosures = effects.flatMap((effect) =>
    effect.kind === 'keyword.close' ? [effect.closure] : [],
  )
  const intakeLinks = effects.flatMap((effect) =>
    effect.kind === 'intake_link.issue' ? [effect.link] : [],
  )
  const settingsSaves = effects.flatMap((effect) =>
    effect.kind === 'settings.save' ? [effect.saving] : [],
  )
  const addedGoals = effects.flatMap((effect) =>
    effect.kind === 'goal.add' ? [effect.goal] : [],
  )
  const renamedGoals = effects.flatMap((effect) =>
    effect.kind === 'goal.rename' ? [effect.renaming] : [],
  )
  const goalOrders = effects.flatMap((effect) =>
    effect.kind === 'goal.reorder' ? [effect.order] : [],
  )
  const removedGoals = effects.flatMap((effect) =>
    effect.kind === 'goal.remove' ? [effect.removal] : [],
  )
  const createdMaterials = effects.flatMap((effect) =>
    effect.kind === 'material.create' ? [effect.material] : [],
  )
  const editedMaterials = effects.flatMap((effect) =>
    effect.kind === 'material.edit' ? [effect.edit] : [],
  )
  const removedMaterials = effects.flatMap((effect) =>
    effect.kind === 'material.remove' ? [effect.removal] : [],
  )
  const materialNotices = effects.flatMap((effect) =>
    effect.kind === 'materialNotice.record' ? [effect.notice] : [],
  )
  const materialLinks = effects.flatMap((effect) =>
    effect.kind === 'materialLink.issue' ? [effect.link] : [],
  )
  const concerns = effects.flatMap((effect) =>
    effect.kind === 'concern.raise' ? [effect.concern] : [],
  )
  const viewings = effects.flatMap((effect) =>
    effect.kind === 'concern.view' ? [effect.viewing] : [],
  )
  const concernResolutions = effects.flatMap((effect) =>
    effect.kind === 'concern.resolve' ? [effect.resolution] : [],
  )
  const heldRows = effects.flatMap((effect) =>
    effect.kind === 'importRow.raise' ? [effect.row] : [],
  )
  const renamings = effects.flatMap((effect) =>
    effect.kind === 'person.rename' ? [effect.renaming] : [],
  )
  const answeredRows = effects.flatMap((effect) =>
    effect.kind === 'importRow.resolve' ? [effect.resolution] : [],
  )

  // Rows before the facts about them. The whole unit of work is one transaction, so
  // ordering buys nothing for atomicity -- it buys the error: a pairing the caps
  // refuse fails as a refusal, rather than after history has already said it
  // happened.
  if (people.length > 0) await unit.createPeople(people)
  // Straight after, and before anything that pairs them: a Person back through
  // Intake who names a group on the same form joins it in the same transaction,
  // and the membership trigger refuses anybody still standing removed.
  for (const restoration of restorations) await unit.restorePerson(restoration)
  // The plans a formation is about to close, locked before its memberships are
  // written and not after: the order settling a plan takes them in, so the two can
  // wait for each other but never on each other.
  if (relationships.length > 0 && planClosures.length > 0) {
    await unit.lockIntendedPairings(planClosures.map((closure) => closure.id))
  }
  for (const relationship of relationships) await unit.createRelationship(relationship)

  // After the relationship a fulfilled plan names, which its foreign key needs,
  // and before the Follow-Up Item a refused one raises, which points back at it.
  for (const closure of planClosures) await unit.closeIntendedPairing(closure)

  // After the people, and before the answers that name them. An import files what
  // it could and holds what it would not guess about, in that order; an answer
  // renames or creates a Person and then records which Person the row became, and
  // the row's foreign key is what would catch the two in the wrong order.
  if (heldRows.length > 0) await unit.holdImportRows(heldRows)
  for (const renaming of renamings) await unit.renamePerson(renaming)
  for (const resolution of answeredRows) await unit.resolveImportRow(resolution)

  // After the people a plan names, which its foreign keys need, and before the
  // Intake record: a plan waits on Intake, and the order here is the order of the
  // story.
  if (plans.length > 0) await unit.planIntendedPairings(plans)

  // Before the messages, and not merely inside the same transaction. The outbound
  // queue refuses a message to anybody with no SMS consent on file, so a Welcome
  // Message enqueued ahead of the consent that permits it is refused by the
  // database -- which is the floor working, and the wrong way round to hit it.
  for (const intake of intakes) await unit.recordIntake(intake)

  // After the relationship, which an invitation points at, and after the
  // acceptance that spends the Leader's token -- a Participant's link is issued by
  // the same act that consumes the Leader's, and the one live token per person per
  // relationship index is what would catch the two in the wrong order.
  for (const acceptance of acceptances) await unit.acceptInvitation(acceptance)
  // Beside the acceptances, for the reason they are here: it stamps the
  // relationship where it activates it, which the Material period below starts
  // from, and it ends the membership before the history saying so.
  for (const withdrawal of withdrawals) await unit.withdrawInvitation(withdrawal)
  for (const invitation of invitations) await unit.issueInvitation(invitation)
  // After the issues, for the same ordering reason: both write the row the one
  // live token per person per relationship index governs, and a re-issue landing
  // before the insert it replaces would be refused by that index rather than
  // replacing anything.
  for (const invitation of reissues) await unit.reissueInvitation(invitation)
  // History that is only true if its item was raised goes with it or not at all.
  const recordedWithAnItem: NewHistoryEvent[] = []
  for (const { item, recordedAs } of followUps) {
    const stillTrue = await unit.raiseFollowUp(item)
    if (stillTrue && recordedAs) recordedWithAnItem.push(recordedAs)
  }

  // Before the history that says they happened, like every other write here. An
  // Admin resolving an item somebody else closed a second earlier is refused, and
  // being refused after history had already recorded the resolution would leave a
  // Ministry's record claiming a decision nobody made.
  for (const resolution of resolutions) await unit.resolveFollowUp(resolution)
  for (const cancellation of cancellations) await unit.cancelRelationship(cancellation)
  for (const ending of endings) await unit.endRelationship(ending)
  for (const departure of departures) await unit.departFromRelationship(departure)
  // After the resolutions above, which close the items about them, and before the
  // history saying it happened, like every other write here.
  for (const removal of removals) await unit.removePerson(removal)

  // After the Intake, which is what the membership's own Intake gate reads: a
  // Person joining a group on the form they have just completed is admitted by the
  // trigger only once the submission and the consent it reads are on the rows.
  // Before the history saying they joined, like every other write here.
  for (const membership of joins) await unit.joinRelationship(membership)
  // A refused membership rolls the invitation issued above back with it, like
  // everything else in the transaction; nothing is sent for a Leader not added.
  for (const membership of addedLeaders) await unit.addLeaderToGroup(membership)
  for (const configuration of groupConfigurations) await unit.configureGroup(configuration)

  // After the acceptance that stamps `accepted_at`, because that is the instant the
  // period with no Material starts from and the row has to exist for it to start.
  // Before the history saying it happened, like every other write here. All of
  // them at once and in order: acceptance's opening period before the Material
  // chosen at pairing, and an Admin's many in the order the page listed them.
  if (materialAssignments.length > 0) await unit.assignMaterials(materialAssignments)

  // The answer to the question that was open, then the conversation it finished,
  // then the one that replaces it, then its first question. In that order because
  // a Leader has one conversation at a time: the partial unique index refuses a
  // second open sequence, so the one being displaced has to close before the new
  // one can open.
  for (const answer of checkInAnswers) await unit.recordCheckInAnswer(answer)

  // Against the prompt that is still open, so both land before anything can close
  // the conversation they belong to. Neither answers a question: a clarification
  // is Discipler speaking and a reminder is Discipler speaking again, and the
  // question they are about stays unanswered either way.
  for (const clarification of clarifications) await unit.clarifyCheckInQuestion(clarification)
  for (const reminder of reminders) await unit.remindCheckInQuestion(reminder)

  // After the answer that produced it, so the prompt holding the raw reply and the
  // Concern standing beside it land in that order -- and before the history saying
  // it was raised, like every other write here.
  for (const concern of concerns) await unit.raiseConcern(concern)

  // Before the history that says they happened. An Admin resolving a Concern
  // somebody else closed a second earlier is refused, and being refused after
  // history had already recorded it would leave a Ministry's record claiming a
  // decision nobody made -- and, worse here, claiming words were cleared that are
  // still on the row.
  for (const viewing of viewings) await unit.recordConcernViewing(viewing)
  for (const resolution of concernResolutions) await unit.resolveConcern(resolution)

  // The exchange that is ending, then the one that replaces it, then the moves
  // inside whichever is now open. In that order because a Person holds one exchange
  // at a time: the partial unique index refuses a second open row, so the one being
  // replaced has to close before the new one can open -- exactly as a Check-In
  // Sequence does.
  for (const closure of exchangeClosures) await unit.closeKeywordExchange(closure)
  for (const exchange of exchanges) await unit.openKeywordExchange(exchange)
  for (const target of exchangeTargets) await unit.setKeywordExchangeTarget(target)
  for (const clarification of exchangeClarifications) {
    await unit.clarifyKeywordExchange(clarification)
  }

  for (const closure of closures) await unit.closeCheckInSequence(closure)
  for (const sequence of sequences) await unit.openCheckInSequence(sequence)
  for (const prompt of prompts) await unit.askCheckInQuestion(prompt)

  // Before the history that says it happened, like every other write here.
  for (const link of intakeLinks) await unit.issueIntakeLink(link)

  // Before the history saying it happened, like every other write here. The
  // database refuses a zone it does not know and an hour outside quiet hours, and
  // being refused after history had already recorded the change would leave a
  // Ministry's record claiming a cadence nothing ever ran on.
  for (const saving of settingsSaves) await unit.saveMinistrySettings(saving.settings)

  // The option, then the list it belongs to. An addition lands before the
  // renumbering that would place it, and a removal before the renumbering that
  // closes the gap it left -- so the order written is always the order of the
  // list as it now stands rather than as it stood a statement ago.
  //
  // Before the history saying they happened, like every other write here: the
  // database refuses to delete a Ministry's last option, and being refused after
  // history had already recorded the loss would leave a Ministry's record
  // claiming answers were destroyed that are still on the rows.
  for (const goal of addedGoals) await unit.addDiscipleshipGoal(goal)
  for (const renaming of renamedGoals) await unit.renameDiscipleshipGoal(renaming)
  for (const removal of removedGoals) await unit.removeDiscipleshipGoal(removal)
  for (const order of goalOrders) await unit.reorderDiscipleshipGoals(order)

  // Before the history saying they happened, like every other write here: the
  // database refuses a second live Material with the same title, and being
  // refused after history had already recorded the Material would leave a
  // Ministry's record naming one that never landed.
  for (const material of createdMaterials) await unit.createMaterial(material)
  for (const edit of editedMaterials) await unit.editMaterial(edit)
  for (const removal of removedMaterials) await unit.removeMaterial(removal)

  // What people have been told about their Materials, beside the texts that tell
  // them: the tick writes both in one transaction, so a text that went out is a
  // text recorded, and a crash between them leaves neither.
  if (materialLinks.length > 0) await unit.issueMaterialLinks(materialLinks)
  if (materialNotices.length > 0) await unit.recordMaterialNotices(materialNotices)

  // Before the messages, and that ordering is the whole of what `START` does. The
  // outbound queue refuses anything bound for a Person with an open opt-out, so a
  // re-opt-in applied after the messages it permits would have the database refuse
  // a message the Person had just asked to start receiving again.
  for (const optIn of optIns) await unit.optPersonIn(optIn)

  // Before the messages, and that ordering is the whole of *a reply releases what
  // was waiting*. A command that answers a question and asks the next one on the
  // same number does both here, and a closure applied after the message it makes
  // room for would leave the new question waiting on the one the Leader just
  // answered.
  for (const sweep of replySweeps) await unit.sweepOutstandingReplies(sweep)
  for (const closure of replyClosures) await unit.closeOutstandingReply(closure)

  // History before messages: a message that goes out unrecorded is worse than a
  // recorded message that failed to send, because only one of the two can be
  // reconstructed.
  const recorded = [...history, ...recordedWithAnItem]
  if (recorded.length > 0) await unit.appendHistory(recorded)

  // Every text the command queues is settled against the rates line together,
  // once they are all known: a Person has the line at most once a month, and only
  // the whole list can say which of their texts is the first (Text wording,
  // ticket 01).
  if (messages.length > 0) {
    const hadSoFar = await unit.ratesLineHistory(whoseRatesLineIsAsked(messages))
    await unit.enqueueMessages(settleRatesLine(messages, hadSoFar))
  }

  // Last of all. The outbound queue refuses a message to anybody with an open
  // opt-out, so a `STOP` applied ahead of a message enqueued by the same command
  // would have the database refuse a message that was composed before the Person
  // asked to be left alone.
  for (const optOut of optOuts) await unit.optPersonOut(optOut)
}

/**
 * Which commands need state loaded before the domain can decide anything. Naming
 * them here keeps the load explicit and keeps every other command from paying for a
 * read it has no use for.
 */
const needsTheRoster = (command: Command): boolean =>
  command.type === 'person.import' ||
  command.type === 'intake.submit' ||
  // It decides against the names the row's number already holds: which Person a
  // rename may name, and whether the name in the file has landed there since.
  command.type === 'import_row.resolve'

/** The commands an Admin performs on one named relationship. */
type AboutOneRelationship = Extract<
  Command,
  {
    type:
      | 'relationship.assign_material'
      | 'relationship.cancel'
      | 'relationship.depart'
      | 'relationship.end'
      | 'relationship.pause'
      | 'relationship.resume'
      | 'group.configure'
  }
>

/**
 * The six commands that name one relationship an Admin is acting on. Each needs
 * the same snapshot, read under the same lock.
 */
const isAboutOneRelationship = (command: Command): command is AboutOneRelationship =>
  command.type === 'relationship.assign_material' ||
  command.type === 'relationship.cancel' ||
  command.type === 'relationship.depart' ||
  command.type === 'relationship.end' ||
  command.type === 'relationship.pause' ||
  command.type === 'relationship.resume' ||
  command.type === 'group.configure'

/**
 * What each of them calls *there is no such relationship*. One map rather than a
 * chain of ternaries, so a seventh command added to the union above fails to
 * compile here until it says which refusal it carries -- rather than silently
 * inheriting whichever branch happened to be last.
 */
const NOT_FOUND: Readonly<Record<AboutOneRelationship['type'], () => Error>> = {
  'relationship.assign_material': () =>
    new MaterialAssignmentRefused('material.relationship_not_found'),
  'relationship.cancel': () => new CancellationRefused('relationship.not_found'),
  'relationship.depart': () => new DepartureRefused('departure.relationship_not_found'),
  'relationship.end': () => new EndingRefused('ending.relationship_not_found'),
  'relationship.pause': () => new PauseRefused('pause.relationship_not_found'),
  'relationship.resume': () => new PauseRefused('pause.relationship_not_found'),
  'group.configure': () => new GroupRefused('group.relationship_not_found'),
}

/**
 * The relationship an Admin command names. Absent rather than defaulted, and a
 * relationship this Ministry does not hold is refused here rather than handed on
 * as an empty snapshot -- which would read as "this command was called wrong"
 * instead of "there is no such relationship".
 *
 * The refusal follows the command, because the ones that reach here are separate
 * acts and a surface renders its own wording from the code it is given.
 */
const named = async (unit: UnitOfWork, command: AboutOneRelationship) => {
  const relationship = await unit.relationshipFor(command.relationshipId)
  if (relationship) return relationship

  throw NOT_FOUND[command.type]()
}

/**
 * The four ways an Admin edits the Ministry's Discipleship Goal options. Each of
 * them decides against the whole list -- whether an option is a duplicate, where
 * a new one goes, whether this is the last one left -- so each of them loads it.
 *
 * Named once and read both ways: the type the guard narrows to is derived from
 * this list, so a fifth edit cannot be added to one and forgotten in the other.
 */
const GOAL_LIST_EDITS = [
  'goal.add',
  'goal.rename',
  'goal.move',
  'goal.reorder',
  'goal.remove',
] as const

const editsTheGoalList = (
  command: Command,
): command is Extract<Command, { type: (typeof GOAL_LIST_EDITS)[number] }> =>
  (GOAL_LIST_EDITS as readonly string[]).includes(command.type)

/**
 * The three ways an Admin edits the Ministry's own list of Materials. Each of
 * them decides against the whole list -- whether a title is taken, whether the
 * Material named is still on it, whether anybody is working through it -- so
 * each of them loads it, as the goal edits load theirs.
 */
const MATERIAL_LIST_EDITS = ['material.create', 'material.edit', 'material.remove'] as const

const editsTheMaterialList = (
  command: Command,
): command is Extract<Command, { type: (typeof MATERIAL_LIST_EDITS)[number] }> =>
  (MATERIAL_LIST_EDITS as readonly string[]).includes(command.type)

/**
 * Whether a command that is not an edit of the list still decides against it:
 * forming a relationship with the Material an Admin chose, assigning one, or
 * accepting a relationship whose intended Material is still to be spent. Forming or accepting anything else pays
 * nothing, and takes no lock on the Ministry's list.
 */
const consultsTheMaterialList = (
  command: Command,
  invitation: InvitationSnapshot | undefined,
): boolean =>
  (command.type === 'relationship.create' && command.materialId !== undefined) ||
  // Assigning a Material names one to check; the un-assign names none (Materials,
  // ticket 03). Behind the list's own lock, so an assignment and a removal of
  // the same Material cannot both decide from a list the other has changed.
  (command.type === 'relationship.assign_material' && command.materialId !== null) ||
  // And assigning one to many, which always names one (Richer materials, ticket 02).
  command.type === 'material.assign_to_relationships' ||
  // A withdrawal can activate a relationship as the last acceptance does, and
  // spends the intended Material the same way.
  ((command.type === 'relationship.accept' ||
    command.type === 'invitation.decline' ||
    command.type === 'invitation.expire' ||
    command.type === 'invitation.withdraw') &&
    invitation !== undefined &&
    invitation.intendedMaterialId !== null)

/**
 * Intake needs two things no other command does: the Ministry's name, because every
 * message it enqueues speaks in that voice, and who has submitted before, because
 * the Welcome Message is first contact and a re-submission must not repeat it.
 */
const isIntakeSubmission = (command: Command): boolean => command.type === 'intake.submit'

/**
 * The commands a token drives. None of them consults a session: possession of the
 * phone the link was sent to is the whole of the authentication.
 */
const isTokenDriven = (
  command: Command,
): command is Extract<
  Command,
  {
    type:
      | 'relationship.accept'
      | 'invitation.dispute_number'
      | 'invitation.decline'
      | 'invitation.expire'
      | 'invitation.withdraw'
  }
> =>
  command.type === 'relationship.accept' ||
  command.type === 'invitation.dispute_number' ||
  command.type === 'invitation.decline' ||
  // An Admin's, from a session the route checked. Driven by the token all the
  // same, for the reason the tick's is.
  command.type === 'invitation.withdraw' ||
  // The tick's, and no Leader's. It is driven by the token all the same: what it
  // decides from is the invitation as the database holds it, under the same locks.
  command.type === 'invitation.expire'

/**
 * The commands whose messages call somebody by their role: pairing, which texts
 * each Leader an invitation to be somebody's Leader, and adding a Leader to a
 * group, which texts them the same invitation. Everything else Discipler sends
 * names people and never roles.
 *
 * Acceptance was one of them until 2026-09-21, when the Starter Message stopped
 * saying a role: it is still in the Ministry's voice, which `isTokenDriven`
 * already asks for.
 */
const namesARole = (command: Command): boolean =>
  command.type === 'relationship.create' ||
  command.type === 'group.add_leader' ||
  command.type === 'intended_pairing.fulfil'

const settlesAPlan = (
  command: Command,
): command is Extract<Command, { type: 'intended_pairing.fulfil' | 'intended_pairing.refuse' }> =>
  command.type === 'intended_pairing.fulfil' || command.type === 'intended_pairing.refuse'

/**
 * Every message these commands enqueue speaks in the Ministry's voice.
 *
 * `namesARole` is folded in rather than checked separately, and that is what makes
 * the two safe to read off one `ministryVoice`. Every message that names a role
 * also carries the Ministry prefix -- `composeMessage` puts it on everything -- so
 * there is no command that needs the words and not the name, and a future one that
 * named a role without appearing here would otherwise reach the boundary with no
 * words at all.
 */
const needsTheMinistryName = (command: Command): boolean =>
  namesARole(command) ||
  isIntakeSubmission(command) ||
  // It texts the group's Leaders that somebody joined, in the Ministry's voice.
  command.type === 'relationship.admit' ||
  command.type === 'group.add_participant' ||
  command.type === 'relationship.create' ||
  command.type === 'relationship.resume' ||
  command.type === 'scheduled.tick' ||
  // It sends a Leader the same text the tick does, and every message this product
  // sends names the Ministry it comes from.
  command.type === 'invitation.reissue' ||
  isCheckIn(command) ||
  isTokenDriven(command)

/**
 * The two commands that read one Person's check-in state: the conversation being
 * opened, and a text arriving in reply to one. Both are addressed to a Person and
 * neither to a relationship, which is the whole of how an inbound reply is
 * resolved.
 */
const isCheckIn = (
  command: Command,
): command is Extract<Command, { type: 'checkin.start' | 'sms.inbound' }> =>
  command.type === 'checkin.start' || command.type === 'sms.inbound'

/**
 * The Person a check-in command names. Absent rather than defaulted: a Person
 * this Ministry does not hold would otherwise reach the domain as an empty
 * snapshot and read as *nothing to ask about* rather than as *no such Person*.
 */
const checkingInWith = async (unit: UnitOfWork, id: PersonId) => {
  const snapshot = await unit.checkInFor(id)
  if (!snapshot) throw new CheckInRefused('checkin.person_not_found')
  return snapshot
}

/**
 * What the Person an inbound text came from holds. Absent rather than defaulted for
 * the same reason their check-in state is: a Person this Ministry does not hold
 * would otherwise reach the domain as an empty snapshot and read as *they hold
 * nothing* rather than as *no such Person*.
 *
 * It carries the same refusal as the check-in read beside it, because it is the
 * same fact about the same Person and one of the two answering differently would be
 * a bug nobody could see from either.
 */
const whatTheSenderHolds = async (unit: UnitOfWork, id: PersonId) => {
  const snapshot = await unit.inboundFor(id)
  if (!snapshot) throw new CheckInRefused('checkin.person_not_found')
  return snapshot
}

/**
 * A token nothing answers to is refused here rather than handed to the domain as
 * an absent snapshot. Absence would read as "this command was called wrong",
 * which is a different thing from "that link is not real" and reaches the holder
 * as a different page.
 */
const resolved = async (unit: UnitOfWork, token: InvitationToken) => {
  const invitation = await unit.resolveInvitation(token)
  if (!invitation) throw new InvitationRefused('invitation.not_found')
  return invitation
}

/**
 * A token nothing answers to never gets this far: the route resolves the page
 * before it composes a command, and serves a 404 for a URL that names nobody. So
 * reaching here means the link was deleted between those two reads, or that a
 * caller composed the command without checking -- a defect either way, and not a
 * refusal anybody holding the form could act on.
 *
 * Deliberately not `intake.link_expired`. That is the one distinction this whole
 * path is built to keep: a link that has run out sends its holder back to whoever
 * issued it, and a token that was never real has nobody to send them to.
 *
 * An expired link is likewise not this function's to refuse. It resolves, and the
 * domain decides against the injected clock.
 */
const resolvedIntakeLink = async (unit: UnitOfWork, token: IntakeLinkToken) => {
  const link = await unit.resolveIntakeLink(token)
  if (!link) throw new Error('intake.submit was handed a token that names no link')
  return link
}

/**
 * Everything an admission decides from: the open request, the group it names as
 * the database holds it now, and the name of the Person who asked. Loaded together
 * because the second and third are found through the first.
 */
const joinRequestContext = async (unit: UnitOfWork, itemId: FollowUpItemId) => {
  const joinRequest = await unit.joinRequest(itemId)
  if (!joinRequest) return { joinRequest: null }

  const relationship = await unit.relationshipFor(joinRequest.relationshipId)
  return {
    joinRequest,
    ...(relationship ? { relationship } : {}),
    contacts: { people: await unit.contactsFor([joinRequest.personId]) },
    // Their open item asking to be placed in a group, which being admitted to
    // one answers (Group form exits, ticket 01).
    placementWanted: await unit.openPlacementWantedFor(joinRequest.personId),
  }
}

/**
 * The group an Admin is putting somebody into, and the name of the Person, which
 * the text to its Leaders says (Manual pairing, ticket 22).
 *
 * `groupToJoin` answers null both for an id that names nothing this Ministry holds
 * and for one that names a one-to-one, and those are two refusals an Admin acts on
 * differently. The second read is what tells them apart, and it is only ever made
 * on the way to refusing: the ordinary path reads the group once.
 */
const groupToAddTo = async (
  unit: UnitOfWork,
  command: Extract<Command, { type: 'group.add_participant' | 'group.add_leader' }>,
) => {
  const groupToJoin = await unit.groupToJoin(command.relationshipId)
  if (!groupToJoin) {
    throw new GroupJoinRefused(
      (await unit.relationshipFor(command.relationshipId))
        ? 'joining.not_a_group'
        : 'joining.group_not_found',
    )
  }

  return {
    groupToJoin,
    contacts: { people: await unit.contactsFor([command.personId]) },
    // A Disciple's open request for this same group, which the act resolves
    // (Manual pairing, recut ticket 03). A Discipler asked to lead it never made
    // one: a Join Request is to be discipled in a group.
    ...(command.type === 'group.add_participant'
      ? {
          joinRequest: await unit.openJoinRequestFor(command.personId, command.relationshipId),
          // And their open item asking to be placed in a group, which putting them
          // in one answers (Group form exits, ticket 01).
          placementWanted: await unit.openPlacementWantedFor(command.personId),
        }
      : {}),
  }
}

/**
 * What *Copy link to re-invite leader* decides from: the relationship under its
 * lock, the Person's name, and the invitations they have held to it. An id that
 * names no relationship here is refused before the domain is asked anything, as
 * a group that is not there is.
 */
const reinvitationContext = async (
  unit: UnitOfWork,
  command: Extract<Command, { type: 'invitation.copy_link' }>,
) => {
  const relationship = await unit.relationshipFor(command.relationshipId)
  if (!relationship) throw new ReinvitationRefused('reinvite.not_found')
  return {
    relationship,
    contacts: { people: await unit.contactsFor([command.personId]) },
    invitationHeld: await unit.invitationHeldBy(command.relationshipId, command.personId),
  }
}

/**
 * The held import row an answer names. Absent is a defect rather than a refusal:
 * the row is never deleted, so an id that names none did not come from the report
 * that offers the answers -- which is a form post composed by hand, not something
 * an Admin can act on.
 */
/**
 * One plan under its own lock, and the two people's names and numbers, which the
 * invitation a fulfilment sends needs. Loaded together because settling is one
 * transaction per plan and the snapshot is what it decides on.
 */
const intendedPairingContext = async (unit: UnitOfWork, id: IntendedPairingId) => {
  const intendedPairing = await unit.intendedPairingFor(id)
  if (!intendedPairing) return { intendedPairing: null }
  return {
    intendedPairing,
    contacts: {
      people: await unit.contactsFor([
        intendedPairing.leader.personId,
        intendedPairing.participant.personId,
      ]),
    },
  }
}

const heldRow = async (unit: UnitOfWork, row: ImportRowId) => {
  const held = await unit.heldImportRow(row)
  if (!held) throw new Error('import_row.resolve was handed an id that names no row')
  return held
}

/**
 * How a check leaves its transaction. Carries nothing and means nothing went wrong:
 * it exists to be thrown past `transact`, which rolls back on any throw, and caught
 * by the one caller that threw it.
 */
class CheckedAndRolledBack extends Error {
  constructor() {
    super('A checked pairing was rolled back, as every checked pairing is')
    this.name = 'CheckedAndRolledBack'
  }
}

export const createCommandService = ({
  clock,
  ids,
  store,
  appBaseUrl,
}: CommandServiceDependencies): CommandService => {
  // The whole command -- the state it reads, the decision it makes and the rows it
  // writes -- happens in one transaction. Deciding an import against a Roster read
  // outside the transaction would let two concurrent imports both find it empty.
  //
  // Named, and handed the unit of work rather than opening one, because there are
  // two things to do with a transaction this has run in: `execute` commits it, and
  // `checkPairing` never does (Manual pairing, ticket 03). Both run these same
  // lines, so neither can read a context or reach a decision the other would not.
  const carryOut =
    (command: Command) =>
    async (unit: UnitOfWork): Promise<CommandResult> => {
      const voice = needsTheMinistryName(command) ? await unit.ministryVoice() : undefined
      // Resolved ahead of the context rather than inside it, because what it
      // carries decides whether a second read is owed below.
      const invitation = isTokenDriven(command) ? await resolved(unit, command.token) : undefined

      const result = handleCommand(command, {
        ministryId: command.ministryId,
        clock,
        ids,
        ...(needsTheRoster(command)
          ? {
              roster: {
                ...(await unit.peopleOnRoster()),
                // Only Intake asks. An import creates nobody who has submitted, so
                // paying for the read there would buy an empty set at full price.
                whoCompletedIntake: isIntakeSubmission(command)
                  ? await unit.peopleWhoCompletedIntake()
                  : new Set<PersonId>(),
              },
            }
          : {}),
        // One read for both. The name a message speaks in and the words it calls
        // the roles by are three columns of one row, and every message that
        // carries a noun carries the name too -- so asking twice would be a
        // second round trip for a second half of the same fact.
        ...(voice
          ? {
              ministryName: voice.name,
              ...(namesARole(command) ? { language: voice } : {}),
            }
          : {}),
        appBaseUrl,
        // Pairing texts every Leader an Invitation Link, so it needs their names
        // and the numbers to send to. Read inside the unit of work like everything
        // else, so a command cannot compose a message for somebody the connection
        // is not acting for.
        ...(command.type === 'relationship.create'
          ? {
              contacts: {
                people: await unit.contactsFor([
                  ...command.leaderIds,
                  ...command.participantIds,
                ]),
              },
              openPlans: await unit.openIntendedPairings(),
            }
          : {}),
        // An import plans against the plans still standing, read inside the
        // transaction like the Roster, so two imports naming the same Disciple
        // cannot both plan them.
        ...(command.type === 'person.import'
          ? { openPlans: await unit.openIntendedPairings() }
          : {}),
        ...(settlesAPlan(command)
          ? await intendedPairingContext(unit, command.intendedPairingId)
          : {}),
        ...(invitation ? { invitation } : {}),
        // Read inside the transaction like everything else, so the link cannot be
        // re-issued out from under the submission it is authenticating.
        ...(command.type === 'intake.submit' && command.token
          ? { intakeLink: await resolvedIntakeLink(unit, command.token) }
          : {}),
        // The group the form named, read and locked inside the transaction like
        // everything else, so a door that closes between the page and the submit
        // is seen closed. Only when the body carries one: every other submission
        // pays nothing for a read it has no use for.
        ...(command.type === 'intake.submit'
        && command.form.groupId
        && !answersNoGroupInMind(command.form.groupId)
          ? { groupToJoin: await unit.groupToJoin(command.form.groupId) }
          : {}),
        // The request an admission names, then the group and the Person it is
        // about -- read off the item rather than the request, so the body could
        // not have named anybody else. Both absent when the item is gone, and the
        // domain refuses on the item before it looks for either.
        ...(command.type === 'relationship.admit'
          ? await joinRequestContext(unit, command.itemId)
          : {}),
        ...(command.type === 'group.add_participant' || command.type === 'group.add_leader'
          ? await groupToAddTo(unit, command)
          : {}),
        // Loaded so that asking for a link somebody already holds gives them that
        // one back rather than minting a second and stopping the first from working.
        ...(command.type === 'intake.reopen'
          ? { intakeLinkHeld: await unit.intakeLinkFor(command.personId) }
          : {}),
        // Read inside the transaction, on the connection that has already declared
        // which Ministry it acts for -- so a Person of another Ministry's is
        // invisible rather than merely unmatched, and the command refuses on the
        // same value it would refuse a Person who holds no account with.
        ...(command.type === 'person.reset_password'
          ? { accountToReset: await unit.accountHeldBy(command.personId) }
          : {}),
        // Read inside the transaction, after the pairings the same removal let go
        // of, so what it decides on is the Person as those left them.
        ...(command.type === 'person.remove'
          ? { personToRemove: await unit.personToRemove(command.personId) }
          : {}),
        // Read inside the transaction and under the row's own lock, so two Admins
        // working the same import report cannot both find it unanswered. The domain
        // refuses a row it saw answered, and it can only refuse one it saw.
        ...(command.type === 'import_row.resolve'
          ? { importRow: await heldRow(unit, command.rowId) }
          : {}),
        // The same snapshot the tick reads, rather than a second read of its own.
        // Re-issuing acts on exactly the Leaders the tick considers still awaited,
        // and two reads of *who is still to agree* would be two answers waiting to
        // disagree about whether an Admin may send somebody a link.
        ...(command.type === 'invitation.reissue'
          ? { unaccepted: await unit.unacceptedRelationships() }
          : {}),
        ...(command.type === 'invitation.copy_link'
          ? await reinvitationContext(unit, command)
          : {}),
        // Read inside the transaction like everything else, so two ticks racing
        // each other cannot both find the same Leader unasked. The cadence read
        // rides along: the tick is the one command that decides a week has come
        // due, and it decides it for every Leader in one pass.
        ...(command.type === 'scheduled.tick'
          ? {
              unaccepted: await unit.unacceptedRelationships(),
              checkInsDue: await unit.leadersDueForCheckIn(),
              paused: await unit.pausedRelationships(),
              materialNotices: await unit.materialRecipients(),
            }
          : {}),
        ...(isAboutOneRelationship(command)
          ? { relationship: await named(unit, command) }
          : {}),
        // Every relationship named, locked in one statement rather than one read
        // each, so a press that starts twenty on a Material is not twenty round
        // trips before anything is decided.
        ...(command.type === 'material.assign_to_relationships'
          ? { relationshipsToAssign: await unit.relationshipsToAssign(command.relationshipIds) }
          : {}),
        // Read inside the transaction like everything else, so two Admins editing
        // the list at once cannot both decide against a version of it that no
        // longer stands -- and so the count an Admin was warned with is the count
        // history records.
        // Read inside the transaction like everything else, so the values history
        // records as *what these used to be* are the ones that were actually
        // there when the edit was decided rather than ones a second Admin had
        // already replaced.
        ...(command.type === 'settings.update'
          ? { settings: await unit.ministrySettings() }
          : {}),
        ...(editsTheGoalList(command)
          ? { goals: await unit.discipleshipGoals() }
          : {}),
        // Only the removal, and only before it happens. `on delete set null` is
        // about to make this unanswerable, so the answers are read here -- inside
        // the same transaction, behind the same advisory lock the list read takes
        // -- and written into the event that outlives them.
        ...(command.type === 'goal.remove'
          ? { goalAnswers: await unit.answersPointingAt(command.goalId) }
          : {}),
        // Read inside the transaction, behind the same advisory lock the goal
        // list takes, so two Admins cannot both create the same title against a
        // list neither can see the other's on -- and so the count a removal is
        // refused with is the count that stood when it was decided.
        //
        // The two ends of a Material chosen at pairing read it too, and only when
        // there is a choice to judge: a relationship formed with one, and the
        // acceptance of a relationship still carrying one. The lock is the point as much as
        // the list. It serialises either against an Admin removing that Material,
        // so a removal and an acceptance cannot both decide against a list the
        // other has already changed and leave a relationship running on a
        // Material that is off it.
        ...(editsTheMaterialList(command) || consultsTheMaterialList(command, invitation)
          ? { materials: await unit.materials() }
          : {}),
        ...(command.type === 'material.create' || command.type === 'material.edit'
          ? { materialPathsNamed: await unit.materialPathsNamed(command.files.map((file) => file.path)) }
          : {}),
        // Read inside the transaction, behind the same advisory lock the read
        // itself takes, so a reply and a newly-due sequence cannot both find no
        // conversation open and each try to start one.
        ...(isCheckIn(command)
          ? { checkIn: await checkingInWith(unit, command.personId) }
          : {}),
        // Read behind the same lock, for the same reason and about the same Person.
        // Only an inbound text needs it: `checkin.start` opens a conversation and
        // reads no keyword, so paying for this there would buy a snapshot nothing
        // consults.
        ...(command.type === 'sms.inbound'
          ? { inbound: await whatTheSenderHolds(unit, command.personId) }
          : {}),
      })

      await applyEffects(result.effects, unit)

      return result
    }

  const service: CommandService = {
  async execute(command) {
    return store.transact(command.ministryId, carryOut(command))
  },

  async checkPairing(command) {
    // Refused at run time as well as by the type. The type is what a caller in
    // this codebase meets; this is what a command that arrived as parsed JSON
    // meets, and rehearsing an acceptance or a tick is not something to find out
    // the transaction machinery permits.
    if ((command as Command).type !== 'relationship.create') {
      throw new Error('Only relationship.create can be checked without being performed')
    }

    try {
      await store.transact(command.ministryId, async (unit) => {
        await carryOut(command)(unit)
        // Formation went ahead, every row of it, and every trigger and index it
        // touches has had its say. Throwing is the one way out of `transact` that
        // cannot commit: the port's contract is all or nothing, and this is nothing.
        throw new CheckedAndRolledBack()
      })
    } catch (error) {
      if (error instanceof CheckedAndRolledBack) return null
      // The boundary's refusal or the database's, translated by the store exactly
      // as it is for `execute`. Rolled back like any refused formation.
      if (error instanceof PairingRefused) return error.refusal
      throw error
    }

    // A store that swallowed the throw above cannot be trusted to have rolled back,
    // and may have formed a relationship nobody asked for. Loud, because the
    // alternative is a check that quietly pairs people.
    throw new Error('A pairing was checked in a transaction that did not roll back')
  },

  async openConcern(command) {
    return store.transact(command.ministryId, async (unit) => {
      const result = handleCommand(command, { ministryId: command.ministryId, clock, ids })

      // The audit first, and in the same transaction as the read. A failure
      // anywhere after this rolls the viewing back along with everything else,
      // which is right: a read that did not complete is a read that did not
      // happen. What must never happen is the other order.
      await applyEffects(result.effects, unit)

      return unit.concernDetailFor(command.concernId)
    })
  },

  async removePerson({ ministryId, personId, removedBy, pairings }) {
    return store.transact(ministryId, async (unit) => {
      for (const { relationshipId, act } of pairings) {
        const about = { ministryId, relationshipId }
        if (act === 'withdraw') {
          // Theirs is an invitation. None standing means it was answered or taken
          // back since the page was drawn: accepted, and `person.remove` refuses
          // somebody now leading; declined, and there is nothing left to let go of.
          const token = await unit.unansweredInvitationOf(relationshipId, personId)
          if (token !== null) {
            await carryOut({ type: 'invitation.withdraw', ministryId, token, withdrawnBy: removedBy })(unit)
          }
        } else if (act === 'cancel') {
          await carryOut({ type: 'relationship.cancel', ...about, cancelledBy: removedBy })(unit)
        } else if (act === 'leave') {
          await carryOut({ type: 'relationship.depart', ...about, personId, departedBy: removedBy })(unit)
        } else {
          await carryOut({
            type: 'relationship.end',
            ...about,
            outcome: 'discontinued',
            reason: REMOVED_FROM_THE_ROSTER,
            endedBy: removedBy,
          })(unit)
        }
      }
      return carryOut({ type: 'person.remove', ministryId, personId, removedBy })(unit)
    })
  },

  async withdrawLapsedInvitations(ministryId) {
    const lapsed = await store.transact(ministryId, (unit) =>
      unit.lapsedInvitations(clock.now()),
    )

    let withdrawn = 0
    for (const token of lapsed) {
      const { effects } = await service.execute({ type: 'invitation.expire', ministryId, token })
      // Nothing, where it was accepted or re-sent since the read above.
      if (effects.some((effect) => effect.kind === 'invitation.withdraw')) withdrawn++
    }
    return withdrawn
  },

  async withdrawInvitationOf(ministryId, relationshipId, personId, withdrawnBy) {
    const token = await store.transact(ministryId, (unit) =>
      unit.unansweredInvitationOf(relationshipId, personId),
    )
    if (token === null) return false

    await service.execute({ type: 'invitation.withdraw', ministryId, token, withdrawnBy })
    return true
  },

  async settleIntendedPairings(ministryId) {
    const open = await store.transact(ministryId, (unit) => unit.openIntendedPairings())
    const settled = { fulfilled: 0, refused: 0, waiting: 0 }

    for (const plan of open) {
      try {
        const { effects } = await service.execute({
          type: 'intended_pairing.fulfil',
          ministryId,
          intendedPairingId: plan.id,
        })
        if (effects.some((effect) => effect.kind === 'relationship.create')) settled.fulfilled++
        else if (effects.some((effect) => effect.kind === 'intendedPairing.close')) settled.refused++
        else settled.waiting++
      } catch (error) {
        // The database refused the pairing the fulfilment formed and rolled it
        // back. Recorded in a transaction of its own; anything else is a fault.
        if (!(error instanceof PairingRefused)) throw error
        await service.execute({
          type: 'intended_pairing.refuse',
          ministryId,
          intendedPairingId: plan.id,
          refusal: error.refusal,
        })
        settled.refused++
      }
    }

    return settled
  },
  }

  return service
}
