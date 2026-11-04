import { after } from 'next/server'
import type { RandomSource } from '~/domain/accounts'
import { systemClock } from '~/domain/clock'
import type { IdSource, MinistryId } from '~/domain/ids'
import { createPostgresMaterialPageReader } from '~/platform/supabase/material-page-reader'
import { sweepUnsavedUploads as sweepUploads } from '~/platform/supabase/material-files'
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
import { createSupabaseCareNeededReader } from '~/platform/supabase/follow-up-page-reader'
import { createSupabaseCheckInsReader } from '~/platform/supabase/check-ins-reader'
import { supabaseIntakeFormsReader } from '~/platform/supabase/intake-forms-reader'
import { supabaseLeaderDashboardReader } from '~/platform/supabase/leader-dashboard'
import { supabaseMinistrySettingsReader } from '~/platform/supabase/ministry-settings'
import {
  createSupabaseMinistrySetup,
  type SupabaseMinistrySetup,
} from '~/platform/supabase/ministry-setup'
import {
  createPostgresMinistryDirectory,
  type PostgresMinistryDirectory,
} from '~/platform/supabase/ministry-directory'
import {
  createPostgresOutboundQueue,
  type PostgresOutboundQueue,
} from '~/platform/supabase/outbound-queue'
import { createSupabaseMaterialsReader } from '~/platform/supabase/materials-reader'
import { createSupabaseOverviewReader } from '~/platform/supabase/overview-reader'
import { createSupabaseSearchReader } from '~/platform/supabase/search-reader'
import { messageTransportKind } from '~/platform/deployment'
import { createRecordingTransport } from '~/platform/recording-transport'
import { createRecordingVerifier } from '~/platform/recording-verifier'
import { firstPriceIdsIn } from '~/platform/stripe/prices'
import { createTwilioBalanceReader } from '~/platform/twilio/account-balance'
import { createTwilioTransport } from '~/platform/twilio/message-transport'
import { createResendTransport } from '~/platform/resend/email-transport'
import { createTurnstile } from '~/platform/cloudflare/turnstile'
import { remindersOffToken } from '~/platform/reminder-link'
import { signUpIsOpen } from '~/platform/sign-up-switch'
import { createSignUpCodeKeeper } from '~/platform/sign-up-code-keeper'
import {
  createPostgresPendingSignups,
  type PostgresPendingSignups,
} from '~/platform/supabase/pending-signups'
import { openSignedUpChurch } from '~/platform/supabase/provisioning'
import { createTwilioVerifier } from '~/platform/twilio/phone-verifier'
import {
  createPostgresPhoneChecks,
  type PostgresPhoneChecks,
} from '~/platform/supabase/phone-checks'
import { supabaseAccounts } from '~/platform/supabase/accounts'
import { createPostgresSignInLimit, type PostgresSignInLimit } from '~/platform/supabase/sign-in-limit'
import { createSupabaseRosterReader } from '~/platform/supabase/roster-reader'
import { createSupabaseSuggestedPairsReader } from '~/platform/supabase/suggested-pairs-reader'
import {
  createPostgresDailyCapHolds,
  type PostgresDailyCapHolds,
} from '~/platform/supabase/daily-cap-holds'
import {
  createPostgresSharedNumbers,
  type PostgresSharedNumbers,
} from '~/platform/supabase/shared-numbers'
import { createPostgresChurchSignups, type PostgresChurchSignups } from '~/platform/supabase/church-signups'
import { createPostgresReferrals, type PostgresReferrals } from '~/platform/supabase/referrals'
import {
  createPostgresOver200FollowUps,
  type PostgresOver200FollowUps,
} from '~/platform/supabase/over-200-follow-ups'
import {
  createPostgresTwilioBalanceFalls,
  type PostgresTwilioBalanceFalls,
} from '~/platform/supabase/twilio-balance-falls'
import {
  createPostgresSupportSubmissions,
  type PostgresSupportSubmissions,
} from '~/platform/supabase/support-submissions'
import type { CapacityConcern } from '~/domain/shared-numbers'
import { createStripeBilling, stripeClient } from '~/platform/stripe/billing'
import { createStripeTrials } from '~/platform/stripe/trials'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import { createCommandService, type CommandService } from './command-service'
import { createDailyCap, type DailyCap } from './daily-cap'
import { createEmailSender } from './email-sender'
import { dispatchQueue, type DispatchOutcome } from './outbound-dispatch'
import { createPhoneCheck, type PhoneCheck } from './phone-check'
import { createOpeningAChurch, type OpeningAChurch } from './opening-a-church'
import { watchPaymentReminders, type PaymentReminderOutcome } from './payment-reminder-watch'
import { createSignUp, type SignUp } from './sign-up'
import { watchSharedNumberCapacity } from './shared-number-capacity'
import {
  processStripeEventQuietly,
  sweepStripeEvents,
  type StripeEventSweep,
  type StripeEventWork,
} from './stripe-events'
import type { Invitations, TrialWork } from './open-trial'
import { watchOver200Churches, type Over200WatchOutcome } from './over-200-watch'
import { createEmailSupportAlerts } from './support-alerts'
import { createSupportForm, type SupportForm, type SupportSweep } from './support-form'
import { watchTwilioBalance, type TwilioBalanceWatchOutcome } from './twilio-balance-watch'
import type {
  ChurchSignups,
  ReferralCodes,
  Accounts,
  BillingRecords,
  CareNeededReader,
  CheckInsReader,
  EffectStore,
  EmailSender,
  LeaderDashboardReader,
  InboundReader,
  IntakeFormsReader,
  IntakeReader,
  InvitationReader,
  MaterialPageReader,
  MaterialsReader,
  MessageTransport,
  MinistryDirectory,
  MinistrySettingsReader,
  MinistrySetup,
  OutboundQueue,
  OverviewReader,
  RosterReader,
  SearchReader,
  SharedNumberCapacity,
  SignInLimit,
  StripeEventInbox,
  SuggestedPairsReader,
  SupportAlerts,
  UnitOfWork,
} from './ports'

