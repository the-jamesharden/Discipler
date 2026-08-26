import { systemClock } from '~/domain/clock'
import { commandDatabaseUrl } from '~/platform/supabase/credentials'
import {
  createPostgresEffectStore,
  type PostgresEffectStore,
} from '~/platform/supabase/effect-store'
import { supabaseRosterReader } from '~/platform/supabase/roster-reader'
import { createCommandService, type CommandService } from './command-service'
import type { RosterReader } from './ports'

/**
 * The composition root: the one place that decides which real implementations sit
 * behind the ports. Everything upstream of here depends on the interfaces, which
 * is what lets the test suite drive the same boundary with a controlled clock and
 * an in-memory store.
 */

let commandService: CommandService | undefined
let commandStore: PostgresEffectStore | undefined

export const getCommandService = (): CommandService => {
  if (!commandService) {
    commandStore = createPostgresEffectStore(commandDatabaseUrl())
    commandService = createCommandService({ clock: systemClock, store: commandStore })
  }
  return commandService
}

/**
 * Gives back the connection pool the store holds. The running app never calls this
 * -- it keeps the pool for its whole lifetime -- but a test that assembles the real
 * container has no other way to let go of it when the suite ends.
 */
export const closeCommandService = async (): Promise<void> => {
  const store = commandStore
  commandService = undefined
  commandStore = undefined
  await store?.close()
}

export const getRosterReader = (): RosterReader => supabaseRosterReader
