import type { SupabaseClient } from '@supabase/supabase-js'
import { daysSince, systemClock, type Clock } from '~/domain/clock'
import {
  isFollowUpKind,
  readFollowUpPayload,
  type FollowUpKind,
} from '~/domain/follow-up'
import { followUpItemId, personId, relationshipId, type MinistryId } from '~/domain/ids'
import { deriveRelationshipState } from '~/domain/relationship-state'
import type {
  CareMember,
  CareNeededItem,
  CareNeededReader,
  FollowUpCareItem,
} from '~/service/ports'
import { readContactToShare } from './contact-to-share'
import {
  concernsOf,
  instant,
  membersOf,
  NOBODY_IN_IT,
  pausesOf,
  timeZoneOf,
  weeksOf,
} from './relationship-history'
import { lookup, rows, text } from './rows'
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
/**
 * How every read in this file fails. From a screen's point of view the seven
 * queries below are one read -- Care Needed either came back or it did not -- and
 * which of them fell over is a server-log question rather than a screen one. The
 * message was written out at each site until one of them drifted.
 */
const couldNotRead = (error: { readonly message: string }): Error =>
  new Error(`Could not read Care Needed: ${error.message}`)

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

  if (error) throw couldNotRead(error)

  const items = (data ?? []).map(asItemRow)
  if (items.length === 0) return []

  // Two follow-up reads rather than embedded joins. The subject columns are
  // composite foreign keys carrying `ministry_id`, and asking PostgREST to resolve
  // those inline makes the select list depend on which of two keys it decides a
  // name should travel along.
  //
  // The second is when each relationship was created, which is what the wait is
  // computed from below.
  const nameOf = await lookup(
    supabase,
    'person',
    'full_name',
    items.map((i) => i.personId),
    text,
    couldNotRead,
  )
  const createdAtOf = await lookup(
    supabase,
    'relationship',
    'created_at',
    items.map((item) => item.relationshipId),
    instant,
    couldNotRead,
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
 * The whole surface: the three sources, read against one signed-in client and one
 * reading of the clock, so two items in the same list cannot disagree about what
 * day it is or which week it is.
 */
export const readCareNeeded = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
): Promise<readonly CareNeededItem[]> => {
  // A Ministry an Admin does not belong to comes back empty from the policy, and
  // there is nothing to derive a week against. Empty rather than a guessed zone:
  // every counter below is anchored to one, and the wrong zone is a wrong answer.
  const timeZone = await timeZoneOf(supabase, ministryId, couldNotRead)
  if (!timeZone) return []

  const now = clock.now()

  const { data: relationshipRows, error: relationshipError } = await supabase
    .from('relationship')
    .select('id, accepted_at, ended_at')
    .eq('ministry_id', ministryId)

  if (relationshipError) {
    throw couldNotRead(relationshipError)
  }

  const [followUps, members, weeks, concerns, pauses] = await Promise.all([
    readOpenFollowUpItems(supabase, ministryId, clock),
    membersOf(supabase, ministryId, couldNotRead),
    weeksOf(supabase, ministryId, couldNotRead),
    concernsOf(supabase, ministryId, couldNotRead),
    pausesOf(supabase, ministryId, couldNotRead),
  ])

  const namesFor = (relationship: string) => members.get(relationship) ?? NOBODY_IN_IT

  const membersFor = (relationship: string): CareMember[] =>
    namesFor(relationship).people.map((person) => ({
      personId: personId(person.personId),
      fullName: person.fullName,
      role: person.role,
    }))

  const needingAttention: CareNeededItem[] = []

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
    const derived = deriveRelationshipState(
      {
        acceptedAt: instant(row.accepted_at),
        endedAt: instant(row.ended_at),
        // `Paused` masks whatever the history would otherwise derive, which is
        // what keeps a Leader on holiday out of the care queue -- and it masks
        // rather than replaces, so the state underneath resurfaces on resume
        // exactly as it was.
        pausedAt: pauses.get(id)?.pausedAt ?? null,
        timeZone,
        weeks: weeks.get(id) ?? [],
        concerns: concerns.raised.get(id) ?? [],
      },
      now,
    )

    // Healthy, Awaiting, Paused and Ended are not things to act on. Only the two
    // states that ask for attention reach the list.
    //
    // A Stalled one says which condition fired and for how long, because *gone
    // silent, 23 days* and *responding, not meeting, 3 weeks* are different phone
    // calls. A Needs Care one carries no reason and is not missing one: the state
    // is itself the condition -- a Concern was raised this week -- and
    // `openConcerns` is what it is a count of.
    if (derived.state !== 'stalled' && derived.state !== 'needs_care') continue

    const { leaders, participants } = namesFor(id)
    needingAttention.push({
      source: 'relationship',
      relationshipId: relationshipId(id),
      state: derived.state,
      reasons: derived.reasons,
      leaderNames: leaders,
      participantNames: participants,
      members: membersFor(id),
      openConcerns: derived.openConcerns,
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
      members: membersFor(relationship),
    }),
  )

  return [
    ...followUps.map((item) => ({ source: 'follow_up' as const, ...item })),
    ...needingAttention,
    ...badges,
  ]
}

/**
 * Built with a clock rather than reaching for one, because how long an item has
 * waited is a time-dependent rule like any other -- as is which ISO week it is,
 * which both counters are anchored to -- and the composition root is what decides
 * whose clock answers them.
 */
export const createSupabaseCareNeededReader = (clock: Clock = systemClock): CareNeededReader => ({
  async listCareNeeded(ministryId) {
    return readCareNeeded(await createSupabaseServerClient(), ministryId, clock)
  },

  async contactToShare(ministryId, person) {
    return readContactToShare(await createSupabaseServerClient(), ministryId, person)
  },
})
