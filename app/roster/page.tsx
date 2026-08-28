import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getRosterReader } from '~/service/container'
import { importFailureMessage, participationStatusLabel, rowProblemMessage } from './copy'
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
  }>
}) {
  const admin = await currentAdmin()

  if (!admin) {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Signed in but not an Admin. Sending them back to sign in would only loop.
    if (user) return <NotAnAdmin />

    redirect('/login')
  }

  const roster = await getRosterReader().listRoster(admin.ministryId)
  const query = await searchParams
  const report = decodeImportReport(query)
  const failure = importFailureMessage(query.error)
  // How many Participants the relationship just created has, so the confirmation can
  // say what landed. Read as a count and never echoed as text.
  const paired = Number.parseInt(query.paired ?? '', 10)

  return (
    <main>
      <h1>Roster</h1>
      <p className="subtle">{admin.ministryName}</p>

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
                  <th>With</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((person) => (
                  <tr key={person.personId}>
                    <td>{person.fullName}</td>
                    <td>{participationStatusLabel[person.participationStatus]}</td>
                    {/* A relationship with several Participants shows everyone in it,
                        so group membership is visible without opening a record. */}
                    <td>
                      {person.withNames.length === 0 ? (
                        <span className="empty">Not in a relationship</span>
                      ) : (
                        person.withNames.join(', ')
                      )}
                    </td>
                    {/* An unpaired Person carries the Pair action on their own row,
                        so an Admin can act on what they are already looking at. It
                        opens the one pairing screen with this Person preselected;
                        somebody who has not completed Intake cannot be paired and is
                        offered nothing to press. */}
                    <td>
                      {person.participationStatus === 'ready_to_pair' ? (
                        <Link href={`/roster/pair?with=${person.personId}`}>Pair</Link>
                      ) : (
                        <span className="empty">—</span>
                      )}
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
