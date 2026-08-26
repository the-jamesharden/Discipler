import { handleCommand, type CommandResult } from '~/domain/boundary'
import type { Clock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import type { EffectSink, EffectStore } from './ports'

export interface CommandServiceDependencies {
  readonly clock: Clock
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
  sink: EffectSink,
): Promise<void> => {
  const history = effects.flatMap((effect) =>
    effect.kind === 'history.append' ? [effect.event] : [],
  )
  const messages = effects.flatMap((effect) =>
    effect.kind === 'message.enqueue' ? [effect.message] : [],
  )

  // History first: a message that goes out unrecorded is worse than a recorded
  // message that failed to send, because only one of the two can be reconstructed.
  if (history.length > 0) await sink.appendHistory(history)
  if (messages.length > 0) await sink.enqueueMessages(messages)
}

export const createCommandService = ({
  clock,
  store,
}: CommandServiceDependencies): CommandService => ({
  async execute(command) {
    const result = handleCommand(command, {
      ministryId: command.ministryId,
      clock,
    })

    await store.transact(command.ministryId, (sink) => applyEffects(result.effects, sink))

    return result
  },
})
