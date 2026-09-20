import { describe, expect, it } from 'vitest'
import { PAIRING_REFUSALS, type GroupJoinRefusal } from '~/domain/errors'
import {
  GROUP_JOIN_REFUSALS,
  PAIRING_REFUSALS_ON_JOINING,
  REFUSALS,
  groupJoinRefusalMessage,
  invitedToGroupReceipt,
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
  'joining.already_leads_a_group',
  'joining.role_not_recognised',
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

describe('a Discipler added to a group as another leader', () => {
  it('names the Discipler who already leads a group, where the Roster still holds them', () => {
    expect(groupJoinRefusalMessage('joining.already_leads_a_group', 'Claire Martinez')).toBe(
      'Claire Martinez already leads a group. A Discipler leads one group at a time, and any '
      + 'number of one-to-ones.',
    )
    expect(groupJoinRefusalMessage('joining.already_leads_a_group')).toMatch(
      /^This Discipler already leads a group\./,
    )
    // The index's own code says the same thing, should it ever arrive in its place.
    expect(groupJoinRefusalMessage('relationship.leader_already_leads_a_group', 'Claire Martinez')).toBe(
      groupJoinRefusalMessage('joining.already_leads_a_group', 'Claire Martinez'),
    )
  })

  it('names nobody in any other sentence, whoever was being added', () => {
    expect(groupJoinRefusalMessage('joining.group_has_ended', 'Claire Martinez')).toBe(
      groupJoinRefusalMessage('joining.group_has_ended'),
    )
  })

  it('says the readiness rules about them, not about a selection on a form', () => {
    expect(groupJoinRefusalMessage('relationship.leader_has_not_completed_intake')).toBe(
      'They have not completed Intake yet. Send them the Intake link first, then add them.',
    )
    expect(groupJoinRefusalMessage('relationship.leader_has_opted_out')).toBe(
      'They have opted out, and cannot be added to a group.',
    )
  })

  it('says they were invited and that the group carries on, and not that they lead it', () => {
    const said = invitedToGroupReceipt('Claire Martinez')

    expect(said).toBe(
      'Claire Martinez has been invited to help lead the group, and nobody else has been '
      + 'contacted. The group carries on meanwhile.',
    )
    expect(said).not.toMatch(/\bleads\b/)
    expect(said).not.toMatch(FORBIDDEN)
  })
})
