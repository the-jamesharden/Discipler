import { EMAIL_CODE, EXPONENTIAL_OFFER, YEARLY_DISCOUNT_PERCENT } from '~/domain/launch-terms'
import { startingPrice, trialDaysOf, type TrialOffer } from '~/domain/offers'
import type { SignUpRefusal } from '~/service/sign-up'

/**
 * What sign-up says in words (Exponential launch, ticket 11). The
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
  // Renamed by James in mock-up 6 (2026-11-04), for every sign-up.
  submit: 'Continue',
  haveACode: 'Have a code?',
  yourCode: 'Your code',
  apply: 'Apply',
} as const

/** The Exponential special offer, over the whole screen, in the mock-up's capitals. */
export const OFFER_SCREEN = {
  eyebrow: 'EXPONENTIAL SPECIAL OFFER',
  big: `${EXPONENTIAL_OFFER.trialDays} DAYS FREE`,
  then: `THEN ${EXPONENTIAL_OFFER.discountPercent}% OFF YOUR FIRST YEAR`,
  small: 'FOR CHURCHES THAT JOIN THROUGH EXPONENTIAL',
  claim: 'CLAIM MY OFFER',
} as const

/** What a live referral code shows on the email and phone page. It never names the church. */
export const INVITED_BANNER = {
  title: 'You were invited by another church',
  line: 'Your first paid month is on us.',
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
  // The popup on arrival from "Continue" (mock-up 6's `c2-code-sent.html`).
  sentTitle: 'Login code sent',
  sentPopupBefore: 'A login code has been sent to ',
  sentPopupAfter: '.',
  sentOk: 'OK',
} as const

/**
 * Drafted, for James: the mock-up draws neither a failed check nor a dropped connection
 * nor a second code being sent.
 */
export const TRY_AGAIN = 'Try again'
export const COULD_NOT_REACH = "We couldn't reach Discipler just now. Please check your connection and try again."
export const newCodeSent = (email: string) => `We sent a new code to ${email}.`

/** The words of mock-up 1's `s4-account.html`, which James approved. */
export const ACCOUNT_PAGE = {
  title: 'Set up your account',
  step: 'Step 2 of 3',
  stepName: 'Your account',
  requiredNote: 'indicates required information',
  optional: '(optional)',
  churchName: 'Church or organization name',
  fullName: 'Full name',
  heardAboutUs: 'Where did you hear about us?',
  chooseOne: 'Choose one',
  loginEmail: 'Login email',
  password: (shortest: number) => `Choose a password (minimum ${shortest} characters)`,
  passwordHint: (shortest: number) => `Use at least ${shortest} characters.`,
  timezone: 'Timezone',
  timezoneHint: 'We picked this from your device. Check-ins go out in this timezone.',
  howToPay: 'How would you like to pay?',
  monthly: 'Monthly',
  yearly: 'Yearly',
  save: `Save ${YEARLY_DISCOUNT_PERCENT}%`,
  agreeBefore: 'I agree to the ',
  terms: 'Terms of Service',
  agreeBetween: ' and ',
  privacy: 'Privacy Policy',
  agreeAfter: '.',
  submit: 'Start free trial',
} as const

/** The church-plant questions on that page (ticket 19), in the mock-up's words. */
export const PLANT_QUESTIONS = {
  question: 'Is your church a church plant?',
  lead: 'Church plants that launched in the last 3 years, or are launching in the next 12 months, can apply for a year of Discipler free.',
  yes: 'Yes, we are',
  no: 'No',
  launchDate: 'Launch date, or planned launch date',
  launchDateExample: 'For example, September 2025',
  sendingChurch: 'Sending or partner church',
  averageAttendance: 'Average weekly attendance',
  leadPastor: 'Lead pastor',
  anythingElse: "Anything else you'd like us to know?",
  followUp: 'James or Lerone will follow up by email. Your trial starts either way, and your free year begins once your application is approved.',
} as const

/** What the page says about money, which is the one place sign-up says anything. */
export interface AccountPrices {
  readonly month: string
  readonly year: string
  readonly underTheButton: string
}

/** Dollars, with cents only where there are some. */
const dollarsAsWritten = (cents: number): string =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`

const NEXT_YOU_ADD = "Next, you'll add a card or bank account. You won't be charged today."

/**
 * The monthly or yearly choice and the line under the button. A referral reads as no
 * offer here, because the free month it brings comes off a bill and not off the days.
 */
export const accountPrices = (offer: TrialOffer): AccountPrices => {
  const month = `${dollarsAsWritten(startingPrice('month').cents)} a month`
  const year = `${dollarsAsWritten(startingPrice('year').cents)} a year`
  if (offer !== 'exponential') {
    return { month, year, underTheButton: `${trialDaysOf(offer)} days free. ${NEXT_YOU_ADD}` }
  }
  const off = `${EXPONENTIAL_OFFER.discountPercent}% off your first year`
  return {
    month: `${month}, ${off}`,
    year: `${year}, ${off}`,
    underTheButton: `${trialDaysOf(offer)} days free with the Exponential special offer. ${NEXT_YOU_ADD}`,
  }
}

/**
 * Drafted, for James, as a sentence inside an approved screen (ticket 17; the spec,
 * decided in triage 2026-11-04). In pieces, because two of them are links.
 */
export const ALREADY_HAS_AN_ACCOUNT = {
  before: 'That phone number or email already has a Discipler account. ',
  signIn: 'Sign in',
  between: ', or ',
  startAgain: 'start again',
  after: ' with a different one.',
} as const

export const ALREADY_HAS_AN_ACCOUNT_SENTENCE = Object.values(ALREADY_HAS_AN_ACCOUNT).join('')

/** Drafted, for James: the mock-up draws no refusal on this page but a disabled button. */
export const OPENING_REFUSALS = {
  'signup.church_name_needed': "Please enter your church or organization's name.",
  'signup.full_name_needed': 'Please enter your full name.',
  'signup.bad_timezone': 'Please choose your timezone.',
  'signup.plant_launch_date_needed': 'Please enter your launch date, or planned launch date.',
  'signup.plant_sending_church_needed': 'Please enter your sending or partner church.',
  'signup.plant_attendance_needed': 'Please enter your average weekly attendance.',
  'signup.plant_lead_pastor_needed': "Please enter your lead pastor's name.",
  'signup.plant_answer_too_long': 'One of your church plant answers is too long. Please shorten it.',
  'signup.bad_cycle': 'Please choose monthly or yearly.',
  'signup.terms_needed': 'Please agree to the Terms of Service and Privacy Policy.',
  'signup.not_human': REFUSALS['signup.not_human'],
  'signup.not_verified': REFUSALS['signup.human_check_needed'],
  'signup.not_opened': "We couldn't set up your account just now. Please try again in a minute.",
  'account.already_exists': ALREADY_HAS_AN_ACCOUNT_SENTENCE,
} as const

/** The sentence for a refusal. A wrong code says how many tries are left. */
export const signUpRefusalMessage = (
  refusal: Exclude<SignUpRefusal, 'signup.not_verified'>,
  triesLeft?: number,
): string =>
  refusal === 'signup.wrong_code'
    ? `That code doesn't match. Please check your email and try again. You have ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.`
    : REFUSALS[refusal]
