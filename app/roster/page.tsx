import Link from 'next/link'
import { redirect } from 'next/navigation'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getRosterReader } from '~/service/container'
import { personId } from '~/domain/ids'
import { intakeReopenLink } from '~/domain/outbound-copy'
import { appBaseUrl } from '~/platform/supabase/credentials'
import {
  importFailureMessage,
  participationStatusLabel,
  rosterRoleLabel,
  rowProblemMessage,
} from './copy'
import { decodeImportReport } from './report'

export const dynamic = 'force-dynamic'

const NotAnAdmin = () => (
  <main>
    <h1>Roster</h1>
    <p className="subtle">Discipler</p>
    <div className="panel">
      <p className="empty">
        This account is not an Admin of a Ministry. Ask whoever invited you to add
        you to yours.
      </p>
    </div>
  </main>
)

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{
    added?: string
    refused?: string
    hidden?: string
    error?: string
    paired?: string
    /** The Person whose Intake link was just issued, so this page shows that one. */
    intakeLinkFor?: string
  }>
}) {
  const resolution = await resolveAdmin()

  // Signed in but not an Admin. Sending them back to sign in would only loop.
  if (resolution.status === 'not-an-admin') return <NotAnAdmin />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin

  const roster = await getRosterReader().listRoster(admin.ministryId)
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
  // How many Participants the relationship just created has, so the confirmation can
  // say what landed. Read as a count and never echoed as text.
  const paired = Number.parseInt(query.paired ?? '', 10)

  return (
    <main>
      <h1>Roster</h1>
      <p className="subtle">{admin.ministryName}</p>

      {/* Both surfaces, in one session, from one `ministry_member` row that says
          `admin`. An Admin who also leads is the same person on both, and the
          Leader surface is a live query for open leader memberships -- so this link
          is offered unconditionally and answers honestly when they lead nothing. */}
      <p>
        <Link href="/relationships">The relationships you lead</Link>
      </p>

      <div className="panel">
        <h2>Import from a spreadsheet</h2>
        <p className="subtle">
          A CSV with a column of names and a column of phone numbers; an email column
          is optional. Importing adds people to the Roster and sends nobody anything.
        </p>

        {failure ? (
          <p className="error" role="alert">
            {failure}
          </p>
        ) : null}

        {report ? (
          <div role="status">
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
            {report.hidden.length > 0 ? (
              <>
                {/* Counted by reason, not just counted: "340 more" tells an Admin
                    nothing to act on, "340 more with no phone number" tells them
                    their export is missing a column. */}
                <p className="subtle">and more that this report had no room to list:</p>
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
          <label htmlFor="file">Spreadsheet</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required />
          <button type="submit">Import</button>
        </form>
      </div>

      <div className="panel">
        {Number.isInteger(paired) && paired > 0 ? (
          <p role="status">
            {paired === 1
              ? 'A relationship was created. It is awaiting its leader\u2019s acceptance, and nobody has been contacted yet.'
              : `A relationship with ${paired} participants was created. It is awaiting its leader\u2019s acceptance, and nobody has been contacted yet.`}
          </p>
        ) : null}

        {roster.length === 0 ? (
          <p className="empty">Nobody is on this Roster yet.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Participation</th>
                  <th>Relationships</th>
                  <th>Eligible to lead</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((person) => (
                  <tr key={person.personId}>
                    <td>{person.fullName}</td>
                    <td>{participationStatusLabel[person.participationStatus]}</td>
                    {/* One line per relationship, each saying what this Person is in
                        it. The role is what makes the status beside it legible: a
                        man leading two relationships and a man being discipled in
                        two are the same names and opposite situations, and it is the
                        first of them who reads Ready to Pair. A relationship with
                        several Participants still shows everyone in it. */}
                    <td>
                      {person.relationships.length === 0 ? (
                        <span className="empty">Not in a relationship</span>
                      ) : (
                        <ul className="bare">
                          {person.relationships.map((relationship, index) => (
                            <li key={`${relationship.role}:${index}`}>
                              {`${rosterRoleLabel[relationship.role]} ${relationship.withNames.join(', ')}`}
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
                      <form method="post" action="/roster/eligibility">
                        <input type="hidden" name="personId" value={person.personId} />
                        <input
                          type="hidden"
                          name="eligible"
                          value={person.eligibleToLead ? 'no' : 'yes'}
                        />
                        <button type="submit">
                          {person.eligibleToLead ? 'Yes — withdraw' : 'No — mark eligible'}
                        </button>
                      </form>
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
                      {person.participationStatus === 'ready_to_pair' ? (
                        <Link href={`/roster/pair?with=${person.personId}`}>Pair</Link>
                      ) : (
                        <span className="empty">—</span>
                      )}
                      <form method="post" action="/roster/intake-link">
                        <input type="hidden" name="personId" value={person.personId} />
                        <button type="submit">Intake link</button>
                      </form>
                      {issuedFor === person.personId && issuedLink ? (
                        <div role="status">
                          {/* Shown rather than sent. The Admin passes it on however
                              they are already in touch with this Person, which is
                              the point: texting it to the number on file would reach
                              whoever holds the number being corrected. */}
                          <p className="subtle">
                            Send this to {person.fullName}. It opens their own Intake
                            form with their answers already in it, and works until{' '}
                            {issuedLink.expiresAt.toISOString().slice(0, 10)}.
                          </p>
                          <input type="text" readOnly value={issuedLink.url} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* The way in that does not start from one row. The Pair action opens the
                same screen with somebody already chosen, but a Person who is already
                being discipled has no Pair action and may still lead, and several
                people selected together start from nobody in particular. */}
            <p>
              <Link href="/roster/pair">Form a relationship</Link>
            </p>
            {/* Said plainly, because the alternative is an Admin reading a man who
                leads two relationships as a bug. Participation answers whether this
                Person is being discipled, and leading is a different fact. */}
            <p className="subtle">
              Participation says whether a Person is being discipled. Someone who
              leads a relationship but is discipled by nobody reads Ready to Pair.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