/**
 * The composition root: the one place that decides which real implementations sit
 * behind the ports. Everything upstream of here depends on the interfaces, which
 * is what lets the test suite drive the same boundary with a controlled clock and
 * an in-memory store.
 */

/** The real source of identifiers, alongside the real clock. */
const randomIds: IdSource = { next: () => crypto.randomUUID() }

/**
 * The real source of randomness, beside the identifiers. Both exist so the domain
 * stays a pure function of its inputs and the tests can say what came out.
 *
 * Rejection sampling rather than `% upperBound`, and the difference is not
 * academic here: 2^32 does not divide by an arbitrary list length, so the modulo
 * alone makes the first few words of the list very slightly likelier than the rest
 * -- a bias in the one thing the wordlist's whole size argument depends on. The
 * loop discards the short tail of the range instead, and with 1024 words it
 * discards nothing at all, because 1024 divides 2^32 exactly.
 */
const randomChoices: RandomSource = {
  choose: (upperBound) => {
    if (!Number.isInteger(upperBound) || upperBound < 1) {
      throw new Error(`Cannot choose from ${upperBound} possibilities`)
    }

    const beyond = 2 ** 32
    const largestWholeMultiple = Math.floor(beyond / upperBound) * upperBound
    const drawn = new Uint32Array(1)

    do {
      crypto.getRandomValues(drawn)
    } while (drawn[0]! >= largestWholeMultiple)

    return drawn[0]! % upperBound
  },
}

let commandService: CommandService | undefined
let commandStore: PostgresEffectStore | undefined
let intakeReader: PostgresIntakeReader | undefined
let invitationReader: PostgresInvitationReader | undefined
let ministrySetup: SupabaseMinistrySetup | undefined
let signInLimit: PostgresSignInLimit | undefined
let inboundReader: PostgresInboundReader | undefined
let outboundQueue: PostgresOutboundQueue | undefined
let ministryDirectory: PostgresMinistryDirectory | undefined
let messageTransport: MessageTransport | undefined
let emailSender: EmailSender | undefined
let supportSubmissions: PostgresSupportSubmissions | undefined
let supportForm: SupportForm | undefined
let phoneChecks: PostgresPhoneChecks | undefined
let phoneCheck: PhoneCheck | undefined
let sharedNumbers: PostgresSharedNumbers | undefined
let twilioBalanceFalls: PostgresTwilioBalanceFalls | undefined
let over200FollowUps: PostgresOver200FollowUps | undefined
let churchSignups: PostgresChurchSignups | undefined
let dailyCapHolds: PostgresDailyCapHolds | undefined
let pendingSignups: PostgresPendingSignups | undefined
let signUp: SignUp | undefined
let openingAChurch: OpeningAChurch | undefined
let postgresBilling: PostgresBilling | undefined

