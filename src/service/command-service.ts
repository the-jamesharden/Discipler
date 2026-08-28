import { handleCommand, type CommandResult } from '~/domain/boundary'
import type { Clock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import type { IdSource, PersonId } from '~/domain/ids'
import type { EffectStore, UnitOfWork } from './ports'

export interface CommandServiceDependencies {
  readonly clock: Clock
  readonly ids: IdSource
  readonly store: EffectStore
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
 * Intake needs two things no other command does: the Ministry's name, because every
 * message it enqueues speaks in that voice, and who has submitted before, because
 * the Welcome Message is first contact and a re-submission must not repeat it.
 */
const isIntakeSubmission = (command: Command): boolean => command.type === 'intake.submit'

export const createCommandService = ({
  clock,
  ids,
  store,
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
                people: await unit.peopleOnRoster(),
                // Only Intake asks. An import creates nobody who has submitted, so
                // paying for the read there would buy an empty set at full price.
                whoCompletedIntake: isIntakeSubmission(command)
                  ? await unit.peopleWhoCompletedIntake()
                  : new Set<PersonId>(),
              },
            }
          : {}),
        ...(isIntakeSubmission(command)
          ? { ministryName: await unit.ministryName() }
          : {}),
      })

      await applyEffects(result.effects, unit)

      return result
    })
  },
})
