import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import { PairingRefused } from '~/domain/errors'
import {
  createSequentialIds,
  intendedPairingId,
  materialId,
  ministryId,
  personId,
} from '~/domain/ids'
import { readMaterialTitle } from '~/domain/materials'
import { createCommandService } from '~/service/command-service'
import type { EffectStore } from '~/service/ports'
import { createInMemoryStore, type InMemoryStore } from '../support/in-memory-store'

/**
 * Manual pairing, ticket 03. Asking whether a relationship would be refused,
 * without forming it.
 *
 * The rules that live in the database -- gender, Intake, opt-outs, the caps -- are
 * proved against the database in `tests/integration`. What is proved here is the
 * shape of the thing: the answer is the refusal `execute` throws, nothing is kept
 * whatever the answer, and nothing but `relationship.create` can be asked about.
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const david = personId('22222222-2222-2222-2222-222222222222')
const emily = personId('33333333-3333-3333-3333-333333333333')
const ada = personId('44444444-4444-4444-4444-444444444444')
const romans = materialId('55555555-5555-5555-5555-555555555555')
const leviticus = materialId('66666666-6666-6666-6666-666666666666')

type Pairing = Extract<Command, { readonly type: 'relationship.create' }>

const aPair: Pairing = {
  type: 'relationship.create',
  ministryId: ministry,
  leaderIds: [david],
  participantIds: [emily],
}

/** Left undeclared rather than set: `undefined` is nobody answered, `null` is mixed. */
const anUndeclaredGroup: Pairing = {
  type: 'relationship.create',
  ministryId: ministry,
  leaderIds: [david],
  participantIds: [emily, ada],
  name: 'The Tuesday Group',
}

const aGroup: Pairing = { ...anUndeclaredGroup, declaredGender: null }

const aStore = (): InMemoryStore => {
  const store = createInMemoryStore()
  store.contacts.set(david, { fullName: 'David Ellis', phone: '+15550100' })
  store.contacts.set(emily, { fullName: 'Emily Johnson', phone: '+15550102' })
  store.contacts.set(ada, { fullName: 'Ada Lovelace', phone: '+15550103' })

  const title = readMaterialTitle('Romans')
  if (!title) throw new Error('Romans is not a title')
  store.materials = [{ id: romans, title, body: 'Week one.', pdf: null, inUseBy: 0 }]

  return store
}

const serviceOver = (store: EffectStore) =>
  createCommandService({
    clock: createTestClock(new Date('2026-03-02T09:00:00Z')),
    ids: createSequentialIds(),
    store,
    appBaseUrl: 'https://discipler.example',
  })

const refusalFrom = async (attempt: Promise<unknown>): Promise<string | null> => {
  try {
    await attempt
    return null
  } catch (error) {
    if (error instanceof PairingRefused) return error.refusal
    throw error
  }
}

const everythingKeptBy = (store: InMemoryStore) => ({
  relationships: store.relationships.length,
  invitations: store.invitations.length,
  history: store.history.length,
  outbox: store.outbox.length,
  planClosures: store.planClosures.length,
})

const NOTHING = { relationships: 0, invitations: 0, history: 0, outbox: 0, planClosures: 0 }

describe('a pairing checked without being formed', () => {
  it('answers with nothing for a pairing that would go ahead, and keeps nothing', async () => {
    const store = aStore()

    expect(await serviceOver(store).checkPairing(aPair)).toBeNull()
    expect(everythingKeptBy(store)).toEqual(NOTHING)
  })

  it.each([
    ['an unnamed group', { ...aGroup, name: '  ' }, 'relationship.needs_a_name'],
    ['a group nobody declared', anUndeclaredGroup, 'relationship.needs_a_gender_declaration'],
    [
      'a Material the Ministry does not hold',
      { ...aPair, materialId: leviticus },
      'relationship.material_is_not_on_the_list',
    ],
    ['nobody to lead', { ...aPair, leaderIds: [] }, 'relationship.needs_a_leader'],
  ] as const)('answers with the refusal for %s, and keeps nothing', async (_, command, refusal) => {
    const store = aStore()

    expect(await serviceOver(store).checkPairing(command)).toBe(refusal)
    expect(everythingKeptBy(store)).toEqual(NOTHING)
  })

  it.each([
    ['a pair', aPair],
    ['a group', aGroup],
    ['a pair with a Material the Ministry holds', { ...aPair, materialId: romans }],
    ['an unnamed group', { ...aGroup, name: null }],
    ['a group nobody declared', anUndeclaredGroup],
    ['a Material the Ministry does not hold', { ...aGroup, materialId: leviticus }],
  ] as const)('gives the answer forming gives, for %s', async (_, command) => {
    const store = aStore()
    const service = serviceOver(store)

    const checked = await service.checkPairing(command)
    const formed = await refusalFrom(service.execute(command))

    expect(checked).toBe(formed)
  })

  it('leaves formation exactly as it was: checking first changes nothing but the ids drawn', async () => {
    const checkedFirst = aStore()
    const service = serviceOver(checkedFirst)
    await service.checkPairing(aGroup)
    await service.execute(aGroup)

    const formedOnly = aStore()
    await serviceOver(formedOnly).execute(aGroup)

    expect(everythingKeptBy(checkedFirst)).toEqual(everythingKeptBy(formedOnly))
    expect(checkedFirst.history.map((event) => event.type)).toEqual(
      formedOnly.history.map((event) => event.type),
    )
  })

  it('closes no plan an import made, though forming the same pairing would', async () => {
    const store = aStore()
    store.openPlans = [
      {
        id: intendedPairingId('77777777-7777-7777-7777-777777777777'),
        leaderId: david,
        participantId: emily,
        plannedAt: new Date('2026-03-01T09:00:00Z'),
      },
    ]
    const service = serviceOver(store)

    expect(await service.checkPairing(aPair)).toBeNull()
    expect(everythingKeptBy(store)).toEqual(NOTHING)

    await service.execute(aPair)
    expect(store.planClosures).toHaveLength(1)
  })

  it('throws what forming throws when the fault is not a refusal', async () => {
    // Nobody the store can name: a defect, not a refusal, and not something a check
    // should turn into *this pairing is fine*.
    const store = createInMemoryStore()
    const service = serviceOver(store)

    const checked = await service.checkPairing(aPair).catch((error: unknown) => error)
    const formed = await service.execute(aPair).catch((error: unknown) => error)

    expect(checked).toBeInstanceOf(Error)
    expect(checked).not.toBeInstanceOf(PairingRefused)
    expect((checked as Error).message).toBe((formed as Error).message)
  })

  it('checks a relationship.create and nothing else', async () => {
    const store = aStore()
    const service = serviceOver(store)

    // @ts-expect-error -- the type admits one command, and this is not it.
    const attempt = service.checkPairing({ type: 'scheduled.tick', ministryId: ministry })

    await expect(attempt).rejects.toThrow(/Only relationship.create can be checked/)
    expect(everythingKeptBy(store)).toEqual(NOTHING)
  })

  it('refuses to answer over a store that kept what it was told to roll back', async () => {
    // The guarantee rests on the port's contract: a throw inside `transact` lands
    // nothing. A store that broke it would turn every check into a pairing, so the
    // service says so rather than answering *this would have gone ahead*.
    const honest = aStore()
    const swallowing: EffectStore = {
      transact: async (id, work) => honest.transact(id, work).catch(() => undefined as never),
    }

    await expect(serviceOver(swallowing).checkPairing(aPair)).rejects.toThrow(
      /did not roll back/,
    )
  })
})