export const getCommandService = (): CommandService => {
  if (!commandService) {
    commandStore = createPostgresEffectStore(commandDatabaseUrl())
    commandService = createCommandService({
      clock: systemClock,
      ids: randomIds,
      store: sendingWhatItQueues(commandStore),
      appBaseUrl: appBaseUrl(),
    })
  }
  return commandService
}

/**
 * The store every command commits through, with one thing added: a transaction
 * that committed a message has the Ministry's queue drained once the response
 * that carried it has gone.
 *
 * Nothing sends the queue but a drain, and until this the only drains were the
 * scheduler's on the hour and the inbound webhook's. So a Discipler who completed
 * the Intake that formed their planned pair, or whom an Admin had just paired,
 * waited up to an hour to be told -- as did the Welcome Message, a Starter
 * Message on acceptance and every other text an act produces. Here rather than in
 * each route, because it is the one place every command commits, and a route
 * added later cannot forget to send what its command queued.
 *
 * Per committed transaction and not per request, so settling several planned
 * pairings drains several times. The later drains find nothing to send, and
 * ADR-0020's lock keeps any two from overlapping. The scheduled tick drains in
 * line as well, for the order its route explains, and the drain scheduled here
 * after it finds its queue already sent.
 */
const sendingWhatItQueues = (store: EffectStore): EffectStore => ({
  async transact(ministryId, work) {
    let queued = false
    const result = await store.transact(ministryId, (unit) =>
      work(
        // The unit as it is, with its own `this`, and only the write watched.
        Object.create(unit, {
          enqueueMessages: {
            value: (messages: Parameters<UnitOfWork['enqueueMessages']>[0]) => {
              if (messages.length > 0) queued = true
              return unit.enqueueMessages(messages)
            },
          },
        }) as UnitOfWork,
      ),
    )
    // After the commit, which `transact` returning is: a rolled-back transaction
    // throws past this, and its messages were never there to send.
    if (queued) sendAfterTheResponse(ministryId)
    return result
  },
})

/**
 * Drains one Ministry's queue once the current response has gone. Every commit
 * that queued a message asks for this; the inbound webhook also asks for it
 * outright, see its route for why.
 */
export const sendAfterTheResponse = (ministryId: MinistryId): void => {
  try {
    // After the response rather than before it, so nobody's page waits on the
    // vendor's round trip. A drain that fails leaves its rows neither sent nor
    // withheld, and the scheduler's next pass retries them.
    after(() => sendWhatWasQueued(ministryId))
  } catch {
    // Outside a request -- a script or a test driving the container -- there is
    // no response to wait for and nothing to schedule on. The scheduler's next
    // pass sends it, which is all any message had before this.
  }
}

