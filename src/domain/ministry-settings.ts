import type { Branded } from './branded'
import { AGE_BANDS } from './intake'
import { isKnownTimezone, type Cadence } from './week'
import { readWording } from './wording'

/**
 * Everything a Ministry is allowed to vary about how Discipler runs for them, and
 * nothing else.
 *
 * Three sections and one form: the **Ministry** it is, the **Language** it speaks,
 * and how it wants **Pairing** and the weekly ask to behave. Message structure,
 * reply tokens and the opt-out footer are deliberately not here -- the first two
 * are a state machine and the third is a carrier obligation -- and they are not
 * here as disabled fields either, because a greyed-out box invites *can you turn
 * that on for us?*
 *
 * Nothing in this module reaches a database, and every rule below is enforced a
 * second time by one. That is not duplication: pilot settings get written by SQL
 * as often as by a button, so a rule only the form holds is a rule that is off
 * wherever the form is not. What this module adds is the sentence an Admin reads
 * in place of a constraint violation.
 */

/**
 * A word a Ministry calls one of the two roles by, as it will appear in the
 * messages that Ministry sends.
 *
 * Branded for the reason `GoalWording` is: the difference between what an Admin
 * typed into a box and the word a message will actually carry is the whole of
 * this module's input handling, and a plain `string` loses it.
 */
export type RoleNoun = Branded<string, 'RoleNoun'>

/** At the platform edge, where the database is the authority on its own column. */
export const roleNoun = (value: string): RoleNoun => value as RoleNoun

/**
 * The hours a Ministry may be asked in, local to its own timezone.
 *
 * Enforced by a check constraint in `20260901000100_the_cadence_and_the_week_boundary.sql`
 * and stated here so the form can say why rather than surfacing a violation. A
 * coordinator who innocently sets 6:30am creates a compliance problem Discipler
 * carries, not the ministry -- so the ceiling is Discipler's to set, and 21 is the
 * last hour that starts before 10pm. See ADR-0007.
 */
export const QUIET_HOURS = { earliest: 8, latest: 21 } as const

/**
 * The widest gap that names anything: the whole ladder, 18-24 up to 65+.
 *
 * Derived from the bands themselves rather than written as `5`, so a Ministry
 * that gains a band gains the gap that spans it without anybody remembering to.
 */
export const MOST_BANDS_APART = AGE_BANDS.length - 1

/** The default the schema seeds, and ADR-0001's own rule. */
export const DEFAULT_AGE_BAND_GAP = 1

/**
 * One Ministry's settings, as they stand.
 *
 * `fromName` is null for a Ministry that has never set one, and null rather than
 * a copy of the display name: a Ministry that renames itself has renamed itself,
 * and a copy would leave its messages speaking as whoever it used to be until
 * somebody noticed. `speakingName` is the one place the fallback happens.
 */
export interface MinistrySettings {
  /** What an Admin sees this Ministry called on every screen. */
  readonly name: string
  /** What its messages read as, or null to speak as the display name. */
  readonly fromName: string | null
  /**
   * The single clock this Ministry's data is interpreted against. Every
   * availability block, the check-in cadence, the ISO week boundary behind the
   * care counters, and the *first check-in of each calendar month* rule all
   * resolve against it.
   */
  readonly timezone: string
  readonly leaderNoun: RoleNoun
  readonly participantNoun: RoleNoun
  /**
   * The absolute gender constraint on a one-to-one, and whether this Ministry has
   * turned it off on purpose.
   *
   * Not a tuning dial and deliberately not presented as one. It is a safeguarding
   * rule, enforced by a trigger rather than by the pairing command, and the only
   * way past it is this setting -- which is why the form gives it a control of its
   * own rather than a row in a list of toggles.
   */
  readonly suggestGenderMatch: boolean
  /**
   * The number of age bands a Participant may be **above** their Leader. There is
   * no limit below: an older person discipling a younger one is the common case.
   *
   * `0` means *never older than their Leader* and is a Ministry that means it, not
   * an absent setting.
   */
  readonly suggestMaxAgeBandGap: number
  readonly cadence: Cadence
}

/**
 * The two words a Ministry's messages use for the two roles.
 *
 * Separate from the settings as a whole because it is what a *message* needs, and
 * the boundary composing one has no business holding a Ministry's age band gap.
 */
export interface MinistryLanguage {
  readonly leaderNoun: RoleNoun
  readonly participantNoun: RoleNoun
}

/**
 * Everything a message needs to speak as this Ministry: the name it reads as, and
 * the words it calls its people by.
 *
 * One read and one concept. `name` here is already the *speaking* name --
 * `from_name` where a Ministry has set one, its display name otherwise -- so
 * nothing downstream of the store has to remember which of the two a message
 * carries.
 */
