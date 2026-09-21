import { describe, expect, it } from 'vitest'
import { materialId, relationshipId } from '~/domain/ids'
import type { MaterialOnTheList, MaterialRelationship } from '~/service/ports'
import {
  dateRange,
  dayMonthYear,
  filterIn,
  filterQuery,
  folderCount,
  previouslyLine,
  relationshipLabel,
} from '../../app/materials/copy'
import {
  chipsFor,
  foldersOf,
  homeCellsOf,
  onNoMaterial,
  pairLabel,
  underFilter,
} from '../../app/materials/folders'
import { initialsOf } from '../../app/initials'

/**
 * How the Materials tab groups relationships into folders, what the filter
 * keeps, and how the cards word their dates. Pure over the reader's own types,
 * so the rules are driven with no database anywhere near them.
 */

let counter = 0
const relationship = (over: Partial<MaterialRelationship> = {}): MaterialRelationship => ({
  relationshipId: relationshipId(`relationship-${++counter}`),
  leaderNames: [`Leader ${counter}`],
  participantNames: [`Participant ${counter}`],
  groupName: null,
  isAGroup: false,
  acceptedAt: new Date('2026-07-12T09:00:00Z'),
  runningMaterialId: null,
  since: new Date('2026-07-12T09:00:00Z'),
  previously: [],
  gender: null,
  state: 'healthy',
  ...over,
})

const masterPlan: MaterialOnTheList = {
  materialId: materialId('m-1'),
  title: 'The Master Plan of Evangelism',
  body: 'Read one chapter a week.',
  pdf: null,
}
const prayer: MaterialOnTheList = { materialId: materialId('m-2'), title: 'Prayer practices', body: null, pdf: { filename: 'prayer.pdf', bytes: 1024 } }

describe('the filter', () => {
  it('reads a gender off the query string and nothing else', () => {
    expect(filterIn(undefined)).toBeNull()
    expect(filterIn('female')).toBe('female')
    expect(filterIn('male')).toBe('male')
    expect(filterIn('everyone')).toBeNull()
    expect(filterQuery(null)).toBe('')
    expect(filterQuery('female')).toBe('?gender=female')
  })

  it('keeps everything under All, and only the folder named otherwise', () => {
    const men = relationship({ gender: 'male' })
    const women = relationship({ gender: 'female' })
    const mixed = relationship({ gender: null, isAGroup: true })
    const all = [men, women, mixed]

    expect(underFilter(all, null)).toEqual(all)
    expect(underFilter(all, 'male')).toEqual([men])
    expect(underFilter(all, 'female')).toEqual([women])
  })
})

