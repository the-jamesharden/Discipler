import type { SupabaseClient } from '@supabase/supabase-js'
import { daysSince, systemClock, type Clock } from '~/domain/clock'
import { relationshipId, type MinistryId } from '~/domain/ids'
import { NO_CHECK_INS, type CheckInCounts } from '~/domain/overview'
import { deriveRelationshipState } from '~/domain/relationship-state'
import { ACCEPTANCE_ESCALATION_DAYS } from '~/domain/relationships'
import { isoWeekOf } from '~/domain/week'
import type { Overview, OverviewReader, OverviewRelationship } from '~/service/ports'
import { careNeededFrom, historyFor } from './care-needed-reader'
import { adminPage, readPageDocument } from './page'
import {
  answersFrom,
  byNames,
  concernsFrom,
  historyOf,
  instant,
  membersFrom,
  namesFrom,
  pausesFrom,
  weeksFrom,
  type HistoryInputs,
  type RelationshipWeekAnswer,
} from './relationship-history'
import { text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * The Overview tab: every live relationship with the state its history derives,
 * the two headcounts, and the three rates over every relationship-week on record.
 *
 * The state is `deriveRelationshipState` over exactly the history Care Needed
 * reads -- the same rows, from the same document -- so the two tabs cannot
 * disagree about which relationships are Stalled. The rates come from a second
 * function, `relationship_week_answers`, that emits the same rows as
 * `relationship_weeks` with the answers kept apart rather than folded into one
 * outcome, because the response rate and the meeting rate run over different
 * denominators and must not be conflated.
 *
 * Read through the signed-in client, so the policies are what scope it to the
 * Admin's Ministry: the page's document is read as the Admin, and a Ministry an
 * Admin does not belong to comes back empty whatever is asked.
 */

/**
 * What an empty Ministry reads as, and what a Ministry the caller cannot see
 * reads as: zeros, 0% and nothing listed. The honest empty state the tab
 * promises, rather than a failure -- there is nothing wrong with a Ministry that
 * has nobody on the Roster yet.
 */
const NOTHING_YET: Overview = {
  relationships: [],
  unsurfacedUnaccepted: 0,
  active: 0,
  paused: 0,
  counts: NO_CHECK_INS,
  completedThisWeek: 0,
}

/**
 * The counts over every relationship-week on record, with the three denominators
 * kept apart. A relationship-week is counted as sent because a sequence covered
 * it, whether or not its question was ever reached -- the same reading of *sent*
 * the Stalled rule uses, so the denominator here is the denominator there.
 */
const countsOf = (answers: readonly RelationshipWeekAnswer[]): CheckInCounts => {
  const rated = { outstanding: 0, good: 0, concern: 0 }
  let answered = 0
  let held = 0

  for (const week of answers) {
    if (week.answeredAt !== null) answered += 1
    if (week.met === true) held += 1
    if (week.satisfaction !== null) rated[week.satisfaction] += 1
  }

  return { sent: answers.length, answered, held, rated }
}

/**
 * The whole tab, out of one page's history and one reading of the clock.
 */
export const overviewFrom = (history: HistoryInputs, clock: Clock): Overview => {
  // A Ministry an Admin does not belong to comes back with no zone, and there is
  // nothing to derive a week against. The empty state rather than a guessed zone:
  // every counter below is anchored to one, and the wrong zone is a wrong answer.
  const timeZone = history.timeZone
  if (!timeZone) return NOTHING_YET

  // Once for the whole tab, so the cards and the counts cannot disagree about what
  // day it is or which week it is -- and from the injected clock, like every other
  // time-dependent rule in this codebase.
  const now = clock.now()
  const thisWeek = isoWeekOf(now, timeZone)

  const nameOf = namesFrom(history)
  const members = membersFrom(history, nameOf)
  const weeks = weeksFrom(history)
  const concerns = concernsFrom(history, nameOf)
  const pauses = pausesFrom(history)
  const answers = answersFrom(history)

  const relationships: OverviewRelationship[] = []
  let unsurfacedUnaccepted = 0
  let active = 0
  let paused = 0

  for (const row of history.relationships) {
    const id = text(row.id)
    const createdAt = instant(row.created_at)
    // Both columns are not-null in the schema. A row arriving without either is
    // the reader and the table having drifted apart, and a card silently left off
    // a list an Admin reads as *everyone* is the wrong answer shown confidently.
    if (!id || !createdAt) {
      throw new Error(`A relationship arrived with no id or no created_at: ${JSON.stringify(row)}`)
    }

    const acceptedAt = instant(row.accepted_at)
    const endedAt = instant(row.ended_at)

    // Ended is terminal and the Overview is about what is going on now. Ended
    // relationships keep their weeks in the counts below -- the rates run over
    // every relationship-week on record -- but get no card and no headcount.
    if (endedAt !== null) continue

    // An unaccepted relationship is included only once it has waited the five days
    // ticket 07 surfaces it at. Before that it is the Leader's to answer and not
    // yet the Admin's to chase, and the page prints how many are still in that
    // window rather than pretending they do not exist.
    if (acceptedAt === null && daysSince(createdAt, now) < ACCEPTANCE_ESCALATION_DAYS) {
      unsurfacedUnaccepted += 1
      continue
    }

    const standingPause = pauses.get(id) ?? null

    // The derivation throws when Stalled and Needs Care both hold, and that throw
    // is deliberately not caught, for the reason the Care Needed reader gives: the
    // condition is unreachable unless something has started raising Concerns
    // without answering the week, and a dropped card would be a wrong answer shown
    // confidently on the tab that exists to show the whole Ministry.
    const derived = deriveRelationshipState(
      {
        acceptedAt,
        endedAt,
        // `Paused` masks whatever the history would otherwise derive, exactly as
        // it does on Care Needed, so a Leader on holiday reads as Paused here and
        // as nothing there.
        pausedAt: standingPause?.pausedAt ?? null,
        timeZone,
        weeks: weeks.get(id) ?? [],
        concerns: concerns.raised.get(id) ?? [],
      },
      now,
    )

    // The two headcounts, off the facts rather than off the derived state. Active
    // is accepted, not paused, not ended; Paused is a standing Pause on something
    // that has not ended. Today the derivation says the same thing for every row
    // that reaches here, and stating the definitions the ticket gives keeps the
    // tiles honest the day it does not.
    if (standingPause !== null) paused += 1
    else if (acceptedAt !== null) active += 1

    const { leaders, participants } = members.get(id) ?? { leaders: [], participants: [] }
    relationships.push({
      relationshipId: relationshipId(id),
      leaderNames: leaders,
      participantNames: participants,
      acceptedAt,
      state: derived.state,
      reasons: derived.reasons,
      openConcerns: derived.openConcerns,
    })
  }

  // Which ISO week a relationship-week falls in is decided against the Ministry's
  // own zone, by the same function the Stalled rule anchors on, so *this week* on
  // the Overview is the week the cadence is running in and not the server's.
  const completedThisWeek = answers.filter(
    (week) => week.answeredAt !== null && isoWeekOf(week.openedAt, timeZone) === thisWeek,
  ).length

  return {
    relationships: relationships.sort(byNames),
    unsurfacedUnaccepted,
    active,
    paused,
    counts: countsOf(answers),
    completedThisWeek,
  }
}

/**
 * The whole tab against whichever signed-in client it is handed, for the tests
 * that drive it with a real session rather than a Next.js request context. The
 * Ministry named is the one the caller is asking about, and asking about one the
 * session does not administer reads as the empty state the policies would have
 * returned.
 */
export const readOverview = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
): Promise<Overview> => {
  const history = await historyFor(supabase, ministryId)
  return history ? overviewFrom(history, clock) : NOTHING_YET
}

/**
 * Built with a clock rather than reaching for one, because how long an unaccepted
 * relationship has waited is a time-dependent rule like any other -- as is which
 * ISO week it is, which the this-week count is anchored to -- and the composition
 * root is what decides whose clock answers them.
 *
 * One read for the tab, the Care Needed list its cards are flagged from and the
 * number on the Follow-Up badge: all three derive from the same document, so the
 * tile, the badge and the flag lines cannot disagree.
 */
export const createSupabaseOverviewReader = (clock: Clock = systemClock): OverviewReader => ({
  async readOverviewPage() {
    const doc = await readPageDocument(await createSupabaseServerClient(), 'overview_page')
    return adminPage(doc, () => {
      const history = historyOf(doc)
      return { overview: overviewFrom(history, clock), care: careNeededFrom(history, clock) }
    })
  },
})
