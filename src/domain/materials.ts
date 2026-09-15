import type { Branded } from './branded'
import type { MaterialId } from './ids'
import { readWording } from './wording'

/**
 * A Material Assignment is a period, not a column. The relationship was working
 * through one thing from a date until another date, and assigning a new Material
 * closes the previous period rather than overwriting it -- which is what makes
 * *what were they using in March* a question the data can still answer in
 * October.
 *
 * The history landed before anything read it, because it cannot be reconstructed
 * afterwards: a week whose Material nobody recorded is a week nothing can ever
 * recover, and getting it wrong silently invalidates every report built on top
 * of it later. The Ministry's own list -- what an Admin may create, change and
 * take off it -- is the second half of this module (`.scratch/materials/spec.md`).
 *
 * Nothing here touches a database. The periods come from `material_assignment`
 * and the list from `material`, which store facts; every rule about which period
 * a week belongs to, and about what an Admin may do to the list, is decided here,
 * where a test can drive a Material changing mid-week in a millisecond.
 */

/**
 * One period a relationship spent on one Material.
 *
 * `materialId` is null on exactly one period: the one acceptance opens, before
 * the Ministry has assigned anything. That is a real period with no Material in
 * it rather than an absence of rows -- a report asking what was in use that week
 * then gets *none*, which is a fact, instead of nothing at all, which is
 * indistinguishable from a defect.
 *
 * `endedAt` is null on the period that is still running. There is at most one.
 */
export interface MaterialPeriod {
  readonly materialId: MaterialId | null
  /** The Material's title, or null on the period with no Material. */
  readonly title: string | null
  readonly startedAt: Date
  /** Null while it is the period still running. */
  readonly endedAt: Date | null
}

/**
 * One relationship-week, as much of it as attribution needs: when the check-in
 * conversation covering it opened, and when the Leader first said something about
 * this relationship in it.
 *
 * Both are facts `relationship_weeks` already holds. The rule that picks between
 * them is below.
 */
export interface AttributableWeek {
  readonly openedAt: Date
  /**
   * The first reply that landed for this relationship in that conversation, or
   * null when none ever did. First rather than last: a check-in is several
   * messages -- did you meet, how was it -- and the moment the Leader started
   * reporting is the moment that names the meeting.
   */
  readonly firstAnsweredAt: Date | null
}

/**
 * The period an instant falls in, or null when it falls before the history
 * starts.
 *
 * Half-open, `[startedAt, endedAt)`. A period runs up to the instant its
 * successor begins and not through it, which is what makes an instant belong to
 * exactly one period at the boundary -- and what makes a zero-length period
 * contain no instant at all. That is not an edge case to tolerate but the reason
 * assigning a Material at the very instant of acceptance is permitted: the
 * opening period closes at its own start, covers nothing, and leaves no gap.
 *
 * Null before the first period begins. No check-in week exists before acceptance,
 * so an instant earlier than that is not a week whose Material went unrecorded --
 * it is an instant no meeting could have been reported in.
 *
 * The periods are not assumed to arrive in order. The database holds them
 * gapless and non-overlapping, so at most one can match however they are sorted,
 * and a caller who has not sorted them gets the same answer as one who has.
 */
export const materialInUseAt = (
  periods: readonly MaterialPeriod[],
  at: Date,
): MaterialPeriod | null =>
  periods.find(
    (period) =>
      at.getTime() >= period.startedAt.getTime() &&
      (period.endedAt === null || at.getTime() < period.endedAt.getTime()),
  ) ?? null

/**
 * The instant a week is attributed by.
 *
 * The rule is *the Material assigned at the moment the check-in was answered*,
 * because that is the meeting being reported on -- so an answered week is
 * attributed by its first answer, and one Material change mid-week moves the
 * whole week or none of it. A week is never divided between two.
 *
 * A week nobody answered has no such moment, and it still has to be attributed:
 * the history has to be complete, and an unanswered week is exactly the kind that
 * a later report must not silently drop. It falls back to the moment the
 * conversation covering it opened, which is the only instant that week is known
 * by.
 */
const attributedBy = (week: AttributableWeek): Date => week.firstAnsweredAt ?? week.openedAt

/**
 * Which Material a relationship-week belongs to.
 *
 * Never null for a week of an accepted relationship, which is the property the
 * opening period exists to hold: the answer for a week before anything was
 * assigned is a period saying *no Material*, not the absence of an answer.
 */
export const materialForWeek = (
  periods: readonly MaterialPeriod[],
  week: AttributableWeek,
): MaterialPeriod | null => materialInUseAt(periods, attributedBy(week))

