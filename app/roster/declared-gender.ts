import { GENDERS, type Gender } from '~/domain/intake'

/**
 * How the Pair form and the route it posts to agree to spell a gender declaration.
 *
 * The domain has three states and the wire has three words, and they do not line up
 * one for one: `null` is *mixed* and `undefined` is *nobody answered*, which HTML has
 * no way to say twice -- an unticked radio simply sends nothing. So the mapping lives
 * here rather than being spelled out at each end, for the reason the import's wire
 * format is: two files that must agree about a format will eventually stop agreeing
 * if each holds its own copy.
 */

/** The word a declared mixed relationship travels as. Never a gender, so never `null`. */
export const MIXED = 'mixed'

/**
 * What arrived in the form field, as a declaration. `undefined` where the radio was
 * left alone -- and where the field held anything else at all, because a value typed
 * into a form post is not a declaration and folding it to `mixed` would answer a
 * safeguarding question on the Admin's behalf.
 */
export const declaredGenderFromField = (field: unknown): Gender | null | undefined => {
  if (field === MIXED) return null
  return GENDERS.includes(field as Gender) ? (field as Gender) : undefined
}

/**
 * The same answer as the form field it came in as, on its way back to the form it was
 * refused on. Named for what it returns -- a field value -- because the round trip is
 * only safe while both directions agree, and a name that said "declaration" would
 * describe the argument rather than the result.
 */
export const declaredGenderToField = (declared: Gender | null): string => declared ?? MIXED

/**
 * The label each gender wears on the form. Keyed by `Gender` rather than listed
 * beside a second copy of the gender set, so a gender added to the domain fails the
 * build here instead of silently going missing from the one screen that declares one.
 */
const GENDER_LABELS: Record<Gender, string> = {
  male: 'A men’s group — everybody in it is a man',
  female: 'A women’s group — everybody in it is a woman',
}

/**
 * The answers the form offers, in the order `GENDERS` declares them and mixed last,
 * with nothing preselected: the product asks a group's gender rather than deriving it
 * (see `needsAGenderDeclaration` in src/domain/relationships.ts for why), and a
 * checked radio would be a derivation wearing a question.
 */
export const DECLARED_GENDER_OPTIONS: readonly { value: string; label: string }[] = [
  ...GENDERS.map((gender) => ({ value: gender, label: GENDER_LABELS[gender] })),
  { value: MIXED, label: 'Mixed — men and women together' },
]
