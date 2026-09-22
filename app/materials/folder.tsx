import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { materialId as asMaterialId } from '~/domain/ids'
import { getMaterialsReader } from '~/service/container'
import type { MaterialOption, MaterialRelationship } from '~/service/ports'
import { statePill, withPeople } from '../overview/copy'
import { flaggedIn, flagsFor } from '../overview/flags'
import { AdminShell, NotAnAdmin } from '../shell'
import { assignRow, MATERIAL_FIELD, NO_MATERIAL_VALUE } from './assigning'
import {
  ALL_MATERIALS,
  ASSIGN,
  assignmentRefusalMessage,
  CHOOSE_A_MATERIAL,
  EDIT_THIS_MATERIAL,
  filterIn,
  filterQuery,
  MATERIAL_LABEL,
  MATERIALS,
  NO_MATERIAL,
  NO_MATERIAL_ASSIGNED,
  notWorkingThroughAnything,
  previouslyLine,
  relationshipLabel,
  SAVE_ASSIGNMENT,
  sinceLine,
  workingThroughItNow,
  type MaterialsFilter,
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
 * Follow-Up item. Here the card holds the assign row (Materials, ticket 03), so
 * only the Leader's name links, and only where an item exists. A Material's
 * folder carries the way to its edit page in the head; removing lives there too.
 */

/** Which folder: one Material's, by id, or the dashed one. */
export type WhichFolder = { readonly kind: 'material'; readonly id: string } | { readonly kind: 'none' }

/**
 * The row pinned to the foot of every card: a dropdown of every live Material
 * and a button, posted on its own. It carries the folder and the filter so the
 * route can send the Admin back to where they pressed it.
 */
const AssignRow = ({
  relationship,
  materials,
  filter,
}: {
  readonly relationship: MaterialRelationship
  readonly materials: readonly MaterialOption[]
  readonly filter: MaterialsFilter
}) => {
  const current = relationship.runningMaterialId
  const { options, selected } = assignRow(materials, current, {
    noMaterial: NO_MATERIAL,
    choose: CHOOSE_A_MATERIAL,
  })
  return (
    <form className="mat-assign" method="post" action="/materials/assign">
      <input type="hidden" name="relationshipId" value={relationship.relationshipId} />
      <input type="hidden" name="folder" value={current ?? NO_MATERIAL_VALUE} />
      {filter === null ? null : <input type="hidden" name="gender" value={filter} />}
      {/* Required where the first line is "Choose a material…", which is no
          choice; in a Material's folder every line is one. */}
      <select name={MATERIAL_FIELD} aria-label={MATERIAL_LABEL} defaultValue={selected} required={current === null}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="submit" className={current === null ? 'small' : 'small sec'}>
        {current === null ? ASSIGN : SAVE_ASSIGNMENT}
      </button>
    </form>
  )
}

const Card = ({
  relationship,
  folder,
  timeZone,
  flagged,
  care,
  materials,
  filter,
}: {
  readonly relationship: MaterialRelationship
  readonly folder: 'material' | 'none'
  readonly timeZone: string
  readonly flagged: ReadonlySet<string>
  readonly care: Parameters<typeof flagsFor>[1]
  readonly materials: readonly MaterialOption[]
  readonly filter: MaterialsFilter
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
      <AssignRow relationship={relationship} materials={materials} filter={filter} />
    </div>
  )
}

export const FolderPage = async ({
  which,
  gender,
  assignError,
}: {
  readonly which: WhichFolder
  readonly gender: string | undefined
  /** Why the last press of an assign row changed nothing, as a code. */
  readonly assignError: string | undefined
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
  const refusal = assignmentRefusalMessage(assignError)

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
          {material ? (
            <Link className="ghost-btn" href={`/materials/${material.materialId}/edit`}>
              {EDIT_THIS_MATERIAL}
            </Link>
          ) : null}
        </div>
        {refusal ? (
          <p className="toast error" role="alert">
            {refusal}
          </p>
        ) : null}
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
                materials={materials}
                filter={filter}
              />
            ))}
          </div>
        ) : null}
      </div>
    </AdminShell>
  )
}
