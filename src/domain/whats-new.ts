import type { MinistryId } from './ids'

/**
 * What's new (Exponential launch, ticket 30): short notes from the team about what
 * has changed in Discipler. The entries live in a file in the repo
 * (`app/help/whats-new.ts`), and each Admin dismisses them for themselves.
 */

export interface WhatsNewEntry {
  /** What a dismissal is stored against. Never reused, and never changed once shipped. */
  readonly id: string
  /** A calendar date, `YYYY-MM-DD`, read as that date wherever the reader is. */
  readonly date: string
  readonly title: string
  readonly sentence: string
  /** A Help page, or a part of one, to read further. */
  readonly readMore?: string
}

/**
 * One Admin saying they have seen one entry.
 *
 * A preference and not an act of ministry, so it writes no history: nothing about a
 * church's discipleship is any different for it, and nobody will ever need to ask
 * who closed a card and when.
 */
export interface WhatsNewDismissal {
  readonly ministryId: MinistryId
  /** The Admin's account, as the session named it. */
  readonly userId: string
  readonly entryId: string
  readonly dismissedAt: Date
}

/**
 * The entry the Overview card shows: the newest this Admin has not dismissed. An ISO
 * date sorts as its text, and two of the same date keep the file's order. A dismissal
 * of an entry since taken out of the file matches nothing and does no harm.
 */
export const newestUndismissed = (
  entries: readonly WhatsNewEntry[],
  dismissed: readonly string[],
): WhatsNewEntry | null =>
  entries
    .filter((entry) => !dismissed.includes(entry.id))
    .reduce<WhatsNewEntry | null>(
      (newest, entry) => (newest === null || entry.date > newest.date ? entry : newest),
      null,
    )
