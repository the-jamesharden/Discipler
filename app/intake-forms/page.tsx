import Link from 'next/link'
import { redirect } from 'next/navigation'
import { personId } from '~/domain/ids'
import { appBaseUrl } from '~/platform/supabase/credentials'
import type { MaterialOption, MinistryGroup } from '~/service/ports'
import { getIntakeFormsReader } from '~/service/container'
import { groupMaterialField, MATERIAL_FIELD } from '../materials/assigning'
import { dayMonthYear, NO_MATERIAL } from '../materials/copy'
import { AccountMenu, NotAnAdmin, PageShell } from '../shell'
import { GoalsCard } from './goals-card'
import { LinkCard } from './link-card'
import { refusalMessage as goalRefusalMessage } from './goals/copy'
import {
  ADMIT,
  admissionRefusalMessage,
  admitted as admittedMessage,
  alreadyIn as alreadyInMessage,
  askedToJoin,
  DECLINE,
  declaredGenderLabel,
  declinedRequest,
  GROUP_MATERIAL_HINT,
  GROUP_MATERIAL_LABEL,
  GROUP_NAME_HINT,
  GROUP_NAME_LABEL,
  GROUP_SAVED,
  groupRefusalMessage,
  GROUPS_EXPLANATION,
  GROUPS_HEADING,
  INTAKE_FORMS,
  REQUIRE_APPROVAL_LABEL,
  SAVE_GROUP,
  shortNameRefusalMessage,
  UNNAMED_GROUP,
  WAITING_EXPLANATION,
  WAITING_HEADING,
  AWAITING_LEADER_ACCEPTANCE,
  LEADS,
  materialOnceAccepted,
  workingThroughItSince,
} from './copy'

export const dynamic = 'force-dynamic'

/**
 * The Admin's half of the Intake sentence: the Ministry's short name, the two
 * readable links built from it and the two QR codes that open them, the groups the
 * groups form offers, and whoever is waiting to be admitted through it.
 *
 * All of it sat at the foot of the Roster from ticket 27 to ticket 32, below the
 * import. Ticket 32 moved it here so the Roster is a list of people and the things
 * an Admin hands out are in one place, reached from the Account menu on every Admin
 * page. Groups and the waiting requests came with the group link because they are
 * about it: a group is on the link once it is named, and a request exists because
 * somebody picked a group on the link that asks first.
 *
 * The goals question joined them with ticket 34: its options are a property of the
 * forms handed out here, so the card that edits them sits between the links and
 * the groups.
 *
 * Since Pastor feedback ticket 04 the links are built from the Ministry's short
 * name, which the page reads and an Admin edits at the top of it, rather than from
 * its identifier. The older `/intake/<ministry id>` links keep working, and so does
 * every short name the Ministry has held.
 */