const sendWhatWasQueued = async (ministryId: MinistryId): Promise<void> => {
  try {
    await drainOutboundQueue(ministryId)
  } catch (error) {
    console.error(`Could not send what was queued in ministry ${ministryId}`, error)
  }
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

let materialPageReader: MaterialPageReader | undefined

/**
 * A Disciple's Material page is served to somebody with no session, so it reads
 * on the command connection as the Invitation Link's page does (Richer
 * materials, ticket 04).
 */
export const getMaterialPageReader = (): MaterialPageReader => {
  if (!materialPageReader) {
    materialPageReader = createPostgresMaterialPageReader(commandDatabaseUrl())
  }
  return materialPageReader
}

/**
 * The Ministry Setup Link's page is served to a pastor with no account and no
 * Ministry yet, so it runs on the same trusted connection provisioning does. It
 * is where a real Ministry comes from; the seed and the fixtures go straight to
 * provisioning because they have no link to spend.
 */
export const getMinistrySetup = (): MinistrySetup => {
  if (!ministrySetup) ministrySetup = createSupabaseMinistrySetup(commandDatabaseUrl())
  return ministrySetup
}

/**
 * The sign-in guessing limit counts on the trusted connection, because a sign-in
 * has no session yet and its table belongs to no Ministry (Exponential launch,
 * ticket 13).
 */
export const getSignInLimit = (): SignInLimit => {
  if (!signInLimit) signInLimit = createPostgresSignInLimit(commandDatabaseUrl(), systemClock)
  return signInLimit
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
 *
 * On staging, and wherever `MESSAGE_TRANSPORT=record` says so, a text is written
 * to the log instead of sent (Exponential launch, ticket 02).
 */
export const getMessageTransport = (): MessageTransport => {
  if (!messageTransport) {
    messageTransport =
      messageTransportKind(process.env) === 'record'
        ? createRecordingTransport()
        : createTwilioTransport()
  }
  return messageTransport
}

/**
 * The one way an email leaves Discipler (Exponential launch, ticket 10). Resend is
 * behind it and nowhere else, and the sender opens every email in the domain
 * before the vendor sees it, so there is no transport to reach around it: this
 * getter is the only thing that builds one.
 *
 * Built lazily, and its credentials read per send, for the reason the message
 * transport's are: only Production has a Resend key, and Preview and a
 * developer's machine run every page without one.
 */
export const getEmailSender = (): EmailSender => {
  if (!emailSender) emailSender = createEmailSender(createResendTransport())
  return emailSender
}

/**
 * Checking an Admin's own phone with a Twilio Verify code (Exponential launch,
 * ticket 09). Its records belong to an account and to no Ministry, so they are
 * kept on the trusted connection; Verify texts from Twilio's own senders, so
 * nothing here passes through the outbound queue or its drain. Wherever texts are
 * recorded rather than sent, so is the code (Exponential launch, ticket 02).
 */
export const getPhoneCheck = (): PhoneCheck => {
  if (!phoneCheck) {
    phoneChecks = createPostgresPhoneChecks(commandDatabaseUrl())
    phoneCheck = createPhoneCheck({
      checks: phoneChecks,
      verifier:
        messageTransportKind(process.env) === 'record'
          ? createRecordingVerifier()
          : createTwilioVerifier(),
      clock: systemClock,
    })
  }
  return phoneCheck
}

/**
 * Sign-up's human check and email code (Exponential launch, ticket 11). On the
 * trusted connection, because somebody signing up has no session and no Ministry.
 * Turnstile's secret and the code's HMAC secret are read per use, so a deployment
 * with neither runs every other page and refuses only this.
 */
export const getSignUp = (): SignUp => {
  if (!signUp) {
    pendingSignups = createPostgresPendingSignups(commandDatabaseUrl())
    signUp = createSignUp({
      signUps: pendingSignups,
      humanCheck: createTurnstile(),
      keeper: createSignUpCodeKeeper(),
      sender: getEmailSender(),
      clock: systemClock,
    })
  }
  return signUp
}

/** **Start free trial** on "Set up your account" (Exponential launch, ticket 17). */
export const getOpeningAChurch = (): OpeningAChurch => {
  if (!openingAChurch) {
    const signingUp = getSignUp()
    openingAChurch = createOpeningAChurch({
      signUp: signingUp,
      signUps: pendingSignups!,
      openChurch: openSignedUpChurch,
      sender: getEmailSender(),
      clock: systemClock,
    })
  }
  return openingAChurch
}

/**
 * What a self-signed-up church chose (Exponential launch, tickets 17 and 18), on the
 * trusted connection, because the reminder's read spans churches and somebody pressing
 * "Don't send me reminders" has no session. A church's own row is written as that church.
 */
export const getChurchSignups = (): ChurchSignups => {
  if (!churchSignups) churchSignups = createPostgresChurchSignups(commandDatabaseUrl())
  return churchSignups
}

/**
 * One pass of the payment reminder (Exponential launch, ticket 18). While sign-up is
 * shut, "Start" would open a page that sends nobody to the payment step, so nothing is
 * read and the tick's response says so. Throws when the churches could not be read, and
 * the tick catches it.
 */
export const watchThePaymentReminders = async (): Promise<PaymentReminderOutcome | 'shut'> => {
  if (!signUpIsOpen(process.env)) return 'shut'
  return watchPaymentReminders({
    signups: getChurchSignups(),
    sender: getEmailSender(),
    clock: systemClock,
    links: {
      start: () => new URL('/', appBaseUrl()),
      logo: () => new URL('/discipler-logo.png', appBaseUrl()),
      stop: (church) => {
        const stop = new URL('/signup/reminders-off', appBaseUrl())
        stop.searchParams.set('t', remindersOffToken(church))
        return stop
      },
    },
  })
}

/**
 * The Help menu's form (Exponential launch, ticket 25). The store is on the trusted
 * connection, and drops into `discipler_command` for a church's own write, because
 * somebody signed out has no session to write with. Turnstile's secret is read per use.
 */
export const getSupportForm = (): SupportForm => {
  if (!supportForm) {
    supportSubmissions = createPostgresSupportSubmissions(commandDatabaseUrl())
    supportForm = createSupportForm({
      submissions: supportSubmissions,
      humanCheck: createTurnstile(),
      sender: getEmailSender(),
      clock: systemClock,
    })
  }
  return supportForm
}

/** The tick's pass over the form's two tables. It throws when the database does, and the tick catches it. */
export const sweepTheSupportSubmissions = (): Promise<SupportSweep> => getSupportForm().sweep()

/**
 * One drain of one Ministry's queue, assembled from the parts above so that its
 * callers cannot assemble it differently. The scheduler drains after its tick, and
 * every request whose command queued a message drains after its response, the
 * inbound webhook's included: everything an act produces -- the next question, a
 * Discipler's invitation, a Welcome Message -- is enqueued by the command and sent
 * by nothing but a drain, so an act that only enqueued left its text waiting for
 * the next pass on the hour.
 */
export const drainOutboundQueue = (ministryId: MinistryId): Promise<DispatchOutcome> =>
  dispatchQueue({
    queue: getOutboundQueue(),
    transport: getMessageTransport(),
    clock: systemClock,
    ministryId,
    dailyCap: getDailyCap(),
  })

/**
 * Twilio's daily limit, as every drain reads it (Exponential launch, ticket 07). On
 * the trusted connection, as the shared numbers are, because the limit belongs to no
 * church.
 */
const getDailyCap = (): DailyCap => {
  if (!dailyCapHolds) dailyCapHolds = createPostgresDailyCapHolds(commandDatabaseUrl())
  return createDailyCap({ holds: dailyCapHolds, alerts: getSupportAlerts() })
}

/**
 * The set of shared numbers, read across every church for the capacity
 * watch. On the trusted connection, as the Setup Link is, because the set belongs
 * to no church.
 */
export const getSharedNumbers = (): SharedNumberCapacity => {
  if (!sharedNumbers) sharedNumbers = createPostgresSharedNumbers(commandDatabaseUrl())
  return sharedNumbers
}

/** What support@ is told about, emailed through the one sender. */
export const getSupportAlerts = (): SupportAlerts => createEmailSupportAlerts(getEmailSender())

/** Once a day, by the email's own key, however many passes find it (Exponential launch, ticket 05). */
export const tellSupportTheTextingGateIsUnread = (): Promise<void> =>
  getSupportAlerts().textingGateUnread({ day: systemClock.now().toISOString().slice(0, 10) })

/** One pass of the capacity watch, assembled so its callers cannot assemble it differently. */
export const watchTheSharedNumbers = (): Promise<readonly CapacityConcern[]> =>
  watchSharedNumberCapacity({
    numbers: getSharedNumbers(),
    alerts: getSupportAlerts(),
    clock: systemClock,
  })

const billing = (): PostgresBilling => {
  if (!postgresBilling) postgresBilling = createPostgresBilling(commandDatabaseUrl())
  return postgresBilling
}

/** Billing's church-scoped records (Exponential launch, ticket 03), for the server only. */
export const getBillingRecords = (): BillingRecords => billing().records

/** The Stripe webhook's inbox, which only the webhook and its processing touch. */
export const getStripeEventInbox = (): StripeEventInbox => billing().inbox

const stripeEventWork = (): StripeEventWork => ({
  inbox: billing().inbox,
  records: billing().records,
  stripe: createStripeBilling(),
  trials: createStripeTrials(),
  alerts: getSupportAlerts(),
  clock: systemClock,
})

let referrals: PostgresReferrals | undefined
const theReferrals = (): PostgresReferrals => {
  if (!referrals) referrals = createPostgresReferrals(commandDatabaseUrl())
  return referrals
}

/** Whether a code in a referral link is live, for the page that shows the banner (ticket 20). */
export const getReferralCodes = (): ReferralCodes => theReferrals()

/**
 * Who invited a church, from the `referral` row written in the transaction that opened it
 * (ticket 20), and never from a browser.
 */
export const getInvitations = (): Invitations => theReferrals()

/** Opening a church's trial, on the server's word about everything but the choice. */
export const getTrialWork = (): TrialWork => ({
  records: billing().records,
  stripe: createStripeBilling(),
  trials: createStripeTrials(),
  invitations: getInvitations(),
  clock: systemClock,
})

/** One event, once the webhook has answered. A failure is left for the sweep. */
export const processStripeEventAfterTheResponse = (eventId: string): Promise<void> =>
  processStripeEventQuietly(stripeEventWork, eventId)

/** One pass over the events the responses missed, for the scheduled tick. */
export const sweepTheStripeEvents = (): Promise<StripeEventSweep> =>
  sweepStripeEvents(stripeEventWork())

/**
 * One pass of the Twilio balance watch (Exponential launch, ticket 08). Wherever texts
 * are recorded rather than sent there is no Twilio account to read, so nothing is
 * read: on staging that is the promise, and a read could only fail. Throws when the
 * balance could not be read, and the tick catches it.
 */
export const watchTheTwilioBalance = async (): Promise<TwilioBalanceWatchOutcome | 'no_account'> => {
  if (messageTransportKind(process.env) === 'record') return 'no_account'

  if (!twilioBalanceFalls) {
    twilioBalanceFalls = createPostgresTwilioBalanceFalls(commandDatabaseUrl())
  }
  return watchTwilioBalance({
    balance: createTwilioBalanceReader(),
    falls: twilioBalanceFalls,
    alerts: getSupportAlerts(),
    clock: systemClock,
  })
}

/**
 * One pass of the over-200 watch (Exponential launch, ticket 14). Where there is no
 * Stripe, or its catalog does not have both of the first price's billing choices,
 * nobody can be said to be on it, so nothing more is read, and the tick's response says
 * so rather than reporting a quiet month. Throws when Stripe or the churches could not
 * be read, and the tick catches it.
 */
export const watchTheOver200Churches = async (): Promise<Over200WatchOutcome | 'no_prices'> => {
  if (!process.env.STRIPE_SECRET_KEY) return 'no_prices'
  const firstPrices = await firstPriceIdsIn(stripeClient())
  if (!firstPrices) return 'no_prices'

  if (!over200FollowUps) over200FollowUps = createPostgresOver200FollowUps(commandDatabaseUrl())
  return watchOver200Churches({
    followUps: over200FollowUps,
    alerts: getSupportAlerts(),
    clock: systemClock,
    firstPrices,
  })
}

/**
 * Settles the pairings an import planned for one Ministry, and never fails the
 * page that called it. Three routes call this after a Person's own act -- an
 * Intake submission through any of the three forms -- and one after an import;
 * the scheduled tick calls the service directly and reports the counts. A plan is
 * an Admin's arrangement, and a fault in settling it is logged for the Admin's
 * benefit rather than shown to the Person who just completed their form.
 */
export const settlePlannedPairings = async (ministryId: MinistryId): Promise<void> => {
  try {
    await getCommandService().settleIntendedPairings(ministryId)
  } catch (error) {
    console.error(`Could not settle the planned pairings in ministry ${ministryId}`, error)
  }
}

/**
 * Which Ministries the scheduler has to run for. The one unscoped read in the app,
 * kept to ids for that reason -- see the port.
 */
/**
 * Deletes a Ministry's uploads that no Material names a day after they landed
 * (Richer materials, ticket 01). The tick runs it; the clock is the one thing
 * passed down, as it is to every reader here.
 */
export const sweepUnsavedUploads = (ministryId: MinistryId): Promise<number> =>
  sweepUploads(ministryId, systemClock)

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
  const checks = phoneChecks
  const shared = sharedNumbers
  const balanceFalls = twilioBalanceFalls
  const followUps = over200FollowUps
  const signupRows = churchSignups
  const capHolds = dailyCapHolds
  const limit = signInLimit
  const signUps = pendingSignups
  const billed = postgresBilling
  const submissions = supportSubmissions
  commandService = undefined
  commandStore = undefined
  intakeReader = undefined
  invitationReader = undefined
  inboundReader = undefined
  outboundQueue = undefined
  ministryDirectory = undefined
  phoneChecks = undefined
  phoneCheck = undefined
  sharedNumbers = undefined
  twilioBalanceFalls = undefined
  over200FollowUps = undefined
  churchSignups = undefined
  dailyCapHolds = undefined
  signInLimit = undefined
  pendingSignups = undefined
  signUp = undefined
  openingAChurch = undefined
  postgresBilling = undefined
  supportSubmissions = undefined
  supportForm = undefined
  // The transport holds no pool -- it is `fetch` and a pair of credentials -- so
  // there is nothing of its to close, only the reference to drop.
  messageTransport = undefined
  emailSender = undefined
  await signupRows?.close()
  await store?.close()
  await reader?.close()
  await invitations?.close()
  await inbound?.close()
  await queue?.close()
  await directory?.close()
  await checks?.close()
  await shared?.close()
  await balanceFalls?.close()
  await followUps?.close()
  await capHolds?.close()
  await limit?.close()
  await signUps?.close()
  await billed?.close()
  await submissions?.close()
}

export const getRosterReader = (): RosterReader => createSupabaseRosterReader(systemClock)

/**
 * Intake forms reads through the signed-in Admin's session -- the groups, the
 * join requests, the Ministry's own list of Discipleship Goal options and the
 * names on the Roster in one document -- so the policies say which Ministry's
 * list it is, and the page never has to.
 */
export const getIntakeFormsReader = (): IntakeFormsReader => supabaseIntakeFormsReader

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
 * Suggested Pairs reads through the signed-in Admin's session, so the Roster's own
 * Admin test and the policies scope it. The clock is for the badge alone: the
 * ranking needs none.
 */
export const getSuggestedPairsReader = (): SuggestedPairsReader =>
  createSupabaseSuggestedPairsReader(systemClock)

/**
 * The Overview reads through the signed-in Admin's session, so the policies on
 * `relationship`, the check-in tables and `concern` are what scope it to their
 * Ministry rather than anything this container passes down. The clock is passed
 * down, because which unaccepted relationships have waited long enough to surface,
 * and which ISO week is this week, are both computed at the moment of the read.
 */
export const getOverviewReader = (): OverviewReader => createSupabaseOverviewReader(systemClock)

/**
 * The Check-Ins tab reads through the signed-in Admin's session for the same
 * reason, and takes the clock because *this week* is a reading of it against the
 * Ministry's own timezone.
 */
export const getCheckInsReader = (): CheckInsReader => createSupabaseCheckInsReader(systemClock)

/**
 * The Materials tab reads through the signed-in Admin's session for the same
 * reason, and takes the clock because which Material period is running is a
 * question about now, as is the state each card's pill shows.
 */
export const getMaterialsReader = (): MaterialsReader => createSupabaseMaterialsReader(systemClock)

/**
 * Search reads through the signed-in Admin's session like every page, and takes the
 * clock because whether the Overview draws an unaccepted relationship yet is a
 * question about now.
 */
export const getSearchReader = (): SearchReader => createSupabaseSearchReader(systemClock)

/**
 * The Leader Dashboard reads through the signed-in user's session and takes no
 * Ministry, because the session is what names it: the list is a live query for open
 * leader memberships, and an Admin who leads is the same person on both surfaces.
 */
export const getLeaderDashboardReader = (): LeaderDashboardReader =>
  supabaseLeaderDashboardReader

/**
 * Acceptance mints an account, and so does provisioning a Ministry's first Admin,
 * but both reach the adapter the same way every other surface does. A route
 * holding a concrete adapter is how a composition root stops being one.
 */
export const getAccounts = (): Accounts => supabaseAccounts

/**
 * Where a generated password's words come from. The reset surface asks for it the
 * way every other surface asks for a port -- a page holding `crypto` directly is
 * how a composition root stops being one, and it is also how a test loses the only
 * seam that lets it name the password it expects.
 */
export const getRandomSource = (): RandomSource => randomChoices
