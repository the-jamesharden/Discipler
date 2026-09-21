import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import { PairingRefused, type PairingRefusal } from '~/domain/errors'
import { createSequentialIds, materialId, ministryId, personId, type PersonId } from '~/domain/ids'
import { oneToOnesFor, readPairingMode } from '~/domain/separate-pairings'
import { createCommandService } from '~/service/command-service'
import { formSeparately } from '~/service/separate-pairings'
import { createInMemoryStore } from '../support/in-memory-store'

/**
 * Manual pairing, ticket 21. One Discipler and several Disciples, formed as several
 * one-to-ones rather than one group, all of them or none.
 *
 * What refuses a pairing is mostly the database, and that is proved against the
 * database in `tests/integration`. What is proved here is the shape of the set: what
 * it is split into, that every pairing is checked before any is formed, and that
 * what is reported is what landed.
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const claire = personId('22222222-2222-2222-2222-222222222222')
const sam = personId('33333333-3333-3333-3333-333333333333')
const ana = personId('44444444-4444-4444-4444-444444444444')
const ruth = personId('55555555-5555-5555-5555-555555555555')
const david = personId('66666666-6666-6666-6666-666666666666')
const mark = materialId('77777777-7777-7777-7777-777777777777')
const romans = materialId('88888888-8888-8888-8888-888888888888')

type Pairing = Extract<Command, { readonly type: 'relationship.create' }>

describe('the mode a pairing is submitted in', () => {
  it('reads separate, and reads anything else as together', () => {
    expect(readPairingMode('separate')).toBe('separate')
    expect(readPairingMode('together')).toBe('together')
    expect(readPairingMode(null)).toBe('together')
    expect(readPairingMode('')).toBe('together')
    expect(readPairingMode('Separate')).toBe('together')
    expect(readPairingMode('apart')).toBe('together')
  })
})

describe('a separate submission, split into one-to-ones', () => {
  it('is one one-to-one per Disciple, each under the one Discipler, in the order submitted', () => {
    const split = oneToOnesFor({
      ministryId: ministry,
      leaderIds: [claire],
      participantIds: [sam, ana, ruth],
    })

    expect(split).toEqual({
      pairings: [
        { type: 'relationship.create', ministryId: ministry, leaderIds: [claire], participantIds: [sam] },
        { type: 'relationship.create', ministryId: ministry, leaderIds: [claire], participantIds: [ana] },
        { type: 'relationship.create', ministryId: ministry, leaderIds: [claire], participantIds: [ruth] },
      ],
    })
  })

  it('carries nothing of a group: no name, no declaration, no door', () => {
    const split = oneToOnesFor({
      ministryId: ministry,
      leaderIds: [claire],
      participantIds: [sam, ana],
    })
    if ('refusal' in split) throw new Error(`refused: ${split.refusal}`)

    for (const pairing of split.pairings) {
      expect(pairing).not.toHaveProperty('name')
      expect(pairing).not.toHaveProperty('declaredGender')
      expect(pairing).not.toHaveProperty('joinRequiresApproval')
    }
  })

  it.each([
    ['one Disciple, which is a one-to-one and needs no mode', [claire], [sam]],
    ['no Disciple', [claire], []],
    ['two Disciplers, which would need deciding who goes with whom', [claire, david], [sam, ana]],
    ['no Discipler', [], [sam, ana]],
  ])('is refused for %s', (_, leaderIds, participantIds) => {
    expect(oneToOnesFor({ ministryId: ministry, leaderIds, participantIds })).toEqual({
      refusal: 'relationship.separate_needs_one_leader_and_several_participants',
    })
  })

  // The one way a pairing in a set can refuse another (ticket 03's Comments): both
  // checks would pass, and the second formation would not.
  it('is refused where a Disciple is named twice', () => {
    expect(
      oneToOnesFor({ ministryId: ministry, leaderIds: [claire], participantIds: [sam, ana, sam] }),
    ).toEqual({ refusal: 'relationship.person_listed_twice' })
  })
})

/**
 * Manual pairing, recut ticket 02. Each Disciple carries their own Material choice,
 * held as an intention on their own one-to-one.
 */
