/**
 * The Material chosen for each Disciple of a set of separate one-to-ones (Manual
 * pairing, recut ticket 02): one field per Disciple, `materialId.<personId>`, beside
 * the one `materialId` a single relationship takes. The popup posts it under that
 * name, the pairing route sends it back under it on a refusal, and the Roster reads
 * it out of the address to restore every choice, so the name is said here once.
 *
 * Ids in and ids out, unread. Whether a Material is on the Ministry's list is the
 * boundary's to say, and whether somebody is one of the Disciples is the split's.
 */

const PREFIX = 'materialId.'

export const materialFieldFor = (personId: string): string => `${PREFIX}${personId}`

/**
 * Every Disciple's choice, by who it was chosen for, out of a form's entries or an
 * address's. An empty value is the select's own *No material* and is no choice at
 * all. Where a field is said twice, the first is the one read.
 */
export const readMaterialPerDisciple = (
  entries: Iterable<readonly [string, unknown]>,
): ReadonlyMap<string, string> => {
  const chosen = new Map<string, string>()
  for (const [field, value] of entries) {
    if (!field.startsWith(PREFIX)) continue
    const personId = field.slice(PREFIX.length)
    const [first] = [value].flat()
    if (personId === '' || typeof first !== 'string' || first === '' || chosen.has(personId)) continue
    chosen.set(personId, first)
  }
  return chosen
}
