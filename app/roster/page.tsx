import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CHANGE_YOUR_PASSWORD } from '../account/copy'
import { AdminShell, initialsOf, NotAnAdmin } from '../shell'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getRosterReader } from '~/service/container'
import { personId } from '~/domain/ids'
import {
  intakeReopenLink,
  ministryDiscipleshipIntakeLink,
  ministryIntakeLink,
} from '~/domain/outbound-copy'
import { appBaseUrl } from '~/platform/supabase/credentials'
import {
  ADMIT,
  admissionRefusalMessage,
  admitted as admittedMessage,
  alreadyIn as alreadyInMessage,
  askedToJoin,
  AWAITING_LEADER_ACCEPTANCE,
  DECLINE,
  declinedRequest,
  declaredGenderLabel,
  GROUP_NAME_HINT,
  GROUP_NAME_LABEL,
  GROUP_SAVED,
  groupRefusalMessage,
  GROUPS_EXPLANATION,
  GROUPS_HEADING,
  HELD_ROWS_EXPLANATION,
  HELD_ROWS_HEADING,
  IMPORT_IS_NEVER_CONSENT,
  importFailureMessage,
  importRowRefusalMessage,
  NOBODY_ON_THIS_NUMBER,
  OFFERED_TO_MENTOR,
  participationStatusLabel,
  peopleCount,
  relationshipSizeLabel,
  REQUIRE_APPROVAL_LABEL,
  RESET_PASSWORD,
  rosterRoleLabel,
  rowProblemMessage,
  samePersonAnswer,
  samePersonConsequence,
  SAVE_GROUP,
  SOMEONE_ELSE_ANSWER,
  SOMEONE_ELSE_CONSEQUENCE,
  UNNAMED_GROUP,
  WAITING_EXPLANATION,
  WAITING_HEADING,
} from './copy'
import { decodeImportReport } from './report'
import { ClipboardField } from './clipboard-field'

export const dynamic = 'force-dynamic'

/**
 * How large the code is drawn on the Roster, in CSS pixels. The square scales, so
 * this is a display decision and it lives here rather than in the stylesheet: it is
 * the number that decides whether an Admin can hold a phone up to their own screen,
 * which is one of the two things the code is for.
 */
const QR_CODE_ON_SCREEN = 320

/**
 * The Everyone / Eligible-to-lead switch: a query parameter on this page, filtered
 * here. Anything else in the query string reads as Everyone.
 */
