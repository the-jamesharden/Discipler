import { describe, expect, it } from 'vitest'
import { materialId, relationshipId } from '~/domain/ids'
import type { MaterialOnTheList, MaterialRelationship } from '~/service/ports'
import { assignToCount, assignToTheTicked } from '../../app/materials/assign-button'
import {
  afterAssigning,
  materialIn,
  pickGroupsFor,
  tickedIn,
} from '../../app/materials/assign-to-more'
import {
  assignToMoreHeading,
  assignToMoreRefusalMessage,
  nobodyToAssign,
  onMaterialHeading,
  onNoMaterialHeading,
  pickMeta,
  pickName,
} from '../../app/materials/copy'

/**
 * A Material's assign page (Richer materials, ticket 02; M-3 of
 * `.lavish/richer-materials/mockup.html`): which relationships it lists and how,
 * what the button says, what the form posts, and what a refusal reads as. Pure,
 * so every rule is driven with no page and no database near it.
 */

let counter = 0
const relationship = (over: Partial<MaterialRelationship> = {}): MaterialRelationship => ({
  relationshipId: relationshipId(`relationship-${++counter}`),
  leaderNames: [`Leader ${counter}`],
  participantNames: [`Participant ${counter}`],
  groupName: null,
  isAGroup: false,
  acceptedAt: new Date('2026-09-04T15:00:00Z'),
  runningMaterialId: null,
  since: new Date('2026-09-04T15:00:00Z'),
  previously: [],
  gender: null,
  state: 'healthy',
  ...over,
})

const material = (id: string, title: string): MaterialOnTheList => ({
  materialId: materialId(id),
  title,
  body: 'Read one chapter a week.',
  items: [],
})

// In title order, as the reader lists them.
const multiply = material('m-1', 'Multiply')
const prayer = material('m-2', 'Prayer practices')
const romans = material('m-3', 'Romans: Life in the Spirit')
const materials = [multiply, prayer, romans]

describe('which relationships the page lists', () => {
  const onNone = relationship()
  const onMultiply = relationship({ runningMaterialId: multiply.materialId })
  const onPrayer = relationship({ runningMaterialId: prayer.materialId, gender: 'female' })
  const onRomans = relationship({ runningMaterialId: romans.materialId })
  const everyone = [onPrayer, onRomans, onMultiply, onNone]

  it('puts those on no Material first, then one group per other Material in title order', () => {
    const groups = pickGroupsFor(materials, everyone, romans.materialId, null)
    expect(groups.map((group) => group.material?.title ?? null)).toEqual([
      null,
      'Multiply',
      'Prayer practices',
    ])
    expect(groups.map((group) => group.relationships)).toEqual([[onNone], [onMultiply], [onPrayer]])
  })

  it('leaves out every relationship already on the Material being assigned', () => {
    const listed = pickGroupsFor(materials, everyone, romans.materialId, null).flatMap(
      (group) => group.relationships,
    )
    expect(listed).not.toContain(onRomans)
    expect(listed).toHaveLength(3)
  })

  it('keeps what the filter keeps, and draws no group the filter empties', () => {
    const groups = pickGroupsFor(materials, everyone, romans.materialId, 'female')
    expect(groups).toEqual([{ material: prayer, relationships: [onPrayer] }])
  })

  it('lists a Material nobody else is on as no group at all', () => {
    expect(pickGroupsFor(materials, [onNone], romans.materialId, null)).toEqual([
      { material: null, relationships: [onNone] },
    ])
  })

  it('lists nothing where everyone is on it already', () => {
    expect(pickGroupsFor(materials, [onRomans], romans.materialId, null)).toEqual([])
  })
})

describe('how the page words it', () => {
  it('heads the page and each group as M-3 draws them', () => {
    expect(assignToMoreHeading('Romans: Life in the Spirit')).toBe(
      'Assign Romans: Life in the Spirit to more relationships',
    )
    expect(onNoMaterialHeading(4)).toBe('On no material · 4')
    expect(onMaterialHeading('Multiply', 2)).toBe('On Multiply · 2')
  })

  it('names a one-to-one by its Leader, with its Disciple', () => {
    expect(pickName(relationship({ leaderNames: ['Cole Alvarez'], participantNames: ['Marcus Boyd'] }))).toEqual({
      who: 'Cole Alvarez',
      rest: 'with Marcus Boyd',
    })
  })

  it('names a group by its name, led by its Leaders', () => {
    expect(
      pickName(
        relationship({
          groupName: "Tuesday Women's Group",
          isAGroup: true,
          leaderNames: ['Bethany Davis'],
          participantNames: ['A', 'B', 'C', 'D', 'E'],
        }),
      ),
    ).toEqual({ who: "Tuesday Women's Group", rest: 'led by Bethany Davis' })
  })

  it('says what each is and what it is on, in the Ministry’s zone', () => {
    const zone = 'America/Chicago'
    const acceptedAt = new Date('2026-09-04T15:00:00Z')
    expect(pickMeta(relationship(), null, acceptedAt, zone)).toBe('One-to-one · started 4 Sep 2026')
    expect(
      pickMeta(
        relationship({ isAGroup: true, participantNames: ['A', 'B', 'C', 'D', 'E'] }),
        null,
        acceptedAt,
        zone,
      ),
    ).toBe('Group of 5 · started 4 Sep 2026')
    expect(
      pickMeta(relationship(), { title: 'Multiply', since: new Date('2026-09-05T03:00:00Z') }, acceptedAt, zone),
    ).toBe('One-to-one · on Multiply since 4 Sep 2026')
  })

  it('says why the list is empty, under the filter that emptied it', () => {
    expect(nobodyToAssign(null)).toBe('Every relationship is already working through it.')
    expect(nobodyToAssign('male')).toBe("No men's relationships to assign it to.")
    expect(nobodyToAssign('female')).toBe("No women's relationships to assign it to.")
  })
})

