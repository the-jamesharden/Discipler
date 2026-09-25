import { materialItemId } from '~/domain/ids'
import type { MaterialItem } from '~/domain/materials'
import { count, text } from './rows'

/**
 * A `material_item` row, however it arrived: from `to_jsonb` on the command
 * connection, or from `app.material_items` in a page document. One reader for
 * both, so what counts as a whole file is said once (Richer materials, ticket 01).
 */

/** One row, read back into the domain's shape. `material` names the Material, for the error. */
export const materialItemFrom = (material: string, row: Record<string, unknown>): MaterialItem => {
  const id = text(row.id)
  const position = count(row.position)
  if (!id || position === null) {
    throw new Error(`Material ${material} arrived with an item missing its id or place`)
  }
  const place = { id: materialItemId(id), position }
  if (row.kind === 'file') {
    const path = text(row.path)
    const filename = text(row.filename)
    const contentType = text(row.content_type)
    const bytes = count(row.bytes)
    // All four or none, which `material_item_is_whole` promises.
    if (!path || !filename || !contentType || bytes === null) {
      throw new Error(`Material ${material} arrived with half a file`)
    }
    return { ...place, kind: 'file', path, filename, contentType, bytes }
  }
  const url = text(row.url)
  if (row.kind !== 'link' || !url) {
    throw new Error(`Material ${material} arrived with an item that is neither a file nor a link`)
  }
  return { ...place, kind: 'link', url, label: text(row.label) }
}
