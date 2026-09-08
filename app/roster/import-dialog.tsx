'use client'

import { useEffect, useMemo, useState } from 'react'
import { RosterFileUnreadable } from '~/domain/errors'
import { personId, type PersonId } from '~/domain/ids'
import { phoneNumber, type PhoneNumber, type RosterKey } from '~/domain/roster'
import { IMPORT_MODES, readRosterFile, type ImportMode } from '~/domain/roster-csv'
import {
  classifyImport,
  type ClassifiedPairing,
  type ImportClassification,
  type ImportReadback,
  type SideRef,
} from '~/domain/roster-import'
import { initialsOf } from '../initials'
import { displayPhone, IMPORT_IS_NEVER_CONSENT, importFailureMessage, rowProblemMessage, rowsNotImported } from './copy'
import {
  CANCEL,
  CLEAR,
  IMPORT_DATASET,
  IMPORT_DIALOG_ID,
  IMPORT_EXAMPLE,
  IMPORT_HELP,
  IMPORT_MODE_COLUMNS,
  IMPORT_MODE_LABEL,
  IMPORT_MODE_SENTENCE,
  IMPORT_STEP,
  importButtonLabel,
  INSERT_EXAMPLE,
  NO_SCRIPT_REVIEW,
  PASTE_HERE,
  REVIEW_COLUMNS,
  REVIEW_EMPTY,
  REVIEW_LISTED_AT_MOST,
  REVIEW_MORE_ROWS,
  REVIEW_UNPAIRED,
  ROLE_PILL,
  ROW_NOTE,
  SUPPORT_EMAIL,
  TILE_LABEL,
} from './import-copy'

/**
 * The import, as the prototype has it (ticket 36): one dialog, three steps, and a
 * review that updates as the Admin pastes. The review is the same two functions
 * the server runs inside its transaction -- the reader and the classifier -- so
 * what is shown is what happens; the server's report stays the authority.
 *
 * Written so the script is the improvement and never the mechanism. The dialog is
 * ordinary markup that opens from a link by `:target`, the layout is two radio
 * buttons, the rows are a textarea, and the button is a form post. With script
 * off, step 3 says the review happens after Import, and the server's report comes
 * back on the Roster as it always has. With script on, step 3 fills in.
 *
 * Nothing here is sent anywhere but the form: the Roster the review classifies
 * against is the one the page already prints, name and number, to the same Admin.
 */

/** The Roster as the page serialises it for the review. Nothing the page does not already show. */
export interface ImportReadbackWire {
  readonly people: readonly { readonly key: string; readonly id: string; readonly name: string }[]
  readonly numbers: readonly { readonly phone: string; readonly names: readonly string[] }[]
  readonly openPlans: readonly { readonly leaderId: string; readonly participantId: string }[]
}

const readbackFrom = (wire: ImportReadbackWire): ImportReadback => ({
  people: new Map(wire.people.map((each) => [each.key as RosterKey, personId(each.id)])),
  namesByNumber: new Map(wire.numbers.map((each) => [phoneNumber(each.phone) as PhoneNumber, each.names])),
  openPlans: wire.openPlans.map((plan) => ({
    leaderId: personId(plan.leaderId),
    participantId: personId(plan.participantId),
  })),
})

