import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminShell, initialsOf, NotAnAdmin } from '../shell'
import { getRosterReader } from '~/service/container'
import type { RosterEntry, RosterIntendedPairing, RosterRelationship } from '~/service/ports'
import {
  AWAITING_ACCEPTANCE,
  AWAITING_INTAKE,
  CANNOT_BE_PAIRED,
  DEFAULT_LIST,
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
  PAIR,
  PAIR_POPUP,
  invitedToGroupReceipt,
  joinedGroupReceipt,
  pairedReceipt,
  pairedSeparatelyReceipt,
  pairingRefusalMessage,
  pairingSizeLabel,
  pairsPlanned,
  partlyPairedReceipt,
  peopleAdded,
  PLANNED,
  ROSTER_LISTS,
  rowProblemMessage,
  samePersonAnswer,
  samePersonConsequence,
  SOMEONE_ELSE_ANSWER,
  SEE_FOLLOW_UP,
  SOMEONE_ELSE_CONSEQUENCE,
  STATS_LABEL,
  UNPAIRED,
  type RosterList,
} from './copy'
import { decodeSeparateReceipt } from './pair/receipt'
import { INTAKE_FORMS } from '../intake-forms/copy'
import { ImportDialog, type ImportReadbackWire } from './import-dialog'
import { IMPORT_DATASET, IMPORT_DIALOG_ID } from './import-copy'
import {
  disciplesFor,
  disciplersFor,
  groupsOf,
  leadsCount,
  onList,
  opensAs,
  pairHref,
  plansOn,
  reasonOnRow,
  relationshipsOn,
  rosterStats,
  whoThePopupIsFor,
  whyNotPairable,
} from './lists'
import { greyedForADisciple, greyedForADiscipler, type Greyed } from './greying'
import { PairPopupFromADisciple } from './pair-popup-from-a-disciple'
import { PairPopupFromADiscipler } from './pair-popup-from-a-discipler'
import { RefusedRows } from './refused-rows'
import { decodeImportReport } from './report'
import { rosterKey } from '~/domain/roster'

export const dynamic = 'force-dynamic'

/**
 * The Roster, as a pastor names it: three lists behind a toggle, All, Disciplers
 * and Disciples, each with its three numbers and its five columns. Rebuilt to the
 * prototype James brought in ticket 36, and opened on All by Manual pairing,
 * ticket 06. The model's Leader and Participant are for the code; nothing here
 * says either.
 *
 * A Discipler is a fact and never a mark -- `lists.ts` is the one rule -- and a
 * person may be on both sides, which is the discipleship-multiplication case
 * working. On All they are one row, holding every pairing they are in. The name on every row opens the Person's own page, where every act about
 * one Person lives; the row keeps Pair, the one act that belongs to a list.
 */

