import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { materialId as asMaterialId } from '~/domain/ids'
import { getMaterialsReader } from '~/service/container'
import type { MaterialRelationship } from '~/service/ports'
import { statePill, withPeople } from '../overview/copy'
import { flaggedIn, flagsFor } from '../overview/flags'
import { AdminShell, NotAnAdmin } from '../shell'
import {
  ALL_MATERIALS,
  filterIn,
  filterQuery,
  MATERIALS,
  NO_MATERIAL_ASSIGNED,
  notWorkingThroughAnything,
  previouslyLine,
  relationshipLabel,
  sinceLine,
  workingThroughItNow,
} from './copy'
import { onMaterial, onNoMaterial, underFilter } from './folders'

/**
 * Inside a folder: a Material's own page, or the "No material assigned" one
 * (`.lavish/materials/design.html`, S-2 and S-3). The cards are the Overview's
 * relationship cards with a meta line and a history line added, drawn from the
 * same document the tab was, under the same filter, so the count on the folder
 * is the number of cards here.
 *
 * One departure from the Overview card: there the whole card is a link to the
 * Follow-Up item. Here the card will hold a form (ticket 03), so only the
 * Leader's name links, and only where an item exists. The Edit link on a
 * Material's folder belongs to ticket 02 and is not drawn yet.
 */

/** Which folder: one Material's, by id, or the dashed one. */
export type WhichFolder = { readonly kind: 'material'; readonly id: string } | { readonly kind: 'none' }

const Card = ({
  relationship,
  folder,
  timeZone,
  flagged,
  care,
}: {
  readonly relationship: MaterialRelationship
  readonly folder: 'material' | 'none'
  readonly timeZone: string
  readonly flagged: ReadonlySet<string>
  readonly care: Parameters<typeof flagsFor>[1]
}) => {
  const { flags, tone } = flagsFor(relationship.relationshipId, care)
  const leaders = relationship.leaderNames.join(', ') || 'Nobody leading'

  return (
    <div className={`rel-card s-${relationship.state}`}>
      <div className="rel-leader">
        {flagged.has(relationship.relationshipId) ? (
          <Link href={`/follow-up#relationship-${relationship.relationshipId}`}>{leaders}</Link>
        ) : (
          leaders
        )}
        {relationship.state !== 'healthy' ? (
          <>
            {' '}
            <span className={`pill ${relationship.state}`}>{statePill[relationship.state]}</span>
          </>
        ) : null}
      </div>
      <div className="rel-people">{withPeople(relationship.participantNames)}</div>
      {/* One string, so it reads as a sentence in the markup too and can be asserted on. */}
      <div className="rel-meta">
        {`${relationshipLabel(relationship.isAGroup, relationship.groupName)} · ${sinceLine(folder, relationship.since, relationship.acceptedAt, timeZone)}`}
      </div>
      {relationship.previously.length > 0 ? (
        <div className="hist">{previouslyLine(relationship.previously, timeZone)}</div>
      ) : null}
      {flags.length > 0 ? <div className={`rel-reason ${tone}`}>{flags.join(' · ')}</div> : null}
    </div>
  )
}

export const FolderPage = async ({
  which,
  gender,
}: {
  readonly which: WhichFolder
  readonly gender: string | undefined
}) => {
  const filter = filterIn(gender)

  // One read, under the folder's own name so the edge log says which page was
  // loaded; the same document as the tab.
  const page = await getMaterialsReader().readMaterialsPage('material', filter)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={MATERIALS} />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { timeZone, materials, relationships, care } = page.page

  const material =
    which.kind === 'material'
      ? materials.find((each) => each.materialId === asMaterialId(which.id))
      : null
  // A Material the Ministry does not hold, or one it no longer offers (ticket 02),
  // is not a page.
  if (which.kind === 'material' && !material) notFound()

  const inside = underFilter(
    material ? onMaterial(relationships, material.materialId) : onNoMaterial(relationships),
    filter,
  )
  const flagged = flaggedIn(care)

  return (
    <AdminShell admin={admin} current="materials" followUpCount={care.length}>
      <div className="card">
        {/* Back to the tab with the filter that was on. The browser's back button
            does the same, because the folder is a URL. */}
        <Link className="mat-back" href={`/materials${filterQuery(filter)}`}>
          {ALL_MATERIALS}
        </Link>
        <div className="drill-head">
          <div>
            <h2 className="card-title">{material ? material.title : NO_MATERIAL_ASSIGNED}</h2>
            <span className="muted">
              {material ? workingThroughItNow(inside.length) : notWorkingThroughAnything(inside.length)}
            </span>
          </div>
        </div>
        {inside.length > 0 ? (
          <div className="rel-grid">
            {inside.map((relationship) => (
              <Card
                key={relationship.relationshipId}
                relationship={relationship}
                folder={material ? 'material' : 'none'}
                // Cards exist only where the Ministry could be read, which is
                // where the zone is; the fallback is never printed.
                timeZone={timeZone ?? 'UTC'}
                flagged={flagged}
                care={care}
              />
            ))}
          </div>
        ) : null}
      </div>
    </AdminShell>
  )
}
