import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isFollowUpKind,
  readFollowUpPayload,
  type FollowUpKind,
} from '~/domain/follow-up'
import { followUpItemId, personId, relationshipId, type MinistryId } from '~/domain/ids'
import type { CareNeededItem, CareNeededReader } from '~/service/ports'
import { createSupabaseServerClient } from './server-client'

/**
 * The Follow-Up Item source of the Care Needed view. The view proper unions three
 * things -- derived relationship states, Concerns, and these -- and the other two
 * arrive with ticket 10, so this reader answers for the third alone rather than
 * pretending to be the whole surface.
 *
 * Read through the signed-in client, so the policy on `follow_up_item` is what
 * scopes it to the Admin's Ministry. The `eq` below restates the same fact and is
 * not the thing enforcing it: a Ministry an Admin does not belong to comes back
 * empty whatever this file asks for.
 */

interface ItemRow {
  readonly id: string
  readonly kind: FollowUpKind
  readonly raisedAt: string
  readonly relationshipId: string | null
  readonly personId: string | null
  readonly payload: unknown
}

/**
 * Checked rather than asserted, on every field rather than the one that looked
 * interesting. Care Needed is a screen somebody is about to act on, and a row that
 * arrived without the kind saying what it is has nothing useful to render.
 */
const asItemRow = (row: unknown): ItemRow => {
  const {
    id,
    kind,
    raised_at: raisedAt,
    relationship_id: relationship,
    person_id: person,
    payload,
  } = (row ?? {}) as Record<string, unknown>

  if (typeof id !== 'string' || id === '') {
    throw new Error('A Care Needed row arrived with no id')
  }
  if (!isFollowUpKind(kind)) {
    throw new Error(`A Care Needed row arrived with no recognizable kind: ${String(kind)}`)
  }
  if (typeof raisedAt !== 'string') {
    throw new Error(`A Care Needed row arrived with no raised_at: ${id}`)
  }
  // The database refuses this too. Reaching here means the check constraint and
  // this reader have drifted apart, which is worth failing over on a surface an
  // Admin acts from.
  if (typeof relationship !== 'string' && typeof person !== 'string') {
    throw new Error(`A Care Needed row arrived about nothing: ${id}`)
  }

  return {
    id,
    kind,
    raisedAt,
    relationshipId: typeof relationship === 'string' ? relationship : null,
    personId: typeof person === 'string' ? person : null,
    payload,
  }
}

/** Everything a set of rows names, once each, with the nulls dropped. */
const distinct = (values: readonly (string | null)[]): string[] => [
  ...new Set(values.flatMap((value) => (value ? [value] : []))),
]

/**
 * The query itself, against whichever signed-in client it is handed. Separated
 * from the reader below so a test can drive it with a real session rather than a
 * Next.js request context, which is the one thing `createSupabaseServerClient`
 * needs and the one thing a test cannot supply.
 */
export const readOpenFollowUpItems = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
): Promise<readonly CareNeededItem[]> => {
  // Open items only. A resolved one leaves the view and stays in the table,
  // because how many care items a Ministry raised and how fast it closed them is
  // a question it should be able to ask later.
  const { data, error } = await supabase
    .from('follow_up_item')
    .select('id, kind, raised_at, relationship_id, person_id, payload')
    .eq('ministry_id', ministryId)
    .is('resolved_at', null)
    .order('raised_at', { ascending: false })

  if (error) throw new Error(`Could not read Care Needed: ${error.message}`)

  const items = (data ?? []).map(asItemRow)
  if (items.length === 0) return []

  // Two follow-up reads rather than embedded joins. The subject columns are
  // composite foreign keys carrying `ministry_id`, and asking PostgREST to resolve
  // those inline makes the select list depend on which of two keys it decides a
  // name should travel along.
  const nameOf = new Map<string, string>()
  const subjects = distinct(items.map((item) => item.personId))
  if (subjects.length > 0) {
    const { data: people, error: peopleError } = await supabase
      .from('person')
      .select('id, full_name')
      .in('id', subjects)

    if (peopleError) throw new Error(`Could not read Care Needed: ${peopleError.message}`)
    for (const row of (people ?? []) as { id: string; full_name: string }[]) {
      nameOf.set(row.id, row.full_name)
    }
  }

  // When each relationship was created, so a `relationship_unaccepted` item can
  // say how long it has waited *now*. Read live rather than frozen into the
  // payload, because an item raised on day five is the same item on day twenty.
  const createdAtOf = new Map<string, string>()
  const relationships = distinct(items.map((item) => item.relationshipId))
  if (relationships.length > 0) {
    const { data: rows, error: relationshipError } = await supabase
      .from('relationship')
      .select('id, created_at')
      .in('id', relationships)

    if (relationshipError) {
      throw new Error(`Could not read Care Needed: ${relationshipError.message}`)
    }
    for (const row of (rows ?? []) as { id: string; created_at: string }[]) {
      createdAtOf.set(row.id, row.created_at)
    }
  }

  return items.map((item) => {
    const createdAt = item.relationshipId ? createdAtOf.get(item.relationshipId) : undefined

    return {
      id: followUpItemId(item.id),
      kind: item.kind,
      raisedAt: new Date(item.raisedAt),
      relationshipId: item.relationshipId ? relationshipId(item.relationshipId) : null,
      personId: item.personId ? personId(item.personId) : null,
      personName: item.personId ? (nameOf.get(item.personId) ?? null) : null,
      relationshipCreatedAt: createdAt ? new Date(createdAt) : null,
      payload: readFollowUpPayload(item.kind, item.payload),
    }
  })
}

export const supabaseCareNeededReader: CareNeededReader = {
  async listOpenItems(ministryId) {
    return readOpenFollowUpItems(await createSupabaseServerClient(), ministryId)
  },
}