export interface MinistryVoice extends MinistryLanguage {
  readonly name: string
}

/** The form as it arrives, before anything has decided whether it is settings. */
export interface MinistrySettingsFields {
  readonly name: string | null
  readonly fromName: string | null
  readonly timezone: string | null
  readonly leaderNoun: string | null
  readonly participantNoun: string | null
  /**
   * A checkbox, and therefore already a boolean by the time it gets here. An
   * unchecked box is a Ministry saying *no* and an absent one is the same fact,
   * which is the one field on this form where the two really are the same.
   */
  readonly suggestGenderMatch: boolean
  readonly suggestMaxAgeBandGap: string | null
  readonly checkinDay: string | null
  readonly checkinHour: string | null
}

/**
 * Why a settings form could not be taken. Reported all at once rather than one per
 * submission, like Intake: an Admin filling in three sections should not discover
 * their mistakes one round trip at a time.
 */
export type MinistrySettingsRefusal =
  /** A Ministry with nothing written on it is not a Ministry. */
  | 'settings.name_missing'
  /** A zone this platform could not resolve a week or a cadence against. */
  | 'settings.timezone_unknown'
  | 'settings.leader_noun_missing'
  | 'settings.participant_noun_missing'
  /** Not a whole number of bands, or wider than the ladder has. */
  | 'settings.age_band_gap_unreadable'
  /** Not one of the seven days, 0 being Sunday. */
  | 'settings.checkin_day_unreadable'
  /**
   * Outside 8am-9pm local, or not a whole hour at all. One refusal and not two,
   * because the sentence an Admin needs is the same either way: *the check-in goes
   * out between 8am and 9pm, on the hour.*
   */
  | 'settings.checkin_hour_outside_quiet_hours'

export type MinistrySettingsReading =
  | { readonly settings: MinistrySettings }
  | { readonly refusals: readonly MinistrySettingsRefusal[] }

/**
 * A whole number as typed, or null for anything that is not one.
 *
 * `Number.isInteger` and not `parseInt`, which reads `9.5` as `9` and `9pm` as
 * `9` -- both of which are an Admin being quietly given a cadence they did not
 * ask for. The empty string is excluded explicitly because `Number('')` is `0`,
 * which is an integer and, for the age gap, a meaningful setting.
 */
const wholeNumber = (raw: string | null): number | null => {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isInteger(value) ? value : null
}

/**
 * Reads one submitted settings form. The order of the checks is the order of the
 * fields on the page -- Ministry, then Language, then Pairing -- so the list of
 * refusals reads top to bottom the way the Admin filled it in.
 */
export const readMinistrySettings = (
  fields: MinistrySettingsFields,
): MinistrySettingsReading => {
  const refusals: MinistrySettingsRefusal[] = []

  const name = readWording(fields.name)
  if (!name) refusals.push('settings.name_missing')

  // Blank is *none*, not a refusal. A Ministry that has never set a sending name
  // speaks as its own display name, which is the right answer and not a gap.
  const fromName = readWording(fields.fromName)

  const timezone = (fields.timezone ?? '').trim()
  if (!isKnownTimezone(timezone)) refusals.push('settings.timezone_unknown')

  const leaderNoun = readWording(fields.leaderNoun)
  if (!leaderNoun) refusals.push('settings.leader_noun_missing')

  const participantNoun = readWording(fields.participantNoun)
  if (!participantNoun) refusals.push('settings.participant_noun_missing')

  const gap = wholeNumber(fields.suggestMaxAgeBandGap)
  if (gap === null || gap < 0 || gap > MOST_BANDS_APART) {
    refusals.push('settings.age_band_gap_unreadable')
  }

  const day = wholeNumber(fields.checkinDay)
  if (day === null || day < 0 || day > 6) refusals.push('settings.checkin_day_unreadable')

  const hour = wholeNumber(fields.checkinHour)
  if (hour === null || hour < QUIET_HOURS.earliest || hour > QUIET_HOURS.latest) {
    refusals.push('settings.checkin_hour_outside_quiet_hours')
  }

  if (refusals.length > 0) return { refusals }

  return {
    settings: {
      name: name!,
      fromName,
      timezone,
      leaderNoun: leaderNoun as RoleNoun,
      participantNoun: participantNoun as RoleNoun,
      suggestGenderMatch: fields.suggestGenderMatch,
      suggestMaxAgeBandGap: gap!,
      cadence: { day: day!, hour: hour! },
    },
  }
}

/**
 * The name this Ministry's messages speak in.
 *
 * One definition, because the settings preview and the sending layer must not be
 * able to disagree about it: a preview showing an Admin a name their congregation
 * will not see is worse than no preview at all.
 */
export const speakingName = (settings: {
  readonly name: string
  readonly fromName: string | null
}): string => settings.fromName ?? settings.name
