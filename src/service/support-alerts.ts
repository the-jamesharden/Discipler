import { EmailField, emailBody, emailSubject } from '~/domain/email'
import type { CapacityConcern } from '~/domain/shared-numbers'
import type { EmailSender, SupportAlerts } from './ports'

const CONCERN_SAYS: Readonly<Record<CapacityConcern, string>> = {
  recipients: 'The shared numbers carry close to as many people as they safely can.',
  one_phone: 'The person in the most churches has at most one shared number left.',
}

/**
 * What support@ is told about, sent as email through the one sender (Exponential
 * launch, tickets 06 and 10). Counts and a day only: an email field takes out
 * anything shaped like a phone number, so none of the shared numbers could be
 * listed even by mistake.
 */
export const createEmailSupportAlerts = (sender: EmailSender): SupportAlerts => ({
  async sharedNumbersNearCapacity({ concern, load, day }) {
    const { numbers, recipients, mostChurchesOnOnePhone } = load
    await sender.send({
      kind: 'numbersNearCapacity',
      subject: emailSubject`The shared numbers are near capacity`,
      body: emailBody`${EmailField.line(CONCERN_SAYS[concern])}

Right now ${EmailField.line(String(numbers))} numbers carry ${EmailField.line(String(recipients))} (phone, church) pairs, and one phone is in ${EmailField.line(String(mostChurchesOnOnePhone))} churches.

Buy a number into the discipler-sms Messaging Service in Twilio, then add it to the shared set with npm run shared-number against production. Until one is added, a church's first text to a phone that already hears from every number waits on the queue.`,
      once: `numbers-near-capacity:${concern}:${numbers}:${day}`,
    })
  },
})
