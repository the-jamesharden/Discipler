import { dollarsToCents } from '~/domain/twilio-balance'
import type { TwilioBalanceReader } from '~/service/ports'
import { twilioCredentials, type TwilioCredentials } from './credentials'

/**
 * Reading the account's balance (Exponential launch, ticket 08). No SDK, for the
 * reason `message-transport.ts` gives: the whole of what is used is one GET.
 *
 * It either gives a balance in dollars or throws. A status, a shape or a currency it
 * does not recognise is a failed read and never a number, because a made-up zero is a
 * false alarm and a made-up figure could hide a real one.
 */

/** Twilio did not say what the balance is. */
export class TwilioBalanceNotRead extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TwilioBalanceNotRead'
  }
}

/**
 * How long the tick waits. It runs after every church's work and shares the cron's
 * time limit with it, and an alarm that could not be raised this pass is raised on
 * the next, so nothing is worth waiting longer than this for.
 */
const READ_TIMEOUT_MILLISECONDS = 10_000

/** Credentials are resolved per read, as the message transport's are per send. */
export const createTwilioBalanceReader = (
  credentials: () => TwilioCredentials = twilioCredentials,
): TwilioBalanceReader => ({
  async readCents() {
    const { accountSid, authToken } = credentials()

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Balance.json`,
      {
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        signal: AbortSignal.timeout(READ_TIMEOUT_MILLISECONDS),
      },
    )

    if (!response.ok) {
      throw new TwilioBalanceNotRead(`Twilio answered the balance read with ${response.status}`)
    }

    // Read defensively: an error page from something in front of Twilio is not JSON.
    const answer = (await response.json().catch(() => null)) as {
      balance?: unknown
      currency?: unknown
    } | null

    // The floor is in dollars, so a balance in anything else cannot be judged by it.
    if (answer?.currency !== 'USD') {
      throw new TwilioBalanceNotRead('Twilio answered the balance read with no balance in USD')
    }

    const cents = typeof answer.balance === 'string' ? dollarsToCents(answer.balance) : null
    if (cents === null) {
      throw new TwilioBalanceNotRead('Twilio answered the balance read with no readable balance')
    }
    return cents
  },
})
