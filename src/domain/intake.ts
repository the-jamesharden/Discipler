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
 * Which form the Person was answering, which is a different question from how they
 * reached it: `source` says link or QR, and one path times two routes is already
 * four combinations. One member today -- ticket 29 adds `group` having decided it.
 *
 * Null everywhere this is absent, and null is a real state: it means the Person
 * answered a form that did not ask. The original `/intake/<ministry>` form is still
 * one of those.
 */
export const INTAKE_PATHS = ['discipleship'] as const
export type IntakePath = (typeof INTAKE_PATHS)[number]

/**
 * Which side of a discipleship relationship the Person offered to stand on. A
 * preference they stated and nothing stronger: it produces a signal on their Roster
 * row and never `eligible_to_lead`, which ticket 16 made a plan an Admin records.
 *
 * Deliberately not `MemberRole`. That says what somebody is in a relationship an
 * Admin formed; this says what somebody offered before one existed.
 */
export const DECLARED_SIDES = ['mentor', 'mentee'] as const
export type DeclaredSide = (typeof DECLARED_SIDES)[number]

/**
 * The first-time screen's two answers, carried as words rather than as a yes/no.
 *
 * The screen words them as statements -- *Yes, I've done this before* and *No, this
 * is my first time* -- so the answer is legible without the question. A field
 * spelled `yes`/`no` would invert under exactly that wording, and a first-timer
 * recorded as experienced is a mistake nothing downstream could notice.
 */
export const EXPERIENCE_ANSWERS = ['first_time', 'done_before'] as const
export type ExperienceAnswer = (typeof EXPERIENCE_ANSWERS)[number]

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
  /**
   * The three the wizard adds, and which the single-page form leaves null. They
   * arrive here together with everything else because nothing is written until the
   * wizard's last step submits: each screen carries the earlier answers forward as
   * hidden inputs, so what reaches this reader is one whole form however many
   * screens it was spread across.
   */
  readonly intakePath: string | null
  readonly declaredSide: string | null
  readonly experience: string | null
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
  readonly intakePath: IntakePath | null
  readonly declaredSide: DeclaredSide | null
  /**
   * True where the Person said this is their first time -- being discipled, or
   * mentoring, whichever side they declared. Null where the form did not ask.
   */
  readonly firstTime: boolean | null
}

/**
 * One guard for every list on this page, exported because the screens have to ask
 * the same questions this reader does and each of them is somewhere a wrong answer
 * is silent: a value out of a query string, a column off a row the Roster is about
 * to render, a hidden input coming back on a refused submission.
 */
export const isOneOf = <T extends string>(allowed: readonly T[], value: unknown): value is T =>
  allowed.includes(value as T)

const readSlot = (key: string): AvailabilitySlot | null => {
  const [day, block] = key.split(':')
  return isOneOf(WEEKDAYS, day) && isOneOf(DAY_BLOCKS, block) ? { day, block } : null
}

/**
 * Whether a key is one of the thirty-five the grid submits, and not something a
 * hand-written URL invented. The key format is this module's -- a screen carrying
 * slots between steps asks here rather than rebuilding `${day}:${block}` beside it,
 * because two spellings of the same key would disagree in exactly one direction:
 * silently, and only about somebody's availability.
 */
export const isSlotKey = (key: string): boolean => readSlot(key) !== null

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
   * The wizard's first screen, unanswered, and its third. Both are ordinary
   * refusals a Person can act on: they name a screen they can go back to.
   */
  | 'intake.side_unknown'
  | 'intake.first_time_unanswered'
  /**
   * The form named a path Discipler does not serve, or carried an answer with no
   * path to belong to. Held to the same rule as `source_unknown` and for the same
   * reason: a consent record that cannot say what question was answered fails
   * rather than guessing, and it is `consent_record` whose whole job is to be read
   * back in an audit.
   */
  | 'intake.path_unknown'
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
   * It reaches them as a refusal rather than as a failure because nothing they did
   * was wrong and nothing of theirs landed: the whole submission rolls back with
   * it, so they are asked again rather than half-recorded. The form itself comes
   * back empty, like it does after every refusal on this page -- what travels back
   * is the code and nothing else.
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

  // The wizard's first and third screens, read first because that is where they
  // are. A form that did not ask carries all three as null and passes through:
  // the single-page form is one of those and stays one until ticket 29.
  const rawPath = fields.intakePath?.trim() || null
  const path = isOneOf(INTAKE_PATHS, rawPath) ? rawPath : null
  const declaredSide = isOneOf(DECLARED_SIDES, fields.declaredSide) ? fields.declaredSide : null
  const experience = isOneOf(EXPERIENCE_ANSWERS, fields.experience) ? fields.experience : null

  if (rawPath !== null && path === null) refusals.push('intake.path_unknown')

  if (path === 'discipleship') {
    if (declaredSide === null) refusals.push('intake.side_unknown')
    if (experience === null) refusals.push('intake.first_time_unanswered')
  } else if (rawPath === null && (fields.declaredSide !== null || fields.experience !== null)) {
    // An answer with no question. Refused rather than dropped, because dropping it
    // writes a consent record that says a Person was asked nothing when they were
    // looking at a screen that asked them something.
    refusals.push('intake.path_unknown')
  }

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
      intakePath: path,
      declaredSide,
      firstTime: experience === null ? null : experience === 'first_time',
    },
  }
}
