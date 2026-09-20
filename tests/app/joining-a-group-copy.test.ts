import { describe, expect, it } from 'vitest'
import { PAIRING_REFUSALS, type GroupJoinRefusal } from '~/domain/errors'
import {
  GROUP_JOIN_REFUSALS,
  PAIRING_REFUSALS_ON_JOINING,
  REFUSALS,
  groupJoinRefusalMessage,
  joinedGroupReceipt,
} from '../../app/roster/copy'

/**
 * Manual pairing, ticket 22: what the Roster says when an Admin puts somebody into
 * a group, and when it could not. Every refusal is a code, and every code has a
 * sentence an Admin can act on.
 */

const FORBIDDEN = /\b(leaders?|participants?|eligib\w*|relationships?)\b/i

const OWN: readonly GroupJoinRefusal[] = [
  'joining.group_not_found',
  'joining.group_has_ended',
  'joining.not_a_group',
  'joining.person_not_found',
  'joining.already_in_the_group',
]

describe('why somebody could not be put into a group', () => {
  it('words each refusal of its own, differently', () => {
    const said = OWN.map((code) => groupJoinRefusalMessage(code))

    expect(said.every((sentence) => sentence !== undefined && sentence.length > 0)).toBe(true)
    expect(new Set(said).size).toBe(OWN.length)
    expect(Object.keys(GROUP_JOIN_REFUSALS).sort()).toEqual([...OWN].sort())
  })

  it('says the rules formation is held to about this act, not about a form', () => {
    expect(groupJoinRefusalMessage('relationship.participant_has_not_completed_intake')).toBe(
      'They have not completed Intake yet. Send them the Intake link first, then add them.',
    )
    expect(groupJoinRefusalMessage('relationship.participant_has_opted_out')).toBe(
      'They have opted out, and cannot be added to a group.',
    )
    // The pairing's own sentence offers *say it is mixed*, which is no fix here:
    // the group said what it is when it was formed.
    const gender = groupJoinRefusalMessage('relationship.gender_does_not_match_the_declaration')
    expect(gender).toContain('a men’s or a women’s group')
    expect(gender).not.toContain('say it is mixed')
  })

  it('falls back to the pairing’s wording for a rule it has no sentence of its own for', () => {
    for (const refusal of PAIRING_REFUSALS) {
      expect(groupJoinRefusalMessage(refusal), refusal).toBe(
        PAIRING_REFUSALS_ON_JOINING[refusal] ?? REFUSALS[refusal],
      )
    }
  })

  it('looks a code up and never renders it', () => {
    expect(groupJoinRefusalMessage(undefined)).toBeUndefined()
    expect(groupJoinRefusalMessage('')).toBeUndefined()
    expect(groupJoinRefusalMessage('<script>alert(1)</script>')).toBe(
      'They could not be added to that group.',
    )
  })

  it('speaks the customer’s language', () => {
    for (const code of [...OWN, ...PAIRING_REFUSALS]) {
      expect(groupJoinRefusalMessage(code) ?? '', code).not.toMatch(FORBIDDEN)
    }
  })
})

describe('the receipt', () => {
  it('names who joined, and says their Discipler was told only when one was', () => {
    expect(joinedGroupReceipt('Sam Lee', true)).toBe(
      'Sam Lee is in the group now. Its Discipler has been told, and nobody else has been contacted.',
    )
    expect(joinedGroupReceipt('Sam Lee', false)).toBe(
      'Sam Lee is in the group now. Nobody has been contacted about it.',
    )
  })

  it('speaks the customer’s language', () => {
    expect(joinedGroupReceipt('Sam Lee', true)).not.toMatch(FORBIDDEN)
    expect(joinedGroupReceipt('Sam Lee', false)).not.toMatch(FORBIDDEN)
  })
})
