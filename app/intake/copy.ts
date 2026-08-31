import type { DayBlock, IntakeRefusal, Weekday } from '~/domain/intake'

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
  'intake.email_unreadable': 'That does not look like an email address.',
  'intake.link_expired':
    'This link has expired. Ask whoever sent it to you for a new one.',
  // Deliberately says nothing about who. A name and a number together are who a
  // Person is within a Ministry, and telling a stranger which pair is already taken
  // would answer a question about somebody else's details.
  'intake.details_belong_to_someone_else':
    'Those details are already on file for someone else here. Please check them, or '
    + 'ask whoever sent you this link.',
}

const isRefusal = (value: string): value is IntakeRefusal => value in REFUSALS

/**
 * Only codes this form actually issues are rendered. Anything else arriving in the
 * query string renders nothing rather than being reflected back into the page.
 */
export const refusalMessages = (raw: string | undefined): readonly string[] =>
  (raw ?? '')
    .split(' ')
    .filter(isRefusal)
    .map((refusal) => REFUSALS[refusal])
