import type { SupabaseClient } from '@supabase/supabase-js'
import { daysSince, systemClock, type Clock } from '~/domain/clock'
import {
  isFollowUpKind,
  readFollowUpPayload,
  type FollowUpKind,
} from '~/domain/follow-up'
import {
  concernId,
  followUpItemId,
  personId,
  relationshipId,
  type MinistryId,
} from '~/domain/ids'
import {
  deriveRelationshipState,
  type RaisedConcern,
  type RelationshipWeek,
} from '~/domain/relationship-state'
import type {
  CareNeededItem,
  CareNeededReader,
  FollowUpCareItem,
  OutstandingConcern,
} from '~/service/ports'
import { createSupabaseServerClient } from './server-client'

/**
 * The Care Needed view: open Follow-Up Items, relationships whose *derived* state
 * asks for attention, and unresolved Concerns, unioned into one list.
 *
 * The three are genuinely different kinds of thing and are kept apart in the
 * union rather than flattened. A Follow-Up Item is a stored row an Admin closes by
 * hand and nothing else clears. A derived state clears itself the moment the
 * Leader answers, which is exactly why it could never have been an item. A Concern
 * is a badge that stands beside a relationship whatever its state, so a Healthy
 * relationship can carry one and a Stalled one can carry three.
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
): Promise<readonly FollowUpCareItem[]> => {
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

const rows = (data: unknown): readonly Record<string, unknown>[] =>
  (data ?? []) as Record<string, unknown>[]

/**
 * Append one value to the list a key holds, making the list if it has none.
 * Written once because the alternative -- `map.set(k, [...(map.get(k) ?? []), v])`
 * -- was appearing at every grouping site and rebuilding the whole array each
 * time round the loop.
 */
const gather = <T>(into: Map<string, T[]>, key: string, value: T): void => {
  const standing = into.get(key)
  if (standing) standing.push(value)
  else into.set(key, [value])
}

/** The one lookup both grouping reads want: a Person's name, by id. */
const namesOf = (supabase: SupabaseClient, ids: readonly (string | null)[]) =>
  lookup(supabase, 'person', 'full_name', ids, String)

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

const instant = (value: unknown): Date | null =>
  typeof value === 'string' ? new Date(value) : null

/**
 * Who is in each live relationship, by role, for the sentence Care Needed writes.
 * Open memberships only: somebody who has left is not who an Admin is calling
 * about.
 */
const membersOf = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
): Promise<Map<string, { leaders: string[]; participants: string[] }>> => {
  const { data, error } = await supabase
    .from('relationship_member')
    .select('relationship_id, person_id, role')
    .eq('ministry_id', ministryId)
    .is('ended_at', null)

  if (error) throw new Error(`Could not read Care Needed: ${error.message}`)

  const memberships = rows(data)
  const nameOf = await namesOf(
    supabase,
    memberships.map((row) => text(row.person_id)),
  )

  const byRelationship = new Map<string, { leaders: string[]; participants: string[] }>()
  for (const row of memberships) {
    const relationship = text(row.relationship_id)
    const person = text(row.person_id)
    if (!relationship || !person) continue

    const side = byRelationship.get(relationship) ?? { leaders: [], participants: [] }
    const name = nameOf.get(person)
    if (name) (row.role === 'leader' ? side.leaders : side.participants).push(name)
    byRelationship.set(relationship, side)
  }

  return byRelationship
}

/**
 * Every relationship-week this Ministry has on record, grouped by relationship.
 *
 * The whole history and not a recent window. Truncating it would silently shorten
 * a duration -- a relationship reporting no meeting for fourteen weeks would say
 * *twelve* with nothing on any screen to show why -- and a wrong number on a care
 * surface is worse than a slow one. If this ever costs anything the answer is an
 * index or a projection, never a cut-off.
 *
 * The ISO week each row falls in is computed here, against the Ministry's own
 * timezone, and the counting is left entirely to `deriveRelationshipState`.
 */
const weeksOf = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
): Promise<Map<string, RelationshipWeek[]>> => {
  const { data, error } = await supabase.rpc('relationship_weeks', {
    target_ministry_id: ministryId,
  })

  if (error) throw new Error(`Could not read Care Needed: ${error.message}`)

  const byRelationship = new Map<string, RelationshipWeek[]>()
  for (const row of rows(data)) {
    const relationship = text(row.relationship_id)
    const openedAt = instant(row.opened_at)
    if (!relationship || !openedAt) continue

    const answeredAt = instant(row.answered_at)

    gather(byRelationship, relationship, {
      // When the conversation opened, for every relationship it covered --
      // including the ones it never reached. A silent Leader's fourth
      // relationship accrues its counter on the week it was covered in, not on
      // the week its question would have arrived had the sequence got that far.
      openedAt,
      outcome:
        row.reported_not_meeting === true
          ? 'did_not_meet'
          : answeredAt
            ? 'met'
            : 'unanswered',
      answeredAt,
    })
  }

  return byRelationship
}

/**
 * Every Concern this Ministry holds, resolved ones included: the derivation needs
 * the resolved ones to know they are no longer outstanding, and the unresolved
 * ones to know whether one was raised this week.
 *
 * `detail` is not in the select list and could not be read if it were -- the
 * authenticated role holds no grant on that column. The words are reached one at a
 * time through `CommandService.openConcern`, which records the viewing in the same
 * transaction that returns them.
 */
