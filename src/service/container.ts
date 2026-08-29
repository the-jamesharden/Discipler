import { systemClock } from '~/domain/clock'
import type { IdSource } from '~/domain/ids'
import { appBaseUrl, commandDatabaseUrl } from '~/platform/supabase/credentials'
import {
  createPostgresEffectStore,
  type PostgresEffectStore,
} from '~/platform/supabase/effect-store'
import {
  createPostgresIntakeReader,
  type PostgresIntakeReader,
} from '~/platform/supabase/intake-reader'
import {
  createPostgresInvitationReader,
  type PostgresInvitationReader,
} from '~/platform/supabase/invitation-reader'
import { supabaseLeaderAccounts } from '~/platform/supabase/leader-accounts'
import { supabaseRosterReader } from '~/platform/supabase/roster-reader'
import { createCommandService, type CommandService } from './command-service'
import type { IntakeReader, InvitationReader, LeaderAccounts, RosterReader } from './ports'

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
let invitationReader: PostgresInvitationReader | undefined

export const getCommandService = (): CommandService => {
  if (!commandService) {
    commandStore = createPostgresEffectStore(commandDatabaseUrl())
    commandService = createCommandService({
      clock: systemClock,
      ids: randomIds,
      store: commandStore,
      appBaseUrl: appBaseUrl(),
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
 * The Invitation Link's page is served to a Leader with no account and no
 * session, so it reads on the same trusted connection the Intake form does, and
 * for the same reason.
 */
export const getInvitationReader = (): InvitationReader => {
  if (!invitationReader) {
    invitationReader = createPostgresInvitationReader(commandDatabaseUrl())
  }
  return invitationReader
}

/**
 * Gives back the connection pool the store holds. The running app never calls this
 * -- it keeps the pool for its whole lifetime -- but a test that assembles the real
 * container has no other way to let go of it when the suite ends.
 */
export const closeCommandService = async (): Promise<void> => {
  const store = commandStore
  const reader = intakeReader
  const invitations = invitationReader
  commandService = undefined
  commandStore = undefined
  intakeReader = undefined
  invitationReader = undefined
  await store?.close()
  await reader?.close()
  await invitations?.close()
}

export const getRosterReader = (): RosterReader => supabaseRosterReader

/**
 * Acceptance is the only surface that mints an account, but it reaches its adapter
 * the same way every other surface does. A route holding a concrete adapter is how
 * a composition root stops being one.
 */
export const getLeaderAccounts = (): LeaderAccounts => supabaseLeaderAccounts
