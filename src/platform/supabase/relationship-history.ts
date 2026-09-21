import type { Satisfaction } from '~/domain/check-in'
import { concernId, personId } from '~/domain/ids'
import { readStandingPause, type StandingPause } from '~/domain/pause'
import { countsAsLeading } from '~/domain/relationships'
import type { RaisedConcern, RelationshipWeek } from '~/domain/relationship-state'
import type { OutstandingConcern } from '~/service/ports'
import { list, section, type PageDocument } from './page'
import { rows, text } from './rows'

/**
 * One relationship's history, as every Admin surface that derives from it reads
 * it: who is in it, the weeks a Check-In Sequence covered it, the Pause standing
 * on it, and the Concerns raised beside it.
 *
 * These stood in the Care Needed reader until the Overview needed the same four
 * reads to run `deriveRelationshipState` over the same history -- and the ticket's
 * whole reason for reusing the derivation is that the two tabs cannot disagree
 * about which relationships are Stalled. Two copies of the reads would be two
 * places for that disagreement to start. So each read lives here once, and what
 * each surface does with the rows stays in that surface's file.
 *
 * Since a page became one read, the rows arrive together in the page's document
 * under `history` (`app.history_inputs` in the migration), read once per page
 * rather than once per surface, and the functions here parse them out of it. The
 * checks are the ones the separate reads had; only where the rows come from is
 * new.
 */

/**
 * Append one value to the list a key holds, making the list if it has none.
 * Written once because the alternative -- `map.set(k, [...(map.get(k) ?? []), v])`
 * -- was appearing at every grouping site and rebuilding the whole array each
 * time round the loop.
 */
export const gather = <T>(into: Map<string, T[]>, key: string, value: T): void => {
  const standing = into.get(key)
  if (standing) standing.push(value)
  else into.set(key, [value])
}

/** A timestamp column as a Date, or null where it holds nothing. */
export const instant = (value: unknown): Date | null =>
  typeof value === 'string' ? new Date(value) : null

/**
 * The `history` part of a page's document: the rows the derivations below read.
 * Each list is required to be present, and a document without one is raised on
 * rather than read as empty -- a Ministry with no weeks has an empty list, and a
 * page that was told nothing about weeks is a different thing from that.
 */
export interface HistoryInputs {
  /**
   * The Ministry's IANA zone, or null where the signed-in caller may not see the
   * Ministry at all. Every counter downstream is anchored to a week, and a week
   * is only a week against a zone; each surface decides for itself what an
   * unreachable Ministry reads as, and none guesses a zone.
   */
  readonly timeZone: string | null
  readonly relationships: readonly Record<string, unknown>[]
  readonly members: readonly Record<string, unknown>[]
  readonly people: readonly Record<string, unknown>[]
  readonly weeks: readonly Record<string, unknown>[]
  readonly concerns: readonly Record<string, unknown>[]
  readonly pauses: readonly Record<string, unknown>[]
  readonly answers: readonly Record<string, unknown>[]
  readonly followUps: readonly Record<string, unknown>[]
}

export const historyOf = (doc: PageDocument): HistoryInputs => {
  const history = section(doc, 'history')
  return {
    timeZone: text(history.timezone),
    relationships: list(history, 'relationships'),
    members: list(history, 'members'),
    people: list(history, 'people'),
    weeks: list(history, 'weeks'),
    concerns: list(history, 'concerns'),
    pauses: list(history, 'pauses'),
    answers: list(history, 'answers'),
    followUps: list(history, 'follow_ups'),
  }
}

/**
 * The one lookup the grouping reads share: a Person's name, by id. The `people`
 * rows are everyone the history's other rows point at, as the `person` policies
 * let the caller name them; a row without a usable name is left out rather than
 * carried forward as a placeholder, so a caller that gets no entry falls back on
 * its own wording.
 */
export const namesFrom = (history: HistoryInputs): Map<string, string> =>
  new Map(
    history.people.flatMap((row) => {
      const id = text(row.id)
      const name = text(row.full_name)
      return id !== null && name !== null ? [[id, name] as const] : []
    }),
  )

export interface RelationshipMembers {
  readonly leaders: string[]
  readonly participants: string[]
  /**
   * The same people with their ids, in the order the rows came back. Care Needed
   * needs the id to reveal one Person's number through the consent check; the
   * two name lists above are what the sentences are written from.
   */
  readonly people: { readonly personId: string; readonly fullName: string; readonly role: 'leader' | 'participant' }[]
}

export const NOBODY_IN_IT: RelationshipMembers = { leaders: [], participants: [], people: [] }

/**
 * Who is in each live relationship, by role, for the sentence a surface writes
 * about it. Open memberships only: somebody who has left is not who an Admin is
 * calling about.
 */
