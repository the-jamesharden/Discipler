import { handleCommand, type CommandResult } from '~/domain/boundary'
import type { Clock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import {
  CancellationRefused,
  CheckInRefused,
  DepartureRefused,
  EndingRefused,
  InvitationRefused,
  MaterialAssignmentRefused,
  PauseRefused,
} from '~/domain/errors'
import type { IdSource, ImportRowId, PersonId } from '~/domain/ids'
import type { IntakeLinkToken } from '~/domain/intake-link'
import type { InvitationToken } from '~/domain/invitations'
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
  const followUps = effects.flatMap((effect) =>
    effect.kind === 'followUp.raise' ? [effect.item] : [],
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
  const eligibilities = effects.flatMap((effect) =>
    effect.kind === 'person.lead_eligibility' ? [effect.eligibility] : [],
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
  for (const relationship of relationships) await unit.createRelationship(relationship)

  // After the people, and before the answers that name them. An import files what
  // it could and holds what it would not guess about, in that order; an answer
  // renames or creates a Person and then records which Person the row became, and
  // the row's foreign key is what would catch the two in the wrong order.
  if (heldRows.length > 0) await unit.holdImportRows(heldRows)
  for (const renaming of renamings) await unit.renamePerson(renaming)
  for (const resolution of answeredRows) await unit.resolveImportRow(resolution)

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
  for (const invitation of invitations) await unit.issueInvitation(invitation)
  // After the issues, for the same ordering reason: both write the row the one
  // live token per person per relationship index governs, and a re-issue landing
  // before the insert it replaces would be refused by that index rather than
  // replacing anything.
  for (const invitation of reissues) await unit.reissueInvitation(invitation)
  for (const item of followUps) await unit.raiseFollowUp(item)

  // Before the history that says they happened, like every other write here. An
  // Admin resolving an item somebody else closed a second earlier is refused, and
  // being refused after history had already recorded the resolution would leave a
  // Ministry's record claiming a decision nobody made.
  for (const resolution of resolutions) await unit.resolveFollowUp(resolution)
  for (const cancellation of cancellations) await unit.cancelRelationship(cancellation)
  for (const ending of endings) await unit.endRelationship(ending)
  for (const departure of departures) await unit.departFromRelationship(departure)

  // After the acceptance that stamps `accepted_at`, because that is the instant the
  // period with no Material starts from and the row has to exist for it to start.
  // Before the history saying it happened, like every other write here.
  for (const assignment of materialAssignments) await unit.assignMaterial(assignment)

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
  for (const eligibility of eligibilities) await unit.setLeadEligibility(eligibility)
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
  if (history.length > 0) await unit.appendHistory(history)
  if (messages.length > 0) await unit.enqueueMessages(messages)

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
  command.type === 'relationship.resume'

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
const GOAL_LIST_EDITS = ['goal.add', 'goal.rename', 'goal.move', 'goal.remove'] as const

const editsTheGoalList = (
  command: Command,
): command is Extract<Command, { type: (typeof GOAL_LIST_EDITS)[number] }> =>
  (GOAL_LIST_EDITS as readonly string[]).includes(command.type)

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
  { type: 'relationship.accept' | 'invitation.dispute_number' }
> =>
  command.type === 'relationship.accept' ||
  command.type === 'invitation.dispute_number'

/**
 * The two commands whose messages call somebody by their role: pairing, which
 * texts each Leader an invitation to be somebody's Leader, and acceptance, which
 * tells both sides what they now are to each other. Everything else Discipler
 * sends names people and never roles.
 */
const namesARole = (command: Command): boolean =>
  command.type === 'relationship.create' || command.type === 'relationship.accept'

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
 * The held import row an answer names. Absent is a defect rather than a refusal:
 * the row is never deleted, so an id that names none did not come from the report
 * that offers the answers -- which is a form post composed by hand, not something
 * an Admin can act on.
 */
const heldRow = async (unit: UnitOfWork, row: ImportRowId) => {
  const held = await unit.heldImportRow(row)
  if (!held) throw new Error('import_row.resolve was handed an id that names no row')
  return held
}

export const createCommandService = ({
  clock,
  ids,
  store,
  appBaseUrl,
}: CommandServiceDependencies): CommandService => ({
  async execute(command) {
    // The whole command -- the state it reads, the decision it makes and the rows it
    // writes -- happens in one transaction. Deciding an import against a Roster read
    // outside the transaction would let two concurrent imports both find it empty.
    return store.transact(command.ministryId, async (unit) => {
      const voice = needsTheMinistryName(command) ? await unit.ministryVoice() : undefined

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
            }
          : {}),
        ...(isTokenDriven(command)
          ? { invitation: await resolved(unit, command.token) }
          : {}),
        // Read inside the transaction like everything else, so the link cannot be
        // re-issued out from under the submission it is authenticating.
        ...(command.type === 'intake.submit' && command.token
          ? { intakeLink: await resolvedIntakeLink(unit, command.token) }
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
        // Read inside the transaction like everything else, so two ticks racing
        // each other cannot both find the same Leader unasked. The cadence read
        // rides along: the tick is the one command that decides a week has come
        // due, and it decides it for every Leader in one pass.
        ...(command.type === 'scheduled.tick'
          ? {
              unaccepted: await unit.unacceptedRelationships(),
              checkInsDue: await unit.leadersDueForCheckIn(),
              paused: await unit.pausedRelationships(),
            }
          : {}),
        ...(isAboutOneRelationship(command)
          ? { relationship: await named(unit, command) }
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
    })
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
})
