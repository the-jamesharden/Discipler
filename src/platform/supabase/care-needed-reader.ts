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
  ContactDetails,
  FollowUpCareItem,
} from '~/service/ports'
import { contactDetailsFrom } from './contact-to-share'
import { adminPage, documentFor, readPageDocument, type PageDocument } from './page'
import {
  concernsFrom,
  historyOf,
  instant,
  membersFrom,
  namesFrom,
  NOBODY_IN_IT,
  pausesFrom,
  weeksFrom,
  type HistoryInputs,
} from './relationship-history'
import { text } from './rows'
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
 * scopes it to the Admin's Ministry: the page's document is read as the Admin,
 * and a Ministry an Admin does not belong to comes back empty whatever is asked.
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
 * The open Follow-Up Items, out of the page's history. Open items only, enforced
 * in the function that wrote the document: a resolved one leaves the view and
 * stays in the table, because how many care items a Ministry raised and how fast
 * it closed them is a question it should be able to ask later.
 *
 * The Person an item is about is named from the same `people` rows every other
 * derivation names from, and when its relationship was created comes from the
 * same `relationships` rows -- which is what the wait is computed from below.
 */
export const followUpItemsFrom = (
  history: HistoryInputs,
  clock: Clock,
  nameOf: ReadonlyMap<string, string> = namesFrom(history),
): readonly FollowUpCareItem[] => {
  const items = history.followUps.map(asItemRow)
  if (items.length === 0) return []

  const createdAtOf = new Map(
    history.relationships.flatMap((row) => {
      const id = text(row.id)
      const createdAt = instant(row.created_at)
      return id !== null && createdAt !== null ? [[id, createdAt] as const] : []
    }),
  )

  // Who an unanswered invitation is still waiting for, and whether the
  // relationship runs meanwhile. Sorted, because the memberships come back in no
  // promised order and a sentence is written from these.
  const activatedAtOf = new Map(
    history.relationships.flatMap((row) => {
      const id = text(row.id)
      return id === null ? [] : [[id, text(row.accepted_at)] as const]
    }),
  )
  const awaitingOn = (relationship: string) => ({
    names: history.members
      .filter(
        (row) =>
          text(row.relationship_id) === relationship &&
          row.role === 'leader' &&
          text(row.accepted_at) === null,
      )
      .flatMap((row) => {
        const name = nameOf.get(text(row.person_id) ?? '')
        return name ? [name] : []
      })
      .sort((a, b) => a.localeCompare(b)),
    running: (activatedAtOf.get(relationship) ?? null) !== null,
  })

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

    const awaiting =
      item.kind === 'relationship_unaccepted' && item.relationshipId
        ? awaitingOn(item.relationshipId)
        : null

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
        //
        // Not for somebody invited onto a relationship already running: its age
        // is not how long they have waited, and a group formed last year would
        // say so of a Leader added last week.
        waitedDays: createdAt && !awaiting?.running ? daysSince(createdAt, now) : null,
        awaiting,
        payload,
      },
    ]
  })
}

/**
 * The whole surface: the three sources, out of one page's history and one
 * reading of the clock, so two items in the same list cannot disagree about what
 * day it is or which week it is.
 */
export const careNeededFrom = (history: HistoryInputs, clock: Clock): readonly CareNeededItem[] => {
  // A Ministry an Admin does not belong to comes back with no zone, and there is
  // nothing to derive a week against. Empty rather than a guessed zone: every
  // counter below is anchored to one, and the wrong zone is a wrong answer.
  const timeZone = history.timeZone
  if (!timeZone) return []

  const now = clock.now()

  const nameOf = namesFrom(history)
  const followUps = followUpItemsFrom(history, clock, nameOf)
  const members = membersFrom(history, nameOf)
  const weeks = weeksFrom(history)
  const concerns = concernsFrom(history, nameOf)
  const pauses = pausesFrom(history)

  const namesFor = (relationship: string) => members.get(relationship) ?? NOBODY_IN_IT

  const membersFor = (relationship: string): CareMember[] =>
    namesFor(relationship).people.map((person) => ({
      personId: personId(person.personId),
      fullName: person.fullName,
      role: person.role,
    }))

  const needingAttention: CareNeededItem[] = []

  for (const row of history.relationships) {
    const id = text(row.id)
    if (!id) continue

    // The derivation throws when Stalled and Needs Care both hold, and that throw
    // is deliberately not caught. It would take the whole Care Needed view down
    // for this Ministry, which is the point: the condition is unreachable unless
    // something has started raising Concerns without answering the week, and the
    // failure this surface exists to prevent is a wrong answer shown confidently.
    // A dropped row would be exactly that. Compare the Follow-Up payload above,
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
 * The page's history for one Ministry, through whichever signed-in client it is
 * handed, or nothing where the session does not administer that Ministry. For
 * the tests that drive the derivations with a real session; see `documentFor`.
 */
export const historyFor = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  page: string = 'overview_page',
): Promise<HistoryInputs | null> => {
  const doc = await documentFor(supabase, ministryId, page)
  return doc ? historyOf(doc) : null
}

/** The open Follow-Up Items alone, for the tests that are about them. */
export const readOpenFollowUpItems = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
): Promise<readonly FollowUpCareItem[]> => {
  const history = await historyFor(supabase, ministryId)
  return history ? followUpItemsFrom(history, clock) : []
}

/** The whole surface, for the tests that drive it with a real session. */
export const readCareNeeded = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
): Promise<readonly CareNeededItem[]> => {
  const history = await historyFor(supabase, ministryId)
  return history ? careNeededFrom(history, clock) : []
}

/**
 * What `Nudge` revealed, out of the page's document: the row `contact_to_share`
 * gave for the one Person the reveal named, or null. No row is the answer, not a
 * failure: the Person has not agreed to share, or has no number, or is not
 * somebody this caller may ask about. The function does not distinguish them and
 * neither may this -- an Admin who could tell "withheld" from "no such Person"
 * would be reading consent by inference.
 */
const revealedFrom = (doc: PageDocument, person: string | null): ContactDetails | null => {
  const row = doc.reveal
  if (person === null || row === null || row === undefined) return null
  if (typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`Contact details for ${person} came back as something other than a row`)
  }
  return contactDetailsFrom(row as Record<string, unknown>, person)
}

/**
 * Built with a clock rather than reaching for one, because how long an item has
 * waited is a time-dependent rule like any other -- as is which ISO week it is,
 * which both counters are anchored to -- and the composition root is what decides
 * whose clock answers them.
 */
export const createSupabaseCareNeededReader = (clock: Clock = systemClock): CareNeededReader => ({
  async readFollowUpPage(reveal) {
    const doc = await readPageDocument(
      await createSupabaseServerClient(),
      'follow_up_page',
      reveal === null ? undefined : { reveal_person_id: reveal },
    )
    return adminPage(doc, () => ({
      items: careNeededFrom(historyOf(doc), clock),
      revealed: revealedFrom(doc, reveal),
    }))
  },

  async readSuggestedPairsPage() {
    const doc = await readPageDocument(await createSupabaseServerClient(), 'suggested_pairs_page')
    return adminPage(doc, () => ({ followUpCount: careNeededFrom(historyOf(doc), clock).length }))
  },
})
