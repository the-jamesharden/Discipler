import { describe, expect, it } from 'vitest'
import type { PairingRefusal } from '~/domain/errors'
import { FILE_PROBLEMS } from '~/domain/errors'
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

const FORBIDDEN = /\b(leaders?|participants?|eligib\w*|relationships?)\b/i

const REFUSALS: readonly PairingRefusal[] = [
  'relationship.needs_a_leader',
  'relationship.needs_a_participant',
  'relationship.leader_cannot_be_a_participant',
  'relationship.person_listed_twice',
  'relationship.person_already_in_this_relationship',
  'relationship.leader_already_leads_a_group',
  'relationship.participant_already_in_a_one_to_one',
  'relationship.person_belongs_to_another_ministry',
  'relationship.participant_has_not_completed_intake',
  'relationship.participant_has_opted_out',
  'relationship.leader_has_not_completed_intake',
  'relationship.leader_has_opted_out',
  'relationship.gender_must_match',
  'relationship.gender_does_not_match_the_declaration',
  'relationship.needs_a_gender_declaration',
  'relationship.needs_a_name',
  'relationship.already_has_a_leader',
]

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
    for (const refusal of REFUSALS) {
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
    const relationships = (roles: readonly ('leader' | 'participant')[]) => roles.map((role) => ({ role }))
    for (const declaredSide of [null, 'mentor', 'mentee'] as const) {
      for (const roles of [[], ['leader'], ['participant'], ['leader', 'participant']] as const) {
        const said = copy.whoTheyAre({ relationships: relationships(roles), declaredSide })
        expect(said, `${declaredSide} ${roles.join('+')}`).not.toMatch(FORBIDDEN)
      }
    }
    expect(copy.pairedReceipt(1)).not.toMatch(FORBIDDEN)
    expect(copy.pairedReceipt(3)).not.toMatch(FORBIDDEN)
    expect(copy.listCount('disciplers', 49)).toBe('49 disciplers total')
    expect(copy.listCount('disciples', 1)).toBe('1 disciple total')
    expect(copy.pairingSizeLabel(1)).toBe('1:1')
    expect(copy.pairingSizeLabel(3)).toBe('3 members')
  })
})
