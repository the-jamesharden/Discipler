import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { createSequentialIds, intendedPairingId, ministryId, personId } from '~/domain/ids'
import { fulfilmentDecision, type IntendedPairingSnapshot } from '~/domain/intended-pairing'
import { roleNoun } from '~/domain/ministry-settings'

/**
 * A pairing an import planned, settled: formed once both have completed Intake,
 * refused with the reason the rules give, or left waiting. Pure, over a snapshot
 * of the two people; the database's own refusals are the service's to catch.
 * ADR-0022.
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const sam = personId('22222222-2222-2222-2222-222222222222')
const taylor = personId('33333333-3333-3333-3333-333333333333')
const at = new Date('2026-03-02T09:00:00Z')

const plan = (over: Partial<IntendedPairingSnapshot> = {}): IntendedPairingSnapshot => ({
  id: intendedPairingId('55555555-5555-5555-5555-555555555555'),
  leader: {
    personId: sam,
    fullName: 'Sam Rivera',
    phone: '+17065550101',
    participationStatus: 'ready_to_pair',
    gender: 'male',
  },
  participant: {
    personId: taylor,
    fullName: 'Taylor Brooks',
    phone: '+17065550440',
    participationStatus: 'ready_to_pair',
    gender: 'male',
  },
  plannedAt: new Date('2026-03-01T09:00:00Z'),
  closedAt: null,
  outcome: null,
  ...over,
})

const context = (over: Partial<CommandContext> = {}): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(at),
  ids: createSequentialIds(),
  ministryName: 'Riverside Chapel',
  language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
  appBaseUrl: 'https://discipler.example',
  contacts: {
    people: new Map([
      [sam, { fullName: 'Sam Rivera', phone: '+17065550101' }],
      [taylor, { fullName: 'Taylor Brooks', phone: '+17065550440' }],
    ]),
  },
  ...over,
})

const settle = (snapshot: IntendedPairingSnapshot) =>
  handleCommand(
    { type: 'intended_pairing.fulfil', ministryId: ministry, intendedPairingId: snapshot.id },
    context({ intendedPairing: snapshot }),
  )

describe('what settling a plan comes to', () => {
  it('waits while either has not completed Intake', () => {
    expect(fulfilmentDecision(plan({ participant: { ...plan().participant, participationStatus: 'no_intake_submitted' } }))).toEqual({ kind: 'wait' })
    expect(fulfilmentDecision(plan({ leader: { ...plan().leader, participationStatus: 'no_intake_submitted' } }))).toEqual({ kind: 'wait' })
  })

  it('refuses when either has opted out, before anything else is asked', () => {
    expect(
      fulfilmentDecision(plan({ leader: { ...plan().leader, participationStatus: 'opted_out', gender: null } })),
    ).toEqual({ kind: 'refuse', refusal: 'relationship.leader_has_opted_out' })
    expect(
      fulfilmentDecision(plan({ participant: { ...plan().participant, participationStatus: 'opted_out' } })),
    ).toEqual({ kind: 'refuse', refusal: 'relationship.participant_has_opted_out' })
  })

  it('refuses two people of different genders as soon as both are known', () => {
    expect(
      fulfilmentDecision(plan({ participant: { ...plan().participant, gender: 'female' } })),
    ).toEqual({ kind: 'refuse', refusal: 'relationship.gender_must_match' })
  })

  it('forms the pairing when both have completed Intake and nothing refuses it', () => {
    expect(fulfilmentDecision(plan())).toEqual({ kind: 'form' })
    // A Disciple already being discipled elsewhere is the database's to refuse,
    // by the same cap the Pair page hits; the snapshot does not pretend to know.
    expect(
      fulfilmentDecision(plan({ participant: { ...plan().participant, participationStatus: 'paired' } })),
    ).toEqual({ kind: 'form' })
  })
})

describe('settling a plan through the boundary', () => {
  it('forms a one-to-one by the pairing rules, invites the Discipler, and closes the plan as fulfilled', () => {
    const { effects } = settle(plan())

    const created = effects.find((effect) => effect.kind === 'relationship.create')
    if (created?.kind !== 'relationship.create') throw new Error('no pairing was formed')
    expect(created.relationship.members.map((member) => [member.role, member.personId])).toEqual([
      ['leader', sam],
      ['participant', taylor],
    ])
    // One Discipler and one Disciple is a one-to-one, asked no declaration and given no name.
    expect(created.relationship.name).toBeNull()
    expect(created.relationship.declaredGender).toBeNull()

    // The same invitation pairing by hand sends, to the Discipler and nobody else.
    const messages = effects.filter((effect) => effect.kind === 'message.enqueue')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.kind === 'message.enqueue' && messages[0].message.personId).toBe(sam)

    const closed = effects.find((effect) => effect.kind === 'intendedPairing.close')
    if (closed?.kind !== 'intendedPairing.close') throw new Error('the plan was not closed')
    expect(closed.closure).toMatchObject({
      outcome: 'fulfilled',
      relationshipId: created.relationship.id,
      refusal: null,
      closedAt: at,
    })

    expect(effects.map((effect) => (effect.kind === 'history.append' ? effect.event.type : null)).filter(Boolean)).toEqual([
      'relationship.created',
      'intended_pairing.fulfilled',
    ])
  })

  it('does nothing while one of them has not completed Intake', () => {
    const { effects } = settle(
      plan({ participant: { ...plan().participant, participationStatus: 'no_intake_submitted' } }),
    )
    expect(effects).toEqual([])
  })

  it('refuses with the reason, raises a Follow-Up Item on the Disciple, and records it', () => {
    const { effects } = settle(plan({ participant: { ...plan().participant, gender: 'female' } }))

    expect(effects.some((effect) => effect.kind === 'relationship.create')).toBe(false)

    const closed = effects.find((effect) => effect.kind === 'intendedPairing.close')
    if (closed?.kind !== 'intendedPairing.close') throw new Error('the plan was not closed')
    expect(closed.closure).toMatchObject({
      outcome: 'refused',
      relationshipId: null,
      refusal: 'relationship.gender_must_match',
    })

    const raised = effects.find((effect) => effect.kind === 'followUp.raise')
    if (raised?.kind !== 'followUp.raise') throw new Error('nothing was raised')
    expect(raised.item).toMatchObject({
      kind: 'intended_pairing_refused',
      personId: taylor,
      relationshipId: null,
      refusal: 'relationship.gender_must_match',
    })

    expect(effects.map((effect) => (effect.kind === 'history.append' ? effect.event.type : null)).filter(Boolean)).toEqual([
      'intended_pairing.refused',
      'follow_up.intended_pairing_refused',
    ])
  })

  it('records the refusal the database gave, by its code', () => {
    const { effects } = handleCommand(
      {
        type: 'intended_pairing.refuse',
        ministryId: ministry,
        intendedPairingId: plan().id,
        refusal: 'relationship.participant_already_in_a_one_to_one',
      },
      context({ intendedPairing: plan() }),
    )
    const closed = effects.find((effect) => effect.kind === 'intendedPairing.close')
    expect(closed?.kind === 'intendedPairing.close' && closed.closure.refusal).toBe(
      'relationship.participant_already_in_a_one_to_one',
    )
  })

  it('does nothing to a plan already closed', () => {
    const settled = plan({ closedAt: at, outcome: 'fulfilled' })
    expect(settle(settled).effects).toEqual([])
    expect(
      handleCommand(
        { type: 'intended_pairing.refuse', ministryId: ministry, intendedPairingId: settled.id, refusal: 'relationship.gender_must_match' },
        context({ intendedPairing: settled }),
      ).effects,
    ).toEqual([])
  })
})

describe('pairing by hand', () => {
  it('fulfils the plan an import made for the same two people', () => {
    const { effects } = handleCommand(
      { type: 'relationship.create', ministryId: ministry, leaderIds: [sam], participantIds: [taylor] },
      context({ openPlans: [{ id: plan().id, leaderId: sam, participantId: taylor, plannedAt: plan().plannedAt }] }),
    )

    const closed = effects.find((effect) => effect.kind === 'intendedPairing.close')
    if (closed?.kind !== 'intendedPairing.close') throw new Error('the plan was not closed')
    expect(closed.closure.outcome).toBe('fulfilled')
    expect(effects.some((effect) => effect.kind === 'history.append' && effect.event.type === 'intended_pairing.fulfilled')).toBe(true)
  })

  it('leaves a plan for different people standing', () => {
    const { effects } = handleCommand(
      { type: 'relationship.create', ministryId: ministry, leaderIds: [taylor], participantIds: [sam] },
      context({ openPlans: [{ id: plan().id, leaderId: sam, participantId: taylor, plannedAt: plan().plannedAt }] }),
    )
    expect(effects.some((effect) => effect.kind === 'intendedPairing.close')).toBe(false)
  })
})
