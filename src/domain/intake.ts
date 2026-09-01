import type { Branded } from './branded'
import { asEmail, asPhoneNumber, type PhoneNumber } from './roster'

/**
 * What the Intake form captures, and the rules for reading one. Intake is the single
 * consent gate: completing this form creates the SMS consent record, and nothing
 * else does. An import never speaks on a congregant's behalf.
 *
 * Refusals travel as codes rather than prose, the same as everywhere else -- the
 * form owns its own wording, and nothing a submitter typed is reflected back.
 */

/**
 * A week is seven days of five blocks: thirty-five slots. The blocks are named
 * rather than clock times because a Person selecting *when could work* is answering
 * about the shape of their day, not committing to an hour, and because pairing
 * counts shared slots -- a count only means something when both sides used the same
 * grid. See `docs/adr/0006-the-availability-grid.md`.
 */
export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export const DAY_BLOCKS = ['early_morning', 'morning', 'midday', 'afternoon', 'evening'] as const

export type Weekday = (typeof WEEKDAYS)[number]
export type DayBlock = (typeof DAY_BLOCKS)[number]

export interface AvailabilitySlot {
  readonly day: Weekday
  readonly block: DayBlock
}

/**
 * Collected as a range, never as an exact age or a date of birth. The suggestion
 * constraint is expressed in bands for the same reason: two adjacent bands may
 * differ by one year or by nineteen, and pretending otherwise would be precision
 * the data does not have. See `docs/adr/0001-pairing-suggestion-inputs.md`.
 */
export const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

/**
 * Gender is an absolute safeguarding constraint on suggestion, so it must match
 * between a Leader and a Participant. A Ministry wanting mixed-gender relationships
 * disables the rule once, deliberately, in settings -- it is never overridden per
 * pairing.
 */
export const GENDERS = ['male', 'female'] as const
export type Gender = (typeof GENDERS)[number]

/** The two routes to the form. There is no third. */
export const CONSENT_SOURCES = ['pastor_link', 'qr_code'] as const
export type ConsentSource = (typeof CONSENT_SOURCES)[number]

/**
 * The options a Ministry offers. The list is the Ministry's own -- set before a
 * semester begins -- so a goal is an identifier here rather than a value.
 */
export type DiscipleshipGoalId = Branded<string, 'DiscipleshipGoalId'>
export const discipleshipGoalId = (value: string): DiscipleshipGoalId =>
  value as DiscipleshipGoalId

export interface IntakeFormFields {
  readonly fullName: string | null
  readonly phone: string | null
  readonly email: string | null
  readonly ageBand: string | null
  readonly gender: string | null
  readonly goalId: string | null
  /** Slot keys as the grid submits them -- `monday:midday`. */
  readonly availability: readonly string[]
  readonly smsConsent: boolean
  readonly contactSharing: string | null
  readonly source: string | null
}

export interface IntakeSubmissionDraft {
  readonly fullName: string
  readonly phone: PhoneNumber
  readonly email: string | null
  readonly ageBand: AgeBand
  readonly gender: Gender
  readonly goalId: DiscipleshipGoalId
  readonly availability: readonly AvailabilitySlot[]
  readonly smsConsent: true
  readonly contactSharingConsent: boolean
  readonly source: ConsentSource
}

const isOneOf = <T extends string>(allowed: readonly T[], value: unknown): value is T =>
  allowed.includes(value as T)

const readSlot = (key: string): AvailabilitySlot | null => {
  const [day, block] = key.split(':')
  return isOneOf(WEEKDAYS, day) && isOneOf(DAY_BLOCKS, block) ? { day, block } : null
}

/**
 * Why a form could not be accepted. Every problem is reported at once rather than
 * one per submission: a Person filling this in on a phone should not have to
 * discover their mistakes one round trip at a time.
 */
