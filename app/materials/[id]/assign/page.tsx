import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { materialId as asMaterialId, relationshipId } from '~/domain/ids'
import { getMaterialsReader } from '~/service/container'
import type { MaterialOnTheList, MaterialRelationship } from '~/service/ports'
import { statePill } from '../../../overview/copy'
import { AdminShell, BackLink, NotAnAdmin } from '../../../shell'
import { relationshipIn } from '../../assigning'
import { pickGroupsFor, TICKED_FIELD } from '../../assign-to-more'
import {
  ASSIGN_TO_MORE_LEAD,
  assignToMoreHeading,
  assignToMoreRefusalMessage,
  CANCEL,
  FILTER_LABEL,
  FILTERS,
  filterIn,
  filterQuery,
  HEALTHY,
  MATERIALS,
  nobodyToAssign,
  onMaterialHeading,
  onNoMaterialHeading,
  pickMeta,
  pickName,
  SELECT_ALL_SHOWN,
} from '../../copy'
import { AssignPicker } from './picker'

export const dynamic = 'force-dynamic'

/**
 * One relationship, as a checkbox and its label: who is in it, what it is and
 * what it is on now, and its pill -- Healthy included, because here the pill
 * helps choose rather than flag.
 */
const Row = ({
  relationship,
  on,
  timeZone,
}: {
  readonly relationship: MaterialRelationship
  /** The Material it is on now, or null for one on none. */
  readonly on: MaterialOnTheList | null
  readonly timeZone: string
}) => {
  const { who, rest } = pickName(relationship)
  return (
    <label className="pick">
      <input type="checkbox" name={TICKED_FIELD} value={relationship.relationshipId} />
      <span>
        <span className="who">
          {who} <span>{rest}</span>
        </span>
        <span className="meta">
          {pickMeta(
            relationship,
            on ? { title: on.title, since: relationship.since } : null,
            relationship.acceptedAt,
            timeZone,
          )}
        </span>
      </span>
      <span className={`pill ${relationship.state}`}>
        {relationship.state === 'healthy' ? HEALTHY : statePill[relationship.state]}
      </span>
    </label>
  )
}

/**
 * Assign a Material to more relationships (Richer materials, ticket 02; M-3 of
 * `.lavish/richer-materials/mockup.html`), reached from **Assign to more** in its
 * folder's head.
 *
 * Every live, accepted relationship not already on it, each with a checkbox:
 * those on no Material first, then grouped by the Material they are on now, in
 * title order. The filter is the tab's, carried as `?gender=`. One press posts
 * every ticked one to one command, which starts them all on it or, refused over
 * any one, none of them; a refusal comes back here, says which relationship and
 * why, and the list is drawn afresh, which is what takes the refused one off it.
 */
export default async function AssignToMorePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gender?: string; assignError?: string; refused?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const filter = filterIn(query.gender)
  // Only an id is sent to the function; anything else on the address is nobody.
  const refused = relationshipIn(query.refused ?? null)

  // One read, under the page's own name: the tab's document, and the name of the
  // relationship a refused press was about.
  const page = await getMaterialsReader().readAssignPage(refused ? relationshipId(refused) : null)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={MATERIALS} />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { timeZone, materials, relationships, care } = page.page
  const material = materials.find((each) => each.materialId === asMaterialId(id))
  // A Material the Ministry does not hold, or one it has removed, is not a page,
  // as its folder is not.
  if (!material) notFound()

  const groups = pickGroupsFor(materials, relationships, material.materialId, filter)
  const refusal = assignToMoreRefusalMessage(query.assignError, page.page.refused, material.title)
  const folder = `/materials/${material.materialId}`
  const self = `${folder}/assign`
  // Cards exist only where the Ministry could be read, which is where the zone
  // is; the fallback is never printed.
  const zone = timeZone ?? 'UTC'

  return (
    <AdminShell admin={admin} current="materials" followUpCount={care.length}>
      <div className="card">
        <BackLink small className="mat-back" href={`${folder}${filterQuery(filter)}`} label={material.title} />
        <h2 className="card-title">{assignToMoreHeading(material.title)}</h2>
        <p className="card-lead pick-lead">{ASSIGN_TO_MORE_LEAD}</p>

        {refusal ? (
          <p className="toast error" role="alert">
            {refusal}
          </p>
        ) : null}

        <form method="post" action={`${self}/save`}>
          {filter === null ? null : <input type="hidden" name="gender" value={filter} />}
          <AssignPicker
            title={material.title}
            selectAll={SELECT_ALL_SHOWN}
            filters={
              <nav className="seg" aria-label="Which relationships to show">
                {FILTERS.map((which) => (
                  <Link
                    key={which ?? 'all'}
                    href={`${self}${filterQuery(which)}`}
                    aria-current={which === filter ? 'true' : undefined}
                  >
                    {FILTER_LABEL[which ?? 'all']}
                  </Link>
                ))}
              </nav>
            }
            cancel={
              <Link className="btn sec" href={`${folder}${filterQuery(filter)}`}>
                {CANCEL}
              </Link>
            }
          >
            {groups.length === 0 ? <p className="muted pick-none">{nobodyToAssign(filter)}</p> : null}
            {groups.map((group) => (
              <div className="pick-group" key={group.material?.materialId ?? 'none'}>
                <h3>
                  {group.material
                    ? onMaterialHeading(group.material.title, group.relationships.length)
                    : onNoMaterialHeading(group.relationships.length)}
                </h3>
                {group.relationships.map((relationship) => (
                  <Row
                    key={relationship.relationshipId}
                    relationship={relationship}
                    on={group.material}
                    timeZone={zone}
                  />
                ))}
              </div>
            ))}
          </AssignPicker>
        </form>
      </div>
    </AdminShell>
  )
}
