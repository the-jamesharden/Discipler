import type { DayBlock, DeclaredSide, IntakeRefusal, Weekday } from '~/domain/intake'

/**
 * Everything the Intake form says in words. The domain deals in refusal codes and
 * slot identifiers; deciding how to say them is the screen's, the same way the
 * Roster owns the wording of an import report.
 */

export const weekdayLabel: Record<Weekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

export const dayBlockLabel: Record<DayBlock, string> = {
  early_morning: 'Early morning',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

const REFUSALS: Record<IntakeRefusal, string> = {
  'intake.name_missing': 'Please give your name.',
  'intake.phone_missing': 'Please give a mobile number we can text.',
  'intake.phone_unreadable': 'That does not look like a mobile number we can text.',
  'intake.availability_not_selected': 'Please select at least one time that could work.',
  'intake.availability_unreadable': 'Something went wrong reading your times. Please try again.',
  'intake.age_band_unknown': 'Please choose an age range.',
  'intake.gender_unknown': 'Please choose an option.',
  'intake.goal_not_selected': 'Please choose what you are hoping for.',
  // Names the real route out, because the form is not one. This form grants consent
  // and never withdraws it: a prefilled link an Admin sent, producing a withdrawal
  // that reads as the Person's own act, is the wrong shape for a decision that has
  // to be dated, reversible and person-level.
  'intake.sms_consent_required':
    'We can only take part by text, so we need your agreement to text you. If you no '
    + 'longer want text messages, reply STOP to any message from us.',
  'intake.contact_sharing_undecided':
    'Please tell us whether we may share your number — either answer is fine.',
  'intake.source_unknown': 'This link is incomplete. Please ask for a new one.',
  'intake.side_unknown':
    'Please tell us whether you are joining as a mentor or as someone to be '
    + 'mentored.',
  'intake.first_time_unanswered': 'Please tell us whether this is your first time.',
  // Says the same thing `intake.source_unknown` says, because it is the same kind
  // of thing: a form that cannot say what it was asking is not one Discipler
  // served, and there is nothing on it the Person can correct.
  'intake.path_unknown': 'This link is incomplete. Please ask for a new one.',
  'intake.email_unreadable': 'That does not look like an email address.',
  'intake.link_expired':
    'This link has expired. Ask whoever sent it to you for a new one.',
  // Deliberately says nothing about who. A name and a number together are who a
  // Person is within a Ministry, and telling a stranger which pair is already taken
  // would answer a question about somebody else's details.
  'intake.details_belong_to_someone_else':
    'Those details are already on file for someone else here. Please check them, or '
    + 'ask whoever sent you this link.',
  // Said as *no longer offered* rather than as an error, because nothing they did
  // was wrong: the ministry changed its list while this form was open.
  //
  // It says the form is empty rather than promising it is not. Every refusal on
  // this page comes back as a code on the query string and nothing else -- a name
  // and a number are not going in a URL -- so the form re-renders blank, and a
  // message claiming otherwise would have somebody hunting for the answers it said
  // were there.
  'intake.goal_no_longer_offered':
    'That option is no longer one this ministry offers: the ministry changed its list '
    + 'while this form was open. Nothing was saved, so please fill the form in again '
    + 'and choose from the list as it stands now.',
}

// `Object.hasOwn` and never `in`, which walks the prototype chain: `__proto__` and
// `toString` are both `in` this object and neither is a refusal. What arrives in
// the query string is whatever somebody typed there, and `in` would hand this form
// an object or a function to render and take the page down with it.
const isRefusal = (value: string): value is IntakeRefusal =>
  Object.hasOwn(REFUSALS, value)

/**
 * Only codes this form actually issues are rendered. Anything else arriving in the
 * query string renders nothing rather than being reflected back into the page.
 *
 * Takes any number of sources because a screen can have two: the codes a refused
 * submission came back with, and one the screen raised on its own. Both are shown,
 * deduplicated -- *every problem at once* is the rule the reader is written to, and
 * a screen that dropped one set to show the other would break it at the boundary
 * where the two overlap.
 */
export const refusalMessages = (
  ...raw: readonly (string | null | undefined)[]
): readonly string[] => [
  ...new Set(
    raw
      .flatMap((codes) => (codes ?? '').split(' '))
      .filter(isRefusal)
      .map((refusal) => REFUSALS[refusal]),
  ),
]

/**
 * The discipleship wizard's wording. Mentor and mentee are asked the same things in
 * the same order and differ only here, which is why every one of these is a record
 * keyed on the side rather than a branch inside a screen: a question that existed
 * for one side and not the other would be invisible until somebody read both.
 */

export const sideLabel: Record<DeclaredSide, string> = {
  mentor: 'A mentor',
  mentee: 'Someone to be mentored',
}

export const SIDE_QUESTION = 'I’m joining as…'

/**
 * The one screen whose question is not the same sentence for both sides. It is
 * still the same question: has this Person done this before.
 */
export const firstTimeQuestion: Record<DeclaredSide, string> = {
  mentor: 'Have you mentored someone before?',
  mentee: 'Have you been discipled by a mentor before?',
}

/**
 * Worded as statements rather than as yes and no, so the answer is legible without
 * the question above it -- on this screen, and afterwards on the pairing surface
 * that reads what it recorded.
 */
export const DONE_BEFORE_ANSWER = 'Yes, I’ve done this before'
export const FIRST_TIME_ANSWER = 'No, this is my first time'

export const DONE_HEADING = 'You’re on the list'

/**
 * The closing line when the side is not known -- said without it rather than said
 * in a guess.
 *
 * The submit route puts the side in the URL of this page and there is no ordinary
 * way to arrive without one, so this is for the hand-typed URL and the truncated
 * redirect. Defaulting to the commoner side would tell somebody who offered to
 * mentor that a mentor is being found for them, which is a sentence about somebody
 * else's Person. Everything true of both sides is still said.
 */
export const doneMessageWithoutASide = (ministryName: string): string =>
  `${ministryName} will look at when you can meet and what you said you are hoping `
  + 'for, and be in touch.'

export const doneMessage: Record<DeclaredSide, (ministryName: string) => string> = {
  mentor: (ministryName) =>
    `${ministryName} will look at when you can meet and what you said you are hoping `
    + 'for, and be in touch when there is someone for you to mentor.',
  mentee: (ministryName) =>
    `${ministryName} will look at when you can meet and what you said you are hoping `
    + 'for, and be in touch when there is a mentor for you.',
}
