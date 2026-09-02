import type { SupabaseClient } from '@supabase/supabase-js'
import { systemClock, type Clock } from '~/domain/clock'
import { relationshipId, type MinistryId } from '~/domain/ids'
import { isoWeekOf } from '~/domain/week'
import type { CheckInsReader, CheckInThisWeek, ThisWeeksCheckIns } from '~/service/ports'
import {
  answersOf,
  membersOf,
  timeZoneOf,
  type RelationshipWeekAnswer,
} from './relationship-history'
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
 * How every read in this file fails. Three queries, one screen, one message;
 * which of them fell over is a server-log question rather than a screen one.
 */
const couldNotRead = (error: { readonly message: string }): Error =>
  new Error(`Could not read this week's Check-Ins: ${error.message}`)

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
 * A stable order for the columns: by the Leaders' names, then the Participants',
 * then the id, so two reads in one week list the same rows the same way round.
 */
const byNames = (a: CheckInThisWeek, b: CheckInThisWeek): number =>
  a.leaderNames.join(', ').localeCompare(b.leaderNames.join(', ')) ||
  a.participantNames.join(', ').localeCompare(b.participantNames.join(', ')) ||
  a.relationshipId.localeCompare(b.relationshipId)

/**
 * The whole tab, against whichever signed-in client it is handed and one reading
 * of the clock. Separated from the reader below so a test can drive it with a
 * real session rather than a Next.js request context.
 */
export const readThisWeeksCheckIns = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
): Promise<ThisWeeksCheckIns> => {
  const now = clock.now()
  const timeZone = await timeZoneOf(supabase, ministryId, couldNotRead)

  // A Ministry the caller cannot see comes back empty from the policy, with no
  // zone to name a week against. The port promises a week, so the header is named
  // against UTC and the list is empty -- there is no Ministry's week to be wrong
  // about, since the policies return nothing of it either way. Compare the
  // Overview, whose empty state carries no week and so needs no zone at all.
  if (!timeZone) return { week: isoWeekOf(now, 'UTC'), sentAt: null, checkIns: [] }

  const week = isoWeekOf(now, timeZone)

  const [answers, members] = await Promise.all([
    answersOf(supabase, ministryId, couldNotRead),
    membersOf(supabase, ministryId, couldNotRead),
  ])

  // The whole history is read and this week is filtered out of it here rather than
  // in SQL, because *which week a row falls in* is a rule about time and every one
  // of those is decided by `isoWeekOf` against the Ministry's zone -- never by a
  // `date_trunc` in a query that would have to agree with it.
  const thisWeek = answers.filter((row) => isoWeekOf(row.openedAt, timeZone) === week)

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
 * Built with a clock rather than reaching for one, because which ISO week it is
 * is a time-dependent rule like any other, and the composition root is what
 * decides whose clock answers it.
 */
export const createSupabaseCheckInsReader = (clock: Clock = systemClock): CheckInsReader => ({
  async readThisWeeksCheckIns(ministryId) {
    return readThisWeeksCheckIns(await createSupabaseServerClient(), ministryId, clock)
  },
})
