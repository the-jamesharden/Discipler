import { systemClock } from '~/domain/clock'
import type { IdSource } from '~/domain/ids'
import { appBaseUrl, commandDatabaseUrl } from '~/platform/supabase/credentials'
import {
  createPostgresEffectStore,
  createPostgresInboundReader,
  type PostgresEffectStore,
  type PostgresInboundReader,
} from '~/platform/supabase/effect-store'
import {
  createPostgresIntakeReader,
  type PostgresIntakeReader,
} from '~/platform/supabase/intake-reader'
import {
  createPostgresInvitationReader,
  type PostgresInvitationReader,
} from '~/platform/supabase/invitation-reader'
import { createSupabaseCareNeededReader } from '~/platform/supabase/care-needed-reader'
import { supabaseDiscipleshipGoalReader } from '~/platform/supabase/discipleship-goals'
import { supabaseLeaderDashboardReader } from '~/platform/supabase/leader-dashboard'
import { supabaseMinistrySettingsReader } from '~/platform/supabase/ministry-settings'
import {
  createPostgresMinistryDirectory,
  type PostgresMinistryDirectory,
} from '~/platform/supabase/ministry-directory'
import {
  createPostgresOutboundQueue,
  type PostgresOutboundQueue,
} from '~/platform/supabase/outbound-queue'
import { createTwilioTransport } from '~/platform/twilio/message-transport'
import { supabaseLeaderAccounts } from '~/platform/supabase/leader-accounts'
import { supabaseRosterReader } from '~/platform/supabase/roster-reader'
import { createCommandService, type CommandService } from './command-service'
import type {
  CareNeededReader,
  DiscipleshipGoalReader,
  LeaderDashboardReader,
  InboundReader,
  IntakeReader,
  InvitationReader,
  LeaderAccounts,
  MessageTransport,
  MinistryDirectory,
  MinistrySettingsReader,
  OutboundQueue,
  RosterReader,
} from './ports'

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
let inboundReader: PostgresInboundReader | undefined
let outboundQueue: PostgresOutboundQueue | undefined
let ministryDirectory: PostgresMinistryDirectory | undefined
let messageTransport: MessageTransport | undefined

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
 * An inbound text carries a phone number and no session, so the webhook reads on
 * the same trusted connection the Intake form and the Invitation Link do -- and
 * for the same reason: it is answering which Ministry the connection should scope
 * itself to, before anything is scoped at all.
 */
export const getInboundReader = (): InboundReader => {
  if (!inboundReader) inboundReader = createPostgresInboundReader(commandDatabaseUrl())
  return inboundReader
}

/**
 * The queue the sending layer drains. It reads and writes on the trusted
 * connection, scoping every statement to the Ministry it is acting for, because
 * draining is not something a browser session ever does and there is no session
 * behind it to say which Ministry a row belongs to.
 */
export const getOutboundQueue = (): OutboundQueue => {
  if (!outboundQueue) outboundQueue = createPostgresOutboundQueue(commandDatabaseUrl())
  return outboundQueue
}

/**
 * Where a message actually leaves the building. Twilio is behind this and nowhere
 * else -- it is a delivery vendor, not a domain concept, and nothing above this
 * line knows its name.
 *
 * Built lazily like everything else here, which matters more than usual: its
 * credentials are only required by a deployment that sends, so a developer running
 * the Roster locally is not stopped by an account they have no use for.
 */
export const getMessageTransport = (): MessageTransport => {
  if (!messageTransport) messageTransport = createTwilioTransport()
  return messageTransport
}

/**
 * Which Ministries the scheduler has to run for. The one unscoped read in the app,
 * kept to ids for that reason -- see the port.
 */
export const getMinistryDirectory = (): MinistryDirectory => {
  if (!ministryDirectory) {
    ministryDirectory = createPostgresMinistryDirectory(commandDatabaseUrl())
  }
  return ministryDirectory
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
  const inbound = inboundReader
  const queue = outboundQueue
  const directory = ministryDirectory
  commandService = undefined
  commandStore = undefined
  intakeReader = undefined
  invitationReader = undefined
  inboundReader = undefined
  outboundQueue = undefined
  ministryDirectory = undefined
  // The transport holds no pool -- it is `fetch` and a pair of credentials -- so
  // there is nothing of its to close, only the reference to drop.
  messageTransport = undefined
  await store?.close()
  await reader?.close()
  await invitations?.close()
  await inbound?.close()
  await queue?.close()
  await directory?.close()
}

export const getRosterReader = (): RosterReader => supabaseRosterReader

/**
 * The Ministry's own list of Discipleship Goal options, read through the
 * signed-in Admin's session -- so the policies say which Ministry's list it is,
 * and the settings surface never has to.
 */
export const getDiscipleshipGoalReader = (): DiscipleshipGoalReader =>
  supabaseDiscipleshipGoalReader

/**
 * The settings surface reads through the signed-in Admin's session, so
 * `ministry_settings` is what scopes it -- and that function answers an Admin of
 * the Ministry and nobody else.
 */
export const getMinistrySettingsReader = (): MinistrySettingsReader =>
  supabaseMinistrySettingsReader

/**
 * Care Needed reads through the signed-in Admin's session, so the policy on
 * `follow_up_item` is what scopes it to their Ministry rather than anything this
 * container passes down. The clock is passed down, because how long each item has
 * waited is computed at the moment of the read.
 */
export const getCareNeededReader = (): CareNeededReader =>
  createSupabaseCareNeededReader(systemClock)

/**
 * The Leader Dashboard reads through the signed-in user's session and takes no
 * Ministry, because the session is what names it: the list is a live query for open
 * leader memberships, and an Admin who leads is the same person on both surfaces.
 */
export const getLeaderDashboardReader = (): LeaderDashboardReader =>
  supabaseLeaderDashboardReader

/**
 * Acceptance is the only surface that mints an account, but it reaches its adapter
 * the same way every other surface does. A route holding a concrete adapter is how
 * a composition root stops being one.
 */
export const getLeaderAccounts = (): LeaderAccounts => supabaseLeaderAccounts
