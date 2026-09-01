import { GENDERS, type Gender } from '~/domain/intake'

/**
 * How the Pair form and the route it posts to agree to spell a gender declaration.
 *
 * The domain has three states and the wire has three words, and they do not line up
 * one for one: `null` is *mixed* and `undefined` is *nobody answered*, which HTML has
 * no way to say twice -- an unticked radio simply sends nothing. So the mapping lives
 * here rather than being spelled out at each end. Written once for the reason the
 * import's wire format is: two files that must agree about a format will eventually
 * stop agreeing if each holds its own copy.
 */

/** The word a declared mixed relationship travels as. Never a gender, so never `null`. */
export const MIXED = 'mixed'

/**
 * What arrived in the form field, as a declaration. `undefined` where the radio was
 * left alone -- and where the field held anything else at all, because a value typed
 * into a form post is not a declaration and folding it to `mixed` would answer a
 * safeguarding question on the Admin's behalf.
 */
export const declarationFrom = (field: unknown): Gender | null | undefined => {
  if (field === MIXED) return null
  return GENDERS.includes(field as Gender) ? (field as Gender) : undefined
}

/** The same answer on its way back to the form it was refused on. */
export const declarationTo = (declared: Gender | null): string => declared ?? MIXED

/**
 * The three answers the form offers, in the order it offers them, and nothing
 * preselected. A group's gender is not implied by anybody in it -- *this is a women's
 * group that currently has one member* is true and nothing in the membership says it
 * -- so the product asks rather than deriving, and a checked radio would be a
 * derivation wearing a question.
 */
export const DECLARATIONS: readonly { value: string; label: string }[] = [
  { value: 'male', label: 'A men’s group — everybody in it is a man' },
  { value: 'female', label: 'A women’s group — everybody in it is a woman' },
  { value: MIXED, label: 'Mixed — men and women together' },
]
