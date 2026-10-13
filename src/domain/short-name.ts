import type { Branded } from './branded'

/**
 * A Ministry's short name: the word its Intake forms live under, in a link a
 * pastor can print on a bulletin and say from the pulpit (Pastor feedback,
 * ticket 04). `/join/<short name>` opens the mentor and mentee form and
 * `/join/<short name>/groups` the groups form.
 *
 * Every rule here is enforced a second time by the database
 * (`20261014000400_a_readable_link_per_church.sql`), which also generates a
 * Ministry's first one from its name and is the only thing that can say whether
 * another Ministry holds a name: no connection acting for one Ministry may read
 * another's. What this module adds is the sentence an Admin reads in place of a
 * constraint violation.
 */

/** A short name that has been through `readShortName`, or that the database gave. */
export type ShortName = Branded<string, 'ShortName'>

/** At the platform edge, where the database is the authority on its own column. */
export const shortName = (value: string): ShortName => value as ShortName

/**
 * The longest a short name may be. A link said from the pulpit is said once and
 * typed from memory, and forty characters fits the longest church name a person
 * would say in full. The database's check and its generator cut at the same.
 */
export const SHORT_NAME_LONGEST = 40

/**
 * The names the app's own routes need: every top-level route, so a short name can
 * never be read as a page of Discipler's own, and `groups`, the word the groups
 * form's link ends in. `app.short_name_is_reserved` holds the same list, and a
 * test fails when a top-level route is added without it.
 */
export const RESERVED_SHORT_NAMES: readonly string[] = [
  'account',
  'api',
  'auth',
  'check-ins',
  'cron',
  'follow-up',
  'groups',
  'intake',
  'intake-forms',
  'invitation',
  'join',
  'login',
  'material',
  'materials',
  'overview',
  'relationships',
  'roster',
  'settings',
  'setup',
  'sms',
  'suggested-pairs',
]

/**
 * Why a short name could not be taken. `taken` is the database's to decide and
 * is translated from its key at the platform edge; the rest are decided here.
 */
export type ShortNameRefusal =
  /** Nothing was typed. */
  | 'short_name.missing'
  /** Something other than lowercase letters, digits and single dashes between them. */
  | 'short_name.unreadable'
  /** Longer than `SHORT_NAME_LONGEST`. */
  | 'short_name.too_long'
  /** One of the app's own routes needs it. */
  | 'short_name.reserved'
  /** Another Ministry holds it, or held it once and its printed links still use it. */
  | 'short_name.taken'

export type ShortNameReading =
  | { readonly shortName: ShortName }
  | { readonly refusal: ShortNameRefusal }

/** Lowercase letters and digits, in words joined by single dashes. */
const READABLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The short name an Admin typed, or why it cannot be one.
 *
 * Trimmed and lowercased, because a capital is how somebody types a name they
 * heard and the link opens the forms either way. Nothing else is rewritten: a
 * space, an accent or an underscore is refused with a sentence rather than
 * quietly turned into something the Admin did not type and will print.
 */
export const readShortName = (typed: string): ShortNameReading => {
  const candidate = typed.trim().toLowerCase()

  if (candidate === '') return { refusal: 'short_name.missing' }
  if (candidate.length > SHORT_NAME_LONGEST) return { refusal: 'short_name.too_long' }
  if (!READABLE.test(candidate)) return { refusal: 'short_name.unreadable' }
  if (RESERVED_SHORT_NAMES.includes(candidate)) return { refusal: 'short_name.reserved' }

  return { shortName: shortName(candidate) }
}

/**
 * The short name a link names, folded the way `readShortName` folds one, or null
 * when no short name could be spelled like that -- so nothing typed into an
 * address bar reaches a query unless it might be one.
 *
 * A reserved word is not refused here. It names no Ministry today, and a lookup
 * finding nothing is the same answer from the one place that knows.
 */
export const shortNameInLink = (segment: string): ShortName | null => {
  const candidate = segment.toLowerCase()
  return candidate.length <= SHORT_NAME_LONGEST && READABLE.test(candidate)
    ? shortName(candidate)
    : null
}
