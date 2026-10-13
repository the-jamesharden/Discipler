import { systemClock, type Clock } from '~/domain/clock'
import { isFollowUpKind } from '~/domain/follow-up'
import { personId } from '~/domain/ids'
import { AGE_BANDS, otherGoal, type AgeBand } from '~/domain/intake'
import {
  NOT_MEETING_WEEKS_BEFORE_STALLED,
  UNANSWERED_WEEKS_BEFORE_STALLED,
  weeksBehindTheStall,
} from '~/domain/relationship-state'
import { calendarDayOf } from '~/domain/week'
import type {
  CareNeededItem,
  CareNeededReader,
  FollowUpCard,
  FollowUpCareItem,
  FollowUpPage,
  CardSubject,
  Happening,
  PairCard,
} from '~/service/ports'
import { careNeededFrom, withPlacements } from './care-needed-reader'
import { adminPage, readPageDocument, type PageDocument } from './page'
import { pairCardFrom } from './pair-card-reader'
import {
  answersFrom,
  concernsFrom,
  historyOf,
  instant,
  namesFrom,
  pausesFrom,
  weeksFrom,
  type HistoryInputs,
} from './relationship-history'
import { rows, text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * The Follow-Up tab: the Care Needed list, and the card an item opens over it
 * (Pastor feedback, ticket 10).
 *
 * Each item is one button. Pressing it opens the pair card of ticket 07, or the
 * group card of ticket 08, at `?card=` in the fuller form only this tab draws:
 * every open item on it a band with today's actions, and *What has happened*
 * under the facts. An item about a Person and no live relationship opens a card
 * of its own, named by the item.
 *
 * One read, like every page: the list, the pair card and what the fuller card
 * adds come from one document, so the card cannot disagree with the item it was
 * opened from.
 */

/**
 * Which page function answers: the tab's own, or with a card open the one that
 * adds the card beside it. Still one read.
 */
export const followUpDocument = (
  card: string | null,
): [page: string, args?: Readonly<Record<string, unknown>>] =>
  card === null ? ['follow_up_page'] : ['follow_up_card_page', { card_id: card }]

/** The tab and the card the address names, out of one document. */
export const followUpPageFrom = (doc: PageDocument, clock: Clock, card: string | null): FollowUpPage => {
  const history = historyOf(doc)
  const items = withPlacements(careNeededFrom(history, clock), doc, history)
  const liveRelationships = new Set(
    history.relationships.flatMap((row) => {
      const id = text(row.id)
      return id !== null && instant(row.ended_at) === null ? [id] : []
    }),
  )
  return {
    items,
    liveRelationships,
    card: card === null ? null : followUpCardFrom(doc, history, items, card, clock),
  }
}

const ageBandOf = (value: unknown): AgeBand | null =>
  AGE_BANDS.find((band) => band === value) ?? null

/**
 * The card `key` names, or null where it names nothing this Admin may open: a
 * relationship that has ended or is another Ministry's, or an item that has been
 * resolved since.
 */
export const followUpCardFrom = (
  doc: PageDocument,
  history: HistoryInputs,
  items: readonly CareNeededItem[],
  key: string,
  clock: Clock,
): FollowUpCard | null => {
  const timeZone = history.timeZone
  if (!timeZone) return null

  const pair = pairCardFrom(doc, history, clock)
  const followUps = items.flatMap((item) => (item.source === 'follow_up' ? [item] : []))
  // A relationship's card carries every open item about it; an item's own card,
  // that item alone.
  const onIt = followUps.filter((item) => (pair ? item.relationshipId === key : item.id === key))
  if (!pair && onIt.length === 0) return null

  const extra = (doc.follow_up_card ?? {}) as Record<string, unknown>
  const nameOf = namesFrom(history)

  const subjects: CardSubject[] = rows(extra.subjects).flatMap((row) => {
    const who = text(row.person_id)
    const fullName = who ? nameOf.get(who) : undefined
    if (!who || !fullName) return []
    const typed = text(row.goal_other)
    return [
      {
        personId: personId(who),
        fullName,
        phone: text(row.phone),
        email: text(row.email),
        ageBand: ageBandOf(row.age_band),
        goal: text(row.goal),
        goalOther: typed === null ? null : otherGoal(typed),
      },
    ]
  })

  return {
    key,
    pair,
    items: onIt,
    subjects,
    happened: whatHasHappened({
      history,
      pair,
      items: onIt,
      earlier: rows(extra.earlier),
      earlierConcerns: rows(extra.earlier_concerns),
      now: clock.now(),
    }),
    timeZone,
  }
}

/**
 * *What has happened*, newest first, from the stored history and nothing else
 * (Pastor feedback, ticket 10). Exactly:
 *
 * - when each item on the card was raised and why: each open Follow-Up Item,
 *   each unresolved Concern, and the stall, dated by the week that crossed its
 *   threshold;
 * - the check-ins that led to it: the very weeks the stall was derived from
 *   (`weeksBehindTheStall`), and the week each unresolved Concern was answered
 *   D in;
 * - who read the Concern, and when: every reader on every day they read it, at
 *   the latest time that day, this opening included;
 * - the earlier items and Concerns, and who resolved them.
 *
 * Never the words of a Concern, which this never sees. Who opened the contact
 * details is not listed, because nothing records it: opening the card is the
 * reveal Nudge was, and Nudge recorded nothing (ADR-0010).
 */
export const whatHasHappened = ({
  history,
  pair,
  items,
  earlier,
  earlierConcerns,
  now,
}: {
  readonly history: HistoryInputs
  readonly pair: PairCard | null
  readonly items: readonly FollowUpCareItem[]
  readonly earlier: readonly Record<string, unknown>[]
  readonly earlierConcerns: readonly Record<string, unknown>[]
  readonly now: Date
}): readonly Happening[] => {
  const happened: Happening[] = items.map((item) => ({ kind: 'item_raised', at: item.raisedAt, item }))

  if (pair) {
    const id = pair.relationshipId

    for (const concern of pair.concerns) {
      happened.push({ kind: 'concern_raised', at: concern.raisedAt, by: concern.raisedByName })
    }
    // The reading this opening records, which the page makes after this read,
    // and every one recorded before it: one line per reader per day, at their
    // latest, so an Admin who opens the card five times one morning is one line
    // and not five.
    const readings = [
      ...(pair.concerns.length > 0 ? [{ at: now, by: pair.readerName }] : []),
      ...pair.readings.map((reading) => ({ at: reading.viewedAt, by: reading.viewerName })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime())
    const seen = new Set<string>()
    for (const reading of readings) {
      const key = `${reading.by ?? ''}|${history.timeZone ? calendarDayOf(reading.at, history.timeZone) : ''}`
      if (seen.has(key)) continue
      seen.add(key)
      happened.push({ kind: 'concern_read', ...reading })
    }

    // The D each unresolved Concern was raised from.
    for (const week of answersFrom(history)) {
      if (week.relationshipId === id && week.satisfaction === 'concern' && week.concernOpen) {
        happened.push({ kind: 'check_in', at: week.openedAt, outcome: 'concern' })
      }
    }

    const reason = pair.reasons[0]
    const row = history.relationships.find((each) => text(each.id) === id)
    if (reason && row && history.timeZone) {
      const run = weeksBehindTheStall(
        {
          acceptedAt: instant(row.accepted_at),
          endedAt: null,
          pausedAt: pausesFrom(history).get(id)?.pausedAt ?? null,
          timeZone: history.timeZone,
          weeks: weeksFrom(history).get(id) ?? [],
          concerns: concernsFrom(history).raised.get(id) ?? [],
        },
        now,
      )
      const silent = reason.kind === 'gone_silent'
      for (const week of run) {
        happened.push({ kind: 'check_in', at: week.openedAt, outcome: silent ? 'unanswered' : 'did_not_meet' })
      }
      // The week that crossed the threshold is when it began: the second
      // unanswered week once it closed, or the third answered as no meeting.
      const threshold = silent ? UNANSWERED_WEEKS_BEFORE_STALLED : NOT_MEETING_WEEKS_BEFORE_STALLED
      const crossing = run[threshold - 1]
      const at = crossing ? (silent ? crossing.closedAt : (crossing.answeredAt ?? crossing.closedAt)) : null
      if (at) happened.push({ kind: 'stalled', at, reason: reason.kind, weeks: threshold })
    }
  }

  for (const row of earlier) {
    const at = instant(row.raised_at)
    const resolvedAt = instant(row.resolved_at)
    if (!at || !resolvedAt || !isFollowUpKind(row.kind)) continue
    happened.push({
      kind: 'earlier_item',
      at,
      itemKind: row.kind,
      personName: text(row.person_name),
      resolvedAt,
      resolvedBy: text(row.resolver_name),
    })
  }

  for (const row of earlierConcerns) {
    const at = instant(row.raised_at)
    const resolvedAt = instant(row.resolved_at)
    if (!at || !resolvedAt) continue
    happened.push({
      kind: 'earlier_concern',
      at,
      raisedBy: text(row.raised_by_name),
      resolvedAt,
      resolvedBy: text(row.resolver_name),
    })
  }

  // Newest first; two things at the same instant keep the order above.
  return happened
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.at.getTime() - a.entry.at.getTime() || a.index - b.index)
    .map(({ entry }) => entry)
}

/**
 * Built with a clock rather than reaching for one, because how long an item has
 * waited is a time-dependent rule like any other -- as is which ISO week it is,
 * which both counters are anchored to -- and the composition root is what decides
 * whose clock answers them.
 */
export const createSupabaseCareNeededReader = (clock: Clock = systemClock): CareNeededReader => ({
  async readFollowUpPage(card) {
    const doc = await readPageDocument(await createSupabaseServerClient(), ...followUpDocument(card))
    return adminPage(doc, () => followUpPageFrom(doc, clock, card))
  },
})
