import type { SupabaseClient } from '@supabase/supabase-js'
import { daysSince, systemClock, type Clock } from '~/domain/clock'
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

/**
 * One lookup keyed by id, for the two the item rows need: the Person an item is
 * about, and when its relationship was created. Written once because the two
 * differ only in the table, the column and what they key -- and a second copy of
 * a three-step fetch-check-map is where the two quietly stop matching.
 */
const lookup = async <T>(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: readonly (string | null)[],
  read: (value: unknown) => T,
): Promise<Map<string, T>> => {
  const wanted = [...new Set(ids.flatMap((id) => (id ? [id] : [])))]
  if (wanted.length === 0) return new Map()

  const { data, error } = await supabase.from(table).select(`id, ${column}`).in('id', wanted)
  if (error) throw new Error(`Could not read Care Needed: ${error.message}`)

  return new Map(
    ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) =>
      typeof row.id === 'string' ? [[row.id, read(row[column])] as const] : [],
    ),
  )
}

/**
 * The query itself, against whichever signed-in client it is handed. Separated
 * from the reader below so a test can drive it with a real session rather than a
 * Next.js request context, which is the one thing `createSupabaseServerClient`
 * needs and the one thing a test cannot supply.
 */
export const readOpenFollowUpItems = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
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
  //
  // The second is when each relationship was created, which is what the wait is
  // computed from below.
  const nameOf = await lookup(supabase, 'person', 'full_name', items.map((i) => i.personId), String)
  const createdAtOf = await lookup(
    supabase,
    'relationship',
    'created_at',
    items.map((item) => item.relationshipId),
    (value) => new Date(String(value)),
  )

  // Once for the whole list, so two items read in the same breath cannot disagree
  // about what day it is -- and from the injected clock, like every other
  // time-dependent rule in this codebase.
  const now = clock.now()

  return items.flatMap((item) => {
    // A payload that has lost its period cannot be rendered, but it is one row.
    // Throwing here would blank the whole of Care Needed over it, which is the
    // opposite of what this surface is for: everything still legible is shown, and
    // the drifted row is left out rather than taking the rest with it.
    const createdAt = item.relationshipId
      ? (createdAtOf.get(item.relationshipId) ?? null)
      : null

    let payload
    try {
      payload = readFollowUpPayload(item.kind, item.payload)
    } catch {
      return []
    }

    return [
      {
        id: followUpItemId(item.id),
        raisedAt: new Date(item.raisedAt),
        relationshipId: item.relationshipId ? relationshipId(item.relationshipId) : null,
        personId: item.personId ? personId(item.personId) : null,
        personName: item.personId ? (nameOf.get(item.personId) ?? null) : null,
        relationshipCreatedAt: createdAt,
        // The derived number the view shows, beside the instant it came from. The
        // instant is what the data keeps; freezing this into the payload instead
        // would have an item raised on day five still saying five on the twentieth.
        waitedDays: createdAt ? daysSince(createdAt, now) : null,
        payload,
      },
    ]
  })
}

/**
 * Built with a clock rather than reaching for one, because how long an item has
 * waited is a time-dependent rule like any other and the composition root is what
 * decides whose clock answers it.
 */
export const createSupabaseCareNeededReader = (clock: Clock = systemClock): CareNeededReader => ({
  async listOpenItems(ministryId) {
    return readOpenFollowUpItems(await createSupabaseServerClient(), ministryId, clock)
  },
})
