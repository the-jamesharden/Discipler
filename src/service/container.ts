import { systemClock } from '~/domain/clock'
import type { IdSource } from '~/domain/ids'
import { commandDatabaseUrl } from '~/platform/supabase/credentials'
import {
  createPostgresEffectStore,
  type PostgresEffectStore,
} from '~/platform/supabase/effect-store'
import {
  createPostgresIntakeReader,
  type PostgresIntakeReader,
} from '~/platform/supabase/intake-reader'
import { supabaseRosterReader } from '~/platform/supabase/roster-reader'
import { createCommandService, type CommandService } from './command-service'
import type { IntakeReader, RosterReader } from './ports'

/**
 * The composition root: the one place that decides which real implementations sit
 * behind the ports. Everything upstream of here depends on the interfaces, which
 * is what lets the test suite drive the same boundary with a controlled clock and
 * an in-memory store.
 */

/** The real source of identifiers, alongside the real clock. */
const randomIds: IdSource = { next: () => crypto.randomUUID() }

let commandService: CommandService | undefined
let commandStore: PostgresEffectStore | undefined
let intakeReader: PostgresIntakeReader | undefined

export const getCommandService = (): CommandService => {
  if (!commandService) {
    commandStore = createPostgresEffectStore(commandDatabaseUrl())
    commandService = createCommandService({
      clock: systemClock,
      ids: randomIds,
      store: commandStore,
    })
  }
  return commandService
}

/**
 * The Intake form is served to a visitor with no session, so it reads on the same
 * trusted connection the command boundary uses. The reader opens its own pool, but
 * it is constructed here and nowhere else, so there is exactly one place that decides
 * a pool exists and exactly one thing that can close it.
 */
export const getIntakeReader = (): IntakeReader => {
  if (!intakeReader) intakeReader = createPostgresIntakeReader(commandDatabaseUrl())
  return intakeReader
}

/**
 * Gives back the connection pool the store holds. The running app never calls this
 * -- it keeps the pool for its whole lifetime -- but a test that assembles the real
 * container has no other way to let go of it when the suite ends.
 */
export const closeCommandService = async (): Promise<void> => {
  const store = commandStore
  const reader = intakeReader
  commandService = undefined
  commandStore = undefined
  intakeReader = undefined
  await store?.close()
  await reader?.close()
}

export const getRosterReader = (): RosterReader => supabaseRosterReader