export const membersFrom = (
  history: HistoryInputs,
  nameOf: ReadonlyMap<string, string> = namesFrom(history),
): Map<string, RelationshipMembers> => {
  // When each relationship was activated, to say who leads it. A Discipler an
  // Admin added to a group that was already running is not one of its Leaders
  // until they accept (Manual pairing, ticket 22): the group's cards would
  // otherwise name somebody who has agreed to nothing as leading it.
  const activatedAt = new Map(
    history.relationships.flatMap((row) => {
      const id = text(row.id)
      return id === null ? [] : [[id, text(row.accepted_at)] as const]
    }),
  )

  const byRelationship = new Map<string, RelationshipMembers>()
  for (const row of history.members) {
    const relationship = text(row.relationship_id)
    const person = text(row.person_id)
    if (!relationship || !person) continue

    if (row.role === 'leader') {
      // A document without the key is drift, thrown like the rest of it: read as
      // absent it would name as a Leader somebody who has not accepted.
      if (row.accepted_at === undefined) {
        throw new Error('A membership in the history came back without its own acceptance')
      }
      const activated = activatedAt.get(relationship)
      if (activated === undefined) {
        throw new Error(`A membership in the history named a relationship that did not come back: ${relationship}`)
      }
      if (!countsAsLeading(activated, text(row.accepted_at))) continue
    }

    const side = byRelationship.get(relationship) ?? { leaders: [], participants: [], people: [] }
    const name = nameOf.get(person)
    const role = row.role === 'leader' ? 'leader' : 'participant'
    if (name) {
      ;(role === 'leader' ? side.leaders : side.participants).push(name)
      side.people.push({ personId: person, fullName: name, role })
    }
    byRelationship.set(relationship, side)
  }

  // The memberships come back in no promised order -- `history_inputs` asks for
  // none, and a heap hands rows back differently after an update -- so the names
  // a sentence is written from are sorted here. Otherwise the same group reads
  // "Wendy, Willa" on one load and "Willa, Wendy" on the next.
  for (const side of byRelationship.values()) {
    side.leaders.sort((a, b) => a.localeCompare(b))
    side.participants.sort((a, b) => a.localeCompare(b))
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
 * The ISO week each row falls in is computed downstream, against the Ministry's
 * own timezone, and the counting is left entirely to `deriveRelationshipState`.
 */
export const weeksFrom = (history: HistoryInputs): Map<string, RelationshipWeek[]> => {
  const byRelationship = new Map<string, RelationshipWeek[]>()
  for (const row of history.weeks) {
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
      // Null while the conversation is still running, which is what stops a week
      // being counted as silence the moment it opens.
      closedAt: instant(row.closed_at),
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
 * The Pause standing on each relationship right now, by relationship.
 *
 * A Pause is two events -- `relationship.paused` and `relationship.resumed` -- and
 * what stands is the later of them, which is a `distinct on` and not something
 * PostgREST can be asked for. So it comes through `relationship_pauses`, the same
 * kind of function `relationship_weeks` is, and the rule it feeds stays in
 * `deriveRelationshipState`.
 *
 * This read is what keeps a Leader on holiday out of the care queue. Without it
 * the derivation reads the weeks *before* the pause and reports a relationship
 * that was Stalled when it was paused as Stalled today -- which is the whole
 * condition the ticket exists to mask.
 *
 * Which is also why a drifted period is not quietly dropped here. `readStandingPause`
 * throws, exactly as it does on the command connection the tick runs on, so the two
 * cannot answer one bad row differently -- and the answer dropping it would give,
 * *this relationship is not paused*, is the wrong one shown confidently on the
 * surface that exists to stop exactly that. Compare the Follow-Up payload in the
 * Care Needed reader, which *is* dropped: an unrenderable item is one row, not a
 * rule that has stopped being true.
 */
export const pausesFrom = (history: HistoryInputs): Map<string, StandingPause> => {
  const byRelationship = new Map<string, StandingPause>()
  for (const row of history.pauses) {
    const relationship = text(row.relationship_id)
    const pausedAt = instant(row.paused_at)
    if (!relationship || !pausedAt) continue

    byRelationship.set(
      relationship,
      readStandingPause({ relationshipId: relationship, pausedAt, periodWeeks: row.period_weeks }),
    )
  }

  return byRelationship
}

/**
 * Every Concern this Ministry holds, resolved ones included: the derivation needs
 * the resolved ones to know they are no longer outstanding, and the unresolved
 * ones to know whether one was raised this week.
 *
 * `detail` is not among the columns and could not be read if it were -- the
 * authenticated role holds no grant on that column. The words are reached one at a
 * time through `CommandService.openConcern`, which records the viewing in the same
 * transaction that returns them.
 */
export const concernsFrom = (
  history: HistoryInputs,
  nameOf: ReadonlyMap<string, string> = namesFrom(history),
): {
  readonly raised: Map<string, RaisedConcern[]>
  readonly outstanding: Map<string, OutstandingConcern[]>
} => {
  const raised = new Map<string, RaisedConcern[]>()
  const outstanding = new Map<string, OutstandingConcern[]>()

  for (const row of history.concerns) {
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
 * One relationship-week with what the Leader answered, as
 * `public.relationship_week_answers` emits it: the rows `relationship_weeks`
 * emits, one for one, with the answers kept apart rather than folded into one
 * outcome.
 *
 * Kept apart because the Overview's three rates run over three different
 * denominators -- sent, answered, rated -- and the one outcome the Stalled rule
 * reads would conflate the meeting rate with the response rate. That conflation is
 * the specific thing the ticket says must not happen.
 */
export interface RelationshipWeekAnswer {
  readonly relationshipId: string
  readonly sequenceId: string
  /** When the conversation covering this relationship opened. */
  readonly openedAt: Date
  readonly closedAt: Date | null
  /** When its meeting question went out, or null where the conversation has not reached it. */
  readonly askedAt: Date | null
  /** The latest reply for this relationship in the conversation; null where none landed. */
  readonly answeredAt: Date | null
  readonly met: boolean | null
  readonly satisfaction: Satisfaction | null
  /** Whether a Concern raised from this relationship-week is still unresolved. */
  readonly concernOpen: boolean
}

const SATISFACTIONS: readonly Satisfaction[] = ['outstanding', 'good', 'concern']

/**
 * A `checkin_satisfaction` column as the domain's word for it, checked rather than
 * cast. A fourth value would mean the enum and the domain had drifted, and a rate
 * that quietly left it out of every bucket would be a wrong number on a screen
 * built to show that number.
 */
const satisfactionOf = (value: unknown): Satisfaction | null => {
  if (value === null || value === undefined) return null
  const known = SATISFACTIONS.find((candidate) => candidate === value)
  if (!known) {
    throw new Error(
      `A relationship-week arrived rated with a satisfaction this reader does not know: ${String(value)}`,
    )
  }
  return known
}

/**
 * Every relationship-week this Ministry has on record with what was answered for
 * it, in no particular order. The whole history, for the reason `weeksFrom` reads
 * the whole history: a rate over a quietly truncated denominator is a number
 * nothing on the screen could explain.
 *
 * Throws on a row it cannot read rather than leaving it out. A dropped row is a
 * denominator one short, which is the kind of wrong answer a rate cannot show.
 */
export const answersFrom = (history: HistoryInputs): readonly RelationshipWeekAnswer[] =>
  rows(history.answers).map((row) => {
    const relationshipId = text(row.relationship_id)
    const sequenceId = text(row.sequence_id)
    const openedAt = instant(row.opened_at)
    if (!relationshipId || !sequenceId || !openedAt) {
      throw new Error(
        `A relationship-week arrived without saying which relationship, which ` +
          `conversation or when: ${JSON.stringify(row)}`,
      )
    }

    const met = row.met
    if (met !== null && met !== undefined && typeof met !== 'boolean') {
      throw new Error(`A relationship-week arrived with a met that is not yes or no: ${String(met)}`)
    }

    return {
      relationshipId,
      sequenceId,
      openedAt,
      closedAt: instant(row.closed_at),
      askedAt: instant(row.asked_at),
      answeredAt: instant(row.answered_at),
      met: typeof met === 'boolean' ? met : null,
      satisfaction: satisfactionOf(row.satisfaction),
      concernOpen: row.concern_open === true,
    }
  })

/**
 * A stable order for the rows an Admin surface lists: by the Leaders' names, then
 * the Participants', then the id, so two relationships between the same people
 * cannot swap places between two reads. Not by urgency -- Care Needed is the
 * surface that ranks, and the tabs that sort by this are lists an Admin scans for
 * a name. Shared by the Overview, Check-Ins and the Materials folders, so three
 * tabs cannot order the same people three ways.
 */
export const byNames = <
  T extends {
    readonly leaderNames: readonly string[]
    readonly participantNames: readonly string[]
    readonly relationshipId: string
  },
>(
  a: T,
  b: T,
): number =>
  a.leaderNames.join(', ').localeCompare(b.leaderNames.join(', ')) ||
  a.participantNames.join(', ').localeCompare(b.participantNames.join(', ')) ||
  a.relationshipId.localeCompare(b.relationshipId)
