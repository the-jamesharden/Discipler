import { redirect } from 'next/navigation'
import { getMaterialsReader } from '~/service/container'
import { AccountMenu, BackLink, NotAnAdmin, PageShell } from '../../shell'
import { MaterialForm, type MaterialQuery } from '../material-form'
import {
  BACK_TO_MATERIALS,
  CREATE_MATERIAL,
  MATERIALS,
  NEW_MATERIAL,
  NEW_MATERIAL_LEAD,
} from '../copy'

export const dynamic = 'force-dynamic'

/**
 * New material (`.lavish/materials/design.html`, S-4): the narrow container, a
 * way back to the tab, and one card with a title, some text, its files and
 * links (Richer materials, ticket 01), and the two buttons. A page of its own
 * and not a modal, as settled at the grill.
 *
 * No message on the page by default. A refused submission comes back here with
 * the red toast above the fields and what was typed still in place, carried on
 * the query string by the route that refused it.
 */
export default async function NewMaterialPage({
  searchParams,
}: {
  searchParams: Promise<MaterialQuery>
}) {
  const query = await searchParams

  // One read, under the page's own name, for the session verdict alone: the
  // titles the new one must not repeat are the boundary's to check.
  const page = await getMaterialsReader().readMaterialsPage('new-material', null)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={MATERIALS} />
  if (page.status === 'signed-out') redirect('/login')

  return (
    <PageShell title={MATERIALS} subtitle={page.admin.ministryName} actions={<AccountMenu ministry />}>
      <BackLink small className="mat-back" href="/materials" label={BACK_TO_MATERIALS} />
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{NEW_MATERIAL}</h2>
        </div>
        <p className="card-lead">{NEW_MATERIAL_LEAD}</p>

        <MaterialForm
          action="/materials/create"
          query={query}
          title={query.title ?? ''}
          body={query.body ?? ''}
          held={[]}
          cancelHref="/materials"
          submit={CREATE_MATERIAL}
        />
      </div>
    </PageShell>
  )
}