describe('the folders', () => {
  it('has one per Material in the order given, whether or not anybody is on it', () => {
    const onPlan = relationship({ runningMaterialId: masterPlan.materialId })
    const onNothing = relationship()
    const folders = foldersOf([prayer, masterPlan], [onPlan, onNothing])

    expect(folders.map((folder) => folder.material.title)).toEqual([
      'Prayer practices',
      'The Master Plan of Evangelism',
    ])
    expect(folders[0]!.relationships).toEqual([])
    expect(folders[1]!.relationships).toEqual([onPlan])
    expect(onNoMaterial([onPlan, onNothing])).toEqual([onNothing])
  })

  it('draws up to three chips of the first Leader initials and counts the rest', () => {
    const five = [
      relationship({ leaderNames: ['David Chen'] }),
      relationship({ leaderNames: ['Maria Okafor', 'Second Leader'] }),
      relationship({ leaderNames: ['Tyler Lee'] }),
      relationship({ leaderNames: ['Grace Park'] }),
      relationship({ leaderNames: [] }),
    ]
    expect(chipsFor(five, initialsOf)).toEqual({ initials: ['DC', 'MO', 'TL'], more: 2 })
    expect(chipsFor(five.slice(0, 2), initialsOf)).toEqual({ initials: ['DC', 'MO'], more: 0 })
    expect(chipsFor([], initialsOf)).toEqual({ initials: [], more: 0 })
  })

  it('words the line under a folder by its count', () => {
    expect(folderCount(0)).toBe('Nobody working through it')
    expect(folderCount(1)).toBe('1 relationship')
    expect(folderCount(5)).toBe('5 relationships')
  })

  it('builds home-screen cells: shared Materials as folders, singles otherwise', () => {
    const a = relationship({ runningMaterialId: masterPlan.materialId, gender: 'male' })
    const b = relationship({ runningMaterialId: masterPlan.materialId, gender: 'male' })
    const alone = relationship({
      runningMaterialId: prayer.materialId,
      gender: 'female',
      leaderNames: ['Grace Lee'],
      participantNames: ['Emily Davis'],
    })
    const none = relationship({
      gender: 'male',
      leaderNames: ['Tyler Patel'],
      participantNames: ['Bryce Odom'],
    })
    const cells = homeCellsOf([masterPlan, prayer], [a, b, alone, none], null)

    expect(cells).toHaveLength(3)
    expect(cells[0]).toMatchObject({ kind: 'folder', material: masterPlan, gender: 'm' })
    expect(cells[1]).toMatchObject({ kind: 'pair', material: prayer, gender: 'f' })
    expect(cells[2]).toMatchObject({ kind: 'pair', material: null, gender: 'm' })
    expect(pairLabel(alone)).toBe('Grace Lee & Emily Davis')
    expect(pairLabel(none)).toBe('Tyler Patel & Bryce Odom')
  })

  it('keeps a cell for a Material nobody is on, as a folder with nothing in it', () => {
    const a = relationship({ runningMaterialId: masterPlan.materialId, gender: 'male' })
    const b = relationship({ runningMaterialId: masterPlan.materialId, gender: 'male' })

    const cells = homeCellsOf([masterPlan, prayer], [a, b], null)

    expect(cells).toHaveLength(2)
    expect(cells[1]).toMatchObject({ kind: 'folder', material: prayer, relationships: [], gender: 'x' })
    expect(homeCellsOf([prayer], [], null)).toMatchObject([{ kind: 'folder', material: prayer }])
  })

  it('decides folder or pair tile by everyone on the Material, not by who the filter keeps', () => {
    const his = relationship({ runningMaterialId: masterPlan.materialId, gender: 'male' })
    const hers = relationship({ runningMaterialId: masterPlan.materialId, gender: 'female' })
    const alone = relationship({ runningMaterialId: prayer.materialId, gender: 'female' })
    const none = relationship({ gender: 'female' })
    const everyone = [his, hers, alone, none]

    expect(homeCellsOf([masterPlan, prayer], everyone, null)[0]).toMatchObject({ kind: 'folder', gender: 'x' })

    const men = homeCellsOf([masterPlan, prayer], everyone, 'male')
    expect(men).toHaveLength(2)
    expect(men[0]).toMatchObject({ kind: 'folder', material: masterPlan, relationships: [his], gender: 'm' })
    expect(men[1]).toMatchObject({ kind: 'folder', material: prayer, relationships: [] })

    const women = homeCellsOf([masterPlan, prayer], everyone, 'female')
    expect(women[0]).toMatchObject({ kind: 'folder', relationships: [hers], gender: 'f' })
    expect(women[1]).toMatchObject({ kind: 'pair', relationship: alone, material: prayer })
    expect(women[2]).toMatchObject({ kind: 'pair', relationship: none, material: null })
  })

  it('leaves a relationship on a removed Material off the tab', () => {
    const onRemoved = relationship({ runningMaterialId: materialId('m-removed') })

    expect(homeCellsOf([masterPlan], [onRemoved], null)).toMatchObject([
      { kind: 'folder', material: masterPlan, relationships: [] },
    ])
  })
})

describe('the cards', () => {
  it('label a relationship by what it is now, never by its kind', () => {
    expect(relationshipLabel(false, null)).toBe('One-to-one')
    expect(relationshipLabel(true, 'Tuesday women’s group')).toBe('Group, Tuesday women’s group')
    expect(relationshipLabel(true, null)).toBe('Group')
  })

  it('print dates in the Ministry’s own zone', () => {
    // Nine in the evening in London on 3 August is still 3 August there, and
    // already the 4th in Auckland.
    const instant = new Date('2026-08-03T20:00:00Z')
    expect(dayMonthYear(instant, 'Europe/London')).toBe('3 Aug 2026')
    expect(dayMonthYear(instant, 'Pacific/Auckland')).toBe('4 Aug 2026')
    expect(dayMonthYear(new Date('2026-09-07T12:00:00Z'), 'UTC')).toBe('7 Sep 2026')
  })

  it('say a closed period’s two dates with the year once where it is the same', () => {
    expect(dateRange(new Date('2026-07-12T09:00:00Z'), new Date('2026-08-03T09:00:00Z'), 'UTC')).toBe(
      '12 Jul – 3 Aug 2026',
    )
    expect(dateRange(new Date('2025-12-12T09:00:00Z'), new Date('2026-01-03T09:00:00Z'), 'UTC')).toBe(
      '12 Dec 2025 – 3 Jan 2026',
    )
  })

  it('list earlier periods in order, naming the stretch with no Material', () => {
    expect(
      previouslyLine(
        [
          { title: null, startedAt: new Date('2026-07-12T09:00:00Z'), endedAt: new Date('2026-08-03T09:00:00Z') },
          { title: 'Prayer practices', startedAt: new Date('2026-08-03T09:00:00Z'), endedAt: new Date('2026-09-07T09:00:00Z') },
        ],
        'UTC',
      ),
    ).toBe('Previously: No material (12 Jul – 3 Aug 2026) · Prayer practices (3 Aug – 7 Sep 2026)')
  })
})