export type IntakeRefusal =
  | 'intake.name_missing'
  | 'intake.phone_missing'
  | 'intake.phone_unreadable'
  | 'intake.availability_not_selected'
  | 'intake.availability_unreadable'
  | 'intake.age_band_unknown'
  | 'intake.gender_unknown'
  | 'intake.goal_not_selected'
  | 'intake.sms_consent_required'
  | 'intake.contact_sharing_undecided'
  | 'intake.source_unknown'
  | 'intake.email_unreadable'
  /**
   * The two a form field cannot produce, and which `readIntakeForm` therefore never
   * returns. They live in this union because they reach the Person the same way
   * every other refusal does -- as a code, on the form they just submitted -- and a
   * second vocabulary for them would be a second thing the page has to know about.
   */
  | 'intake.link_expired'
  | 'intake.details_belong_to_someone_else'
  /**
   * The Ministry retired the option this Person picked while their form was open.
   * A form field cannot produce it either: the list was on the page when it was
   * served, and stopped being true before it came back.
   *
   * It reaches them as a refusal rather than as a failure because everything else
   * they typed is still good -- their name, their number, the grid, the consents --
   * and the form re-renders around one answer they now have to give again.
   */
  | 'intake.goal_no_longer_offered'

export type IntakeReading =
  | { readonly submission: IntakeSubmissionDraft }
  | { readonly refusals: readonly IntakeRefusal[] }

/**
 * Reads one submitted form. The order of the checks is the order of the fields on
 * the page, so the list of refusals reads top to bottom the way the Person filled
 * it in.
 */
export const readIntakeForm = (fields: IntakeFormFields): IntakeReading => {
  const refusals: IntakeRefusal[] = []

  // A name and a number together, because that is what identifies a Person within a
  // Ministry. One link serves a whole Ministry -- the pastor sends it, or a QR code
  // opens it at a leaders' meeting -- so the form has to ask who is filling it in
  // rather than being told by the URL.
  const fullName = fields.fullName?.trim() || null
  if (!fullName) refusals.push('intake.name_missing')

  const rawPhone = fields.phone?.trim() || null
  const phone = rawPhone ? asPhoneNumber(rawPhone) : null
  if (!rawPhone) refusals.push('intake.phone_missing')
  else if (!phone) refusals.push('intake.phone_unreadable')

  const availability: AvailabilitySlot[] = []
  let slotUnreadable = false
  for (const key of fields.availability) {
    const slot = readSlot(key)
    if (slot) availability.push(slot)
    else slotUnreadable = true
  }

  // A grid the Person could not have produced means the submission is not the form
  // Discipler served. Reported rather than dropped, for the same reason an import
  // reports a row it cannot read: a silently smaller availability is a Person who
  // quietly never overlaps with anybody.
  if (slotUnreadable) refusals.push('intake.availability_unreadable')
  else if (availability.length === 0) refusals.push('intake.availability_not_selected')

  if (!isOneOf(AGE_BANDS, fields.ageBand)) refusals.push('intake.age_band_unknown')
  if (!isOneOf(GENDERS, fields.gender)) refusals.push('intake.gender_unknown')

  const goalId = fields.goalId?.trim() || null
  if (!goalId) refusals.push('intake.goal_not_selected')

  // Without it Discipler has no way to reach them at all, and Participation Status
  // would read `No Intake Submitted` however complete the rest of the form was.
  if (!fields.smsConsent) refusals.push('intake.sms_consent_required')

  // Unanswered is not the same as declined. A checkbox cannot tell the two apart,
  // which is why the form asks this one as a choice between two answers.
  const contactSharing = fields.contactSharing
  if (contactSharing !== 'granted' && contactSharing !== 'declined') {
    refusals.push('intake.contact_sharing_undecided')
  }

  // Not defaulted anywhere, here or in the database: a consent record that cannot
  // say how the Person reached the form fails rather than guessing.
  if (!isOneOf(CONSENT_SOURCES, fields.source)) refusals.push('intake.source_unknown')

  const raw = fields.email?.trim() || null
  const email = raw === null ? null : asEmail(raw)
  if (raw !== null && email === null) refusals.push('intake.email_unreadable')

  if (refusals.length > 0) return { refusals }

  return {
    submission: {
      fullName: fullName!,
      phone: phone!,
      email,
      ageBand: fields.ageBand as AgeBand,
      gender: fields.gender as Gender,
      goalId: discipleshipGoalId(goalId!),
      availability,
      smsConsent: true,
      contactSharingConsent: contactSharing === 'granted',
      source: fields.source as ConsentSource,
    },
  }
}
