'use client'

import { useState } from 'react'
import { displayPhone, PAIR_POPUP, type RosterList } from './copy'
import { CLEAR } from './import-copy'
import { PairList, PairPopupShell, PairRow, useHydrated } from './pair-popup'

/**
 * The Pair popup, from a Disciple (Manual pairing, ticket 12): one Discipler is
 * chosen with a round mark, a sentence says what is about to be made, and the
 * button is the same act. No shape toggle ever appears on this side, and nothing
 * else is asked.
 *
 * This file is the Disciple's side and nothing else. What it shares with the
 * Discipler's side is `./pair-popup`.
 */

/** One Discipler as the popup lists them. Nothing the Roster behind it does not already show this Admin. */
export interface PairPopupDiscipler {
  readonly id: string
  readonly fullName: string
  readonly email: string | null
  readonly phone: string | null
  /** How many people they already lead. */
  readonly leads: number
  /** Why they cannot be chosen, already in words, or null where they can (Manual pairing, ticket 23). */
  readonly greyed: string | null
}

export const PairPopupFromADisciple = ({
  person,
  list,
  disciplers,
  refusal,
  chosenBefore,
}: {
  /** Whose row was pressed: the Disciple this popup pairs. */
  readonly person: { readonly id: string; readonly fullName: string }
  readonly list: RosterList
  readonly disciplers: readonly PairPopupDiscipler[]
  readonly refusal: string | undefined
  /** The Discipler chosen on a submission that came back refused, or null. */
  readonly chosenBefore: string | null
}) => {
  // A choice that came back from a refusal and is greyed now is not restored as
  // chosen: the row says why, and a round mark nobody can press is not pressed.
  const [chosenId, setChosenId] = useState<string | null>(
    disciplers.find((each) => each.id === chosenBefore && each.greyed === null)?.id ?? null,
  )
  const hydrated = useHydrated()
  const chosen = disciplers.find((each) => each.id === chosenId) ?? null

  return (
    <PairPopupShell
      person={person}
      list={list}
      refusal={refusal}
      posts={{ participantId: person.id }}
      summary={chosen ? PAIR_POPUP.oneToOne(chosen.fullName, person.fullName) : null}
      submit={{
        label: chosen ? PAIR_POPUP.createOneToOne : PAIR_POPUP.nothingChosen,
        disabled: hydrated && chosen === null,
      }}
    >
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

          <PairList exactlyOne>
            {disciplers.map((discipler) => (
              <PairRow
                key={discipler.id}
                mark="radio"
                name="leaderId"
                person={discipler}
                details={[
                  discipler.email,
                  discipler.phone ? displayPhone(discipler.phone) : null,
                  PAIR_POPUP.leads(discipler.leads),
                ]}
                greyed={discipler.greyed}
                checked={discipler.id === chosenId}
                onChange={() => setChosenId(discipler.id)}
              />
            ))}
          </PairList>
        </>
      )}
    </PairPopupShell>
  )
}
