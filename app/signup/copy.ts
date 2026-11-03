import { EMAIL_CODE } from '~/domain/launch-terms'
import type { SignUpRefusal } from '~/service/sign-up'

/**
 * What sign-up's first three steps say in words (Exponential launch, ticket 11). The
 * service refuses in codes and this owns the sentences, in the voice of the mock-up's
 * code page. The wrong-code line is the mock-up's own; the rest are drafted with the
 * routes, for tickets 15 and 16 to show or reword when James reviews those pages.
 *
 * A `Record`, so a refusal added to the service and left unworded fails the build.
 */
const REFUSALS: Record<Exclude<SignUpRefusal, 'signup.wrong_code' | 'signup.not_verified'>, string> = {
  'signup.not_human': "We couldn't confirm you're a real person. Please try again.",
  'signup.human_check_needed': 'Please start again. It only takes a moment.',
  'signup.bad_email': "That doesn't look like an email address. Please check it and try again.",
  'signup.bad_phone': "That doesn't look like a phone number. Please include the area code.",
  'signup.phone_not_us': 'Discipler can only text US mobile numbers for now. Please use a US mobile number.',
  'signup.resend_too_soon': 'We just sent a code. Please wait a moment before asking for a new one.',
  'signup.too_many_codes': "We've sent a lot of codes. Please try again in an hour.",
  'signup.not_sent': "We couldn't send your code just now. Please try again in a minute.",
  'signup.malformed_code': `Please enter the ${EMAIL_CODE.digits}-digit code from the email.`,
  'signup.no_code': 'Please ask for a new code first.',
  'signup.code_expired': 'That code has expired. Please ask for a new one.',
  'signup.too_many_tries': "That was too many tries, so this code has stopped working. Please ask for a new one.",
  'signup.already_verified': 'Your email is already confirmed.',
  'signup.not_checked': "We couldn't check that code just now. Please try again in a minute.",
}

/** The sentence for a refusal. A wrong code says how many tries are left. */
export const signUpRefusalMessage = (
  refusal: Exclude<SignUpRefusal, 'signup.not_verified'>,
  triesLeft?: number,
): string =>
  refusal === 'signup.wrong_code'
    ? `That code doesn't match. Please check your email and try again. You have ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.`
    : REFUSALS[refusal]
