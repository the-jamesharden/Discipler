import Stripe from 'stripe'
import type { StripeEventEnvelope } from '~/domain/billing'
import { deploymentOf, stripeTakesLiveEvents, type Environment } from '~/platform/deployment'

/**
 * The addresses Stripe says its webhooks come from: "Webhook notifications" at
 * https://docs.stripe.com/ips, and https://stripe.com/files/ips/ips_webhooks.json, read
 * 2026-11-04. Stripe gives seven days' notice of a change on its API announce list.
 * `docs/stripe-webhook-addresses.md` says what to do then, and who else holds this list.
 */
export const STRIPE_WEBHOOK_ADDRESSES: ReadonlySet<string> = new Set([
  '3.18.12.63',
  '3.69.109.8',
  '3.120.168.93',
  '3.130.192.231',
  '13.235.14.237',
  '13.235.122.149',
  '18.211.135.69',
  '35.154.171.200',
  '35.157.207.129',
  '52.15.183.38',
  '54.88.130.119',
  '54.88.130.237',
  '54.187.174.169',
  '54.187.205.235',
  '54.187.216.72',
])

/**
 * Whether a request reached the webhook from where Stripe sends them (Exponential launch,
 * ticket 37; spec, Q57), asked before the body is read. The signature is what proves an
 * event is Stripe's. This turns everybody else away before they can make the server do
 * that work.
 *
 * Production and staging only. Staging's sandbox sends from these same addresses. A
 * developer's machine has `stripe listen` and the tests, and a Preview holds no Stripe
 * secret, so the signature check refuses everything there anyway.
 */
export const comesFromStripe = (network: string | null, env: Environment): boolean =>
  deploymentOf(env) === 'other' || (network !== null && STRIPE_WEBHOOK_ADDRESSES.has(network))

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
