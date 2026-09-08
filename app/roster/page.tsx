import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminShell, initialsOf, NotAnAdmin } from '../shell'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getRosterReader } from '~/service/container'
import type { RosterEntry, RosterIntendedPairing, RosterRelationship } from '~/service/ports'
import {
  AWAITING_ACCEPTANCE,
  AWAITING_INTAKE,
  displayPhone,
  EMPTY_LIST,
  HELD_ROWS_EXPLANATION,
  HELD_ROWS_HEADING,
  importFailureMessage,
  importRowRefusalMessage,
  isRosterList,
  LIST_HEADING,
  LIST_LABEL,
  listCount,
  NOBODY_ON_THIS_NUMBER,
  NOT_MADE,
  OFFERED_TO_MENTOR,
  PAIR,
  PAIR_PEOPLE,
  pairedReceipt,
  pairingSizeLabel,
  pairsPlanned,
  participationStatusLabel,
  peopleAdded,
  PLANNED,
  ROSTER_LISTS,
  rowProblemMessage,
  rowsNotImported,
  samePersonAnswer,
  samePersonConsequence,
  SOMEONE_ELSE_ANSWER,
  SEE_FOLLOW_UP,
  SOMEONE_ELSE_CONSEQUENCE,
  STATS_LABEL,
  STATUS_FOOTNOTE,
  UNPAIRED,
  type RosterList,
} from './copy'
import { INTAKE_FORMS } from '../intake-forms/copy'
import { ImportDialog, type ImportReadbackWire } from './import-dialog'
import { IMPORT_DATASET, IMPORT_DIALOG_ID } from './import-copy'
import { isDiscipler, onList, plansOn, relationshipsOn, rosterStats } from './lists'
import { decodeImportReport } from './report'
import { rosterKey } from '~/domain/roster'

export const dynamic = 'force-dynamic'

/**
 * The Roster, as a pastor names it: two lists behind a toggle, All Disciplers and
 * All Disciples, each with its four numbers and its five columns. Rebuilt to the
 * prototype James brought in ticket 36. The model's Leader and Participant are
 * for the code; nothing here says either.
 *
 * A Discipler is a fact and never a mark -- `lists.ts` is the one rule -- and a
 * person may be on both lists, which is the discipleship-multiplication case
 * working. The name on every row opens the Person's own page, where every act
 * about one Person lives; the row keeps Pair, the one act that belongs to a list.
 */

