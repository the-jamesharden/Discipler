import Stripe from 'stripe'
import type { StripeEventEnvelope } from '~/domain/billing'
import { stripeTakesLiveEvents, type Environment } from '~/platform/deployment'

/**
 * Who may speak to `/stripe/webhook`, decided on the raw body before anything is read
 * from it (Exponential launch, ticket 03).
 *
 * `constructEvent` needs no API key and makes no request, so the webhook verifies on a
 * deployment that could not read Stripe at all. Stripe's default tolerance is left
 * alone: a replay of an old signature is refused, and a resend is signed afresh.
 *
 * **An unset secret is a closed door**, as `CRON_SECRET` is at `/cron/tick`. Every
 * refusal answers null and nothing else, so nobody can learn which check they failed.
 * An event from the wrong mode is refused after its signature is good: it is a real
 * event sent to the wrong deployment, and recording it would mix real money with a
 * sandbox's.
 */
export const admittedStripeEvent = (
  rawBody: string,
  signature: string | null,
  env: Environment,
): StripeEventEnvelope | null => {
  const secret = env.STRIPE_WEBHOOK_SECRET
  if (!secret || !signature) return null

  let event: Stripe.Event
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch {
    return null
  }

  if (event.livemode !== stripeTakesLiveEvents(env)) {
    console.warn(`Stripe event ${event.id} (${event.type}) refused: it is from the wrong mode`)
    return null
  }

  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    created: event.created,
    object: event.data.object as unknown as Readonly<Record<string, unknown>>,
  }
}
