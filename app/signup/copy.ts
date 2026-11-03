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

/** Every sign-up page's subtitle (spec, decided in the mock-up 1 review). */
export const CREATE_AN_ACCOUNT = 'Create an account'

/**
 * Under the phone field, word for word. The privacy policy, the opt-in page and the
 * Twilio registration all quote this sentence, so it changes only with all of them;
 * `tests/app/the-sign-up-pages.test.ts` reads the two that are in this repository.
 */
export const TEXTING_FINE_PRINT =
  'By continuing, you agree to receive texts from Discipler at this number, including sign-in codes and test check-ins. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.'

/** The words of mock-up 1 (`.lavish/signup-checkout/`), which James approved. */
export const ALREADY_HAVE_AN_ACCOUNT = 'Already have an account?'
export const SIGN_IN = 'Sign in'

export const EMAIL_PAGE = {
  title: 'Start your free trial',
  step: 'Step 1 of 3',
  stepName: 'Your email',
  emailLabel: 'Email',
  emailHint: 'This will be your login email.',
  phoneLabel: 'Mobile phone',
  submit: 'Email me a code',
} as const

export const CODE_PAGE = {
  title: 'Check your email',
  step: 'Step 1 of 3',
  stepName: 'Check your email',
  sentBefore: `We sent a ${EMAIL_CODE.digits}-digit code to `,
  sentAfter: `. Please enter it below. It works for ${EMAIL_CODE.lifetimeMinutes} minutes.`,
  codeLabel: 'Your code',
  submit: 'Continue',
  differentEmail: 'Use a different email',
  newCode: 'Send a new code',
  newCodeIn: (wait: string) => `Send a new code in ${wait}`,
  cantFindIt: "Can't find it? Please check your spam or promotions folder. The email comes from notify.trydiscipler.com.",
} as const

/**
 * Drafted, for James: the mock-up draws neither a failed check nor a dropped connection
 * nor a second code being sent, and the stopping point below stands only until ticket
 * 17 replaces it.
 */
export const TRY_AGAIN = 'Try again'
export const COULD_NOT_REACH = "We couldn't reach Discipler just now. Please check your connection and try again."
export const newCodeSent = (email: string) => `We sent a new code to ${email}.`

export const STOPPING_POINT = {
  title: 'Set up your account',
  step: 'Step 2 of 3',
  stepName: 'Your account',
  confirmedBefore: 'Your email is confirmed: ',
  confirmedAfter: '.',
  notOpenYet: "The next step, setting up your account, isn't open yet.",
} as const

/** The sentence for a refusal. A wrong code says how many tries are left. */
export const signUpRefusalMessage = (
  refusal: Exclude<SignUpRefusal, 'signup.not_verified'>,
  triesLeft?: number,
): string =>
  refusal === 'signup.wrong_code'
    ? `That code doesn't match. Please check your email and try again. You have ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.`
    : REFUSALS[refusal]