describe('a Material per Disciple in a separate submission', () => {
  const materialOf = (split: ReturnType<typeof oneToOnesFor>) => {
    if ('refusal' in split) throw new Error(`refused: ${split.refusal}`)
    return split.pairings.map((pairing) => [pairing.participantIds[0], pairing.materialId])
  }

  it('gives each one-to-one the Material named for its own Disciple', () => {
    const split = oneToOnesFor({
      ministryId: ministry,
      leaderIds: [claire],
      participantIds: [sam, ana],
      materialIds: new Map([[sam, mark], [ana, romans]]),
    })

    expect(materialOf(split)).toEqual([[sam, mark], [ana, romans]])
  })

  it('gives none to a Disciple with none named, and one choice never spills onto another', () => {
    const split = oneToOnesFor({
      ministryId: ministry,
      leaderIds: [claire],
      participantIds: [sam, ana, ruth],
      materialIds: new Map([[ana, romans]]),
    })
    if ('refusal' in split) throw new Error(`refused: ${split.refusal}`)

    expect(materialOf(split)).toEqual([[sam, undefined], [ana, romans], [ruth, undefined]])
    // Absent, and not a key holding nothing: absent is what the command reads as none.
    expect(split.pairings[0]).not.toHaveProperty('materialId')
    expect(split.pairings[2]).not.toHaveProperty('materialId')
  })

  it('ignores a Material named for somebody who is not among the Disciples, rather than refusing', () => {
    const split = oneToOnesFor({
      ministryId: ministry,
      leaderIds: [claire],
      participantIds: [sam, ana],
      materialIds: new Map([[david, mark], [claire, romans]]),
    })

    expect(materialOf(split)).toEqual([[sam, undefined], [ana, undefined]])
  })
})

/**
 * A command service that answers as it is told to, and says what it was asked. The
 * rules that refuse are the database's, so a set that is refused halfway cannot be
 * arranged over the in-memory store.
 */
const aScriptedService = (script: {
  readonly checks?: Partial<Record<PersonId, PairingRefusal>>
  readonly formations?: Partial<Record<PersonId, PairingRefusal | Error>>
}) => {
  const asked: string[] = []
  const disciple = (command: Pairing): PersonId => {
    const [only] = command.participantIds
    if (!only || command.participantIds.length !== 1) throw new Error('not a one-to-one')
    return only
  }

  return {
    asked,
    service: {
      checkPairing: async (command: Pairing) => {
        asked.push(`check ${disciple(command)}`)
        return script.checks?.[disciple(command)] ?? null
      },
      execute: async (command: Command) => {
        if (command.type !== 'relationship.create') throw new Error('only pairings are formed here')
        asked.push(`form ${disciple(command)}`)
        const failure = script.formations?.[disciple(command)]
        if (failure instanceof Error) throw failure
        if (failure) throw new PairingRefused(failure)
        return { effects: [], rejections: [] }
      },
    },
  }
}

const theSet = { ministryId: ministry, leaderIds: [claire], participantIds: [sam, ana, ruth] }

