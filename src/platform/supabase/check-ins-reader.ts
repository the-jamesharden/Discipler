import type { SupabaseClient } from '@supabase/supabase-js'
import { systemClock, type Clock } from '~/domain/clock'
import { concernId, relationshipId, type MinistryId, type RelationshipId } from '~/domain/ids'
import { isoWeekOf } from '~/domain/week'
import type {
  CheckInsPage,
  CheckInsReader,
  CheckInThisWeek,
  ThisWeeksAnswer,
  ThisWeeksCheckIns,
} from '~/service/ports'
import { careNeededFrom, historyFor } from './care-needed-reader'
import { adminPage, documentFor, list, readPageDocument, type PageDocument } from './page'
import { pairCardFrom } from './pair-card-reader'
import {
  answersFrom,
  byNames,
  historyOf,
  membersFrom,
  type HistoryInputs,
  type RelationshipWeekAnswer,
} from './relationship-history'
import { text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * The Check-Ins tab: this ISO week's relationship-weeks, one per relationship a
 * Check-In Sequence covered this week, with what the Leader answered.
 *
 * *This week* is the ISO week in the Ministry's own timezone, decided by the same
 * function the Stalled rule anchors on -- so a relationship-week the Overview
 * counts as completed this week is one this tab lists as answered, and neither
 * can drift from the cadence the Ministry is actually running.
 *
 * Nothing here carries Concern text, and nothing could: the rows come from
 * `relationship_week_answers`, which reads `concern.resolved_at` and no other
 * column of that table, and the authenticated role holds no grant on the words.
 * They are reached one Person at a time through `CommandService.openConcern`.
 */

/**
 * One entry per relationship, when a week holds two rows for one.
 *
 * Two sequences can cover one relationship inside one ISO week: a group with two
 * Leaders is asked in two conversations, and a cadence moved from late Sunday to
 * early Monday puts two prompts inside seven days. The list shows the relationship
 * once, and the later-answered row is the one shown -- the same rule
 * `oneEntryPerWeek` applies in `deriveRelationshipState`, restated here rather
 * than imported because that one resolves to an outcome and this one keeps the
 * answers. An answer of any kind beats a silence, and the later answer beats the
 * earlier.
 */
const oneEntryPerRelationship = (
  thisWeek: readonly RelationshipWeekAnswer[],
): readonly RelationshipWeekAnswer[] => {
  const byRelationship = new Map<string, RelationshipWeekAnswer>()

  for (const week of thisWeek) {
    const standing = byRelationship.get(week.relationshipId)
    const beatsIt =
      !standing ||
      (week.answeredAt !== null &&
        (standing.answeredAt === null ||
          week.answeredAt.getTime() >= standing.answeredAt.getTime()))

    if (beatsIt) byRelationship.set(week.relationshipId, week)
  }

  return [...byRelationship.values()]
}

/**
 * Every relationship-week of the ISO week `now` falls in, in the Ministry's zone.
 *
 * The whole history is read and this week is filtered out of it here rather than
 * in SQL, because *which week a row falls in* is a rule about time and every one
 * of those is decided by `isoWeekOf` against the Ministry's zone -- never by a
 * `date_trunc` in a query that would have to agree with it.
 */
const thisWeeksRows = (history: HistoryInputs, timeZone: string, now: Date): readonly RelationshipWeekAnswer[] => {
  const week = isoWeekOf(now, timeZone)
  return answersFrom(history).filter((row) => isoWeekOf(row.openedAt, timeZone) === week)
}

/**
 * The whole tab, out of one page's history and one reading of the clock.
 */
export const checkInsFrom = (history: HistoryInputs | null, clock: Clock): ThisWeeksCheckIns => {
  const now = clock.now()
  const timeZone = history?.timeZone ?? null

  // A Ministry the caller cannot see comes back with no zone to name a week
  // against. The port promises a week, so the header is named against UTC and the
  // list is empty -- there is no Ministry's week to be wrong about, since the
  // policies return nothing of it either way. Compare the Overview, whose empty
  // state carries no week and so needs no zone at all.
  if (!history || !timeZone) return { week: isoWeekOf(now, 'UTC'), sentAt: null, checkIns: [] }

  const week = isoWeekOf(now, timeZone)
  const members = membersFrom(history)
  const thisWeek = thisWeeksRows(history, timeZone, now)

  // When this week's first conversation opened -- the earliest of them, because a
  // Ministry with three Leaders has three conversations and the page prints one
  // *Sent* date, which is when the check-in went out.
  const sentAt = thisWeek.reduce<Date | null>(
    (earliest, row) =>
      earliest === null || row.openedAt.getTime() < earliest.getTime() ? row.openedAt : earliest,
    null,
  )

  const checkIns = oneEntryPerRelationship(thisWeek).map((row): CheckInThisWeek => {
    const { leaders, participants } = members.get(row.relationshipId) ?? {
      leaders: [],
      participants: [],
    }

    return {
      relationshipId: relationshipId(row.relationshipId),
      leaderNames: leaders,
      participantNames: participants,
      // When *this relationship's* question went out, which for a Leader's second
      // relationship is later than the conversation opened, and null while the
      // conversation has not reached it. The header's `sentAt` above is the other
      // instant; the two are different facts and the port keeps them apart.
      sentAt: row.askedAt,
      // The latest reply for the relationship in the conversation, which is the
      // moment its turn was finished -- the same reading `relationship_weeks`
      // gives, so the Overview's completed count and this list cannot disagree.
      answeredAt: row.answeredAt,
      met: row.met,
      satisfaction: row.satisfaction,
      concernOpen: row.concernOpen,
    }
  })

  return { week, sentAt, checkIns: checkIns.sort(byNames) }
}

/**
 * The whole tab against whichever signed-in client it is handed, for the tests
 * that drive it with a real session rather than a Next.js request context. The
 * Ministry named is the one the caller is asking about, and asking about one the
 * session does not administer reads as the empty week the policies would have
 * returned.
 */
export const readThisWeeksCheckIns = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
): Promise<ThisWeeksCheckIns> =>
  checkInsFrom(await historyFor(supabase, ministryId, 'check_ins_page'), clock)

