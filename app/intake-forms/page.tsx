import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ministryDiscipleshipIntakeLink,
  ministryIntakeLink,
} from '~/domain/outbound-copy'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { appBaseUrl } from '~/platform/supabase/credentials'
import { getDiscipleshipGoalReader, getRosterReader } from '~/service/container'
import { AWAITING_LEADER_ACCEPTANCE, rosterRoleLabel } from '../roster/copy'
import { AccountMenu, NotAnAdmin, PageShell } from '../shell'
import { ClipboardField } from './clipboard-field'
import { GoalsCard } from './goals-card'
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
  GROUP_NAME_HINT,
  GROUP_NAME_LABEL,
  GROUP_SAVED,
  groupRefusalMessage,
  GROUPS_EXPLANATION,
  GROUPS_HEADING,
  INTAKE_FORMS,
  REQUIRE_APPROVAL_LABEL,
  SAVE_GROUP,
  UNNAMED_GROUP,
  WAITING_EXPLANATION,
  WAITING_HEADING,
} from './copy'

export const dynamic = 'force-dynamic'

/**
 * The Admin's half of the Intake sentence: the two Ministry Intake Links and the two
 * QR codes that open them, the groups the group link offers, and whoever is waiting
 * to be admitted through it.
 *
 * All of it sat at the foot of the Roster from ticket 27 to ticket 32, below the
 * import. Ticket 32 moved it here so the Roster is a list of people and the things
 * an Admin hands out are in one place, reached from the Account menu on every Admin
 * page. Groups and the waiting requests came with the group link because they are
 * about it: a group is on the link once it is named, and a request exists because
 * somebody picked a group on the link that asks first.
 *
 * Nothing about the links changed in the move. Each is composed from the session
 * rather than read from anywhere: it is the Ministry's identifier and the configured
 * host, and there is nothing about it to store. The QR code's variant of each is
 * composed by the route that draws the code, which is the only thing that needs it.
 */

/**
 * How large each code is drawn on the page, in CSS pixels. The square scales, so
 * this is a display decision and it lives here rather than in the stylesheet: it is
 * the number that decides whether an Admin can hold a phone up to their own screen,
 * which is one of the two things the code is for.
 */
