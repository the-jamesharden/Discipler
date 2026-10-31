import type { PhoneCheckRefusal } from '~/service/phone-check'
import { displayPhone } from '../../roster/copy'

/**
 * What checking an Admin's own phone says in words (Exponential launch, ticket
 * 09). The service refuses in codes and this owns the sentences, in the voice the
 * test check-in's own messages use: please and thank you.
 *
 * Drafted with the routes, for the test check-in's card (ticket 28) to show; the
 * mock-up drew only the card asking for the code, so these wait on James.
 *
 * A `Record`, so a refusal added to the service and left unworded fails the build.
 */
const REFUSALS: Record<Exclude<PhoneCheckRefusal, 'phone_check.wrong_code'>, string> = {
  'phone_check.no_phone':
    'There is no phone on your own Roster row to check. Please email support@trydiscipler.com and we\'ll help. Thank you!',
  'phone_check.not_us':
    'We can only text codes to US mobile numbers. Please email support@trydiscipler.com and we\'ll help. Thank you!',
  'phone_check.too_many_codes':
    'We\'ve texted this phone a lot of codes. Please try again later. If something isn\'t working, please email support@trydiscipler.com and we\'ll help. Thank you!',
  'phone_check.not_sent':
    'We couldn\'t text you a code just now. Please try again in a minute. If it keeps happening, please email support@trydiscipler.com and we\'ll help.',
  'phone_check.malformed_code': 'Please enter the 6-digit code from the text.',
  'phone_check.no_code': 'Please press Text me a new code first.',
  'phone_check.code_expired': 'That code has expired. Please press Text me a new code. Thank you!',
  'phone_check.attempt_ended':
    'That was five codes that didn\'t match, so this one has stopped working. Please press Text me a new code. Thank you!',
  'phone_check.not_checked': 'We couldn\'t check that code just now. Please try again in a minute.',
}

/** The sentence for a refusal. A wrong code says how many tries are left. */
export const phoneCheckRefusalMessage = (refusal: PhoneCheckRefusal, triesLeft?: number): string =>
  refusal === 'phone_check.wrong_code'
    ? `That code doesn't match. Please check the text and try again. You have ${triesLeft} more ${triesLeft === 1 ? 'try' : 'tries'}.`
    : REFUSALS[refusal]

/** The phone as the card shows it, `(318) 555-0142`. */
export const phoneShown = displayPhone

/** Said to a session that ended before the button was pressed. */
export const SIGN_IN_TO_CHECK_YOUR_PHONE = 'You have been signed out. Please sign in again, then try once more.'