export default async function IntakeFormsPage({
  searchParams,
}: {
  searchParams: Promise<{
    /** The group whose name or door was just saved, and why one could not be. */
    configured?: string
    groupError?: string
    /** Whose request to join a group was just answered, and why one could not be. */
    admitted?: string
    alreadyIn?: string
    declined?: string
    joinError?: string
    /** The goal option an Admin has asked to remove, and why a goal edit was refused. */
    removing?: string
    goalError?: string
    /** The short name was just changed, or why it could not be. */
    shortName?: string
    shortNameError?: string
  }>
}) {
  const resolution = await getIntakeFormsReader().readIntakeFormsPage()

  if (resolution.status === 'not-an-admin') return <NotAnAdmin title={INTAKE_FORMS} />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin

  // The Ministry's groups and whoever is waiting to join one, read on every load
  // rather than only after a redirect: a request that appeared only there would
  // expire the moment an Admin navigated away.
  const groups = resolution.page.groups
  const waiting = resolution.page.joinRequests
  // The options behind the one question both forms ask that the Ministry writes
  // itself. Edited from here since ticket 34, because it is a property of the
  // forms handed out from this page.
  const goals = resolution.page.goals
  // The live Materials each accepted group's dropdown offers, and the zone the
  // date beneath it is printed in (Materials, ticket 03).
  const materials = resolution.page.materials
  const timeZone = resolution.page.timeZone ?? 'UTC'
  const query = await searchParams

  // Looked up on the Roster rather than echoed, like every other name a surface
  // here says: what arrives in the query string is whatever somebody typed there.
  const nameOf = (id: string | undefined) =>
    id === undefined ? null : (resolution.page.nameOf.get(personId(id)) ?? null)
  const admittedName = nameOf(query.admitted)
  const declinedName = nameOf(query.declined)
  const alreadyInName = nameOf(query.alreadyIn)
  const groupFailure = groupRefusalMessage(query.groupError)
  const joinFailure = admissionRefusalMessage(query.joinError)
  // Looked up on the list rather than echoed, like every other name a surface here
  // says: an option this Ministry does not offer warns about nothing.
  const removing = goals.find((goal) => goal.id === query.removing) ?? null
  const goalFailure = goalRefusalMessage(query.goalError)

  return (
    <PageShell
      title={INTAKE_FORMS}
      subtitle={admin.ministryName}
      back={{ href: '/overview', label: 'Back to the overview' }}
      actions={<AccountMenu ministry />}
      wide
    >
      {/* The short name and the two readable links built from it, with their QR
          codes (Pastor feedback, ticket 04). */}
      <LinkCard
        ministryName={admin.ministryName}
        shortName={resolution.page.shortName}
        baseUrl={appBaseUrl()}
        saved={query.shortName === 'saved'}
        refusal={shortNameRefusalMessage(query.shortNameError)}
      />

      {/* Whoever picked a group that asks first. Shown only when somebody has, or
          when an answer just landed: a heading over nothing is noise. Above the
          groups because it is the one thing here waiting on the Admin. The two
          answers are two forms, each carrying exactly the answer it means. */}
      {waiting.length > 0 || joinFailure || admittedName || alreadyInName || declinedName ? (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-head">
            <h2 className="card-title">{WAITING_HEADING}</h2>
          </div>
          <p className="card-lead">{WAITING_EXPLANATION}</p>

          {joinFailure ? (
            <p className="toast error" role="alert">
              {joinFailure}
            </p>
          ) : null}
          {admittedName ? <p className="toast" role="status">{admittedMessage(admittedName)}</p> : null}
          {alreadyInName ? <p className="toast" role="status">{alreadyInMessage(alreadyInName)}</p> : null}
          {declinedName ? <p className="toast" role="status">{declinedRequest(declinedName)}</p> : null}

          {waiting.map((request) => (
            <div key={request.itemId} className="mentee-card">
              <h3>{request.fullName}</h3>
              <p className="subtle">
                {[
                  askedToJoin(request.groupName),
                  request.gender ? declaredGenderLabel[request.gender] : null,
                  request.ageBand,
                  `asked ${request.raisedAt.toISOString().slice(0, 10)}`,
                ]
                  .filter((part) => part !== null)
                  .join(' · ')}
              </p>
              <div className="actions">
                <form method="post" action="/intake-forms/join-requests/admit">
                  <input type="hidden" name="itemId" value={request.itemId} />
                  <input type="hidden" name="personId" value={request.personId} />
                  <button type="submit">{ADMIT}</button>
                </form>
                <form method="post" action="/intake-forms/join-requests/decline">
                  <input type="hidden" name="itemId" value={request.itemId} />
                  <input type="hidden" name="personId" value={request.personId} />
                  <button type="submit" className="sec">
                    {DECLINE}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* The goals question, between the forms and the groups: it is asked on both
          forms, where the groups belong to the group link alone. */}
      <GoalsCard goals={goals} removing={removing} refusal={goalFailure} />

      {/* Every live group, for the two things an Admin decides about each: what it
          is called, and whether picking it on the link asks. Here rather than on
          the Roster because both decisions are about the group link above. */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-head">
          <h2 className="card-title">{GROUPS_HEADING}</h2>
        </div>
        <p className="card-lead">{GROUPS_EXPLANATION}</p>

        {groupFailure ? (
          <p className="toast error" role="alert">
            {groupFailure}
          </p>
        ) : null}

        {groups.length === 0 ? (
          <p className="empty">
            No groups yet. Form one from the <Link href="/roster">Roster</Link>.
          </p>
        ) : (
          groups.map((group) => (
            <form key={group.relationshipId} method="post" action="/intake-forms/groups/configure" className="mentee-card">
              <input type="hidden" name="relationshipId" value={group.relationshipId} />
              <h3>{group.name ?? UNNAMED_GROUP}</h3>
              <p className="subtle">
                {`${declaredGenderLabel[group.declaredGender ?? 'mixed']} · `}
                {`${LEADS} ${group.leaderNames.join(', ')} · `}
                {group.participantNames.length === 0
                  ? 'nobody else in it yet'
                  : `with ${group.participantNames.join(', ')}`}
                {group.accepted ? null : ` — ${AWAITING_LEADER_ACCEPTANCE}`}
              </p>
              {query.configured === group.relationshipId ? <p className="toast" role="status">{GROUP_SAVED}</p> : null}
              <div className="field">
                <label className="label" htmlFor={`name:${group.relationshipId}`}>{GROUP_NAME_LABEL}</label>
                <input
                  id={`name:${group.relationshipId}`}
                  name="name"
                  required
                  defaultValue={group.name ?? ''}
                />
                <p className="subtle">{GROUP_NAME_HINT}</p>
              </div>
              <label className="check" htmlFor={`approval:${group.relationshipId}`}>
                <input
                  id={`approval:${group.relationshipId}`}
                  type="checkbox"
                  name="joinRequiresApproval"
                  value="yes"
                  defaultChecked={group.joinRequiresApproval}
                />
                <span>{REQUIRE_APPROVAL_LABEL}</span>
              </label>
              {/* What the group is working through (Materials, ticket 03, S-6),
                  saved in this same press. Only once it is accepted: the
                  assignment is refused before that, and nothing is stored to
                  apply later. */}
              {/* A running Material off the live list cannot be drawn as
                  selected, and a dropdown showing "No material" over it would
                  un-assign it on the next Save; the field is left out instead.
                  Removal refuses while in use, so only hand-made data gets here. */}
              {group.accepted &&
              group.running &&
              (group.running.materialId === null ||
                materials.some((material) => material.materialId === group.running?.materialId)) ? (
                <GroupMaterialField
                  group={group.relationshipId}
                  running={group.running}
                  materials={materials}
                  timeZone={timeZone}
                />
              ) : (
                <div className="field" style={{ marginTop: '1rem' }}>
                  <span className="label">{GROUP_MATERIAL_LABEL}</span>
                  <p className="subtle" style={{ marginTop: 0 }}>
                    {materialOnceAccepted(group.leaderNames.map(firstName))}
                  </p>
                </div>
              )}
              <button type="submit">{SAVE_GROUP}</button>
            </form>
          ))
        )}
      </div>
    </PageShell>
  )
}

/** The first word of a full name, which is what the groups card calls a Leader by. */
const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? fullName

/**
 * The Material dropdown on an accepted group's card: "No material", then every
 * live Material, on the running one, with the hint and, while a Material is
 * running, since when.
 */
const GroupMaterialField = ({
  group,
  running,
  materials,
  timeZone,
}: {
  readonly group: string
  readonly running: NonNullable<MinistryGroup['running']>
  readonly materials: readonly MaterialOption[]
  readonly timeZone: string
}) => {
  const { options, selected } = groupMaterialField(materials, running.materialId, NO_MATERIAL)
  return (
    <div className="field" style={{ marginTop: '1rem' }}>
      <label className="label" htmlFor={`material:${group}`}>{GROUP_MATERIAL_LABEL}</label>
      <select id={`material:${group}`} name={MATERIAL_FIELD} defaultValue={selected}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="subtle">
        {running.materialId === null
          ? GROUP_MATERIAL_HINT
          : `${GROUP_MATERIAL_HINT} ${workingThroughItSince(dayMonthYear(running.since, timeZone))}`}
      </p>
    </div>
  )
}
