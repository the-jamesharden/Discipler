import { createHash } from 'node:crypto'
import { dollarsToCents } from '~/domain/twilio-balance'
import type { TwilioSpendPassed } from '~/service/ports'

/**
 * What a Usage Trigger's callback says, in Discipler's terms (Exponential launch,
 * ticket 08). Twilio's names for these stop here.
 *
 * Read leniently, because the request is already known to be Twilio's and the alarm
 * matters more than its details: one with a value missing still reaches support@.
 */
const cents = (raw: string | undefined): number | null =>
  raw === undefined ? null : dollarsToCents(raw)

/**
 * `once` is a digest of everything Twilio signed. A retry of a firing carries the same
 * parameters and so the same key and the same words, which Resend drops, and each new
 * firing carries a new `IdempotencyToken` and so a new key.
 *
 * A digest rather than that token itself, whose documented form begins with the
 * account's SID, because Resend keeps its keys and has no use for that.
 */
export const usageTriggerFired = (
  parameters: Readonly<Record<string, string>>,
): TwilioSpendPassed => ({
  spentCents: cents(parameters.CurrentValue),
  markCents: cents(parameters.TriggerValue),
  watching: parameters.UsageCategory ?? null,
  once: createHash('sha256')
    .update(JSON.stringify(Object.entries(parameters).sort(([a], [b]) => (a < b ? -1 : 1))))
    .digest('hex'),
})
