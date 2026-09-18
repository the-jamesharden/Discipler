import { describe, expect, it } from 'vitest'
import { roleNoun } from '~/domain/ministry-settings'
import { handleCommand, type CommandContext, type InvitationSnapshot } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { PairingRefused } from '~/domain/errors'
import { createSequentialIds, materialId, ministryId, personId, relationshipId } from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'
import { readMaterialTitle, type MaterialOnOffer } from '~/domain/materials'

/**
 * The Material an Admin picks while forming a relationship. It cannot be an
 * assignment, because a relationship formed a moment ago is never accepted and
 * Material periods begin at acceptance -- so it is held as an intention and
 * acceptance spends it.
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const david = personId('22222222-2222-2222-2222-222222222222')
const emily = personId('33333333-3333-3333-3333-333333333333')
const ada = personId('44444444-4444-4444-4444-444444444444')

const romans = materialId('55555555-5555-5555-5555-555555555555')

const hebrews = materialId('66666666-6666-6666-6666-666666666666')

const at = new Date('2026-03-02T09:00:00Z')

const onOffer = (id: typeof romans, title: string): MaterialOnOffer => {
  const read = readMaterialTitle(title)
  if (!read) throw new Error(`${title} is not a title`)
  return { id, title: read, body: 'Week one.', pdf: null, inUseBy: 0 }
}

const pairingContext = (materials?: readonly MaterialOnOffer[]): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(at),
  ids: createSequentialIds(),
  ministryName: 'Riverside Chapel',
  language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
  appBaseUrl: 'https://discipler.example',
  contacts: {
    people: new Map([
      [david, { fullName: 'David Ellis', phone: '+15550100' }],
      [emily, { fullName: 'Emily Johnson', phone: '+15550102' }],
      [ada, { fullName: 'Ada Lovelace', phone: '+15550103' }],
    ]),
  },
  ...(materials ? { materials } : {}),
})

const formAGroup = (
  material: typeof romans | undefined,
  materials?: readonly MaterialOnOffer[],
) =>
  handleCommand(
    {
      type: 'relationship.create',
      ministryId: ministry,
      leaderIds: [david],
      participantIds: [emily, ada],
      declaredGender: null,
      name: 'The Tuesday Group',
      ...(material ? { materialId: material } : {}),
    },
    pairingContext(materials),
  )

const relationshipIn = (result: ReturnType<typeof formAGroup>) => {
  const effect = result.effects.find((e) => e.kind === 'relationship.create')
  if (effect?.kind !== 'relationship.create') throw new Error('no relationship was formed')
  return effect.relationship
}

describe('a Material chosen while forming a relationship', () => {
  it('is held on the relationship as an intention, and assigns nothing', () => {
    const result = formAGroup(romans, [onOffer(romans, 'Romans')])

    expect(relationshipIn(result).intendedMaterialId).toBe(romans)
    // Nothing is assigned: a period on a relationship nobody has accepted is one
    // the Material history refuses.
    expect(result.effects.some((effect) => effect.kind === 'material.assign')).toBe(false)
  })

  it('is refused where the Ministry holds no such live Material', () => {
    // One refusal for both ways of not being on the list: a Material another
    // Ministry holds and one an Admin has since removed are equally not there,
    // since the list a pairing decides against is the live one.
    const refusal = (() => {
      try {
        formAGroup(hebrews, [onOffer(romans, 'Romans')])
      } catch (error) {
        return error
      }
    })()

    expect(refusal).toBeInstanceOf(PairingRefused)
    expect((refusal as PairingRefused).refusal).toBe('relationship.material_is_not_on_the_list')
  })

  it('is kept on a one-to-one, unlike a name typed for one', () => {
    const result = handleCommand(
      {
        type: 'relationship.create',
        ministryId: ministry,
        leaderIds: [david],
        participantIds: [emily],
        materialId: romans,
      },
      pairingContext([onOffer(romans, 'Romans')]),
    )

    expect(relationshipIn(result)).toMatchObject({ kind: 'one_to_one', intendedMaterialId: romans })
  })

  it('is written into the pairing event, which stays after the intention is spent', () => {
    const events = (result: ReturnType<typeof formAGroup>) =>
      result.effects.flatMap((effect) =>
        effect.kind === 'history.append' && effect.event.type === 'relationship.created'
          ? [effect.event.payload]
          : [],
      )

    expect(events(formAGroup(romans, [onOffer(romans, 'Romans')]))).toEqual([
      expect.objectContaining({ materialId: romans }),
    ])
    expect(events(formAGroup(undefined))).toEqual([expect.objectContaining({ materialId: null })])
  })

  it('reads no list of Materials, and intends nothing, where none was chosen', () => {
    // The context here carries no list at all, which is a loud failure for any
    // command that consults one.
    expect(relationshipIn(formAGroup(undefined)).intendedMaterialId).toBeNull()
  })
})

const tuesdayGroup = relationshipId('77777777-7777-7777-7777-777777777777')
const token = invitationToken('a-token')

const invited = (intendedMaterialId: typeof romans | null): InvitationSnapshot => ({
  relationshipId: tuesdayGroup,
  personId: david,
  expiresAt: new Date('2026-03-16T09:00:00Z'),
  consumedAt: null,
  intendedMaterialId,
  members: [
    { personId: david, role: 'leader', fullName: 'David Ellis', phone: '+15550100', acceptedAt: null },
    { personId: emily, role: 'participant', fullName: 'Emily Johnson', phone: '+15550102', acceptedAt: null },
    { personId: ada, role: 'participant', fullName: 'Ada Lovelace', phone: '+15550103', acceptedAt: null },
  ],
})

const accept = (invitation: InvitationSnapshot, materials?: readonly MaterialOnOffer[]) =>
  handleCommand(
    { type: 'relationship.accept', ministryId: ministry, token, fullName: 'David Ellis', userId: 'user-1' },
    { ...pairingContext(materials), invitation },
  )

const assignments = (result: ReturnType<typeof accept>) =>
  result.effects.flatMap((effect) => (effect.kind === 'material.assign' ? [effect.assignment] : []))

const activations = (result: ReturnType<typeof accept>) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'history.append' && effect.event.type === 'relationship.activated'
      ? [effect.event.payload]
      : [],
  )

describe('accepting a relationship that carries an intended Material', () => {
  it('opens the history with no Material, then assigns the intended one at the same instant', () => {
    // Two periods at one instant. The opening one closes at its own start and
    // covers nothing, which is the zero-length period the Material history
    // permits, and it stays first because nothing precedes the period a history
    // opens with. No Admin performed this act: the Admin who chose the Material
    // is on the pairing event.
    expect(assignments(accept(invited(romans), [onOffer(romans, 'Romans')]))).toEqual([
      { ministryId: ministry, relationshipId: tuesdayGroup, materialId: null, assignedAt: at, assignedBy: null },
      { ministryId: ministry, relationshipId: tuesdayGroup, materialId: romans, assignedAt: at, assignedBy: null },
    ])
  })

  it('skips a Material removed since pairing, and refuses nothing', () => {
    // Acceptance is a Leader's act. An Admin's choice going stale between pairing
    // and acceptance is not something a Leader can act on, so the relationship
    // activates with the opening period alone.
    const result = accept(invited(romans), [onOffer(hebrews, 'Hebrews')])

    expect(assignments(result).map((assignment) => assignment.materialId)).toEqual([null])
    expect(activations(result)).toHaveLength(1)
  })

  it('records on the activation that the intended Material was assigned', () => {
    // The intention is cleared once spent, and no Admin's assignment event is
    // appended for an act no Admin performed, so this is where history says
    // which Material the relationship started on.
    expect(activations(accept(invited(romans), [onOffer(romans, 'Romans')]))).toEqual([
      { participantCount: 2, intendedMaterial: { materialId: romans, outcome: 'assigned' } },
    ])
  })

  it('records on the activation that a removed Material was skipped', () => {
    // A skip writes no period, so without this the pairing event would say a
    // Material was chosen and nothing would say it was dropped.
    expect(activations(accept(invited(romans), [onOffer(hebrews, 'Hebrews')]))).toEqual([
      { participantCount: 2, intendedMaterial: { materialId: romans, outcome: 'skipped_as_removed' } },
    ])
  })

  it('records nothing about a Material on the activation where none was intended', () => {
    expect(activations(accept(invited(null)))).toEqual([{ participantCount: 2 }])
  })

  it('opens the history with the one period, exactly as before, where nothing was intended', () => {
    // No list of Materials is loaded here, and none is asked for.
    expect(assignments(accept(invited(null))).map((assignment) => assignment.materialId)).toEqual([
      null,
    ])
  })

  it('assigns nothing while a co-leader is still to agree', () => {
    const sam = personId('88888888-8888-8888-8888-888888888888')
    const waiting: InvitationSnapshot = {
      ...invited(romans),
      members: [
        ...invited(romans).members,
        { personId: sam, role: 'leader', fullName: 'Sam Carter', phone: '+15550104', acceptedAt: null },
      ],
    }

    expect(assignments(accept(waiting, [onOffer(romans, 'Romans')]))).toEqual([])
  })
})

