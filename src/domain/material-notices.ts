import type { MaterialId, PersonId, RelationshipId } from './ids'
import { QUIET_HOURS } from './ministry-settings'
import { calendarDayOf, localHourOf } from './week'

/**
 * The text a person gets when the Material they are working through changes
 * (`.scratch/richer-materials/spec.md`, *The change text*; Richer materials,
 * tickets 03 and 04).
 *
 * Decided by James on 2026-09-24: one text per person, sent once nothing that
 * feeds it has changed for an hour, at most once a day, saying where things
 * ended up rather than what happened on the way. An Admin who assigns, edits,
 * changes their mind and puts it back has sent nobody anything.
 *
 * Nothing here reads a clock or a table. The tick hands over, for each person,
 * every relationship of theirs with what is running now, what they were last
 * told, and when either last changed; the rule is decided here, where a test can
 * make an afternoon of edits pass in a millisecond.
 */

/** How long nothing may have changed before a text goes: an Admin at work is not interrupted mid-thought. */
export const QUIET_MINUTES_BEFORE_A_MATERIAL_TEXT = 60

/**
 * A Material as far as a text is concerned: which one, and a fingerprint of what
 * it holds. The fingerprint is of the text and the items and not of the title,
 * so a corrected title sends nobody anything. Null Material is none at all.
 */
export interface MaterialAsTold {
  readonly materialId: MaterialId | null
  /** Opaque, from the database. Null where there is no Material. */
  readonly fingerprint: string | null
}

/** Nothing: what a person who has never been told anything was told. */
const NOTHING: MaterialAsTold = { materialId: null, fingerprint: null }

/** One relationship of one person's, as the tick reads it. */
export interface MaterialStanding {
  readonly relationshipId: RelationshipId
  readonly role: 'leader' | 'participant'
  /** A paused relationship's change waits for the resume. */
  readonly paused: boolean
  /** What it is working through now. */
  readonly running: MaterialAsTold & { readonly title: string | null }
  /** What this person was last told about it, or null where they never were. */
  readonly told: MaterialAsTold | null
  /**
   * The last moment anything feeding it changed: the running period's start, or
   * the last edit of the Material it is on. Null where nothing ever has.
   */
  readonly changedAt: Date | null
  /** The Leaders' names, as the Starter Message lists them; read for a Participant's text. */
  readonly leaderNames: readonly string[]
}

/** One person the tick may text. */
export interface MaterialRecipient {
  readonly personId: PersonId
  readonly phone: string | null
  /** When they were last sent a Material text, or null where never. */
  readonly lastTextedAt: Date | null
  readonly standings: readonly MaterialStanding[]
}

/** What a text says, before it is worded. */
export type MaterialText =
  | { readonly kind: 'leader_moved'; readonly title: string }
  | { readonly kind: 'leader_updated'; readonly title: string }
  | { readonly kind: 'leader_several'; readonly count: number }
  | { readonly kind: 'leader_none' }
  | {
      readonly kind: 'participant_moved'
      readonly title: string
      readonly leaderNames: readonly string[]
      readonly relationshipId: RelationshipId
    }
  | {
      readonly kind: 'participant_updated'
      readonly title: string
      readonly relationshipId: RelationshipId
    }

/** What the tick does for one person: a text or none, and what they are now recorded as told. */
export interface MaterialNotice {
  readonly personId: PersonId
  readonly phone: string | null
  readonly text: MaterialText | null
  readonly told: readonly MaterialStanding[]
}

/** Whether what is running differs from what this person was last told. */
export const hasPendingChange = (standing: MaterialStanding): boolean => {
  const told = standing.told ?? NOTHING
  if (standing.running.materialId !== told.materialId) return true
  return standing.running.materialId !== null && standing.running.fingerprint !== told.fingerprint
}

/**
 * Every notice due now, one per person at most. A person is skipped when any of
 * their changes is still less than an hour old, when it is outside the hours a
 * check-in may be sent in, or when they have already had a Material text today;
 * a Participant moved to no Material is recorded as told and sent nothing, and
 * that needs neither the hours nor the day (James, 2026-09-24, Q6).
 */
export const materialNoticesDue = (
  recipients: readonly MaterialRecipient[],
  now: Date,
  timeZone: string,
): readonly MaterialNotice[] => {
  const quietSince = now.getTime() - QUIET_MINUTES_BEFORE_A_MATERIAL_TEXT * 60 * 1000
  const hour = localHourOf(now, timeZone)
  const inHours = hour >= QUIET_HOURS.earliest && hour <= QUIET_HOURS.latest
  const today = calendarDayOf(now, timeZone)

  return recipients.flatMap((recipient): MaterialNotice[] => {
    const pending = recipient.standings.filter(
      (standing) => !standing.paused && hasPendingChange(standing),
    )
    if (pending.length === 0) return []

    // Where things ended up, which is only known once they have stopped moving.
    // One change still settling holds all of them: the text is one text.
    const settled = pending.every(
      (standing) => standing.changedAt === null || standing.changedAt.getTime() <= quietSince,
    )
    if (!settled) return []

    // Nothing to open: recorded as told, and no text.
    const toNothing = pending.filter(
      (standing) => standing.role === 'participant' && standing.running.materialId === null,
    )
    const textable =
      inHours &&
      (recipient.lastTextedAt === null || calendarDayOf(recipient.lastTextedAt, timeZone) !== today)

    const leading = pending.filter((standing) => standing.role === 'leader')
    const discipled = pending
      .filter((standing) => standing.role === 'participant' && standing.running.materialId !== null)
      // The most recent first: one text links one page, and the rest wait a day.
      .sort((a, b) => (b.changedAt?.getTime() ?? 0) - (a.changedAt?.getTime() ?? 0))

    let text: MaterialText | null = null
    let covered: readonly MaterialStanding[] = []
    if (textable && leading.length > 0) {
      // A Leader's dashboard shows every relationship they lead, so one text
      // covers them all. Their own discipleship, if they have one changing too,
      // waits for another day.
      text = leaderText(leading)
      covered = leading
    } else if (textable && discipled.length > 0) {
      const [first] = discipled
      text = participantText(first!)
      covered = [first!]
    }

    const told = [...covered, ...toNothing]
    return told.length === 0 ? [] : [{ personId: recipient.personId, phone: recipient.phone, text, told }]
  })
}

const leaderText = (leading: readonly MaterialStanding[]): MaterialText => {
  if (leading.length > 1) return { kind: 'leader_several', count: leading.length }
  const [only] = leading
  if (only!.running.materialId === null || only!.running.title === null) return { kind: 'leader_none' }
  return only!.told?.materialId === only!.running.materialId
    ? { kind: 'leader_updated', title: only!.running.title }
    : { kind: 'leader_moved', title: only!.running.title }
}

const participantText = (standing: MaterialStanding): MaterialText => {
  const title = standing.running.title ?? ''
  return standing.told?.materialId === standing.running.materialId
    ? { kind: 'participant_updated', title, relationshipId: standing.relationshipId }
    : {
        kind: 'participant_moved',
        title,
        leaderNames: standing.leaderNames,
        relationshipId: standing.relationshipId,
      }
}
