import type { Answer } from '../post'

/**
 * What the payment step shows, from what the server last said (Exponential launch,
 * ticket 18). Nothing here touches a browser or Stripe, so a test can read it.
 *
 * **Nothing the browser says unlocks anything** (spec, protection 4). The method being
 * confirmed moves the page to waiting and no further, and only `billing.hasAccess`, as
 * the webhook writes it, moves it on. Either way out goes to `/overview` and never `/`,
 * which would read the church as not confirmed yet and send the Admin straight back.
 */

/** Where the page goes when waiting is over, however it ended. */
export const AFTER_THE_PAYMENT_STEP = '/overview'

/** How long the waiting line shows before the page offers a way on (ticket 18). */
export const WAITING_BEFORE_OFFERING_THE_LINK_MS = 30_000

/** How often the small read asks. */
export const ASKING_FOR_ACCESS_EVERY_MS = 2_000

/** What `/signup/payment/open` answers. */
export interface OpenedTrial {
  readonly clientSecret: string
  readonly publishableKey: string
  readonly trialEndsAt: string
  readonly codeRefusal: { readonly refusal: string; readonly message: string } | null
}

export type PaymentStep =
  | { readonly kind: 'opening' }
  | ({ readonly kind: 'form' } & OpenedTrial)
  /** The method is confirmed, or Stripe says it was, and the webhook is on its way. */
  | { readonly kind: 'waiting' }
  | { readonly kind: 'refused'; readonly message: string; readonly canTryAgain: boolean }

/**
 * Asked again, a refusal can come out differently only when something failed along the
 * way. The rest say something about the church that pressing a button does not change.
 */
const CAN_TRY_AGAIN: ReadonlySet<string | null> = new Set([null, 'payment.not_opened'])

export const stepAfterOpening = (answer: Answer<OpenedTrial>): PaymentStep => {
  if (answer.ok) return { kind: 'form', ...answer.body }
  // The route asks Stripe, and the webhook's record may not have landed yet.
  if (answer.refusal === 'payment.already_paying') return { kind: 'waiting' }
  return { kind: 'refused', message: answer.message, canTryAgain: CAN_TRY_AGAIN.has(answer.refusal) }
}

/**
 * Whether Stripe has a wallet to draw on this device, which decides whether the "or"
 * shows. Its ready event says `{ applePay: true }` and its later event says
 * `{ applePay: { available: true } }`, and either can name a method it has ruled out.
 */
export const someWalletIsAvailable = (
  methods: Readonly<Record<string, boolean | { readonly available: boolean } | undefined>> | undefined,
): boolean =>
  Object.values(methods ?? {}).some((method) => (typeof method === 'object' ? method.available : method === true))

/** The trial's last day as the mock-up writes it, on the church's clock. */
export const trialEndsOn = (trialEndsAt: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone }).format(
    new Date(trialEndsAt),
  )

/**
 * Whether the method that left the page came back having failed, which Stripe says in
 * the address. Only ever a reason to say so: a "succeeded" here is read as nothing, and
 * the page asks the server as it does on any other arrival.
 */
export const cameBackFailed = (redirectStatus: string | string[] | undefined): boolean =>
  redirectStatus === 'failed'