describe('forming a set of one-to-ones', () => {
  it('checks every pairing before it forms any', async () => {
    const { service, asked } = aScriptedService({})

    const outcome = await formSeparately(service, theSet)

    expect(outcome).toEqual({ status: 'formed', formed: 3 })
    expect(asked).toEqual([
      `check ${sam}`,
      `check ${ana}`,
      `check ${ruth}`,
      `form ${sam}`,
      `form ${ana}`,
      `form ${ruth}`,
    ])
  })

  it('forms none where any one would be refused, and names the Disciple it is about', async () => {
    const { service, asked } = aScriptedService({
      checks: { [ana]: 'relationship.gender_must_match' },
    })

    const outcome = await formSeparately(service, theSet)

    expect(outcome).toEqual({
      status: 'refused',
      refusal: 'relationship.gender_must_match',
      about: ana,
    })
    expect(asked.filter((each) => each.startsWith('form'))).toEqual([])
  })

  it('refuses the shape before it checks anybody, and that refusal is about nobody', async () => {
    const { service, asked } = aScriptedService({})

    const outcome = await formSeparately(service, { ...theSet, participantIds: [sam] })

    expect(outcome).toEqual({
      status: 'refused',
      refusal: 'relationship.separate_needs_one_leader_and_several_participants',
      about: null,
    })
    expect(asked).toEqual([])
  })

  it('is plainly refused where the first formation is, since nothing landed', async () => {
    const { service } = aScriptedService({
      formations: { [sam]: 'relationship.participant_has_opted_out' },
    })

    expect(await formSeparately(service, theSet)).toEqual({
      status: 'refused',
      refusal: 'relationship.participant_has_opted_out',
      about: sam,
    })
  })

  it('says how many were formed and who was not, where a write is refused partway', async () => {
    const { service, asked } = aScriptedService({
      formations: { [ana]: 'relationship.participant_already_in_a_one_to_one' },
    })

    const outcome = await formSeparately(service, theSet)

    expect(outcome).toEqual({
      status: 'partly_formed',
      formed: [sam],
      notFormed: [ana, ruth],
      refusal: 'relationship.participant_already_in_a_one_to_one',
      about: ana,
    })
    // It stops where the world moved, rather than carrying on against a Roster the
    // Admin has not seen.
    expect(asked).not.toContain(`form ${ruth}`)
  })

  it('still says what landed where a write fails partway with something that is not a refusal', async () => {
    const lost = new Error('the connection was lost')
    const { service } = aScriptedService({ formations: { [ruth]: lost } })

    expect(await formSeparately(service, theSet)).toEqual({
      status: 'partly_formed',
      formed: [sam, ana],
      notFormed: [ruth],
      refusal: null,
      // Handed over rather than swallowed, so whoever reports the count can log it.
      fault: lost,
      about: ruth,
    })
  })

  it('throws what is not a refusal where nothing has landed, as forming one pairing does', async () => {
    const { service } = aScriptedService({
      formations: { [sam]: new Error('the connection was lost') },
    })

    await expect(formSeparately(service, theSet)).rejects.toThrow('the connection was lost')
  })

  it('checks and forms each one-to-one with its own Disciple’s Material, and names who a refused one was chosen for', async () => {
    const commands: Pairing[] = []
    const { service } = aScriptedService({ checks: { [ana]: 'relationship.material_is_not_on_the_list' } })
    const recording = {
      ...service,
      checkPairing: async (command: Pairing) => {
        commands.push(command)
        return service.checkPairing(command)
      },
    }

    const outcome = await formSeparately(recording, {
      ...theSet,
      materialIds: new Map([[sam, mark], [ana, romans]]),
    })

    expect(outcome).toEqual({
      status: 'refused',
      refusal: 'relationship.material_is_not_on_the_list',
      about: ana,
    })
    expect(commands.map(({ materialId: chosen }) => chosen)).toEqual([mark, romans])
  })

  it('forms real one-to-ones through the command service: one relationship and one invitation each', async () => {
    const store = createInMemoryStore()
    store.contacts.set(claire, { fullName: 'Claire Martinez', phone: '+15550100' })
    store.contacts.set(sam, { fullName: 'Sam Lee', phone: '+15550101' })
    store.contacts.set(ana, { fullName: 'Ana Ruiz', phone: '+15550102' })
    store.contacts.set(ruth, { fullName: 'Ruth Okafor', phone: '+15550103' })
    const service = createCommandService({
      clock: createTestClock(new Date('2026-03-02T09:00:00Z')),
      ids: createSequentialIds(),
      store,
      appBaseUrl: 'https://discipler.example',
    })

    const outcome = await formSeparately(service, theSet)

    expect(outcome).toEqual({ status: 'formed', formed: 3 })
    expect(store.relationships).toHaveLength(3)
    expect(store.invitations).toHaveLength(3)
  })
})
