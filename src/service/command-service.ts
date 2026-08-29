import { handleCommand, type CommandResult } from '~/domain/boundary'
import type { Clock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import { CancellationRefused, InvitationRefused } from '~/domain/errors'
import type { IdSource, PersonId, RelationshipId } from '~/domain/ids'
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
}

export const applyEffects = async (
  effects: readonly Effect[],
  unit: UnitOfWork,
): Promise<void> => {
  // Five separate narrowings rather than one generic collector: each `flatMap`
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
  const invitations = effects.flatMap((effect) =>
    effect.kind === 'invitation.issue' ? [effect.invitation] : [],
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

  // Rows before the facts about them. The whole unit of work is one transaction, so
  // ordering buys nothing for atomicity -- it buys the error: a pairing the caps
  // refuse fails as a refusal, rather than after history has already said it
  // happened.
  if (people.length > 0) await unit.createPeople(people)
  for (const relationship of relationships) await unit.createRelationship(relationship)

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
  for (const item of followUps) await unit.raiseFollowUp(item)

  // Before the history that says they happened, like every other write here. An
  // Admin resolving an item somebody else closed a second earlier is refused, and
  // being refused after history had already recorded the resolution would leave a
  // Ministry's record claiming a decision nobody made.
  for (const resolution of resolutions) await unit.resolveFollowUp(resolution)
  for (const cancellation of cancellations) await unit.cancelRelationship(cancellation)

  // History before messages: a message that goes out unrecorded is worse than a
  // recorded message that failed to send, because only one of the two can be
  // reconstructed.
  if (history.length > 0) await unit.appendHistory(history)
  if (messages.length > 0) await unit.enqueueMessages(messages)
}

/**
 * Which commands need state loaded before the domain can decide anything. Naming
 * them here keeps the load explicit and keeps every other command from paying for a
 * read it has no use for.
 */
const needsTheRoster = (command: Command): boolean =>
  command.type === 'person.import' || command.type === 'intake.submit'

/**
 * The relationship an Admin command names. Absent rather than defaulted, and a
 * relationship this Ministry does not hold is refused here rather than handed on
 * as an empty snapshot -- which would read as "this command was called wrong"
 * instead of "there is no such relationship".
 */
const named = async (unit: UnitOfWork, id: RelationshipId) => {
  const relationship = await unit.relationshipFor(id)
  if (!relationship) throw new CancellationRefused('relationship.not_found')
  return relationship
}

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
  { type: 'relationship.accept' | 'invitation.dispute_number' | 'match.decline' }
> =>
  command.type === 'relationship.accept' ||
  command.type === 'invitation.dispute_number' ||
  command.type === 'match.decline'

/** Every message these commands enqueue speaks in the Ministry's voice. */
const needsTheMinistryName = (command: Command): boolean =>
  isIntakeSubmission(command) ||
  command.type === 'relationship.create' ||
  command.type === 'scheduled.tick' ||
  isTokenDriven(command)

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
        ...(needsTheMinistryName(command)
          ? { ministryName: await unit.ministryName() }
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
        // Read inside the transaction like everything else, so two ticks racing
        // each other cannot both find the same relationship unreminded.
        ...(command.type === 'scheduled.tick'
          ? { tick: await unit.unacceptedRelationships() }
          : {}),
        ...(command.type === 'relationship.cancel'
          ? { relationship: await named(unit, command.relationshipId) }
          : {}),
      })

      await applyEffects(result.effects, unit)

      return result
    })
  },
})
