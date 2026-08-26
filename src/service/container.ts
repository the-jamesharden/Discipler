import { systemClock } from '~/domain/clock'
import { commandDatabaseUrl } from '~/platform/supabase/credentials'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
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

export const getCommandService = (): CommandService => {
  commandService ??= createCommandService({
    clock: systemClock,
    store: createPostgresEffectStore(commandDatabaseUrl()),
  })
  return commandService
}

export const getRosterReader = (): RosterReader => supabaseRosterReader