export const ImportDialog = ({
  readback,
  failure,
}: {
  readonly readback: ImportReadbackWire
  /** Why the last import was refused, if it was; the dialog is open already with it. */
  readonly failure: string | undefined
}) => {
  const [mode, setMode] = useState<ImportMode>('already_paired')
  const [text, setText] = useState('')
  // The review renders only once the script is running, so the server and the
  // browser agree on the first paint and an Admin without script reads the
  // sentence that is true for them.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  // Opened by the hash as `:target` opens it without script. Said again here
  // because the router rewrites the URL on hydration and the browser does not
  // re-evaluate `:target` for that, so a page loaded on `#import` would be shut.
  const [openedByHash, setOpenedByHash] = useState(false)
  useEffect(() => {
    const check = () => setOpenedByHash(window.location.hash === `#${IMPORT_DIALOG_ID}`)
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  const roster = useMemo(() => readbackFrom(readback), [readback])
  const review = useMemo(() => reviewOf(text, mode, roster), [text, mode, roster])

  const refused = failure !== undefined
  const open = refused || openedByHash
  const label =
    review.kind === 'classified'
      ? importButtonLabel(review.classification.rows.length, review.classification.counts.pairsPlanned)
      : importButtonLabel()

  return (
    <div
      id={IMPORT_DIALOG_ID}
      className={`modal-bg${open ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
    >
      <form method="post" action="/roster/import" className="modal import">
        <div className="modal-head">
          <h2 id="import-title" className="card-title">{IMPORT_DATASET}</h2>
          {/* A link, so closing needs no script: `#closed` names nothing, so the
              dialog is no longer the target. When it is open on a refusal the
              query string is what holds it open, and the link drops that too. */}
          <a className="modal-close" href={refused ? '/roster' : '#closed'} aria-label="Close">
            ✕
          </a>
        </div>

        <p className="notice">{IMPORT_IS_NEVER_CONSENT}</p>

        {failure ? (
          <p className="toast error" role="alert">
            {importFailureMessage(failure)}
          </p>
        ) : null}

        <p className="modal-step">{`1 · ${IMPORT_STEP.layout}`}</p>
        <div className="seg-radio">
          {IMPORT_MODES.map((which) => (
            <label key={which} className={mode === which ? 'on' : undefined}>
              <input
                type="radio"
                name="mode"
                value={which}
                checked={mode === which}
                onChange={() => setMode(which)}
              />
              {IMPORT_MODE_LABEL[which]}
            </label>
          ))}
        </div>
        <p className="mode-desc">
          {IMPORT_MODE_SENTENCE[mode]}
          {' Columns: '}
          {IMPORT_MODE_COLUMNS[mode].map((column, index) => (
            <span key={column}>
              {index > 0 ? ', ' : ''}
              <span className="chip">{column}</span>
            </span>
          ))}
          {'. '}
          {IMPORT_HELP.before}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          {IMPORT_HELP.after}
        </p>

        <p className="modal-step">{`2 · ${IMPORT_STEP.paste}`}</p>
        <textarea
          name="rows"
          className="paste"
          placeholder={PASTE_HERE}
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          aria-label={IMPORT_STEP.paste}
        />
        {/* Filling the box and emptying it are conveniences that need script and
            are offered only where it runs. */}
        {hydrated ? (
          <div className="link-row">
            <button type="button" className="link-btn" onClick={() => setText(IMPORT_EXAMPLE[mode])}>
              {INSERT_EXAMPLE}
            </button>
            <button type="button" className="link-btn" onClick={() => setText('')}>
              {CLEAR}
            </button>
          </div>
        ) : null}

        <p className="modal-step">{`3 · ${IMPORT_STEP.review}`}</p>
        {hydrated ? <Review review={review} /> : <p className="muted">{NO_SCRIPT_REVIEW}</p>}

        <div className="modal-actions">
          <button type="submit">{label}</button>
          <a className="btn sec" href={refused ? '/roster' : '#closed'}>
            {CANCEL}
          </a>
        </div>
      </form>
    </div>
  )
}

type ReviewState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'unreadable'; readonly problem: string }
  | { readonly kind: 'classified'; readonly classification: ImportClassification }

/** The same reading and the same decision the server makes, over the text as typed. */
const reviewOf = (text: string, mode: ImportMode, roster: ImportReadback): ReviewState => {
  if (text.trim() === '') return { kind: 'empty' }
  try {
    return { kind: 'classified', classification: classifyImport(readRosterFile(text, mode), roster) }
  } catch (error) {
    if (error instanceof RosterFileUnreadable) return { kind: 'unreadable', problem: error.problem }
    throw error
  }
}

const Review = ({ review }: { readonly review: ReviewState }) => {
  if (review.kind === 'empty') return <p className="muted">{REVIEW_EMPTY}</p>
  if (review.kind === 'unreadable') {
    return (
      <p className="toast error" role="alert">
        {importFailureMessage(review.problem)}
      </p>
    )
  }

  const { rows, pairings, rejections, counts } = review.classification
  const listed = rows.slice(0, REVIEW_LISTED_AT_MOST)

  /** The name a side resolves to: a row of this paste, or somebody the Roster holds. */
  const nameOf = (side: SideRef | null, names: ReadonlyMap<PersonId, string>): string | null =>
    side === null ? null : side.kind === 'row' ? (rows[side.index]?.fullName ?? null) : (names.get(side.personId) ?? null)

  const names = new Map<PersonId, string>()
  for (const row of rows) if (row.existingId) names.set(row.existingId, row.fullName)

  const refersTo = (side: SideRef | null, index: number) => side?.kind === 'row' && side.index === index
  type Side = { readonly role: 'discipler' | 'disciple'; readonly with: string | null }
  const plannedWith = (index: number): Side[] =>
    pairings
      .filter((pairing): pairing is ClassifiedPairing & { outcome: 'planned' } => pairing.outcome === 'planned')
      .flatMap((pairing): Side[] => {
        if (refersTo(pairing.leader, index)) return [{ role: 'discipler', with: nameOf(pairing.participant, names) }]
        if (refersTo(pairing.participant, index)) return [{ role: 'disciple', with: nameOf(pairing.leader, names) }]
        return []
      })

  return (
    <>
      <div className="tiles">
        <div className="tile"><div className="tile-value">{counts.newDisciplers}</div><div className="tile-label">{TILE_LABEL.newDisciplers}</div></div>
        <div className="tile"><div className="tile-value">{counts.newDisciples}</div><div className="tile-label">{TILE_LABEL.newDisciples}</div></div>
        <div className="tile"><div className="tile-value">{counts.pairsPlanned}</div><div className="tile-label">{TILE_LABEL.pairsPlanned}</div></div>
        <div className="tile"><div className={`tile-value${counts.alreadyOnTheRoster === 0 ? ' dim' : ''}`}>{counts.alreadyOnTheRoster}</div><div className="tile-label">{TILE_LABEL.alreadyInRoster}</div></div>
      </div>

      {listed.length > 0 ? (
        <div className="review-wrap">
          <table>
            <thead>
              <tr>
                {REVIEW_COLUMNS.map((column) => (
                  <th key={column} className={column === '#' ? 'num' : undefined}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed.map((row, index) => {
                const plans = plannedWith(index)
                const discipler = plans.some((plan) => plan.role === 'discipler')
                return (
                  <tr key={`${row.line}:${row.phone}:${row.fullName}`} className={row.outcome === 'new' ? undefined : 'dim'}>
                    <td className="num">{index + 1}</td>
                    <td>
                      <div className="person">
                        <span className="avatar" aria-hidden="true">{initialsOf(row.fullName)}</span>
                        <div>
                          <span>{row.fullName}</span>
                          {row.outcome !== 'new' ? <div className="muted">{ROW_NOTE[row.outcome]}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-pill ${discipler ? 'discipler' : 'disciple'}`}>
                        {discipler ? ROLE_PILL.discipler : ROLE_PILL.disciple}
                      </span>
                    </td>
                    <td className="contact">{displayPhone(row.phone)}</td>
                    <td className="contact">{row.email ?? '-'}</td>
                    <td>
                      {plans.length === 0 ? (
                        <span className="blocked">{REVIEW_UNPAIRED}</span>
                      ) : (
                        plans.map((plan, at) => (
                          <span key={at} className="pair-yes">{`→ ${plan.with ?? ''}`}</span>
                        ))
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length > listed.length ? (
            <p className="muted">{REVIEW_MORE_ROWS(rows.length - listed.length)}</p>
          ) : null}
        </div>
      ) : null}

      {rejections.length > 0 ? (
        <div className="review-refused">
          <p>{rowsNotImported(rejections.length)}</p>
          <ul>
            {rejections.map(({ line, problem }) => (
              <li key={`${line}:${problem}`}>{`Line ${line} - ${rowProblemMessage(problem)}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
