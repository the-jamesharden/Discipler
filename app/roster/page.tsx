import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CHANGE_YOUR_PASSWORD } from '../account/copy'
import { AdminShell, initialsOf, NotAnAdmin } from '../shell'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getRosterReader } from '~/service/container'
import { personId } from '~/domain/ids'
import { intakeReopenLink } from '~/domain/outbound-copy'
import { appBaseUrl } from '~/platform/supabase/credentials'
import {
  AWAITING_LEADER_ACCEPTANCE,
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
  RESET_PASSWORD,
  rosterRoleLabel,
  rowProblemMessage,
  samePersonAnswer,
  samePersonConsequence,
  SOMEONE_ELSE_ANSWER,
  SOMEONE_ELSE_CONSEQUENCE,
} from './copy'
import { INTAKE_FORMS } from '../intake-forms/copy'
import { decodeImportReport } from './report'

export const dynamic = 'force-dynamic'

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

  const view = rosterView(query.show)
  const shown = view === 'eligible' ? roster.filter((person) => person.eligibleToLead) : roster

  return (
    <AdminShell admin={admin} current="roster">
      {/* The table first, because the Roster is a list of people, and the import
          in a popup over it. The one card below is the import rows waiting on an
          Admin. The groups, the join requests, the two Intake links and their codes
          followed the table too until ticket 32 gave them a page of their own. */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Roster</h2>
          <div className="actions" style={{ marginTop: 0 }}>
            <span className="muted">{peopleCount(shown.length)}</span>
            {/* The import, in a popup under its own button rather than a card of its
                own below the table (ticket 32, decision 7). A details element, like
                the Account menu, so it opens and closes with no script; it is open
                already when the last upload was refused, so the file field is in
                front of the Admin with the reason beside it. */}
            <details className="popover" open={failure !== undefined}>
              <summary className="btn sec">Upload CSV</summary>
              <div className="popover-panel">
                <h2 className="card-title">Import from a spreadsheet</h2>
                <p className="notice">{IMPORT_IS_NEVER_CONSENT}</p>
                <p className="card-lead">
                  A CSV with a column of names and a column of phone numbers; an email
                  column is optional.
                </p>
                {/* Why the last upload was refused, beside the field to try again
                    with. The report of one that went through is above the table
                    instead, because that one needs no second attempt. */}
                {failure ? (
                  <p className="toast error" role="alert">
                    {failure}
                  </p>
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
            </details>
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

        {/* What the last upload did, here rather than in the popup that started it:
            the upload redirects back to this page, and its report has to be in
            front of the Admin without a button to press first. */}
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

        {roster.length === 0 ? (
          <p className="empty">
            Nobody is on this Roster yet. Upload a spreadsheet, or send one of the{' '}
            <Link href="/intake-forms">{INTAKE_FORMS}</Link>.
          </p>
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
                            {/* And what an Admin decided: a plan, recorded here and
                                read by nothing else until Suggested Pairs ships. */}
                            {person.eligibleToLead ? (
                              <span className="pill n">Eligible to lead</span>
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
                        <div className="row-actions">
                        {person.participationStatus === 'ready_to_pair' ? (
                          <Link className="btn sec small" href={`/roster/pair?with=${person.personId}`}>
                            Pair
                          </Link>
                        ) : null}
                        <form method="post" action="/roster/intake-link">
                          <input type="hidden" name="personId" value={person.personId} />
                          <button type="submit" className="sec small">
                            Intake link
                          </button>
                        </form>
                        {/* A plan an Admin records, and never a fact about the Person.
                            Offered on every row, including somebody who has not
                            completed Intake -- planning while waiting on them is the
                            whole reason it is here -- and it makes nobody pairable.
                            Manual pairing never reads it; it is the leader pool the
                            suggestion engine will draw from. */}
                        <form method="post" action="/roster/eligibility">
                          <input type="hidden" name="personId" value={person.personId} />
                          <input
                            type="hidden"
                            name="eligible"
                            value={person.eligibleToLead ? 'no' : 'yes'}
                          />
                          <button type="submit" className="sec small">
                            {person.eligibleToLead ? 'Withdraw eligibility' : 'Mark eligible to lead'}
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
                        ) : null}
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

      {/* Its own card, below the table. Not folded into the import report: the report says what one upload did and is gone on the
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

    </AdminShell>
  )
}
