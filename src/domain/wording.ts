/**
 * Characters nobody can see, or that nothing should be sent: every control character,
 * and those that change how text reads without being seen (the direction overrides
 * that turn a sentence round, zero-width spaces, the byte-order mark). `email.ts`
 * holds its own set for a line in an email, which takes the joiners out too. Here the joiners U+200C and U+200D stay,
 * because an emoji or a script needs them.
 */
const NOT_FOR_WORDING =
  /[\u0000-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g

/** The next-line control, which is a line break and not nothing. */
const NEXT_LINE = /\u0085/g

/**
 * What somebody typed into a box, as the wording it will actually carry.
 *
 * One definition, because it is one rule and two copies of it would drift. The
 * difference between `Career  and calling` and `Career and calling` is a typo
 * rather than a second option a Ministry meant to offer, and the same is true of
 * a Ministry name and of the word a Ministry calls its Leaders -- so trimming and
 * collapsing happens here and the callers only decide what to brand the result.
 *
 * Invisible and control characters are taken out first, and taken out rather than
 * refused: they arrive by pasting, nobody could see what they were being asked to
 * fix, many of these boxes end up in a text, and a `NUL` would otherwise reach the
 * database and come back as a crash.
 *
 * Null for nothing at all, which is what every caller refuses: an option with
 * nothing written on it is not an option, a Ministry with no name is not a
 * Ministry, and a role with no word for it cannot be put in a sentence.
 */
export const readWording = (raw: string | null | undefined): string | null => {
  const wording = (raw ?? '')
    .replace(NEXT_LINE, ' ')
    .replace(NOT_FOR_WORDING, '')
    .trim()
    .replace(/\s+/g, ' ')
  return wording === '' ? null : wording
}
