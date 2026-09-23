import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMaterialsReader } from '~/service/container'
import { AccountMenu, BackLink, NotAnAdmin, PageShell } from '../../shell'
import {
  BACK_TO_MATERIALS,
  CANCEL,
  CREATE_MATERIAL,
  MATERIALS,
  NEW_MATERIAL,
  NEW_MATERIAL_LEAD,
  PDF_HINT,
  PDF_LABEL,
  refusalMessage,
  TEXT_HINT,
  TEXT_LABEL,
  TEXT_PLACEHOLDER,
  TITLE_LABEL,
} from '../copy'

export const dynamic = 'force-dynamic'

/**
 * New material (`.lavish/materials/design.html`, S-4): the narrow container, a
 * way back to the tab, and one card with a title, some text, a PDF, and the two
 * buttons. A page of its own and not a modal, as settled at the grill.
 *
 * No message on the page by default. A refused submission comes back here with
 * the red toast above the fields and what was typed still in place, carried on
 * the query string by the route that refused it.
 */
export default async function NewMaterialPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; title?: string; body?: string }>
}) {
  const query = await searchParams

  // One read, under the page's own name, for the session verdict alone: the
  // titles the new one must not repeat are the boundary's to check.
  const page = await getMaterialsReader().readMaterialsPage('new-material', null)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={MATERIALS} />
  if (page.status === 'signed-out') redirect('/login')

  const refusal = refusalMessage(query.error)

  return (
    <PageShell title={MATERIALS} subtitle={page.admin.ministryName} actions={<AccountMenu ministry />}>
      <BackLink small className="mat-back" href="/materials" label={BACK_TO_MATERIALS} />
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{NEW_MATERIAL}</h2>
        </div>
        <p className="card-lead">{NEW_MATERIAL_LEAD}</p>

        {refusal ? (
          <p className="toast error" role="alert">
            {refusal}
          </p>
        ) : null}

        <MaterialForm
          action="/materials/create"
          title={query.title ?? ''}
          body={query.body ?? ''}
          cancelHref="/materials"
          submit={CREATE_MATERIAL}
        />
      </div>
    </PageShell>
  )
}

/**
 * The three fields and the two buttons. Multipart, because one of the fields is
 * a file; `required` on the title, because a browser can say that much before a
 * round trip and the boundary says it again.
 */
const MaterialForm = ({
  action,
  title,
  body,
  cancelHref,
  submit,
}: {
  readonly action: string
  readonly title: string
  readonly body: string
  readonly cancelHref: string
  readonly submit: string
}) => (
  <form method="post" action={action} encType="multipart/form-data">
    <div className="field">
      <label className="label" htmlFor="m-title">{TITLE_LABEL}</label>
      <input id="m-title" name="title" type="text" defaultValue={title} required />
    </div>
    <div className="field">
      <label className="label" htmlFor="m-body">{TEXT_LABEL}</label>
      <textarea id="m-body" name="body" rows={5} placeholder={TEXT_PLACEHOLDER} defaultValue={body} />
      <p className="subtle">{TEXT_HINT}</p>
    </div>
    <div className="field">
      <label className="label" htmlFor="m-pdf">{PDF_LABEL}</label>
      <input id="m-pdf" name="pdf" type="file" accept="application/pdf" />
      <p className="subtle">{PDF_HINT}</p>
    </div>
    <div className="form-actions">
      <Link className="btn sec" href={cancelHref}>{CANCEL}</Link>
      <button type="submit">{submit}</button>
    </div>
  </form>
)
