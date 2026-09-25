import Link from 'next/link'
import { CANCEL, refusalMessage, TEXT_LABEL, TEXT_PLACEHOLDER, TITLE_LABEL } from './copy'
import { allOf, uploadsIn } from './editing'
import { FilesAndLinks, type HeldItem } from './files-and-links'
import { SaveButton, UploadingForm } from './uploading-form'

/** What a refused submission carries back on the query string, and nothing else is read. */
export interface MaterialQuery {
  readonly error?: string
  readonly title?: string
  readonly body?: string
  readonly linkUrl?: string
  readonly linkLabel?: string
  readonly upload?: string | readonly string[]
  readonly removeItem?: string | readonly string[]
}

/**
 * The fields and the two buttons, shared by the create and edit pages, with the
 * red toast above the fields when a refused submission came back here. Not
 * multipart: no file travels with the form, only the paths the browser uploaded
 * to. `required` on the title, because a browser can say that much before a
 * round trip and the boundary says it again.
 */
export const MaterialForm = ({
  action,
  query,
  title,
  body,
  held,
  cancelHref,
  submit,
}: {
  readonly action: string
  readonly query: MaterialQuery
  readonly title: string
  readonly body: string
  readonly held: readonly HeldItem[]
  readonly cancelHref: string
  readonly submit: string
}) => (
  <UploadingForm action={action} refusal={refusalMessage(query.error)}>
    <div className="field">
      <label className="label" htmlFor="m-title">{TITLE_LABEL}</label>
      <input id="m-title" name="title" type="text" defaultValue={title} required />
    </div>
    <div className="field">
      <label className="label" htmlFor="m-body">{TEXT_LABEL}</label>
      <textarea id="m-body" name="body" rows={5} placeholder={TEXT_PLACEHOLDER} defaultValue={body} />
    </div>
    <FilesAndLinks
      held={held}
      ticked={allOf(query.removeItem)}
      carried={uploadsIn(allOf(query.upload))}
      linkUrl={query.linkUrl ?? ''}
      linkLabel={query.linkLabel ?? ''}
    />
    <div className="form-actions">
      <Link className="btn sec" href={cancelHref}>{CANCEL}</Link>
      <SaveButton>{submit}</SaveButton>
    </div>
  </UploadingForm>
)
