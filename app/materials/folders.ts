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

/** The relationships on no Material: the dashed folder, and the page at `/materials/none`. */
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

/** How many leader-initial chips a folder draws before it says *+N* for the rest. */
export const CHIPS_ON_A_FOLDER = 3

/**
 * The chips on a folder: the initials of each relationship's first Leader, for
 * the first few relationships, and how many more there are. A relationship led
 * by nobody named draws no chip and still counts.
 */
export const chipsFor = (
  relationships: readonly MaterialRelationship[],
  initialsOf: (fullName: string) => string,
): { readonly initials: readonly string[]; readonly more: number } => {
  const led = relationships.filter((each) => each.leaderNames.length > 0)
  const initials = led.slice(0, CHIPS_ON_A_FOLDER).map((each) => initialsOf(each.leaderNames[0]!))
  return { initials, more: relationships.length - initials.length }
}
