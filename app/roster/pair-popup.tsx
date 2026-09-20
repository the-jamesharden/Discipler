'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { initialsOf } from '../initials'
import { displayPhone, PAIR_POPUP, type RosterList } from './copy'
import { CANCEL, CLEAR } from './import-copy'

/**
 * The Pair popup over the Roster (Manual pairing, ticket 12): its shell, and its
 * simplest complete path, from a Disciple. One Discipler is chosen with a round
 * mark, a sentence says what is about to be made, and the button is the same act.
 *
 * It is the Roster's own page at `?pair=`, so the server sends it open, a refresh
 * keeps it open, and every way out is a link back to the list behind it. It is
 * fed from the document the Roster already read; opening it is no second read.
 *
 * Script is the improvement here as it is in the import dialog: the sentence, the
 * button's words and its disabled state follow the round marks once script runs.
 * The form is an ordinary one to the existing pairing route, so it posts without
 * script, and the route refuses an empty choice as it always has.
 */

/** One Discipler as the popup lists them. Nothing the Roster behind it does not already show this Admin. */
export interface PairPopupDiscipler {
  readonly id: string
  readonly fullName: string
  readonly email: string | null
  readonly phone: string | null
  /** How many people they already lead. */
  readonly leads: number
}

export const PairPopup = ({
  person,
  list,
  disciplers,
  refusal,
  chosenBefore,
}: {
  /** Whose row was pressed: the Disciple this popup pairs. */
  readonly person: { readonly id: string; readonly fullName: string }
  /** The list behind the popup, which every way out returns to and the receipt lands on. */
  readonly list: RosterList
  readonly disciplers: readonly PairPopupDiscipler[]
  /** Why the last submission was refused, already in words, if it was. */
  readonly refusal: string | undefined
  /** The Discipler chosen on a submission that came back refused, or null. */
  readonly chosenBefore: string | null
}) => {
  const [chosenId, setChosenId] = useState<string | null>(chosenBefore)
  // Disabled only where script runs, so an Admin without it can still post.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const chosen = disciplers.find((each) => each.id === chosenId) ?? null
  const back = `/roster?${new URLSearchParams({ list })}`

  return (
    <div
      className="modal-bg open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pair-title"
      data-testid="pair-popup"
    >
      {/* The backdrop is a link like the other two ways out, under the popup and
          out of the tab order: the X and Cancel already say Close to a keyboard. */}
      <Link className="modal-backdrop" href={back} scroll={false} aria-hidden="true" tabIndex={-1} />

      <form method="post" action="/roster/pair/create" className="modal pair">
        <input type="hidden" name="pair" value={person.id} />
        <input type="hidden" name="list" value={list} />
        <input type="hidden" name="participantId" value={person.id} />

        <div className="modal-head">
          <h2 id="pair-title" className="card-title">{PAIR_POPUP.title(person.fullName)}</h2>
          <Link className="modal-close" href={back} scroll={false} aria-label={PAIR_POPUP.close}>
            ✕
          </Link>
        </div>

        {refusal ? (
          <p className="toast error" role="alert">{refusal}</p>
        ) : null}

        <p className="pair-intro">{PAIR_POPUP.chooseADiscipler(person.fullName)}</p>

        {disciplers.length === 0 ? (
          <p className="empty">{PAIR_POPUP.noDisciplers}</p>
        ) : (
          <>
            <div className="pair-toolbar">
              <span>{PAIR_POPUP.disciplers(disciplers.length)}</span>
              {/* The only way to take a round mark back, and it needs script. */}
              {hydrated ? (
                <button type="button" className="link-btn" onClick={() => setChosenId(null)}>
                  {CLEAR}
                </button>
              ) : null}
            </div>

            <div className="pair-list" role="radiogroup" aria-labelledby="pair-title">
              {disciplers.map((discipler) => (
                <label
                  key={discipler.id}
                  className={`pair-opt${discipler.id === chosenId ? ' on' : ''}`}
                >
                  <input
                    type="radio"
                    name="leaderId"
                    value={discipler.id}
                    checked={discipler.id === chosenId}
                    onChange={() => setChosenId(discipler.id)}
                  />
                  <span className="avatar" aria-hidden="true">{initialsOf(discipler.fullName)}</span>
                  <span className="pair-who">
                    <span className="pair-name">{discipler.fullName}</span>
                    {/* Each missing detail is simply absent: no dash stands in for it. */}
                    <span className="pair-sub">
                      {[
                        discipler.email,
                        discipler.phone ? displayPhone(discipler.phone) : null,
                        PAIR_POPUP.leads(discipler.leads),
                      ]
                        .filter((detail): detail is string => detail !== null)
                        .join(' · ')}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {chosen ? (
          <p className="pair-summary" role="status">
            {PAIR_POPUP.oneToOne(chosen.fullName, person.fullName)}
          </p>
        ) : null}

        <div className="modal-actions">
          <Link className="btn sec" href={back} scroll={false}>
            {CANCEL}
          </Link>
          <button type="submit" disabled={hydrated && chosen === null}>
            {chosen ? PAIR_POPUP.createOneToOne : PAIR_POPUP.nothingChosen}
          </button>
        </div>
      </form>
    </div>
  )
}
