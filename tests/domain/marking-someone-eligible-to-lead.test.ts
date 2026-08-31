import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { createSequentialIds, ministryId, personId } from '~/domain/ids'

/**
 * Eligibility to lead is an Admin's plan, recorded early. It is one field and not
 * two -- the intended role *is* the leader-pool flag -- because a Person marked
 * intended-leader but not eligible would be a state nobody could say the meaning
 * of.
 *
 * It is a plan and not a fact about the Person: it does not make them pairable, it
 * does not stand in for Intake, and it says nothing about what they already lead.
 * Every one of those is enforced elsewhere, which is precisely why nothing here
 * consults them.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const marcus = personId('00000000-0000-4000-8000-0000000000d0')
const at = new Date('2026-09-14T10:00:00Z')

const mark = (eligible: boolean) =>
  handleCommand(
    { type: 'person.set_lead_eligibility', ministryId: ministry, personId: marcus, eligible },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
    } satisfies CommandContext,
  )

const eligibility = (effects: readonly Effect[]) =>
  effects.flatMap((effect) =>
    effect.kind === 'person.lead_eligibility' ? [effect.eligibility] : [],
  )

const history = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

describe('marking someone eligible to lead', () => {
  it('records the Admin’s plan against the Person', () => {
    expect(eligibility(mark(true).effects)).toEqual([
      { ministryId: ministry, personId: marcus, eligible: true, decidedAt: at },
    ])
  })

  it('records withdrawing it as the same fact with the other answer', () => {
    expect(eligibility(mark(false).effects)).toEqual([
      { ministryId: ministry, personId: marcus, eligible: false, decidedAt: at },
    ])
  })

  it('appends the decision to history, so a plan that changed is recoverable', () => {
    expect(history(mark(true).effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'person.lead_eligibility_set',
        subjectType: 'person',
        subjectId: marcus,
        payload: { eligible: true },
      },
    ])
  })

  it('needs nothing loaded about the Person, because it consults nothing', () => {
    // No Roster, no Intake, no count of what they already lead. Eligibility is
    // independent of every one of them, and a snapshot here would be a rule
    // waiting to be written against it.
    expect(() => mark(true)).not.toThrow()
  })
})
