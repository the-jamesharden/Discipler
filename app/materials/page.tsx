import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMaterialsReader } from '~/service/container'
import { AdminShell, initialsOf, NotAnAdmin } from '../shell'
import {
  FILTER_LABEL,
  FILTERS,
  filterIn,
  filterQuery,
  folderCount,
  MATERIALS,
  MATERIALS_LEAD,
  NO_MATERIAL_ASSIGNED,
  NO_MATERIALS_YET,
  type MaterialsFilter,
} from './copy'
import { chipsFor, foldersOf, onNoMaterial, underFilter } from './folders'

export const dynamic = 'force-dynamic'

/**
 * The Materials tab: the Ministry's Materials as folders, as the v10 prototype
 * draws them and `.lavish/materials/design.html` approves them (S-1, S-1b).
 *
 * One folder per live Material in title order, each with its count and the
 * initials of the Leaders inside, then the dashed folder for the relationships
 * on no Material. The filter is the URL, so it works before any script has
 * loaded and survives a refresh, and every folder link carries it so the way
 * back keeps it. A Material nobody is on is still a folder: the prototype hid
 * those, and here they would otherwise be invisible.
 *
 * The New material button belongs to ticket 02 and is not drawn yet.
 */

/** One folder tile: the count, up to three chips and *+N*, the title, and the line beneath. */
const Folder = ({
  href,
  title,
  initials,
  more,
  count,
  dashed = false,
}: {
  readonly href: string
  readonly title: string
  readonly initials: readonly string[]
  readonly more: number
  readonly count: number
  readonly dashed?: boolean
}) => (
  <Link className={dashed ? 'mat-tile unassigned' : 'mat-tile'} href={href}>
    <div className="mat-folder">
      <span className={count === 0 ? 'mat-count zero' : 'mat-count'}>{count}</span>
      {initials.map((chip, index) => (
        // Alternate colours as the prototype does, so two neighbouring chips with
        // the same letters still read as two people.
        <span key={index} className={index % 2 === 1 ? 'mat-chip alt' : 'mat-chip'}>
          {chip}
        </span>
      ))}
      {more > 0 ? <span className="mat-chip more">+{more}</span> : null}
    </div>
    <div className="mat-name">{title}</div>
    <div className="mat-sub">{folderCount(count)}</div>
  </Link>
)

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ gender?: string }>
}) {
  const query = await searchParams
  const filter: MaterialsFilter = filterIn(query.gender)

  // One read: the session verdict, the Materials, every relationship and the
  // badge's number come from one document.
  const page = await getMaterialsReader().readMaterialsPage('materials', filter)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={MATERIALS} />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { materials, relationships, care } = page.page

  const shown = underFilter(relationships, filter)
  const folders = foldersOf(materials, shown)
  const unassigned = onNoMaterial(shown)

  return (
    <AdminShell admin={admin} current="materials" followUpCount={care.length}>
      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">{MATERIALS}</h2>
            <span className="muted">{MATERIALS_LEAD}</span>
          </div>
        </div>

        {/* The three filters: three links to this same page. The current one is
            marked, and the folders below carry it on their links. */}
        <nav className="seg" aria-label="Which relationships to show">
          {FILTERS.map((which) => (
            <Link
              key={which ?? 'all'}
              href={`/materials${filterQuery(which)}`}
              aria-current={which === filter ? 'true' : undefined}
            >
              {FILTER_LABEL[which ?? 'all']}
            </Link>
          ))}
        </nav>

        {materials.length === 0 ? <p className="empty">{NO_MATERIALS_YET}</p> : null}

        {folders.length > 0 || unassigned.length > 0 ? (
          <div className="mat-grid">
            {folders.map(({ material, relationships: inside }) => (
              <Folder
                key={material.materialId}
                href={`/materials/${material.materialId}${filterQuery(filter)}`}
                title={material.title}
                {...chipsFor(inside, initialsOf)}
                count={inside.length}
              />
            ))}
            {/* Last, and only while somebody is on no Material: with nobody there
                the folder goes too, and the empty line above says what to do. */}
            {unassigned.length > 0 ? (
              <Folder
                href={`/materials/none${filterQuery(filter)}`}
                title={NO_MATERIAL_ASSIGNED}
                {...chipsFor(unassigned, initialsOf)}
                count={unassigned.length}
                dashed
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminShell>
  )
}
