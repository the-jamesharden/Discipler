import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMaterialsReader } from '~/service/container'
import type { MaterialRelationship } from '~/service/ports'
import { AdminShell, NotAnAdmin } from '../shell'
import {
  FILTER_LABEL,
  FILTERS,
  filterIn,
  filterQuery,
  folderCount,
  MATERIALS,
  MATERIALS_INFO,
  MATERIALS_LEGEND,
  NO_MATERIAL_ASSIGNED,
  NO_MATERIALS_YET,
  NO_PROGRAM_YET,
  PROGRAMS,
  type MaterialsFilter,
} from './copy'
import { homeCellsOf, pairLabel, type HomeCell } from './folders'

export const dynamic = 'force-dynamic'

/**
 * The Materials tab as the v11 prototype draws it: a home-screen of program
 * folders (shared Materials) and single pair tiles (unique or unassigned), with
 * the gender filter and Programs control in the toolbar.
 */

const PairGlyph = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8.5 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm7 0a2.6 2.6 0 1 0-2.6-2.6A2.6 2.6 0 0 0 15.5 11Zm0 1.6a4.9 4.9 0 0 0-1.5.24 4.7 4.7 0 0 1 1.3 3.26V18H21v-1.6c0-2.1-2.6-3.8-5.5-3.8Zm-7 0c-2.9 0-5.5 1.5-5.5 3.7V18h11v-1.6c0-2.2-2.6-3.8-5.5-3.8Z" />
  </svg>
)

const GroupGlyph = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7.5 11a2.4 2.4 0 1 0-2.4-2.4A2.4 2.4 0 0 0 7.5 11Zm9 0a2.4 2.4 0 1 0-2.4-2.4A2.4 2.4 0 0 0 16.5 11Zm-9 1.5c-2 0-4 1-4 3v1.4h4.3v-1.4c0-1 .3-1.9.9-2.7a5.6 5.6 0 0 0-1.2-.3Zm9 0a5.6 5.6 0 0 0-1.2.3c.6.8.9 1.7.9 2.7v1.4H20v-1.4c0-2-2-3-4-3ZM12 11.5A2.8 2.8 0 1 0 9.2 8.7 2.8 2.8 0 0 0 12 11.5Zm0 1.6c-2.4 0-4.6 1.2-4.6 3.4v1.4h9.2v-1.4c0-2.2-2.2-3.4-4.6-3.4Z" />
  </svg>
)

const UnitGlyph = ({ relationship }: { readonly relationship: MaterialRelationship }) =>
  relationship.isAGroup ? <GroupGlyph /> : <PairGlyph />

const FolderCell = ({
  cell,
  filter,
}: {
  readonly cell: Extract<HomeCell, { kind: 'folder' }>
  readonly filter: MaterialsFilter
}) => {
  const { material, relationships, gender } = cell
  const preview = relationships.slice(0, 4)
  const overflow = relationships.length > 4

  return (
    <div className="hs-cell">
      <Link
        className={`hs-tile gender-${gender}`}
        href={`/materials/${material.materialId}${filterQuery(filter)}`}
        title={`Open ${material.title}`}
      >
        <div className="hs-folder-grid">
          {preview.map((relationship, index) =>
            overflow && index === 3 ? (
              <div key="more" className="hs-mini more">
                +{relationships.length - 3}
              </div>
            ) : (
              <div key={relationship.relationshipId} className="hs-mini">
                <UnitGlyph relationship={relationship} />
              </div>
            ),
          )}
        </div>
        <span className={`hs-count${relationships.length === 0 ? ' zero' : ''}`}>{relationships.length}</span>
      </Link>
      <div className="hs-label">{material.title}</div>
      <div className="hs-sub">{folderCount(relationships.length)}</div>
    </div>
  )
}

const PairCell = ({
  cell,
  filter,
}: {
  readonly cell: Extract<HomeCell, { kind: 'pair' }>
  readonly filter: MaterialsFilter
}) => {
  const { relationship, material, gender } = cell
  const href = material
    ? `/materials/${material.materialId}${filterQuery(filter)}`
    : `/materials/none${filterQuery(filter)}`
  const label = pairLabel(relationship)
  const sub = material ? material.title : NO_PROGRAM_YET

  return (
    <div className="hs-cell">
      <Link className={`hs-tile gender-${gender}`} href={href} title={`Open ${material?.title ?? NO_MATERIAL_ASSIGNED}`}>
        <span className="hs-app-icon">
          <UnitGlyph relationship={relationship} />
        </span>
        <span className="hs-pencil" aria-hidden="true">
          ✎
        </span>
      </Link>
      <div className="hs-label">{label}</div>
      <div className={`hs-sub${material ? '' : ' muted'}`}>{sub}</div>
    </div>
  )
}

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ gender?: string }>
}) {
  const query = await searchParams
  const filter: MaterialsFilter = filterIn(query.gender)

  const page = await getMaterialsReader().readMaterialsPage('materials', filter)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={MATERIALS} />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { materials, relationships, care } = page.page

  const cells = homeCellsOf(materials, relationships, filter)

  return (
    <AdminShell admin={admin} current="materials" followUpCount={care.length}>
      <div className="mat-toolbar">
        <div className="mat-info">
          <button
            type="button"
            className="mat-info-btn"
            aria-label="How the Materials view works"
            aria-describedby="materials-info"
          >
            i
          </button>
          <span className="mat-tooltip" id="materials-info" role="tooltip">
            {MATERIALS_INFO}
          </span>
        </div>
        <div className="mat-toolbar-actions">
          <nav className="seg-toggle" aria-label="Which relationships to show">
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
          <Link className="mat-programs-btn" href="/materials/new">
            {PROGRAMS}
          </Link>
        </div>
      </div>

      {materials.length === 0 ? <p className="empty-tile">{NO_MATERIALS_YET}</p> : null}

      {cells.length > 0 ? (
        <>
          <div className="hs-grid">
            {cells.map((cell) =>
              cell.kind === 'folder' ? (
                <FolderCell key={cell.material.materialId} cell={cell} filter={filter} />
              ) : (
                <PairCell key={cell.relationship.relationshipId} cell={cell} filter={filter} />
              ),
            )}
          </div>
          <div className="hs-legend">
            <span>
              <span className="swatch gender-m" />
              {FILTER_LABEL.male}
            </span>
            <span>
              <span className="swatch gender-f" />
              {FILTER_LABEL.female}
            </span>
            <span>{MATERIALS_LEGEND}</span>
          </div>
        </>
      ) : null}
    </AdminShell>
  )
}
