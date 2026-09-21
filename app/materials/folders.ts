import type { MaterialId } from '~/domain/ids'
import type { MaterialOnTheList, MaterialRelationship } from '~/service/ports'
import type { MaterialsFilter } from './copy'

/**
 * How the tab groups relationships into folders, and what the filter keeps. Pure
 * over the reader's own types, so the rules are driven with no database near
 * them, and shared by the tab and the folder pages so a folder's count on the
 * tab is the number of cards inside it.
 */

/**
 * The relationships a filter keeps. All keeps everything; Men's or Women's keeps
 * the ones filed under that gender -- what the relationship declared, or the
 * Leader's own gender for a one-to-one that declared none. A group that declared
 * none is under neither, because it is mixed.
 */
export const underFilter = (
  relationships: readonly MaterialRelationship[],
  filter: MaterialsFilter,
): readonly MaterialRelationship[] =>
  filter === null ? relationships : relationships.filter((each) => each.gender === filter)

/** One folder on the tab: a Material and the relationships whose running period is on it. */
export interface MaterialFolder {
  readonly material: MaterialOnTheList
  readonly relationships: readonly MaterialRelationship[]
}

/**
 * A folder per live Material, in title order, whether or not anybody is on it.
 * A relationship whose running period names a removed Material, which no live
 * folder holds, is on no folder here and in no dashed folder either: it is
 * working through something, and that something is not on the tab.
 */
export const foldersOf = (
  materials: readonly MaterialOnTheList[],
  relationships: readonly MaterialRelationship[],
): readonly MaterialFolder[] =>
  materials.map((material) => ({
    material,
    relationships: relationships.filter((each) => each.runningMaterialId === material.materialId),
  }))

/** The relationships on no Material: the dashed tile, and the page at `/materials/none`. */
export const onNoMaterial = (
  relationships: readonly MaterialRelationship[],
): readonly MaterialRelationship[] =>
  relationships.filter((each) => each.runningMaterialId === null)

/** The relationships whose running period is on one Material: its folder's page. */
export const onMaterial = (
  relationships: readonly MaterialRelationship[],
  material: MaterialId,
): readonly MaterialRelationship[] =>
  relationships.filter((each) => each.runningMaterialId === material)

/** Gender tint on a home-screen tile: men's, women's, or mixed/undeclared. */
export type TileGender = 'm' | 'f' | 'x'

/**
 * One cell on the Materials home screen: a folder when two or more relationships
 * are on the same Material, a tile of its own for the one relationship on a
 * Material, and one dashed tile for everyone on no Material. A Material nobody
 * is on is a folder with nothing in it, because the tab is the only way in to
 * its page, and so to editing or removing it.
 */
export type HomeCell =
  | {
      readonly kind: 'folder'
      readonly material: MaterialOnTheList
      readonly relationships: readonly MaterialRelationship[]
      readonly gender: TileGender
    }
  | {
      readonly kind: 'single'
      readonly relationship: MaterialRelationship
      readonly material: MaterialOnTheList
      readonly gender: TileGender
    }
  | {
      readonly kind: 'unassigned'
      readonly relationships: readonly MaterialRelationship[]
      readonly gender: TileGender
    }

const genderOf = (relationship: MaterialRelationship): TileGender =>
  relationship.gender === 'female' ? 'f' : relationship.gender === 'male' ? 'm' : 'x'

/** The tint a folder takes from everyone inside: one gender, or mixed. */
export const bucketGender = (relationships: readonly MaterialRelationship[]): TileGender => {
  const set = new Set(relationships.map(genderOf))
  if (set.size === 1) return set.has('f') ? 'f' : set.has('m') ? 'm' : 'x'
  return 'x'
}

/**
 * The home-screen cells in the Materials' own order, then the dashed tile last
 * when the filter keeps anybody on no Material. Every live Material has a cell.
 * Whether it is a folder or a single tile is decided by everyone on it, not by
 * who the filter keeps, so a Material two relationships share stays a folder
 * under Men's and Women's and only its count changes. The one relationship on a
 * Material is a single tile while the filter keeps it, and leaves an empty
 * folder behind when it does not.
 */
export const homeCellsOf = (
  materials: readonly MaterialOnTheList[],
  relationships: readonly MaterialRelationship[],
  filter: MaterialsFilter,
): readonly HomeCell[] => {
  const shown = underFilter(relationships, filter)
  const everyoneOn = foldersOf(materials, relationships)
  const cells = foldersOf(materials, shown).map(({ material, relationships: members }, index): HomeCell => {
    const alone = everyoneOn[index]!.relationships.length === 1 ? members[0] : undefined
    return alone
      ? { kind: 'single', relationship: alone, material, gender: genderOf(alone) }
      : { kind: 'folder', material, relationships: members, gender: bucketGender(members) }
  })
  const unassigned = onNoMaterial(shown)
  return unassigned.length === 0
    ? cells
    : [...cells, { kind: 'unassigned', relationships: unassigned, gender: bucketGender(unassigned) }]
}

/** How a one-to-one or a group is named under its tile. */
export const tileName = (relationship: MaterialRelationship): string => {
  if (relationship.isAGroup) {
    return relationship.groupName?.trim() || relationship.leaderNames.join(', ') || 'Group'
  }
  const leader = relationship.leaderNames[0] ?? 'Nobody leading'
  const participant = relationship.participantNames[0] ?? 'nobody'
  return `${leader} & ${participant}`
}
