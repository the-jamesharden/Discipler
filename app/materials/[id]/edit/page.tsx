import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { materialId as asMaterialId } from '~/domain/ids'
import { getMaterialsReader } from '~/service/container'
import { AccountMenu, BackLink, NotAnAdmin, PageShell } from '../../../shell'
import {
  CANCEL,
  confirmRemoval,
  EDIT_THIS_MATERIAL,
  fileSize,
  inUseNotice,
  KEEP_IT,
  MATERIALS,
  PDF_HINT,
  PDF_LABEL,
  refusalMessage,
  REMOVE,
  REMOVE_LEAD,
  REMOVE_THE_PDF,
  REMOVE_THIS_MATERIAL,
  removalQuestion,
  REPLACE_IT,
  SAVE_CHANGES,
  TEXT_HINT,
  TEXT_LABEL,
  TITLE_LABEL,
} from '../../copy'
import { onMaterial } from '../../folders'

export const dynamic = 'force-dynamic'

/**
 * Edit a material (`.lavish/materials/design.html`, S-5): the narrow container,
 * a way back to the folder, the card that edits it and the card that removes it.
 *
 * Plain edits with nothing said about them on the page. A period points at the
 * row, so a retitled Material is what history shows from then on, and a Leader
 * sees the new text or PDF on their next load.
 *
 * Removing takes two presses, like a Discipleship Goal option. Remove reopens
 * this page with the confirmation open, and only the button inside it removes.
 * While any live relationship is working through the Material the button is
 * disabled and the notice says how many; the boundary refuses it a second time.
 */
export default async function EditMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; title?: string; body?: string; removing?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])

  // One read, under the page's own name: the Material, and every relationship
  // whose running period is on it, from the tab's document.
  const page = await getMaterialsReader().readMaterialsPage('edit-material', null)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={MATERIALS} />
  if (page.status === 'signed-out') redirect('/login')

  const { materials, relationships } = page.page
  const material = materials.find((each) => each.materialId === asMaterialId(id))
  // A Material the Ministry does not hold, or one it has removed, is not a page.
  if (!material) notFound()

  const inUseBy = onMaterial(relationships, material.materialId).length
  const refusal = refusalMessage(query.error)
  const removing = query.removing === 'yes'
  const folder = `/materials/${material.materialId}`
  const self = `${folder}/edit`

  return (
    <PageShell title={MATERIALS} subtitle={page.admin.ministryName} actions={<AccountMenu ministry />}>
      <BackLink small className="mat-back" href={folder} label={material.title} />

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{EDIT_THIS_MATERIAL}</h2>
        </div>

        {refusal ? (
          <p className="toast error" role="alert">
            {refusal}
          </p>
        ) : null}

        <form method="post" action={`${folder}/save`} encType="multipart/form-data">
          <div className="field">
            <label className="label" htmlFor="e-title">{TITLE_LABEL}</label>
            <input id="e-title" name="title" type="text" defaultValue={query.title ?? material.title} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="e-body">{TEXT_LABEL}</label>
            <textarea id="e-body" name="body" rows={4} defaultValue={query.body ?? material.body ?? ''} />
            <p className="subtle">{TEXT_HINT}</p>
          </div>
          <div className="field">
            {material.pdf ? (
              <>
                {/* The current file, by the name it arrived under and its size,
                    then the two ways to change it: take it away, or put another
                    in its place. A replacement wins where both are asked for. */}
                <span className="label">{PDF_LABEL}</span>
                <div className="pdf-row">
                  <span className="name">{material.pdf.filename}</span>
                  {material.pdf.bytes !== null ? (
                    <span className="muted">{fileSize(material.pdf.bytes)}</span>
                  ) : null}
                </div>
                <label className="check" htmlFor="e-remove-pdf" style={{ marginTop: '.6rem' }}>
                  <input id="e-remove-pdf" name="removePdf" type="checkbox" value="yes" />
                  <span>{REMOVE_THE_PDF}</span>
                </label>
                <label className="label" htmlFor="e-pdf" style={{ marginTop: '.6rem' }}>{REPLACE_IT}</label>
                <input id="e-pdf" name="pdf" type="file" accept="application/pdf" />
              </>
            ) : (
              <>
                <label className="label" htmlFor="e-pdf">{PDF_LABEL}</label>
                <input id="e-pdf" name="pdf" type="file" accept="application/pdf" />
                <p className="subtle">{PDF_HINT}</p>
              </>
            )}
          </div>
          <div className="form-actions">
            <Link className="btn sec" href={folder}>{CANCEL}</Link>
            <button type="submit">{SAVE_CHANGES}</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{REMOVE_THIS_MATERIAL}</h2>
        </div>
        <p className="card-lead">{REMOVE_LEAD}</p>

        {inUseBy > 0 ? (
          <>
            <p className="notice">{inUseNotice(inUseBy)}</p>
            <button type="button" className="sec danger" disabled>
              {REMOVE}
            </button>
          </>
        ) : removing ? (
          <div role="alert" className="notice">
            <h3>{removalQuestion(material.title)}</h3>
            <form method="post" action={`${folder}/remove`}>
              {/* The confirmation itself. The route removes nothing without it,
                  so a stale form or a copied link that names the Material and
                  says nothing else reopens this rather than acting on it. */}
              <input type="hidden" name="confirm" value="yes" />
              <button type="submit" className="danger">{confirmRemoval(material.title)}</button>
            </form>
            <p style={{ marginTop: '0.75rem' }}>
              <Link className="btn sec" href={self}>{KEEP_IT}</Link>
            </p>
          </div>
        ) : (
          // A form and not a link, so the first press is the same act the
          // second is; the route answers it with this page and the confirmation
          // open, and removes nothing.
          <form method="post" action={`${folder}/remove`}>
            <button type="submit" className="sec danger">{REMOVE}</button>
          </form>
        )}
      </div>
    </PageShell>
  )
}
