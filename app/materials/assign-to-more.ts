import type { MaterialId } from '~/domain/ids'
import type { MaterialOnTheList, MaterialRelationship } from '~/service/ports'
import { relationshipIn } from './assigning'
import type { MaterialsFilter } from './copy'
import { foldersOf, onNoMaterial, underFilter } from './folders'

/**
 * A Material's assign page (Richer materials, ticket 02; M-3 of
 * `.lavish/richer-materials/mockup.html`): which relationships it lists and in
 * what groups, what its form posts, and where the route sends an Admin after.
 * Pure over the reader's own types, like `./folders`, and built from the same
 * rules the tab files relationships by, so a relationship listed under a
 * Material here is one that Material's folder holds.
 */

/** One group on the page: those on no Material, or those on one other Material. */
export interface PickGroup {
  /** The Material they are on now, or null for the group on none. */
  readonly material: MaterialOnTheList | null
  readonly relationships: readonly MaterialRelationship[]
}

/**
 * Every live, accepted relationship not already on the Material being assigned,
 * under the filter: those on no Material first, then one group per Material they
 * are on, in title order (James, Q3 of the mock-up review). A group the filter
 * leaves empty is not drawn. Within each, the order the reader lists them in.
 */
export const pickGroupsFor = (
  materials: readonly MaterialOnTheList[],
  relationships: readonly MaterialRelationship[],
  assigning: MaterialId,
  filter: MaterialsFilter,
): readonly PickGroup[] => {
  const shown = underFilter(relationships, filter).filter(
    (relationship) => relationship.runningMaterialId !== assigning,
  )
  const others = materials.filter((material) => material.materialId !== assigning)
  return [
    { material: null, relationships: onNoMaterial(shown) },
    ...foldersOf(others, shown),
  ].filter((group) => group.relationships.length > 0)
}

/**
 * The Material a route's address names, or null where it is not an id the
 * database could have minted -- which is the same shape a relationship's is, so
 * the one check is used for both, and an address is never built out of anything
 * else.
 */
export const materialIn = (value: string): string | null => relationshipIn(value)

/** The checkboxes' name, which the route reads every ticked one under. */
export const TICKED_FIELD = 'relationshipId'

/**
 * The relationships a press ticked, in the order the page listed them, or null
 * where any value is not an id the database could have minted -- a form nobody
 * drew, which is refused rather than partly carried out.
 */
export const tickedIn = (values: readonly FormDataEntryValue[]): readonly string[] | null => {
  const ticked = values.map(relationshipIn)
  return ticked.every((id): id is string => id !== null) ? ticked : null
}

/**
 * Where the route sends an Admin: to the Material's folder once it is done, where
 * the count in its head has grown; back to this page after a refusal, with its
 * code and the relationship it was about. The filter that was on travels both
 * ways.
 */
export const afterAssigning = (
  material: string,
  filter: MaterialsFilter,
  refusal?: { readonly code: string; readonly relationshipId: string | null },
): { readonly path: string; readonly params: Record<string, string> } => ({
  path: refusal === undefined ? `/materials/${material}` : `/materials/${material}/assign`,
  params: {
    ...(filter === null ? {} : { gender: filter }),
    ...(refusal === undefined ? {} : { assignError: refusal.code }),
    ...(refusal?.relationshipId ? { refused: refusal.relationshipId } : {}),
  },
})