/** Which list to show. Nothing, or anything that is not one of the three, reads as All. */
const listIn = (value: string | undefined): RosterList =>
  isRosterList(value) ? value : DEFAULT_LIST

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
    /**
     * A set of separate one-to-ones (Manual pairing, ticket 21): how many were made,
     * and where it stopped partway, who was not paired and the code of why. Its own
     * name for the code, because `error` on this page is the import's.
     */
    pairs?: string
    notPaired?: string | string[]
    pairError?: string
    /** Who an Admin has just put into a group, and whether anybody was texted about it. */
    joined?: string
    told?: string
    /** Who an Admin has just invited to help lead a group. */
    invited?: string
    /** Why an answer to a held import row could not be applied. A code, never prose. */
    rowError?: string
    /** Whose Pair popup is open over this list (Manual pairing, ticket 12). */
    pair?: string | string[]
    /** The Discipler chosen in the popup, on a submission that came back refused. */
    leaderId?: string | string[]
    /** The Disciples ticked in the popup from a Discipler, on a submission that came back refused. */
    with?: string | string[]
  }>
}) {
  // One read: the Roster, the import rows waiting on an answer and the badge's
  // number come from one document. The held rows are read on every load, not
  // only after an upload. The import report is a redirect and outlives nothing; a
  // question that appeared only there would expire the moment an Admin navigated
  // away, which is the silent drop the reporting exists to prevent.
  //
  // With the Pair popup asked for, that one document is the Pair surface's: the
  // Roster's own with the Ministry's gender setting beside it, which is what the
  // popup greys its rows against (Manual pairing, ticket 23). Still one read.
  const query = await searchParams
  const asked = [query.pair ?? []].flat()[0]
  const page = await getRosterReader().readRosterPage(asked === undefined ? 'roster' : 'pair')

  // Signed in but not an Admin. Sending them back to sign in would only loop.
  if (page.status === 'not-an-admin') return <NotAnAdmin title="Roster" />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { roster, held, followUpCount, suggestGenderMatch, groups } = page.page

  const list = listIn(query.list)
  const shown = roster.filter((person) => onList(list, person))
  const stats = rosterStats(list, shown)

  // The Pair popup, drawn over this list (Manual pairing, ticket 12). Out of the
  // document already read: opening it is no second read. A `pair` that names
  // nobody on this Roster, or somebody who cannot be paired, opens nothing.
  const pairing = whoThePopupIsFor(roster, asked)
  // The toggle decides the side, and each side is a popup of its own (Manual
  // pairing, ticket 23). No row opens the Discipler's side until the old Pair
  // page retires: it is reached by its address, and a Discipler's row keeps
  // opening that page.
  const side = pairing ? opensAs(list, pairing) : null
  // Why a row cannot be chosen, already in words, or null where it can. Read
  // against what a one-to-one declares in this Ministry, never offered and then
  // refused.
  const inWords = (greyed: Greyed | null): string | null => (greyed === null ? null : PAIR_POPUP.greyed(greyed))
  // Compared against the list and never rendered, like every value from an address.
  const chosenBefore = [query.leaderId ?? []].flat()[0]
  const tickedBefore = [query.with ?? []].flat()

  const report = decodeImportReport(query)
  // The code, not the sentence: the dialog words it, and opens on it. An error
  // beside `pair` is a refused pairing's, and never opens the import.
  const failure =
    asked !== undefined || importFailureMessage(query.error) === undefined ? undefined : query.error
  const rowFailure = importRowRefusalMessage(query.rowError)
  // How many people the pairing just made has in it, so the receipt can say what
  // landed. Read as a count and never echoed as text.
  const paired = Number.parseInt(query.paired ?? '', 10)
  // Who was just put into a group (Manual pairing, ticket 22). Found on the whole
  // Roster and not only the list shown, and their name read off the row: the
  // address carries an id, and nothing it says is rendered. An id that names
  // nobody here is no receipt at all.
  const joined = roster.find((person) => person.personId === query.joined)?.fullName
  // And who was just invited to help lead one, found and named the same way.
  const invited = roster.find((person) => person.personId === query.invited)?.fullName

  // A set of separate one-to-ones counts the one-to-ones made. Who was not paired
  // arrives as ids and is named from the whole Roster, whichever list is showing,
  // so nothing in the address is rendered and an id that names nobody says nothing.
  const separately = decodeSeparateReceipt(query)
  const notPaired = (separately?.notPaired ?? []).flatMap((id) => {
    const person = roster.find((each) => each.personId === id)
    return person ? [person.fullName] : []
  })
  const separateReceipt =
    separately === undefined
      ? undefined
      : notPaired.length > 0
        ? partlyPairedReceipt({
            formed: separately.formed,
            notPaired,
            reason: pairingRefusalMessage(separately.refusal),
          })
        : pairedSeparatelyReceipt(separately.formed)

  /**
   * Another list's link keeps nothing else from the query string: a receipt is
   * about the page it landed on. Each names its list, All included, so the address
   * says what is being looked at whichever way the default goes.
   */
  const listHref = (which: RosterList): string => `/roster?${new URLSearchParams({ list: which })}`

  // The Roster as the import review classifies against it, in the browser:
  // every name and number this page already prints (ADR-0021), and the plans
  // still waiting. The server's own read, inside its transaction, stays the
  // authority.
  const readback = importReadback(roster)

  return (
    <AdminShell admin={admin} current="roster" followUpCount={followUpCount}>
      {/* The table first, because the Roster is a list of people, and the import
          in a popup over it. The one card below is the import rows waiting on an
          Admin. The groups, the join requests, the two Intake links and their codes
          followed the table too until ticket 32 gave them a page of their own. */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Roster</h2>
          <div className="actions" style={{ marginTop: 0 }}>
            <span className="muted">{listCount(list, shown.length)}</span>
            {/* No way into pairing from up here: every pairing starts from a row
                (Manual pairing, ticket 07). */}
            {/* The import, in a dialog over the table (ticket 36). A link to the
                dialog's own id, so it opens with no script; the dialog itself is
                at the end of the page. */}
            <a className="btn" href={`#${IMPORT_DIALOG_ID}`}>{`↑ ${IMPORT_DATASET}`}</a>
          </div>
        </div>

        {/* The three lists: three links to this same page, so the switch works
            before JavaScript has loaded and survives a refresh. */}
        <nav className="seg" aria-label="Which list to show">
          {ROSTER_LISTS.map((which) => (
            <Link key={which} href={listHref(which)} aria-current={list === which ? 'true' : undefined}>
              {LIST_LABEL[which]}
            </Link>
          ))}
        </nav>

        {/* Three numbers about the list being looked at. Paired is an open pairing
            in this list's role and nothing else, and on All in either role. */}
        <p className="stats-line">
          <span><b>{stats.total}</b> {STATS_LABEL.total}</span>
          <span><b>{stats.paired}</b> {STATS_LABEL.paired}</span>
          <span><b>{stats.unpaired}</b> {STATS_LABEL.unpaired}</span>
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

        {/* A set that stopped partway is an alert and not a status: part of what the
            Admin asked for did not happen, and they have something to do about it. */}
        {separateReceipt === undefined ? null : notPaired.length > 0 ? (
          <p className="toast error" role="alert">
            {separateReceipt}
          </p>
        ) : (
          <p className="toast" role="status">
            {separateReceipt}
          </p>
        )}

        {joined !== undefined ? (
          <p className="toast" role="status">
            {joinedGroupReceipt(joined, query.told === 'yes')}
          </p>
        ) : null}

        {invited !== undefined ? (
          <p className="toast" role="status">
            {invitedToGroupReceipt(invited)}
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
            <RefusedRows rejections={report.refused} />
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
                      {`${count} more - ${rowProblemMessage(problem)}`}
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
        ) : list !== 'all' && shown.length === 0 ? (
          <p className="empty">{EMPTY_LIST[list]}</p>
        ) : (
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
                    {/* The name opens the Person's own page, and nothing sits under
                        it: the status chip and the *Offered to mentor* tag explained
                        the model to a pastor who came to see people (Manual pairing,
                        ticket 07). The initials are derived from the name. */}
                    <td>
                      <div className="person">
                        <span className="avatar" aria-hidden="true">
                          {initialsOf(person.fullName)}
                        </span>
                        <Link href={`/roster/${person.personId}`} data-testid="roster-name">
                          {person.fullName}
                        </Link>
                      </div>
                    </td>
                    {/* Contact details, to an Admin, on every row (ADR-0021). The
                        number is shown as a person reads it and stored as the
                        system does. */}
                    <td className="contact">
                      {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : '-'}
                    </td>
                    <td className="contact">
                      {person.phone ? <a href={`tel:${person.phone}`}>{displayPhone(person.phone)}</a> : '-'}
                    </td>
                    <td>
                      <PairedWith list={list} person={person} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  the spreadsheet the Admin uploaded, and the number the row is held
                  over (ADR-0021): the question is who is on it, and an Admin answers
                  that with the number in front of them. */}
              <h3>{`Line ${row.line} - “${row.fullName}”`}</h3>
              <p className="muted">
                <a href={`tel:${row.phone}`}>{displayPhone(row.phone)}</a>
              </p>

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

      {/* Keyed by the person and the side, so a popup opened for somebody else, or
          on the other side, starts with nothing chosen. */}
      {pairing && side === 'disciple' ? (
        <PairPopupFromADisciple
          key={`disciple-${pairing.personId}`}
          person={{ id: pairing.personId, fullName: pairing.fullName }}
          list={list}
          disciplers={disciplersFor(roster, pairing).map((discipler) => ({
            id: discipler.personId,
            fullName: discipler.fullName,
            email: discipler.email,
            phone: discipler.phone,
            leads: leadsCount(discipler),
            greyed: inWords(greyedForADisciple({ enforced: suggestGenderMatch, disciple: pairing, discipler })),
          }))}
          refusal={pairingRefusalMessage(query.error)}
          chosenBefore={chosenBefore ?? null}
        />
      ) : null}
      {pairing && side === 'discipler' ? (
        <PairPopupFromADiscipler
          key={`discipler-${pairing.personId}`}
          person={{ id: pairing.personId, fullName: pairing.fullName }}
          list={list}
          disciples={disciplesFor(roster, pairing).map((disciple) => ({
            id: disciple.personId,
            fullName: disciple.fullName,
            email: disciple.email,
            phone: disciple.phone,
            firstTime: disciple.firstTime,
            groups: groupsOf(disciple, groups).map(({ name, leaders }) => ({ name, leaders })),
            greyed: inWords(greyedForADiscipler({ enforced: suggestGenderMatch, discipler: pairing, disciple })),
          }))}
          refusal={pairingRefusalMessage(query.error)}
          tickedBefore={tickedBefore}
        />
      ) : null}
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
 * they hold on the other list. On All the lines are every pairing in either role,
 * and unpaired means in none at all. No line says which way it runs: the toggle
 * above the table answers that, and a word on every line would be clutter (James,
 * reviewing Manual pairing, ticket 06).
 *
 * Every pairing starts here (Manual pairing, ticket 07). Pair is on the row of
 * everybody who can be paired, a Discipler who already leads somebody included,
 * because leading one person does not stop them leading another. Somebody who
 * cannot be paired is offered nothing to press, and the cell says why where the
 * button would have been: in place of *Unpaired* when they hold nothing, and after
 * their pairings when they do, so an Admin still reads that somebody in a pairing
 * has opted out. A plan still waiting has already said *awaiting Intake*, and its
 * row does not say it twice. `whyNotPairable` decides the button and `reasonOnRow`
 * the words, both in `lists.ts`.
 */
const PairedWith = ({ list, person }: { readonly list: RosterList; readonly person: RosterEntry }) => {
  const pairings = relationshipsOn(list, person)
  const plans = plansOn(list, person)
  const canBePaired = whyNotPairable(person) === null
  const said = reasonOnRow(list, person)
  const reason = said ? <span className="blocked">{CANNOT_BE_PAIRED[said]}</span> : null

  if (pairings.length === 0 && plans.length === 0) {
    return canBePaired ? (
      <div className="paired-with">
        <span className="blocked">{UNPAIRED}</span>
        <Link className="btn small" href={pairHref(list, person)} scroll={false}>
          {PAIR}
        </Link>
      </div>
    ) : (
      reason
    )
  }

  const lines = (
    <ul className="bare">
      {pairings.map((pairing) => (
        <li key={pairing.relationshipId}>
          <PairingLine pairing={pairing} />
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

  // Quieter beside a pairing than beside *Unpaired*: the row is already about
  // somebody, and the button is the second thing on it.
  return (
    <div className="paired-with">
      {lines}
      {canBePaired ? (
        <Link className="btn small sec" href={pairHref(list, person)} scroll={false}>
          {PAIR}
        </Link>
      ) : (
        reason
      )}
    </div>
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
      <span className="muted">{` - ${AWAITING_INTAKE}`}</span>
    ) : (
      <span className="muted">
        {' - '}
        <Link href="/follow-up">{SEE_FOLLOW_UP}</Link>
      </span>
    )}
  </>
)

const PairingLine = ({ pairing }: { readonly pairing: RosterRelationship }) => {
  // By the role the Person holds in it and not by the list, which on All is no
  // side at all. On a side's list every pairing shown is in that side's role.
  const otherSide = pairing.role === 'leader' ? pairing.participantNames : pairing.leaderNames
  return (
    <>
      {otherSide.slice(0, -1).map((name) => `${name}, `).join('')}
      {/* The size stays on the line of the last name: a pill that wraps alone
          reads as belonging to nobody. */}
      <span className="nowrap">
        {otherSide.at(-1)}
        {' '}
        <span className="size">{pairingSizeLabel(pairing.participantCount)}</span>
      </span>
      {/* Derived from the absence of an acceptance, not read from a status column
          -- there is not one. It is the difference between a pairing an Admin has
          arranged and one that has actually started, and both sides read it. */}
      {pairing.awaitingAcceptance ? <span className="muted">{` - ${AWAITING_ACCEPTANCE}`}</span> : null}
    </>
  )
}