// ---------------------------------------------------------------------------
// The Ministry's own list
// ---------------------------------------------------------------------------

/**
 * A title that has been through `readMaterialTitle` -- trimmed, its internal
 * whitespace collapsed, and not empty. Branded for the reason `GoalWording` is:
 * the difference between what an Admin typed into the box and the title a row
 * will carry is the whole of this module's input handling, and a plain `string`
 * loses it.
 */
export type MaterialTitle = Branded<string, 'MaterialTitle'>

/** At the platform edge, where the database is the authority on its own column. */
export const materialTitle = (value: string): MaterialTitle => value as MaterialTitle

/**
 * The title a Material will carry, or null where there is none. `readWording`'s
 * rule, shared with the Discipleship Goal options and the Ministry's own name:
 * `Romans  1-8` and `Romans 1-8` are one title, not two.
 */
export const readMaterialTitle = (raw: string): MaterialTitle | null =>
  readWording(raw) as MaterialTitle | null

/**
 * The text a Material will carry, or null where there is none. Trimmed at the
 * ends and nowhere else: the line breaks inside are the Ministry's own -- a plan
 * for the weeks is a list -- and the Leader is shown the text as written. A
 * form posts them as CRLF, which is the wire's spelling and not the Ministry's,
 * so they are stored as plain newlines whichever way they arrived.
 */
export const readMaterialBody = (raw: string | null | undefined): string | null => {
  const body = (raw ?? '').replace(/\r\n?/g, '\n').trim()
  return body === '' ? null : body
}

/** The uploaded file a Material carries: where it is in the bucket, and what it was called. */
export interface MaterialPdf {
  /** The object key, `<ministry_id>/<uuid>.pdf`. */
  readonly path: string
  /** What the Admin's file was called, so a download is handed back under it. */
  readonly filename: string
}

/**
 * One live Material as the Ministry holds it, with how many accepted, unended
 * relationships are working through it now. The count is what refuses a removal
 * and what the Remove card says, and it travels with the Material for the reason
 * `chosenBy` travels with a Discipleship Goal option: the number an Admin was
 * told is the number the rule decides on.
 */
export interface MaterialOnOffer {
  readonly id: MaterialId
  readonly title: MaterialTitle
  readonly body: string | null
  readonly pdf: MaterialPdf | null
  /** How many accepted, unended relationships' running period is on it. */
  readonly inUseBy: number
}

/**
 * Whether this Ministry already holds a live Material titled like this, ignoring
 * the Material being edited. Case-insensitive, stricter than the database's own
 * partial unique index: two folders differing only in capitalisation are one
 * Material to an Admin looking at the tab. The exception is what lets an Admin
 * correct a title's own capitalisation.
 */
export const titleAlreadyHeld = (
  materials: readonly MaterialOnOffer[],
  title: MaterialTitle,
  except?: MaterialId,
): boolean =>
  materials.some(
    (material) =>
      material.id !== except && material.title.toLocaleLowerCase() === title.toLocaleLowerCase(),
  )

/** The live Material this id names, or undefined where the Ministry offers no such thing. */
export const materialOnOffer = (
  materials: readonly MaterialOnOffer[],
  id: MaterialId,
): MaterialOnOffer | undefined => materials.find((material) => material.id === id)

/**
 * Whether a Material is a Material at all: text, a PDF, or both. A title pointing
 * at nothing would be assignable and would attribute weeks, and a Leader opening
 * it would find an empty page. The database refuses the same shape a second time.
 */
export const carriesSomething = (body: string | null, pdf: MaterialPdf | null): boolean =>
  body !== null || pdf !== null

/**
 * The largest PDF a Material may carry, in bytes. Named here rather than on the
 * page that says it, so the copy and the check cannot drift apart.
 */
export const LARGEST_PDF_BYTES = 20 * 1024 * 1024

/** The two ways an upload is refused before storage is touched. */
export type PdfUploadRefusal = 'material.pdf_only' | 'material.pdf_too_large'

/**
 * Whether a file an Admin chose may be stored as a Material's PDF. Checked from
 * what the browser said about the file, before a byte of it reaches the bucket:
 * a route refusing a 200 MB upload after storing it has already paid for it.
 */
export const readPdfUpload = (file: {
  readonly type: string
  readonly size: number
}): PdfUploadRefusal | null =>
  file.type !== 'application/pdf'
    ? 'material.pdf_only'
    : file.size > LARGEST_PDF_BYTES
      ? 'material.pdf_too_large'
      : null
