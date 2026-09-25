import { describe, expect, it } from 'vitest'
import { FILE_PROBLEMS, PAIRING_REFUSALS } from '~/domain/errors'
import { ROW_PROBLEMS } from '~/domain/roster'
import * as copy from '../../app/roster/copy'
import * as importCopy from '../../app/roster/import-copy'

/**
 * The Roster, the person page and the pairing page speak the customer's language
 * (ticket 36): Discipler and Disciple, pairing and one-to-one and group. The
 * model's words -- Leader, Participant, relationship, eligibility -- are for the
 * code and never reach one of these screens. This walks everything the Roster's
 * copy module exports so the rule cannot decay one sentence at a time.
 */

/**
 * *co-leader* is let through, and only that: it is the word James chose for the Pair
 * popup's button, **Add as co-leader** (Manual pairing, recut ticket 04, mock state
 * G), and the word a Discipler's own page already uses for somebody who leads a
 * group with them. It names a person beside another and not the model's role.
 */
const FORBIDDEN = /\b((?<!co-)leaders?|participants?|eligib\w*|relationships?)\b/i

/** Every string an export holds, however it holds it. */
const stringsIn = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn)
  return []
}

describe('the Roster speaks the customer’s language', () => {
  it('says Discipler and Disciple, never the model’s words, in every constant', () => {
    for (const [name, value] of Object.entries({ ...copy, ...importCopy })) {
      if (typeof value === 'function') continue
      for (const said of stringsIn(value)) {
        expect(said, `${name}: ${said}`).not.toMatch(FORBIDDEN)
      }
    }
  })

  it('still refuses the model’s Leader, and lets only co-leader through', () => {
    expect('Add as co-leader').not.toMatch(FORBIDDEN)
    expect('Add as leader').toMatch(FORBIDDEN)
    expect('Its leaders have been told').toMatch(FORBIDDEN)
  })

  it('says it in the import dialog’s own sentences', () => {
    expect(importCopy.importButtonLabel()).toBe('Import')
    expect(importCopy.importButtonLabel(6, 3)).toBe('Import 6 people & 3 pairs')
    expect(importCopy.importButtonLabel(1, 1)).toBe('Import 1 person & 1 pair')
    expect(importCopy.importButtonLabel(4)).toBe('Import 4 people')
    expect(importCopy.REVIEW_MORE_ROWS(1)).not.toMatch(FORBIDDEN)
    expect(copy.pairsPlanned(1)).not.toMatch(FORBIDDEN)
    expect(copy.pairsPlanned(3)).not.toMatch(FORBIDDEN)
  })

  it('says it in every pairing refusal', () => {
    for (const refusal of PAIRING_REFUSALS) {
      const said = copy.pairingRefusalMessage(refusal) ?? ''
      expect(said, refusal).not.toMatch(FORBIDDEN)
    }
  })

  it('says it in every import problem and failure', () => {
    for (const problem of ROW_PROBLEMS) {
      expect(copy.rowProblemMessage(problem), problem).not.toMatch(FORBIDDEN)
    }
    for (const failure of [...FILE_PROBLEMS, 'nothing_pasted', 'too_large', 'roster_changed']) {
      expect(copy.importFailureMessage(failure) ?? '', failure).not.toMatch(FORBIDDEN)
    }
  })

  it('says it about a Person, whoever they are', () => {
    // Each tag under a name on their page (Roles per pairing, ticket 03), either
    // side, one-to-one or group, named or not.
    for (const role of ['leader', 'participant'] as const) {
      for (const isAGroup of [false, true]) {
        for (const name of [null, 'Thursday Table']) {
          const { direction, who } = copy.pairingTagSaid(
            { role, name, leaderNames: ['Grace Lee'], participantNames: ['Ana Ruiz', 'Mia Chen'] },
            isAGroup,
          )
          expect(`${direction} ${who}`, `${role} ${isAGroup} ${name}`).not.toMatch(FORBIDDEN)
        }
      }
    }
    expect(copy.pairedReceipt(1)).not.toMatch(FORBIDDEN)
    expect(copy.pairedReceipt(3)).not.toMatch(FORBIDDEN)
    // A set of separate one-to-ones (Manual pairing, ticket 21).
    expect(copy.pairedSeparatelyReceipt(3)).not.toMatch(FORBIDDEN)
    expect(copy.partlyPairedReceipt({ formed: 1, notPaired: ['Ana Ruiz'], reason: undefined })).not.toMatch(FORBIDDEN)
    expect(copy.refusalAboutOneOfASet('Ana Ruiz', '')).not.toMatch(FORBIDDEN)
    // The Roster reads for people, not for one side (Manual pairing, ticket 06),
    // and is one list (Roles per pairing, ticket 02).
    expect(copy.peopleTotal(49)).toBe('49 people total')
    expect(copy.peopleTotal(1)).toBe('1 person total')
    // What the Everyone menu names, whatever is ticked.
    const everything = {
      pairings: [
        'disciples-somebody',
        'being-discipled',
        'in-a-group',
        'unpaired',
        'offered-to-disciple',
        'awaiting-intake',
      ] as const,
      gender: 'women' as const,
      admins: true,
    }
    expect(copy.shownAs(everything)).not.toMatch(FORBIDDEN)
    expect(copy.shownAs({ ...everything, gender: 'men' })).not.toMatch(FORBIDDEN)
    expect(copy.pairingSizeLabel(1)).toBe('1:1')
    expect(copy.pairingSizeLabel(3)).toBe('3 members')
  })
})
