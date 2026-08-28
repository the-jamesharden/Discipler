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
  'intake.sms_consent_required':
    'We can only take part by text, so we need your agreement to text you.',
  'intake.contact_sharing_undecided':
    'Please tell us whether we may share your number — either answer is fine.',
  'intake.source_unknown': 'This link is incomplete. Please ask for a new one.',
  'intake.email_unreadable': 'That does not look like an email address.',
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