/** Which list to show. Anything the query string does not say reads as Disciplers. */
const listIn = (value: string | undefined): RosterList =>
  isRosterList(value) ? value : 'disciplers'

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{
    list?: string
    added?: string
    refused?: string
    hidden?: string
    error?: string
    paired?: string
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

  const list = listIn(query.list)
  const shown = roster.filter((person) => onList(list, person))
  const stats = rosterStats(list, shown)

  const report = decodeImportReport(query)
  // The code, not the sentence: the dialog words it, and opens on it.
  const failure = importFailureMessage(query.error) === undefined ? undefined : query.error
  const rowFailure = importRowRefusalMessage(query.rowError)
  // How many people the pairing just made has in it, so the receipt can say what
  // landed. Read as a count and never echoed as text.
  const paired = Number.parseInt(query.paired ?? '', 10)

  /** The other list's link keeps nothing else from the query string: a receipt is about the page it landed on. */
  const listHref = (which: RosterList): string =>
    which === 'disciplers' ? '/roster' : `/roster?${new URLSearchParams({ list: which })}`

  // The Roster as the import review classifies against it, in the browser:
  // every name and number this page already prints (ADR-0021), and the plans
  // still waiting. The server's own read, inside its transaction, stays the
  // authority.
  const readback = importReadback(roster)

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
            <span className="muted">{listCount(list, shown.length)}</span>
            {/* The way in that does not start from one row. The Pair action on a
                row opens the same screen with somebody already chosen, but somebody
                already being discipled has no Pair action and may still disciple,
                and several people selected together start from nobody in
                particular. */}
            <Link className="btn sec" href="/roster/pair">{PAIR_PEOPLE}</Link>
            {/* The import, in a dialog over the table (ticket 36). A link to the
                dialog's own id, so it opens with no script; the dialog itself is
                at the end of the page. */}
            <a className="btn" href={`#${IMPORT_DIALOG_ID}`}>{`↑ ${IMPORT_DATASET}`}</a>
          </div>
        </div>

        {/* The two lists: two links to this same page, so the switch works before
            JavaScript has loaded and survives a refresh. */}
        <nav className="seg" aria-label="Which list to show">
          {ROSTER_LISTS.map((which) => (
            <Link key={which} href={listHref(which)} aria-current={list === which ? 'true' : undefined}>
              {LIST_LABEL[which]}
            </Link>
          ))}
        </nav>

        {/* Four numbers about the list being looked at. Paired is an open pairing in
            this list's role and nothing else; in groups is counted from the live
            number of people being discipled, never from a kind column. */}
        <p className="stats-line">
          <span><b>{stats.total}</b> {STATS_LABEL.total}</span>
          <span><b>{stats.paired}</b> {STATS_LABEL.paired}</span>
          <span><b>{stats.unpaired}</b> {STATS_LABEL.unpaired}</span>
          <span><b>{stats.inGroups}</b> {STATS_LABEL.inGroups}</span>
        </p>

        {Number.isInteger(paired) && paired > 0 ? (
          <p className="toast" role="status">
            {/* What just happened, and not what is still true. The state this used
                to assert is on the rows, derived; a receipt that went on claiming
                it would be the one thing on the Roster still saying *awaiting*
                after the Discipler had accepted and the page was reloaded. */}
            {pairedReceipt(paired)}
          </p>
        ) : null}

        {/* What the last upload did, here rather than in the popup that started it:
            the upload redirects back to this page, and its report has to be in
            front of the Admin without a button to press first. */}
        {report ? (
          <div className="toast" role="status">
            {/* Each sentence is one string rather than an assembly of fragments, so
                it reads as a sentence in the markup too and can be asserted on. */}
            <p>{peopleAdded(report.added)}</p>
            {/* A plan is not a pairing (ADR-0022); the sentence says what it waits on. */}
            {report.planned > 0 ? <p>{pairsPlanned(report.planned)}</p> : null}
            {report.refused.length > 0 ? (
              <>
                <p>{rowsNotImported(report.refused.length)}</p>
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
            Nobody is on this Roster yet. Import your spreadsheet, or send one of the{' '}
            <Link href="/intake-forms">{INTAKE_FORMS}</Link>.
          </p>
        ) : shown.length === 0 ? (
          <p className="empty">{EMPTY_LIST[list]}</p>
        ) : (
          <>
            <div className="tbl-wrap roster-table">
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>{LIST_HEADING[list]}</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Paired with</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((person, index) => (
                    <tr key={person.personId}>
                      <td className="num">{index + 1}</td>
                      {/* The name opens the Person's own page. Under it, the one
                          status chip and the one Intake signal the row carries
                          (ticket 36, Q2): small, on a second line, so the five
                          columns of the prototype stay five. The initials are
                          derived from the name. */}
                      <td>
                        <div className="person">
                          <span className="avatar" aria-hidden="true">
                            {initialsOf(person.fullName)}
                          </span>
                          <div>
                            <span>
                              <Link href={`/roster/${person.personId}`} data-testid="roster-name">
                                {person.fullName}
                              </Link>
                            </span>
                            <div className="person-sub">
                              <span className={`rs rs-${person.participationStatus}`}>
                                {participationStatusLabel[person.participationStatus]}
                              </span>
                              {/* What the Person said about themselves on the form.
                                  Only the mentor answer is said: it is the one an
                                  Admin might act on, and a word on every other row
                                  would make a column of state out of one signal. */}
                              {person.declaredSide === 'mentor' ? (
                                <span className="pill n">{OFFERED_TO_MENTOR}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Contact details, to an Admin, on every row (ADR-0021). The
                          number is shown as a person reads it and stored as the
                          system does. */}
                      <td className="contact">
                        {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : '—'}
                      </td>
                      <td className="contact">
                        {person.phone ? <a href={`tel:${person.phone}`}>{displayPhone(person.phone)}</a> : '—'}
                      </td>
                      <td>
                        <PairedWith list={list} person={person} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="subtle">{STATUS_FOOTNOTE}</p>
          </>
        )}
      </div>

      {/* Its own card, below the table. Not folded into the import report: the
          report says what one upload did and is gone on the next navigation, and
          these outlive it by design -- a row nobody has answered is still waiting
          a week later. */}
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
                  the spreadsheet the Admin uploaded, and the names below say which
                  number this is. */}
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

      {/* Fixed over the page, so where it sits in the markup does not matter;
          last, so a reader without styles meets the Roster first. Open already
          when the last import was refused, with the reason beside the rows. */}
      <ImportDialog readback={readback} failure={failure} />
    </AdminShell>
  )
}

/**
 * What the review needs to know about the Roster, from what the page already
 * holds. A Person with no number cannot be matched by an import and is left out.
 */
const importReadback = (roster: readonly RosterEntry[]): ImportReadbackWire => {
  const numbers = new Map<string, string[]>()
  for (const person of roster) {
    if (person.phone) numbers.set(person.phone, [...(numbers.get(person.phone) ?? []), person.fullName])
  }
  return {
    people: roster.flatMap((person) =>
      person.phone
        ? [{ key: rosterKey({ fullName: person.fullName, phone: person.phone }), id: person.personId, name: person.fullName }]
        : [],
    ),
    numbers: [...numbers].map(([phone, names]) => ({ phone, names })),
    openPlans: roster.flatMap((person) =>
      person.intendedPairings.flatMap((plan) =>
        plan.role === 'leader' && plan.state === 'awaiting_intake'
          ? [{ leaderId: person.personId, participantId: plan.withPersonId }]
          : [],
      ),
    ),
  }
}

/**
 * The Paired with cell: one line per pairing the Person holds in this list's
 * role, naming the other side -- who a Discipler disciples, who a Disciple is
 * discipled by -- with the size pill and, where the Discipler has not yet agreed,
 * a note saying so. A person in no pairing in this role is unpaired here, whatever
 * they hold on the other list, and gets the one act that belongs to a row.
 */
const PairedWith = ({ list, person }: { readonly list: RosterList; readonly person: RosterEntry }) => {
  const pairings = relationshipsOn(list, person)
  const plans = plansOn(list, person)

  if (pairings.length === 0 && plans.length === 0) {
    return (
      <>
        <span className="blocked">{UNPAIRED}</span>
        {/* Offered on the state: somebody who has not completed Intake cannot be
            paired and is offered nothing to press. Preselected as the Discipler on
            the Disciplers list and as the Disciple on the other, and the pairing
            screen lets the Admin change that. */}
        {person.participationStatus === 'ready_to_pair' ? (
          <>
            {' '}
            <Link
              className="btn small"
              href={`/roster/pair?${new URLSearchParams(
                list === 'disciplers' || isDiscipler(person)
                  ? { leaderId: person.personId }
                  : { with: person.personId },
              )}`}
            >
              {PAIR}
            </Link>
          </>
        ) : null}
      </>
    )
  }

  return (
    <ul className="bare">
      {pairings.map((pairing) => (
        <li key={pairing.relationshipId}>
          <PairingLine list={list} pairing={pairing} />
        </li>
      ))}
      {/* What an import planned and nothing has formed yet: waiting on Intake, or
          refused and standing on the Follow-Up tab until an Admin acts. Neither
          counts as paired; both say so on the row (ADR-0022). */}
      {plans.map((plan) => (
        <li key={plan.id}>
          <PlanLine plan={plan} />
        </li>
      ))}
    </ul>
  )
}

const PlanLine = ({ plan }: { readonly plan: RosterIntendedPairing }) => (
  <>
    {/* The name and its pill stay on one line; only the note after them wraps. */}
    <span className="nowrap">
      {plan.withName}
      {' '}
      <span className={`pill ${plan.state === 'awaiting_intake' ? 'plan' : 'refused'}`}>
        {plan.state === 'awaiting_intake' ? PLANNED : NOT_MADE}
      </span>
    </span>
    {plan.state === 'awaiting_intake' ? (
      <span className="muted">{` — ${AWAITING_INTAKE}`}</span>
    ) : (
      <span className="muted">
        {' — '}
        <Link href="/follow-up">{SEE_FOLLOW_UP}</Link>
      </span>
    )}
  </>
)

const PairingLine = ({ list, pairing }: { readonly list: RosterList; readonly pairing: RosterRelationship }) => {
  const otherSide = list === 'disciplers' ? pairing.participantNames : pairing.leaderNames
  return (
    <>
      {otherSide.join(', ')}
      {' '}
      <span className="size">{pairingSizeLabel(pairing.participantCount)}</span>
      {/* Derived from the absence of an acceptance, not read from a status column
          -- there is not one. It is the difference between a pairing an Admin has
          arranged and one that has actually started, and both sides read it. */}
      {pairing.awaitingAcceptance ? <span className="muted">{` — ${AWAITING_ACCEPTANCE}`}</span> : null}
    </>
  )
}
