import type { Branded } from './branded'
import type { MaterialId, MaterialItemId } from './ids'
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
 * `materialId` is null on the period acceptance opens, before the Ministry has
 * assigned anything, and on any later one an Admin opened by un-assigning
 * (Materials, ticket 03). That is a real period with no Material in it rather
 * than an absence of rows -- a report asking what was in use that week
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

// ---------------------------------------------------------------------------
// What a Material holds (Richer materials, ticket 01)
// ---------------------------------------------------------------------------

/**
 * One kind of file a Material may hold. The extension decides, not whatever the
 * browser guessed: a browser names a `.docx` three different ways and a `.heic`
 * not at all, so the upload is sent under the type this list gives its extension
 * and the bucket's own allowed list is these types exactly.
 */
export interface MaterialFileType {
  readonly extension: string
  readonly contentType: string
  /** What a screen calls it beside the filename. */
  readonly kind: string
}

/**
 * Planning Center's list, chosen by James on 2026-09-24: documents, images, audio
 * and video. The migration that gave the bucket its limits holds the same types.
 */
export const MATERIAL_FILE_TYPES: readonly MaterialFileType[] = [
  { extension: 'pdf', contentType: 'application/pdf', kind: 'PDF' },
  { extension: 'doc', contentType: 'application/msword', kind: 'Word document' },
  {
    extension: 'docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'Word document',
  },
  { extension: 'txt', contentType: 'text/plain', kind: 'Text' },
  { extension: 'rtf', contentType: 'application/rtf', kind: 'Rich text' },
  { extension: 'jpg', contentType: 'image/jpeg', kind: 'Image' },
  { extension: 'jpeg', contentType: 'image/jpeg', kind: 'Image' },
  { extension: 'png', contentType: 'image/png', kind: 'Image' },
  { extension: 'gif', contentType: 'image/gif', kind: 'Image' },
  { extension: 'webp', contentType: 'image/webp', kind: 'Image' },
  { extension: 'heic', contentType: 'image/heic', kind: 'Image' },
  { extension: 'mp3', contentType: 'audio/mpeg', kind: 'Audio' },
  { extension: 'm4a', contentType: 'audio/mp4', kind: 'Audio' },
  { extension: 'wav', contentType: 'audio/wav', kind: 'Audio' },
  { extension: 'mp4', contentType: 'video/mp4', kind: 'Video' },
  { extension: 'mov', contentType: 'video/quicktime', kind: 'Video' },
  { extension: 'webm', contentType: 'video/webm', kind: 'Video' },
]

/** The file type a filename's extension names, or null where a Material may not hold it. */
export const fileTypeNamed = (filename: string): MaterialFileType | null => {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return null
  const extension = filename.slice(dot + 1).toLowerCase()
  return MATERIAL_FILE_TYPES.find((type) => type.extension === extension) ?? null
}

/** The file type a stored object's content type is, or null where it is none of them. */
export const fileTypeOf = (contentType: string): MaterialFileType | null =>
  MATERIAL_FILE_TYPES.find((type) => type.contentType === contentType) ?? null

/**
 * The largest file a Material may hold, in bytes. Named here rather than on the
 * page that says it, so the copy, the check and the bucket's own limit cannot
 * drift apart.
 */
export const LARGEST_FILE_BYTES = 50 * 1024 * 1024

/**
 * The most files and links one Material may hold. A study is a guide, a video
 * a week and a reading plan; twenty is room for that and a ceiling on a list no
 * Leader would scroll.
 */
export const MOST_ITEMS = 20

/** A file a Material holds: where it is in the bucket, and what Storage said about it. */
export interface MaterialFile {
  readonly kind: 'file'
  /** The object key, `<ministry_id>/<uuid>.<ext>`. */
  readonly path: string
  /** What the Admin's file was called, so a download is handed back under it. */
  readonly filename: string
  /** As Storage holds it, read back after the upload rather than taken from the form. */
  readonly contentType: string
  readonly bytes: number
}

