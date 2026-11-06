import type { TestCheckInRefusal } from '~/domain/test-check-in'
import { phoneCheckRefusalMessage } from '../../account/phone/copy'
import { CHURCH_HAS_NO_ACCESS_TO_TEXTING } from '../../texting-gate-copy'
import type { PhoneCheckRefusal } from '~/service/phone-check'

/**
 * What a test check-in refuses with, for the routes and the card (Exponential launch,
 * ticket 28). The domain refuses in codes and this owns the sentences.
 *
 * `real_question_open` and `limit_reached` are James's, from `.lavish/onboarding/
 * s4-waiting.html` and `s4-limit.html`. The rest are drafts, listed for him in
 * `docs/open-questions.md`.
 *
 * A `Record`, so a refusal added to the domain and left unworded fails the build.
 */
const REFUSALS: Record<TestCheckInRefusal, string> = {
  'test_check_in.real_question_open':
    'You have a check-in waiting on your phone. Please answer it first, then try the test again. Thank you!',
  'test_check_in.limit_reached':
    "You've sent three test check-ins today. Please try again tomorrow. If something isn't working, please email support@trydiscipler.com and we'll help. Thank you!",
  'test_check_in.no_phone':
    "There's no phone on your own Roster row, so we have nowhere to send a test. Please add one on the Roster, then try again. Thank you!",
  'test_check_in.opted_out':
    "This phone has opted out of texts from Discipler, so we can't send a test. Reply START to any of our texts, then try again. Thank you!",
  'test_check_in.declined':
    "You've told us not to text this phone, so we can't send a test. If that's changed, please email support@trydiscipler.com and we'll help. Thank you!",
  'test_check_in.agreement_needed':
    'Please read the line above the button, then press it again. Thank you!',
  'test_check_in.church_has_no_access': CHURCH_HAS_NO_ACCESS_TO_TEXTING,
}

export const testCheckInRefusalMessage = (
  refusal: TestCheckInRefusal | PhoneCheckRefusal,
  triesLeft?: number,
): string =>
  refusal.startsWith('test_check_in.')
    ? REFUSALS[refusal as TestCheckInRefusal]
    : phoneCheckRefusalMessage(refusal as PhoneCheckRefusal, triesLeft)