const QR_CODE_ON_SCREEN = 320

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
  }>
}) {
  const resolution = await resolveAdmin()

  if (resolution.status === 'not-an-admin') return <NotAnAdmin title={INTAKE_FORMS} />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin
  const intakeLink = ministryIntakeLink(appBaseUrl(), admin.ministryId)
  // Two links because an Admin sends whichever fits the conversation: this one opens
  // the wizard that asks first whether somebody is offering to mentor or asking to
  // be mentored.
  const discipleshipLink = ministryDiscipleshipIntakeLink(appBaseUrl(), admin.ministryId)

  // The Ministry's groups and whoever is waiting to join one, read on every load
  // rather than only after a redirect: a request that appeared only there would
  // expire the moment an Admin navigated away.
  const groups = await getRosterReader().listGroups(admin.ministryId)
  const waiting = await getRosterReader().openJoinRequests(admin.ministryId)
  // The options behind the one question both forms ask that the Ministry writes
  // itself. Edited from here since ticket 34, because it is a property of the
  // forms handed out from this page.
  const goals = await getDiscipleshipGoalReader().listDiscipleshipGoals(admin.ministryId)
  const query = await searchParams

  // Looked up on the Roster rather than echoed, like every other name a surface
  // here says: what arrives in the query string is whatever somebody typed there.
  const roster = await getRosterReader().listRoster(admin.ministryId)
  const nameOf = (id: string | undefined) =>
    roster.find((person) => person.personId === id)?.fullName ?? null
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
      <div className="two-up">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">The group link</h2>
          </div>
          <p className="card-lead">
            One link, for everybody who wants to join one of this Ministry’s groups. It
            does not know who opens it, so it asks — their age, gender, when they could
            meet, and which group — which is what lets the same link be sent to one
            person and put in front of a room. A group appears on it once you have
            named it below. Picking a group joins it, unless you have set that group
            to ask you first. It is not the Intake link on a Person’s Roster row: that
            one is theirs alone, arrives with their answers already in it, and runs out.
          </p>

          <label className="label" htmlFor="intakeLink">The link to send</label>
          {/* A field rather than a sentence, because what an Admin does with this is
              paste it into a text message -- and a button beside it, because the
              criterion is that they can *copy* it and selecting a field by hand is not
              something the page offers them. The field is still a field underneath: a
              browser running no script leaves an Admin exactly where they were. */}
          <ClipboardField id="intakeLink" value={intakeLink} />
          <p className="subtle">
            Intake completed through this link is recorded as sent by a pastor.
          </p>

          <h3>The QR code</h3>
          <p className="subtle">
            The same form, reached by scanning. Intake completed this way is recorded
            as scanned from a QR code, which is a different record from the one above —
            a compliance review asks which of the two a Person agreed through, so it is
            worth knowing which one you handed out.
          </p>
          {/* Drawn by the route rather than inlined here, so the square an Admin
              prints and the square they are looking at cannot come to differ.

              The code carries the same link with `?via=qr` on it, and that link is
              deliberately not offered as a second field to copy: a link texted from
              here would record every Person who followed it as having scanned a code
              nobody printed, which is the one distinction this panel exists to keep
              honest. */}
          <img
            className="qr"
            src="/intake-forms/intake-code.svg"
            alt={`QR code opening the group form for ${admin.ministryName}`}
            width={QR_CODE_ON_SCREEN}
            height={QR_CODE_ON_SCREEN}
          />
          <p className="links">
            {/* Two actions rather than a tab and some knowledge of the browser. Saving
                is the download, which names the file on the way out so an Admin
                recognises it later in a folder of downloads. Printing is the tab: a
                browser printing the square on its own puts it on the paper at whatever
                size the paper is, which is what the page around it would prevent. */}
            <a href="/intake-forms/intake-code.svg" download="intake-qr-code.svg">
              Save the QR code
            </a>
            <span>·</span>
            <a href="/intake-forms/intake-code.svg" target="_blank" rel="noreferrer">
              Open it on its own, to print
            </a>
          </p>
        </div>

        {/* The second link, and the second code. They are handed out side by side and
            the difference between them is what an Admin has to be able to see before
            they print one: this one asks which side of a discipleship relationship
            somebody is offering to stand on, and the one beside it does not ask. */}
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">The discipleship link</h2>
          </div>
          <p className="card-lead">
            A step-by-step form for discipleship. Its first question is whether the
            person is joining as a mentor or as someone to be mentored, and both are
            then asked the same things — their age, gender, whether this is their first
            time, when they could meet, and what they are hoping for. Answering{' '}
            <em>mentor</em> shows on their Roster row. It does not make them eligible
            to lead: that stays yours to decide.
          </p>

          <label className="label" htmlFor="discipleshipLink">The link to send</label>
          <ClipboardField id="discipleshipLink" value={discipleshipLink} />
          <p className="subtle">
            Intake completed through this link is recorded as sent by a pastor, exactly
            like the link beside it.
          </p>

          <h3>The discipleship QR code</h3>
          <p className="subtle">
            The same wizard, reached by scanning — and a different square from the one
            beside it. Printing the wrong one puts the wrong form in front of a room.
          </p>
          <img
            className="qr"
            src="/intake-forms/discipleship-code.svg"
            alt={`QR code opening the discipleship form for ${admin.ministryName}`}
            width={QR_CODE_ON_SCREEN}
            height={QR_CODE_ON_SCREEN}
          />
          <p className="links">
            <a
              href="/intake-forms/discipleship-code.svg"
              download="discipleship-intake-qr-code.svg"
            >
              Save the discipleship QR code
            </a>
            <span>·</span>
            <a href="/intake-forms/discipleship-code.svg" target="_blank" rel="noreferrer">
              Open it on its own, to print
            </a>
          </p>
        </div>
      </div>

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
                {`${rosterRoleLabel.leader} ${group.leaderNames.join(', ')} · `}
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
              <button type="submit">{SAVE_GROUP}</button>
            </form>
          ))
        )}
      </div>
    </PageShell>
  )
}