const concernsOf = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
): Promise<{
  readonly raised: Map<string, RaisedConcern[]>
  readonly outstanding: Map<string, OutstandingConcern[]>
}> => {
  const { data, error } = await supabase
    .from('concern')
    .select('id, relationship_id, raised_by, raised_at, resolved_at')
    .eq('ministry_id', ministryId)
    .order('raised_at', { ascending: false })

  if (error) throw new Error(`Could not read Care Needed: ${error.message}`)

  const found = rows(data)
  const nameOf = await namesOf(
    supabase,
    found.map((row) => text(row.raised_by)),
  )

  const raised = new Map<string, RaisedConcern[]>()
  const outstanding = new Map<string, OutstandingConcern[]>()

  for (const row of found) {
    const relationship = text(row.relationship_id)
    const raisedAt = instant(row.raised_at)
    const id = text(row.id)
    const raisedBy = text(row.raised_by)
    if (!relationship || !raisedAt || !id || !raisedBy) continue

    const resolvedAt = instant(row.resolved_at)
    gather(raised, relationship, { raisedAt, resolvedAt })

    if (resolvedAt === null) {
      gather(outstanding, relationship, {
        id: concernId(id),
        raisedAt,
        raisedBy: personId(raisedBy),
        raisedByName: nameOf.get(raisedBy) ?? null,
      })
    }
  }

  return { raised, outstanding }
}

/**
 * The whole surface: the three sources, read against one signed-in client and one
 * reading of the clock, so two items in the same list cannot disagree about what
 * day it is or which week it is.
 */
export const readCareNeeded = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
): Promise<readonly CareNeededItem[]> => {
  const { data: settings, error } = await supabase
    .from('ministry')
    .select('timezone')
    .eq('id', ministryId)
    .maybeSingle()

  if (error) throw new Error(`Could not read Care Needed: ${error.message}`)

  // A Ministry an Admin does not belong to comes back empty from the policy, and
  // there is nothing to derive a week against. Empty rather than a guessed zone:
  // every counter below is anchored to one, and the wrong zone is a wrong answer.
  const timeZone = text((settings ?? {}).timezone)
  if (!timeZone) return []

  const now = clock.now()

  const { data: relationshipRows, error: relationshipError } = await supabase
    .from('relationship')
    .select('id, accepted_at, ended_at')
    .eq('ministry_id', ministryId)

  if (relationshipError) {
    throw new Error(`Could not read Care Needed: ${relationshipError.message}`)
  }

  const [followUps, members, weeks, concerns] = await Promise.all([
    readOpenFollowUpItems(supabase, ministryId, clock),
    membersOf(supabase, ministryId),
    weeksOf(supabase, ministryId),
    concernsOf(supabase, ministryId),
  ])

  const namesFor = (relationship: string) =>
    members.get(relationship) ?? { leaders: [], participants: [] }

  const derived: CareNeededItem[] = []

  for (const row of rows(relationshipRows)) {
    const id = text(row.id)
    if (!id) continue

    // The derivation throws when Stalled and Needs Care both hold, and that throw
    // is deliberately not caught. It would take the whole Care Needed view down
    // for this Ministry, which is the point: the condition is unreachable unless
    // something has started raising Concerns without answering the week, and the
    // failure this surface exists to prevent is a wrong answer shown confidently.
    // A dropped row would be exactly that. Compare the Follow-Up payload below,
    // which *is* dropped -- a drifted payload is one unrenderable item, not a rule
    // that has stopped being true.
    const state = deriveRelationshipState(
      {
        acceptedAt: instant(row.accepted_at),
        endedAt: instant(row.ended_at),
        // Ticket 12 builds the Pause. Until it does there is nothing on the row
        // that could say a relationship is paused, and reading one as paused
        // would be inventing a fact.
        pausedAt: null,
        timeZone,
        weeks: weeks.get(id) ?? [],
        concerns: concerns.raised.get(id) ?? [],
      },
      now,
    )

    // Healthy, Awaiting, Paused and Ended are not things to act on. Only the two
    // states that ask for attention reach the list -- and they reach it saying
    // which condition fired and for how long, because *gone silent, 23 days* and
    // *responding, not meeting, 3 weeks* are different phone calls.
    if (state.state !== 'stalled' && state.state !== 'needs_care') continue

    const { leaders, participants } = namesFor(id)
    derived.push({
      source: 'relationship',
      relationshipId: relationshipId(id),
      state: state.state,
      reasons: state.reasons,
      leaderNames: leaders,
      participantNames: participants,
      openConcerns: state.openConcerns,
    })
  }

  // Concern badges are their own rows and not folded into the state above,
  // because they are not a state: a Healthy relationship carries its unresolved
  // Concerns and a Stalled one carries them too. Several on one relationship are
  // one row with a count, so an Admin sees *3 Concerns* rather than three rows
  // they have to notice are about the same people.
  const badges: CareNeededItem[] = [...concerns.outstanding.entries()].map(
    ([relationship, outstanding]) => ({
      source: 'concern',
      relationshipId: relationshipId(relationship),
      concerns: outstanding,
      participantNames: namesFor(relationship).participants,
    }),
  )

  return [...followUps.map((item) => ({ source: 'follow_up' as const, ...item })), ...derived, ...badges]
}

/**
 * Built with a clock rather than reaching for one, because how long an item has
 * waited is a time-dependent rule like any other -- as is which ISO week it is,
 * which both counters are anchored to -- and the composition root is what decides
 * whose clock answers them.
 */
export const createSupabaseCareNeededReader = (clock: Clock = systemClock): CareNeededReader => ({
  async listOpenItems(ministryId) {
    return readCareNeeded(await createSupabaseServerClient(), ministryId, clock)
  },
})
