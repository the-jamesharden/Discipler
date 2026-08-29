import { describe, expect, it } from 'vitest'
import type { PairingRefusal } from '~/domain/errors'
import { REFUSALS, pairingRefusalMessage } from '../../app/roster/copy'

/**
 * A refusal that reaches the Admin as a constraint name, or as nothing at all, is
 * the silent no-op ticket 05 exists to rule out. The domain and the database decide
 * in codes; deciding how to *say* them is the screen's, the same rule the sign-in
 * page follows.
 */

const EVERY_REFUSAL: readonly PairingRefusal[] = [
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
  'relationship.already_has_a_leader',
]

describe('what a refused pairing says to an Admin', () => {
  it('lists every refusal the domain declares, and no more', () => {
    // The list above is written by hand, so it can drift from the union it mirrors:
    // dropping an entry would leave the tests below passing while covering less. The
    // `Record<PairingRefusal, string>` is the one thing that cannot drift -- omitting a
    // refusal there fails the build -- so it is what the list is measured against.
    expect([...EVERY_REFUSAL].sort()).toEqual(Object.keys(REFUSALS).sort())
  })

  it('says something for every refusal the domain and the database can raise', () => {
    for (const refusal of EVERY_REFUSAL) {
      expect(pairingRefusalMessage(refusal), refusal).toBeTruthy()
    }
  })

  it('says something different for each of them', () => {
    // Two refusals sharing one sentence is the silent no-op wearing a message: the
    // Admin is told something happened but not which thing to change.
    const said = EVERY_REFUSAL.map((refusal) => pairingRefusalMessage(refusal))
    expect(new Set(said).size).toBe(EVERY_REFUSAL.length)
  })

  it('never reflects the code itself back into the page', () => {
    // The sentences may of course use the word "relationship". What must never
    // appear is the code: a screen that renders what it was handed is a screen that
    // renders whatever somebody put in the query string.
    for (const refusal of EVERY_REFUSAL) {
      expect(pairingRefusalMessage(refusal), refusal).not.toContain(refusal)
      expect(pairingRefusalMessage(refusal), refusal).not.toMatch(/[a-z]_[a-z]/)
    }
  })

  it('names gender plainly, because that refusal is the one an Admin cannot work around', () => {
    expect(pairingRefusalMessage('relationship.gender_must_match')).toMatch(/gender/i)
  })

  it('says gender binds the one-to-one, because the Admin it stops has an alternative', () => {
    // The same people in a group are not refused. A sentence that said "a
    // relationship" would be true of the case in front of them and would hide the
    // way out of it.
    const said = pairingRefusalMessage('relationship.gender_must_match') ?? ''
    expect(said).toMatch(/one-to-one/i)
    expect(said).toMatch(/group/i)
  })

  it('distinguishes the two roles, because they send the Admin to different people', () => {
    expect(pairingRefusalMessage('relationship.leader_has_not_completed_intake')).not.toBe(
      pairingRefusalMessage('relationship.participant_has_not_completed_intake'),
    )
  })

  it('falls back rather than rendering a blank alert for a code it does not know', () => {
    expect(pairingRefusalMessage('something_else_entirely')).toBeTruthy()
    expect(pairingRefusalMessage(undefined)).toBeUndefined()
  })
})