const ROSTER_VIEWS = ['all', 'eligible'] as const
type RosterView = (typeof ROSTER_VIEWS)[number]
const rosterView = (value: string | undefined): RosterView =>
  value === 'eligible' ? 'eligible' : 'all'

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{
    added?: string
    refused?: string
    hidden?: string
    error?: string
    paired?: string
    /** Everyone, or only the people marked eligible to lead. */
    show?: string
    /** The Person whose Intake link was just issued, so this page shows that one. */
    intakeLinkFor?: string
    /** The Leader who was just sent their Invitation Link again. */
    reinvited?: string
    /** Why an answer to a held import row could not be applied. A code, never prose. */
    rowError?: string
    /** The group whose name or door was just saved, and why one could not be. */
    configured?: string
    groupError?: string
    group?: string
    /** Whose request to join a group was just answered, and why one could not be. */
    admitted?: string
    alreadyIn?: string
    declined?: string
    joinError?: string
  }>
}) {
  const resolution = await resolveAdmin()

  // Signed in but not an Admin. Sending them back to sign in would only loop.
  if (resolution.status === 'not-an-admin') return <NotAnAdmin title="Roster" />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin

  const roster = await getRosterReader().listRoster(admin.ministryId)
  // Read on every load, not only after an upload. The import report is a redirect
  // and outlives nothing; a question that appeared only there would expire the
  // moment an Admin navigated away, which is the silent drop the reporting exists
  // to prevent.
  const held = await getRosterReader().heldImportRows(admin.ministryId)
  // The Ministry's groups and whoever is waiting to join one, read with the Roster
  // for the reason the held rows are: a request that appeared only on a redirect
  // would expire the moment an Admin navigated away.
  const groups = await getRosterReader().listGroups(admin.ministryId)
  const waiting = await getRosterReader().openJoinRequests(admin.ministryId)
  const query = await searchParams

  // One Person's link, and only when an Admin has just asked for theirs. Reading
  // every row's token would put a page full of credentials on screen, nearly all of
  // them for rows nobody is acting on -- and the query string carries the Person,
  // never the token, so the credential stays out of browser history and server logs.
  const askedAbout = query.intakeLinkFor
  const issuedFor =
    askedAbout && roster.some((person) => person.personId === askedAbout)
      ? personId(askedAbout)
      : null
  const issued = issuedFor
    ? await getRosterReader().liveIntakeLink(admin.ministryId, issuedFor)
    : null
  const issuedLink = issued
    ? { url: intakeReopenLink(appBaseUrl(), issued.token), expiresAt: issued.expiresAt }
    : null

  // The Ministry's own Intake link. Composed from the session rather than read from
  // anywhere: it is the Ministry's identifier and the configured host, and there is
  // nothing about it to store. The QR code's variant of it is composed by the route
  // that draws the code, which is the only thing that needs it.
  const intakeLink = ministryIntakeLink(appBaseUrl(), admin.ministryId)
  // The second one, composed the same way for the same reason. Two links because
  // an Admin sends whichever fits the conversation: this one opens the wizard that
  // asks first whether somebody is offering to mentor or asking to be mentored.
  const discipleshipLink = ministryDiscipleshipIntakeLink(appBaseUrl(), admin.ministryId)

  const report = decodeImportReport(query)
  const failure = importFailureMessage(query.error)
  const rowFailure = importRowRefusalMessage(query.rowError)
  // How many Participants the relationship just created has, so the confirmation can
  // say what landed. Read as a count and never echoed as text.
  const paired = Number.parseInt(query.paired ?? '', 10)

  // Looked up on the Roster rather than echoed, like every other name this page
  // says: what arrives in the query string is whatever somebody typed there.
  //
  // Whether anything was *sent* is not decided here and cannot be -- every no-op
  // path leaves the Leader on the Roster under their own name, so this lookup
  // cannot tell a text that went out from one that did not. The route only
  // redirects with `reinvited` when a message was actually enqueued.
  const reinvited = roster.find((person) => person.personId === query.reinvited)?.fullName ?? null
  // Looked up the same way, for the same reason: a name in the query string is
  // whatever somebody typed there, and the Roster is what says whose it is.
  const admittedName = roster.find((person) => person.personId === query.admitted)?.fullName ?? null
  const declinedName = roster.find((person) => person.personId === query.declined)?.fullName ?? null
  const alreadyInName = roster.find((person) => person.personId === query.alreadyIn)?.fullName ?? null
  const groupFailure = groupRefusalMessage(query.groupError)
  const joinFailure = admissionRefusalMessage(query.joinError)

  const view = rosterView(query.show)
  const shown = view === 'eligible' ? roster.filter((person) => person.eligibleToLead) : roster

  return (
    <AdminShell admin={admin} current="roster">
      {/* The table first, because the Roster is a list of people. Everything the
          design has no home for -- the import, the rows and requests waiting on an
          Admin, the groups, the two links and their codes -- follows it as its own
          card, in the order an Admin acts on them (decision 4 of ticket 31). */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Roster</h2>
          <div className="actions" style={{ marginTop: 0 }}>
            <span className="muted">{peopleCount(shown.length)}</span>
            <a className="btn sec" href="#import">
              Upload CSV
            </a>
          </div>
        </div>

        {/* The Everyone / Eligible-to-lead switch: two links to this same page,
            so it works before JavaScript has loaded and survives a refresh. */}
        <nav className="seg" aria-label="Which people to show">
          <Link href="/roster" aria-current={view === 'all' ? 'true' : undefined}>
            Everyone
          </Link>
          <Link href="/roster?show=eligible" aria-current={view === 'eligible' ? 'true' : undefined}>
            Eligible to lead
          </Link>
        </nav>

        {Number.isInteger(paired) && paired > 0 ? (
          <p className="toast" role="status">
            {/* What just happened, and not what is still true. The state this used
                to assert is now on the rows, derived; a receipt that went on
                claiming it would be the one thing on the Roster still saying
                *awaiting* after the leader had accepted and the page was
                reloaded. */}
            {paired === 1
              ? 'A relationship was created. Its leader has been invited, and nobody else has been contacted yet.'
              : `A relationship with ${paired} participants was created. Its leader has been invited, and nobody else has been contacted yet.`}
          </p>
        ) : null}

        {reinvited ? (
          <p className="toast" role="status">{`A new invitation has been sent to ${reinvited}.`}</p>
        ) : null}

        {roster.length === 0 ? (
          <p className="empty">Nobody is on this Roster yet. Import a spreadsheet below, or send the Intake link.</p>
        ) : shown.length === 0 ? (
          <p className="empty">Nobody is marked eligible to lead yet. Mark somebody from their row under Everyone.</p>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Relationship</th>
                    <th>Eligible to lead</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((person) => (
                    <tr key={person.personId}>
                      {/* No contact details anywhere on this table, by design: a
                          number is reached one Person at a time through the
                          consent check, and never listed (ADR-0010). The initials
                          are derived from the name. */}
                      <td>
                        <div className="person">
                          <span className="avatar" aria-hidden="true">
                            {initialsOf(person.fullName)}
                          </span>
                          <span>
                            {person.fullName}
                            {/* What the Person said about themselves, immediately
                                beside what an Admin decided about them. The two
                                are constantly confused and must not be: this one
                                is an answer somebody gave on a form, and answering
                                `mentor` sets nothing beside it. Only the mentor
                                answer is said. */}
                            {person.declaredSide === 'mentor' ? (
                              <span className="pill n">{OFFERED_TO_MENTOR}</span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`rs rs-${person.participationStatus}`}>
                          {participationStatusLabel[person.participationStatus]}
                        </span>
                      </td>
                      {/* One line per relationship, each saying what this Person is in
                          it. The role is what makes the status beside it legible: a
                          man leading two relationships and a man being discipled in
                          two are the same names and opposite situations, and it is the
                          first of them who reads Ready to Pair. A relationship with
                          several Participants still shows everyone in it. */}
                      <td>
                        {person.relationships.length === 0 ? (
                          <span className="blocked">
                            {person.participationStatus === 'no_intake_submitted'
                              ? 'Awaiting intake'
                              : person.participationStatus === 'opted_out'
                                ? 'Excluded from pairing'
                                : 'Unpaired'}
                          </span>
                        ) : (
                          <ul className="bare">
                            {person.relationships.map((relationship, index) => (
                              <li key={`${relationship.role}:${index}`}>
                                {`${rosterRoleLabel[relationship.role]} ${relationship.withNames.join(', ')}`}
                                {/* Derived from the absence of an acceptance, not read
                                    from a status column -- there is not one. It is the
                                    difference between a pairing an Admin has arranged
                                    and one that has actually started. */}
                                {relationship.awaitingAcceptance ? (
                                  <span className="muted">{` — ${AWAITING_LEADER_ACCEPTANCE}`}</span>
                                ) : null}
                                <span className="pill n">
                                  {relationshipSizeLabel(relationship.withNames.length + 1)}
                                </span>
                                {/* Offered on the state and the role together, never
                                    on either alone. A Participant is sent no link at
                                    all (ADR-0011), so on their row there is nothing
                                    to send again -- and on an accepted relationship
                                    there is nobody left to ask. */}
                                {relationship.awaitingAcceptance
                                && relationship.role === 'leader' ? (
                                  <form action="/roster/reinvite" method="post">
                                    <input
                                      type="hidden"
                                      name="relationshipId"
                                      value={relationship.relationshipId}
                                    />
                                    <input type="hidden" name="personId" value={person.personId} />
                                    <button type="submit" className="sec small">
                                      Send a new invitation
                                    </button>
                                  </form>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      {/* A plan an Admin records, and never a fact about the Person.
                          Offered on every row, including somebody who has not
                          completed Intake -- planning while waiting on them is the
                          whole reason it is here -- and it makes nobody pairable. */}
                      <td>
                        <div className="row-actions stack">
                        {person.eligibleToLead ? <span className="pill n" style={{ marginLeft: 0 }}>Eligible to lead</span> : null}
                        <form method="post" action="/roster/eligibility">
                          <input type="hidden" name="personId" value={person.personId} />
                          <input
                            type="hidden"
                            name="eligible"
                            value={person.eligibleToLead ? 'no' : 'yes'}
                          />
                          <button type="submit" className="sec small">
                            {person.eligibleToLead ? 'Yes — withdraw' : 'No — mark eligible'}
                          </button>
                        </form>
                        </div>
                      </td>
                      {/* An unpaired Person carries the Pair action on their own row,
                          so an Admin can act on what they are already looking at. It
                          opens the one pairing screen with this Person preselected;
                          somebody who has not completed Intake cannot be paired and is
                          offered nothing to press.

                          Beside it, the link that reopens their own Intake. Offered on
                          every row, because the two things it corrects -- a wrong
                          number and an availability that has changed -- are as likely
                          before Intake as after it. */}
                      <td>
                        {/* Three slots, in the same order on every row, and an
                            empty one where an action does not apply. The actions a
                            row carries vary -- only a `ready_to_pair` Person can be
                            paired, and only somebody with an account can have a
                            password reset -- so a list that simply closed up the
                            gaps put `Intake link` in a different place on almost
                            every row, and an Admin scanning the column had to read
                            each button to find the one they wanted. Holding the
                            gap open costs a little width and makes the column
                            scannable down its own edges. */}
                        <div className="row-actions slots">
                        {person.participationStatus === 'ready_to_pair' ? (
                          <Link className="btn sec small" href={`/roster/pair?with=${person.personId}`}>
                            Pair
                          </Link>
                        ) : (
                          <span className="slot-empty" aria-hidden="true" />
                        )}
                        <form method="post" action="/roster/intake-link">
                          <input type="hidden" name="personId" value={person.personId} />
                          <button type="submit" className="sec small">
                            Intake link
                          </button>
                        </form>
                        {/* Offered only where there is an account to reset, which
                            is most of a Roster's rows not having it: an account
                            exists for a Leader who accepted an Invitation Link and
                            for an Admin who was provisioned, and for nobody else.

                            On the Admin's own row the action is a different one.
                            Resetting your own password is not a recovery -- you are
                            holding a session as you ask -- so the row offers the
                            self-service change instead. */}
                        {person.holdsAnAccount ? (
                          person.personId === admin.personId ? (
                            <Link className="btn sec small" href="/account">
                              {CHANGE_YOUR_PASSWORD}
                            </Link>
                          ) : (
                            <Link className="btn sec small" href={`/roster/reset/${person.personId}`}>
                              {RESET_PASSWORD}
                            </Link>
                          )
                        ) : (
                          <span className="slot-empty" aria-hidden="true" />
                        )}
                        </div>
                        {issuedFor === person.personId && issuedLink ? (
                          <div className="toast" role="status" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                            {/* Shown rather than sent. The Admin passes it on however
                                they are already in touch with this Person, which is
                                the point: texting it to the number on file would reach
                                whoever holds the number being corrected. */}
                            <p className="muted">
                              Send this to {person.fullName}. It opens their own Intake
                              form with their answers already in it, and works until{' '}
                              {issuedLink.expiresAt.toISOString().slice(0, 10)}.
                            </p>
                            <input type="text" readOnly value={issuedLink.url} aria-label="Their Intake link" />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* The way in that does not start from one row. The Pair action opens the
                same screen with somebody already chosen, but a Person who is already
                being discipled has no Pair action and may still lead, and several
                people selected together start from nobody in particular. */}
            <div className="actions">
              <Link className="btn" href="/roster/pair">
                Form a relationship
              </Link>
            </div>
            {/* Said plainly, because the alternative is an Admin reading a man who
                leads two relationships as a bug. Participation answers whether this
                Person is being discipled, and leading is a different fact. */}
            <p className="subtle">
              Status says whether a Person is being discipled. Someone who leads a
              relationship but is discipled by nobody reads Ready to Pair.
            </p>
          </>
        )}
      </div>

      <div className="card" id="import">
        <div className="card-head">
          <h2 className="card-title">Import from a spreadsheet</h2>
        </div>
        <p className="notice">{IMPORT_IS_NEVER_CONSENT}</p>
        <p className="card-lead">
          A CSV with a column of names and a column of phone numbers; an email column
          is optional.
        </p>

        {failure ? (
          <p className="toast error" role="alert">
            {failure}
          </p>
        ) : null}

        {report ? (
          <div className="toast" role="status">
            {/* Each sentence is one string rather than an assembly of fragments, so
                it reads as a sentence in the markup too and can be asserted on. */}
            <p>
              {report.added === 1
                ? '1 person was added.'
                : `${report.added} people were added.`}
            </p>
            {report.refused.length > 0 ? (
              <>
                <p>
                  {report.refused.length === 1
                    ? '1 row was not imported:'
                    : `${report.refused.length} rows were not imported:`}
                </p>
                <ul>
                  {report.refused.map(({ line, problem }) => (
                    <li key={`${line}:${problem}`}>
                      {`Line ${line} — ${rowProblemMessage(problem)}`}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {/* The report says the row was refused; the panel below is where it can
                be answered. Pointing at it rather than repeating the answers here:
                two places offering the same two buttons would be two places for an
                Admin to answer the same question, and the panel is the one that
                survives navigating away from this redirect. */}
            {report.refused.some(({ problem }) => problem === 'same_number_different_name') ? (
              <p>{`Rows on a number the Roster already holds are waiting for you under “${HELD_ROWS_HEADING}” below.`}</p>
            ) : null}
            {report.hidden.length > 0 ? (
              <>
                {/* Counted by reason, not just counted: "340 more" tells an Admin
                    nothing to act on, "340 more with no phone number" tells them
                    their export is missing a column. */}
                <p className="muted">and more that this report had no room to list:</p>
                <ul>
                  {report.hidden.map(({ problem, count }) => (
                    <li key={problem}>
                      {`${count} more — ${rowProblemMessage(problem)}`}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        <form method="post" action="/roster/import" encType="multipart/form-data">
          <div className="field">
            <label className="label" htmlFor="file">
              Spreadsheet
            </label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required />
          </div>
          <button type="submit">Import</button>
        </form>
      </div>

      {/* Its own card, below the import that produced it. Not folded into the
          import report: the report says what one upload did and is gone on the
          next navigation, and these outlive it by design -- a row nobody has
          answered is still waiting a week later. */}
      {held.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">{HELD_ROWS_HEADING}</h2>
          </div>
          <p className="card-lead">{HELD_ROWS_EXPLANATION}</p>

          {rowFailure ? (
            <p className="toast error" role="alert">
              {rowFailure}
            </p>
          ) : null}

          {held.map((row) => (
            <div key={row.rowId} className="mentee-card">
              {/* The line and the name in the file, which is what places the row in
                  the spreadsheet the Admin uploaded. No phone number: the Roster
                  shows no contact details, and the names below say which number
                  this is more usefully than the digits would. */}
              <h3>{`Line ${row.line} — “${row.fullName}”`}</h3>

              {row.onThisNumber.length === 0 ? (
                <p className="subtle">{NOBODY_ON_THIS_NUMBER}</p>
              ) : null}

              {/* One form per answer rather than one form with a choice of submit
                  buttons. Each carries exactly the answer it means, so there is
                  nothing to leave unset and no value that a browser could send on
                  an Admin's behalf -- which is the whole of *neither answer is a
                  default*. */}
              {row.onThisNumber.map((person) => (
                <form key={person.personId} method="post" action="/roster/resolve">
                  <input type="hidden" name="rowId" value={row.rowId} />
                  <input type="hidden" name="answer" value="same_person" />
                  <input type="hidden" name="personId" value={person.personId} />
                  <button type="submit" className="sec">
                    {samePersonAnswer(person.fullName)}
                  </button>
                  <p className="subtle">
                    {samePersonConsequence(person.fullName, row.fullName)}
                  </p>
                </form>
              ))}

              <form method="post" action="/roster/resolve">
                <input type="hidden" name="rowId" value={row.rowId} />
                <input type="hidden" name="answer" value="someone_else" />
                <button type="submit" className="sec">
                  {SOMEONE_ELSE_ANSWER}
                </button>
                <p className="subtle">{SOMEONE_ELSE_CONSEQUENCE}</p>
              </form>
            </div>
          ))}
        </div>
      ) : null}

      {/* Whoever picked a group that asks first. Shown only when somebody has:
          a heading over nothing is noise on a page that is already long. The
          two answers are two forms, each carrying exactly the answer it means. */}
      {waiting.length > 0 || joinFailure || admittedName || alreadyInName || declinedName ? (
        <div className="card">
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
                <form method="post" action="/roster/join-requests/admit">
                  <input type="hidden" name="itemId" value={request.itemId} />
                  <input type="hidden" name="personId" value={request.personId} />
                  <button type="submit">{ADMIT}</button>
                </form>
                <form method="post" action="/roster/join-requests/decline">
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

      {/* Every live group, for the two things an Admin decides about each: what it
          is called, and whether picking it on the link asks. Its own card because
          the Roster is a list of people and a group is on it once per member. */}
      <div className="card">
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
          <p className="empty">No groups yet. Form one from the Roster above.</p>
        ) : (
          groups.map((group) => (
            <form key={group.relationshipId} method="post" action="/roster/groups/configure" className="mentee-card">
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

      <div className="two-up">
        {/* The Admin's half of the Intake sentence. The form and both routes to it
            have existed since ticket 03; what did not exist was any way for a pastor
            to obtain either one short of knowing the Ministry's identifier and typing
            the URL. */}
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">The group link</h2>
          </div>
          <p className="card-lead">
            One link, for everybody who wants to join one of this Ministry’s groups. It
            does not know who opens it, so it asks — their age, gender, when they could
            meet, and which group — which is what lets the same link be sent to one
            person and put in front of a room. A group appears on it once you have
            named it above. Picking a group joins it, unless you have set that group
            to ask you first. It is not the Intake link on a Person’s row: that
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
            src="/roster/intake-code.svg"
            alt={`QR code opening the group form for ${admin.ministryName}`}
            width={QR_CODE_ON_SCREEN}
            height={QR_CODE_ON_SCREEN}
          />
          <p className="links">
            {/* Two actions rather than a tab and some knowledge of the browser. Saving
                is the download, which names the file on the way out so an Admin
                recognises it later in a folder of downloads. Printing is the tab: a
                browser printing the square on its own puts it on the paper at whatever
                size the paper is, which is what the Roster around it would prevent. */}
            <a href="/roster/intake-code.svg" download="intake-qr-code.svg">
              Save the QR code
            </a>
            <span>·</span>
            <a href="/roster/intake-code.svg" target="_blank" rel="noreferrer">
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
            <em>mentor</em> shows on their Roster row above. It does not make them
            eligible to lead: that stays yours to decide.
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
            src="/roster/discipleship-code.svg"
            alt={`QR code opening the discipleship form for ${admin.ministryName}`}
            width={QR_CODE_ON_SCREEN}
            height={QR_CODE_ON_SCREEN}
          />
          <p className="links">
            <a
              href="/roster/discipleship-code.svg"
              download="discipleship-intake-qr-code.svg"
            >
              Save the discipleship QR code
            </a>
            <span>·</span>
            <a href="/roster/discipleship-code.svg" target="_blank" rel="noreferrer">
              Open it on its own, to print
            </a>
          </p>
        </div>
      </div>
    </AdminShell>
  )
}
