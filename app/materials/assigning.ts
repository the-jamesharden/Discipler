import type { MaterialOption } from '~/service/ports'
import type { MaterialsFilter } from './copy'

/**
 * The assign row at the foot of a folder's cards, and the Material field on a
 * group's card on Intake forms (Materials, ticket 03; S-2, S-3 and S-6 of
 * `.lavish/materials/design.html`): what each dropdown offers, what it posts,
 * and where the folder's row sends an Admin back to. Pure, so the rules are
 * driven with no page near them, and shared by both screens so the two cannot
 * come to spell *no material* differently.
 */

/** The select's name on both forms. */
export const MATERIAL_FIELD = 'materialId'

/**
 * What *No material* posts. A word rather than the empty string, because the
 * empty string is the "Choose a material…" line on the no-material folder, which
 * is no choice at all.
 */
export const NO_MATERIAL_VALUE = 'none'

/** What an Admin chose: a Material by id, the un-assign, or nothing yet. */
export type Chosen =
  | { readonly kind: 'material'; readonly id: string }
  | { readonly kind: 'none' }
  | null

/**
 * The choice a form posted. Nothing, the empty string and anything that is not
 * text are no choice; whether this Ministry holds the id is the boundary's to say.
 */
export const chosenIn = (value: FormDataEntryValue | null): Chosen =>
  typeof value !== 'string' || value === ''
    ? null
    : value === NO_MATERIAL_VALUE
      ? { kind: 'none' }
      : { kind: 'material', id: value }

/** One line of a dropdown. */
export interface AssignOption {
  readonly value: string
  readonly label: string
}

/**
 * What a card's dropdown offers and which line it opens on. In a Material's
 * folder: every live Material, then "No material", on the current one. In the
 * no-material folder: "Choose a material…", then every live Material, on the
 * first line, because there is nothing to save over.
 */
export const assignRow = (
  materials: readonly MaterialOption[],
  current: string | null,
  labels: { readonly noMaterial: string; readonly choose: string },
): { readonly options: readonly AssignOption[]; readonly selected: string } => {
  const live = materials.map((material) => ({ value: material.materialId, label: material.title }))
  return current === null
    ? { options: [{ value: '', label: labels.choose }, ...live], selected: '' }
    : { options: [...live, { value: NO_MATERIAL_VALUE, label: labels.noMaterial }], selected: current }
}

/**
 * The groups card's dropdown: "No material" first, then every live Material, on
 * the running one. The same values the folder's row posts.
 */
export const groupMaterialField = (
  materials: readonly MaterialOption[],
  running: string | null,
  noMaterial: string,
): { readonly options: readonly AssignOption[]; readonly selected: string } => ({
  options: [
    { value: NO_MATERIAL_VALUE, label: noMaterial },
    ...materials.map((material) => ({ value: material.materialId, label: material.title })),
  ],
  selected: running ?? NO_MATERIAL_VALUE,
})

/** The shape of an id the database mints, which is all a folder in a query can be. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The relationship a card names, or null where the form sent something no row
 * could be keyed by -- which is *no such relationship*, not a query to send.
 */
export const relationshipIn = (value: FormDataEntryValue | null): string | null =>
  typeof value === 'string' && UUID.test(value) ? value : null

/**
 * The folder a card was pressed in, as the form names it: the no-material one,
 * or a Material's by id. Anything else is no folder, and the route goes back to
 * the tab rather than building an address out of what somebody typed.
 */
export const folderIn = (value: FormDataEntryValue | null): string | null =>
  typeof value === 'string' && (value === NO_MATERIAL_VALUE || UUID.test(value)) ? value : null

/**
 * Where the row sends an Admin back to, with the filter that was on and, after a
 * refusal, its code: the folder the card was pressed in, or the tab.
 */
export const backToFolder = (
  folder: string | null,
  filter: MaterialsFilter,
  refusal?: string,
): { readonly path: string; readonly params: Record<string, string> } => ({
  path: folder === null ? '/materials' : `/materials/${folder}`,
  params: {
    ...(filter === null ? {} : { gender: filter }),
    ...(refusal === undefined ? {} : { assignError: refusal }),
  },
})
