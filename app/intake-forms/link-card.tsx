import {
  ministryGroupsJoinLink,
  ministryGroupsJoinQrLink,
  ministryJoinLink,
  ministryJoinQrLink,
} from '~/domain/outbound-copy'
import type { ShortName } from '~/domain/short-name'
import { renderQrSquare } from '~/platform/qr/qr-code'
import { CopyLinkButton } from './clipboard-field'
import {
  COPY_LINK,
  DOWNLOAD_QR_CODE,
  GROUPS_FORM,
  LINK_COPIED,
  MENTOR_AND_MENTEE_FORM,
  qrCodeAlt,
  qrCodeFilename,
  SAVE_SHORT_NAME,
  SHORT_NAME_LABEL,
  SHORT_NAME_SAVED,
} from './copy'

/**
 * The card at the top of Intake forms (Pastor feedback, ticket 04; settled in
 * James's Lavish review of 2026-10-12, `.lavish/pastor-feedback/mock-link.html`).
 * The short name first, because both links are built from it, then the two forms
 * side by side as even tiles: each with its name, its QR code, its readable link,
 * *Copy link* and *Download QR code*. No helper sentences, and nothing in the
 * card below the tiles.
 *
 * The plain link is what is shown and copied; each square carries the same link
 * with `?via=qr`, which the form records as a scan rather than a link a pastor
 * sent. That link is deliberately not offered to copy: texted from here, it would
 * record everybody who followed it as having scanned a code nobody printed.
 */

/**
 * How large each square is drawn on the page, in CSS pixels. The code keeps its
 * full quiet zone, so the modules take a little under three quarters of this --
 * about what the mock-up drew -- and it still scans off a laptop screen.
 */
const QR_CODE_ON_SCREEN = 140

/** The id of the field, which its label and the receipt beside it point at. */
const FIELD = 'shortName'

export const LinkCard = async ({
  ministryName,
  shortName,
  baseUrl,
  saved,
  refusal,
}: {
  readonly ministryName: string
  readonly shortName: ShortName
  /** The configured host every link hangs off, scheme and all. */
  readonly baseUrl: string
  /** The name was just changed. */
  readonly saved: boolean
  /** Why the name typed was not taken, as a sentence, or null. */
  readonly refusal: string | null
}) => {
  // What the field's prefix and each tile show: the address without its scheme,
  // which is how a pastor says it and how a bulletin prints it.
  const shownHost = new URL(ministryJoinLink(baseUrl, shortName)).host

  return (
    <div className="card link-card">
      <form method="post" action="/intake-forms/short-name" className="short-name">
        <label htmlFor={FIELD}>{SHORT_NAME_LABEL}</label>
        <div className="link-edit">
          <span aria-hidden="true">{`${shownHost}/join/`}</span>
          <input
            id={FIELD}
            name={FIELD}
            type="text"
            required
            defaultValue={shortName}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={refusal || saved ? `${FIELD}-receipt` : undefined}
          />
        </div>
        <button type="submit" className="small">
          {SAVE_SHORT_NAME}
        </button>
        {refusal ? (
          <p id={`${FIELD}-receipt`} className="toast error" role="alert">
            {refusal}
          </p>
        ) : saved ? (
          <p id={`${FIELD}-receipt`} className="toast" role="status">
            {SHORT_NAME_SAVED}
          </p>
        ) : null}
      </form>

      <div className="form-tiles">
        <FormTile
          id="mentor-and-mentee"
          form={MENTOR_AND_MENTEE_FORM}
          ministryName={ministryName}
          shownHost={shownHost}
          shortName={shortName}
          path=""
          link={ministryJoinLink(baseUrl, shortName)}
          scanned={ministryJoinQrLink(baseUrl, shortName)}
          download={{
            href: '/intake-forms/discipleship-code.svg',
            filename: qrCodeFilename.mentorAndMentee(shortName),
          }}
        />
        <FormTile
          id="groups"
          form={GROUPS_FORM}
          ministryName={ministryName}
          shownHost={shownHost}
          shortName={shortName}
          path="/groups"
          link={ministryGroupsJoinLink(baseUrl, shortName)}
          scanned={ministryGroupsJoinQrLink(baseUrl, shortName)}
          download={{
            href: '/intake-forms/intake-code.svg',
            filename: qrCodeFilename.groups(shortName),
          }}
        />
      </div>
    </div>
  )
}

/**
 * One form's tile. The square is drawn into the page from the same encoder the
 * downloaded file is, without the caption the file carries, because the tile
 * already names the form in words above it.
 */
const FormTile = async ({
  id,
  form,
  ministryName,
  shownHost,
  shortName,
  path,
  link,
  scanned,
  download,
}: {
  readonly id: string
  readonly form: string
  readonly ministryName: string
  readonly shownHost: string
  readonly shortName: ShortName
  /** What follows the short name in this form's link. */
  readonly path: string
  readonly link: string
  readonly scanned: string
  readonly download: { readonly href: string; readonly filename: string }
}) => {
  const square = await renderQrSquare(scanned)

  return (
    <div className="form-tile">
      <p className="form-tile-name">{form}</p>
      <img
        className="qr"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(square)}`}
        alt={qrCodeAlt(form, ministryName)}
        width={QR_CODE_ON_SCREEN}
        height={QR_CODE_ON_SCREEN}
      />
      {/* The short name picked out, because it is the one part of the address
          that is this church's and the one part a pastor chose. */}
      <code id={`${id}-link`}>
        {`${shownHost}/join/`}
        <b>{shortName}</b>
        {path}
      </code>
      <div className="btn-row">
        <CopyLinkButton value={link} shows={`${id}-link`} label={COPY_LINK} confirmation={LINK_COPIED} />
        <a className="btn sec small" href={download.href} download={download.filename}>
          {DOWNLOAD_QR_CODE}
        </a>
      </div>
    </div>
  )
}