/** A link a Material holds: an address and, optionally, what to call it. */
export interface MaterialLink {
  readonly kind: 'link'
  readonly url: string
  /** Null where the Admin named it nothing; the screens then show the site's address. */
  readonly label: string | null
}

/** One file or link, as the Material holds it: in its place in the order. */
export type MaterialItem = (MaterialFile | MaterialLink) & {
  readonly id: MaterialItemId
  readonly position: number
}

/** The ways an item is refused, before or after its upload. */
export type ItemRefusal =
  | 'material.file_type'
  | 'material.file_too_large'
  | 'material.link_unreadable'

/**
 * Whether a file an Admin chose may be uploaded at all, from its name and size,
 * before a signed upload address is minted for it. The same rule runs again on
 * what Storage says it holds, in `readStoredFile`, because a browser can be told
 * anything.
 */
export const readUpload = (file: {
  readonly filename: string
  readonly bytes: number
}): 'material.file_type' | 'material.file_too_large' | null =>
  fileTypeNamed(file.filename) === null
    ? 'material.file_type'
    : file.bytes > LARGEST_FILE_BYTES
      ? 'material.file_too_large'
      : null

/** Whether a stored object may be one of a Material's files, from what Storage says it is. */
export const readStoredFile = (
  file: MaterialFile,
): 'material.file_type' | 'material.file_too_large' | null =>
  fileTypeOf(file.contentType) === null
    ? 'material.file_type'
    : file.bytes > LARGEST_FILE_BYTES
      ? 'material.file_too_large'
      : null

/**
 * A link as a Material will hold it, or null where the address is not one. Only
 * `http` and `https`: a `javascript:` address on a Leader's screen is a script
 * somebody else wrote, and a `mailto:` or a bare `www.` is not somewhere a
 * button can take anybody. The label is trimmed and collapsed like a title, and
 * a blank one is no label.
 */
export const readMaterialLink = (raw: {
  readonly url: string
  readonly label: string | null
}): MaterialLink | null => {
  const typed = raw.url.trim()
  let url: URL
  try {
    url = new URL(typed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (/\s/.test(typed) || url.hostname === '') return null
  return { kind: 'link', url: typed, label: readWording(raw.label ?? '') }
}

/**
 * The address a link is shown by when it has no label: the host, without a
 * leading `www.`. `https://www.youtube.com/watch?v=...` is *youtube.com* on a
 * Leader's screen, which is what they need to know before tapping it.
 */
export const linkHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A link with more said about it: the host and the path, as the edit page shows an address. */
export const linkAddress = (url: string): string => {
  try {
    const parsed = new URL(url)
    const rest = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`
    return `${parsed.hostname.replace(/^www\./, '')}${rest}`
  } catch {
    return url
  }
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
  /** Its files and links, in order. */
  readonly items: readonly MaterialItem[]
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
 * Whether a Material is a Material at all: text, a file or link, or both. A
 * title pointing at nothing would be assignable and would attribute weeks, and a
 * Leader opening it would find an empty page. The database refuses the same
 * shape a second time.
 */
export const carriesSomething = (body: string | null, items: readonly unknown[]): boolean =>
  body !== null || items.length > 0

/**
 * How long an upload nobody saved is kept before it is swept. A day covers an
 * Admin who uploaded, was refused over a title and came back after lunch; past
 * that, a file no Material names is a file nobody will.
 */
export const UNSAVED_UPLOAD_HOURS = 24

/**
 * The objects in a Ministry's folder that no Material names and that have sat
 * there longer than `UNSAVED_UPLOAD_HOURS`. A browser uploads a file the moment
 * it is chosen, and the form it was chosen on may never be saved; this is what
 * keeps the bucket from filling with those.
 */
export const abandonedUploads = (
  objects: readonly { readonly path: string; readonly createdAt: Date }[],
  named: ReadonlySet<string>,
  now: Date,
): readonly string[] =>
  objects
    .filter(
      (object) =>
        !named.has(object.path) &&
        now.getTime() - object.createdAt.getTime() > UNSAVED_UPLOAD_HOURS * 60 * 60 * 1000,
    )
    .map((object) => object.path)
