/**
 * What somebody typed into a box, as the wording it will actually carry.
 *
 * One definition, because it is one rule and two copies of it would drift. The
 * difference between `Career  and calling` and `Career and calling` is a typo
 * rather than a second option a Ministry meant to offer, and the same is true of
 * a Ministry name and of the word a Ministry calls its Leaders -- so trimming and
 * collapsing happens here and the callers only decide what to brand the result.
 *
 * Null for nothing at all, which is what every caller refuses: an option with
 * nothing written on it is not an option, a Ministry with no name is not a
 * Ministry, and a role with no word for it cannot be put in a sentence.
 */
export const readWording = (raw: string | null | undefined): string | null => {
  const wording = (raw ?? '').trim().replace(/\s+/g, ' ')
  return wording === '' ? null : wording
}