describe('the button', () => {
  it('counts the ticks, one relationship or many', () => {
    expect(assignToCount('Romans', 3)).toBe('Assign Romans to 3 relationships')
    expect(assignToCount('Romans', 1)).toBe('Assign Romans to 1 relationship')
    expect(assignToCount('Romans', 0)).toBe('Assign Romans to 0 relationships')
  })

  it('promises no number before script has counted', () => {
    expect(assignToTheTicked('Romans')).toBe('Assign Romans to the ticked relationships')
  })
})

describe('what the form posts', () => {
  const first = '3f0c2a8e-1b4d-4c6e-9a7b-000000000001'
  const second = '3f0c2a8e-1b4d-4c6e-9a7b-000000000002'

  it('is every ticked relationship, in the order the page listed them', () => {
    expect(tickedIn([second, first])).toEqual([second, first])
  })

  it('is nothing at all where nothing was ticked', () => {
    expect(tickedIn([])).toEqual([])
  })

  it('is refused whole where any value is not an id', () => {
    expect(tickedIn([first, 'robert; drop table'])).toBeNull()
    expect(tickedIn([first, new File([], 'x')])).toBeNull()
  })

  it('names a Material on the address only by an id', () => {
    expect(materialIn(first)).toBe(first)
    expect(materialIn('..%2Fsettings')).toBeNull()
  })
})

describe('where the route sends an Admin', () => {
  it('is the folder once it is done, with the filter kept', () => {
    expect(afterAssigning('m-3', 'female')).toEqual({ path: '/materials/m-3', params: { gender: 'female' } })
    expect(afterAssigning('m-3', null)).toEqual({ path: '/materials/m-3', params: {} })
  })

  it('is back to the page after a refusal, with the code and whom it was about', () => {
    expect(
      afterAssigning('m-3', 'male', { code: 'material.relationship_ended', relationshipId: 'r-1' }),
    ).toEqual({
      path: '/materials/m-3/assign',
      params: { gender: 'male', assignError: 'material.relationship_ended', refused: 'r-1' },
    })
    expect(afterAssigning('m-3', null, { code: 'material.none_ticked', relationshipId: null })).toEqual({
      path: '/materials/m-3/assign',
      params: { assignError: 'material.none_ticked' },
    })
  })
})

describe('what a refusal reads as', () => {
  const ended = {
    leaderNames: ['Cole Alvarez'],
    participantNames: ['Marcus Boyd'],
    groupName: null,
  }

  it('names the relationship the lot was refused over, and why', () => {
    expect(assignToMoreRefusalMessage('material.relationship_ended', ended, 'Romans')).toBe(
      'Nothing was assigned. Cole Alvarez with Marcus Boyd has ended since this page was opened, so it is no longer listed. Tick the others again to assign them.',
    )
    expect(assignToMoreRefusalMessage('material.already_running', ended, 'Romans')).toBe(
      'Nothing was assigned. Cole Alvarez with Marcus Boyd is already working through Romans, so it is no longer listed. Tick the others again to assign them.',
    )
  })

  it('says one of them where the page could not read whose it was', () => {
    expect(assignToMoreRefusalMessage('material.relationship_not_found', null, 'Romans')).toBe(
      'Nothing was assigned. One of the ticked relationships is not on this Roster any more, so it is no longer listed. Tick the others again to assign them.',
    )
  })

  it('asks for a tick where none was made', () => {
    expect(assignToMoreRefusalMessage('material.none_ticked', null, 'Romans')).toBe(
      'Tick at least one relationship to assign it to.',
    )
  })

  it('says nothing for a code it does not know, whatever was typed', () => {
    expect(assignToMoreRefusalMessage(undefined, null, 'Romans')).toBeNull()
    expect(assignToMoreRefusalMessage('__proto__', null, 'Romans')).toBeNull()
    expect(assignToMoreRefusalMessage('<script>', ended, 'Romans')).toBeNull()
  })
})