/**
 * This week's answer for one relationship, as the row the list shows for it
 * says it, and the unresolved Concern that answer raised (Pastor feedback,
 * ticket 09). Null where nothing was answered for it this week.
 *
 * The Concern is the one whose words came in this same conversation:
 * `concernSequences` says, for each unresolved Concern on the card, which
 * conversation raised it, by the exact join `concern_open` makes, never by when
 * it was raised. A Concern from another week, or from a second conversation the
 * list did not show, keeps its own band on the card.
 */
export const thisWeeksAnswerFor = (
  relationship: RelationshipId,
  history: HistoryInputs,
  concernSequences: readonly Record<string, unknown>[],
  clock: Clock,
): ThisWeeksAnswer | null => {
  const timeZone = history.timeZone
  if (!timeZone) return null

  const row = oneEntryPerRelationship(
    thisWeeksRows(history, timeZone, clock.now()).filter((week) => week.relationshipId === relationship),
  )[0]
  if (!row?.answeredAt) return null

  const raised = concernSequences.find((each) => text(each.sequence_id) === row.sequenceId)
  const raisedId = raised ? text(raised.concern_id) : null
  return {
    answeredAt: row.answeredAt,
    met: row.met,
    satisfaction: row.satisfaction,
    concernId: raisedId ? concernId(raisedId) : null,
  }
}

/**
 * Which page function answers: the tab's own, or with a card open the one that
 * adds the card beside it (Pastor feedback, ticket 09). Still one read.
 */
export const checkInsDocument = (
  card: RelationshipId | null,
): [page: string, args?: Readonly<Record<string, unknown>>] =>
  card === null ? ['check_ins_page'] : ['check_ins_card_page', { card_relationship_id: card }]

/** The tab, the badge's number and the card the address names, out of one document. */
export const checkInsPageFrom = (doc: PageDocument, clock: Clock): CheckInsPage => {
  const history = historyOf(doc)
  const card = pairCardFrom(doc, history, clock)
  return {
    week: checkInsFrom(history, clock),
    followUpCount: careNeededFrom(history, clock).length,
    card,
    cardThisWeek: card
      ? thisWeeksAnswerFor(card.relationshipId, history, list(doc, 'card_concern_sequences'), clock)
      : null,
  }
}

/**
 * The tab with a card open, against whichever signed-in client it is handed, for
 * the tests that drive it with a real session; null where the session does not
 * administer the Ministry named.
 */
export const readCheckInsWithACard = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  card: RelationshipId,
  clock: Clock,
): Promise<CheckInsPage | null> => {
  const doc = await documentFor(supabase, ministryId, ...checkInsDocument(card))
  return doc ? checkInsPageFrom(doc, clock) : null
}

/**
 * Built with a clock rather than reaching for one, because which ISO week it is
 * is a time-dependent rule like any other, and the composition root is what
 * decides whose clock answers it. The badge's number and the card derive from
 * the same document as the week, so none of them can be read at a different
 * moment.
 */
export const createSupabaseCheckInsReader = (clock: Clock = systemClock): CheckInsReader => ({
  async readCheckInsPage(card: RelationshipId | null = null) {
    const doc = await readPageDocument(await createSupabaseServerClient(), ...checkInsDocument(card))
    return adminPage(doc, () => checkInsPageFrom(doc, clock))
  },
})
