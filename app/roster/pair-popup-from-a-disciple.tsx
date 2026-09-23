'use client'

import { useState } from 'react'
import { displayPhone, PAIR_POPUP, type RosterList } from './copy'
import { CLEAR } from './import-copy'
import { PairList, PairPopupShell, PairRow, useHydrated } from './pair-popup'
import { PairGroups, type PairPopupGroup } from './pair-popup-groups'

/**
 * The Pair popup, from a Disciple (Manual pairing, ticket 12): one Discipler is
 * chosen with a round mark, a sentence says what is about to be made, and the
 * button is the same act. No shape toggle ever appears on this side, and nothing
 * else is asked.
 *
 * Under the Disciplers, the Ministry's groups (Manual pairing, recut ticket 03).
 * Exactly one choice across both sections: choosing a group clears a chosen
 * Discipler, and the other way round. A Discipler makes a one-to-one; a group puts
 * the Disciple straight into it, and the group keeps the Material it has.
 *
 * This file is the Disciple's side and nothing else. What it shares with the
 * Discipler's side is `./pair-popup`, and the groups are `./pair-popup-groups`.
 */

/** The one thing chosen: a Discipler to be paired with, or a group to join. */
type Choice = { readonly of: 'a_discipler' | 'a_group'; readonly id: string }

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
  groups,
  someLeftOut,
  refusal,
  chosenBefore,
  groupChosenBefore,
}: {
  /** Whose row was pressed: the Disciple this popup pairs. */
  readonly person: { readonly id: string; readonly fullName: string }
  readonly list: RosterList
  readonly disciplers: readonly PairPopupDiscipler[]
  /** The groups this Disciple could be put into: every one the Ministry has that they are not already in. */
  readonly groups: readonly PairPopupGroup[]
  /** Whether gender left anybody or any group off the two lists above: they are not shown, and not counted. */
  readonly someLeftOut: boolean
  readonly refusal: string | undefined
  /** The Discipler chosen on a submission that came back refused, or null. */
  readonly chosenBefore: string | null
  /** The group chosen on a submission that came back refused, or null. */
  readonly groupChosenBefore: string | null
}) => {
  // A choice that came back from a refusal and is greyed now is not restored as
  // chosen: the row says why, and a round mark nobody can press is not pressed.
  // A refused join carries its group and a refused pairing its Discipler, never both.
  const [choice, setChoice] = useState<Choice | null>(() => {
    const group = groups.find((each) => each.id === groupChosenBefore && each.greyed === null)
    if (group) return { of: 'a_group', id: group.id }
    const discipler = disciplers.find((each) => each.id === chosenBefore && each.greyed === null)
    return discipler ? { of: 'a_discipler', id: discipler.id } : null
  })
  const hydrated = useHydrated()
  const discipler = choice?.of === 'a_discipler' ? disciplers.find((each) => each.id === choice.id) ?? null : null
  const group = choice?.of === 'a_group' ? groups.find((each) => each.id === choice.id) ?? null : null

  return (
    <PairPopupShell
      person={person}
      list={list}
      refusal={refusal}
      // What is chosen decides the act, and so the route and what it is told: a
      // one-to-one names the Disciple as its participant, and a join as the Person.
      postsTo={group ? 'join' : 'create'}
      posts={group ? { personId: person.id } : { participantId: person.id }}
      summary={
        group
          ? PAIR_POPUP.joinGroup(person.fullName, group)
          : discipler
            ? PAIR_POPUP.oneToOne(discipler.fullName, person.fullName)
            : null
      }
      submit={{
        label: group ? PAIR_POPUP.addToGroup : discipler ? PAIR_POPUP.createOneToOne : PAIR_POPUP.nothingChosen,
        disabled: hydrated && group === null && discipler === null,
      }}
    >
      <p className="pair-intro">{PAIR_POPUP.chooseADiscipler(person.fullName)}</p>

      {disciplers.length === 0 && groups.length === 0 ? (
        <p className="empty">{someLeftOut ? PAIR_POPUP.nobodyToChoose : PAIR_POPUP.noDisciplers}</p>
      ) : (
        <>
          <div className="pair-toolbar">
            <span>{PAIR_POPUP.counts(PAIR_POPUP.disciplers(disciplers.length), groups.length)}</span>
            {/* The only way to take a round mark back, and it needs script. */}
            {hydrated ? (
              <button type="button" className="ghost-btn small" onClick={() => setChoice(null)}>
                {CLEAR}
              </button>
            ) : null}
          </div>

          <PairList exactlyOne>
            {disciplers.map((each) => (
              <PairRow
                key={each.id}
                mark="radio"
                name="leaderId"
                person={each}
                details={[
                  each.email,
                  each.phone ? displayPhone(each.phone) : null,
                  PAIR_POPUP.leads(each.leads),
                ]}
                greyed={each.greyed}
                // With a group the server sent chosen, a refused join restored, the
                // form points at the route that joins, and a Discipler marked beside
                // it would be posted there and ignored. Held until script runs.
                held={!hydrated && group !== null}
                checked={each.id === discipler?.id}
                onChange={() => setChoice({ of: 'a_discipler', id: each.id })}
              />
            ))}
            <PairGroups
              groups={groups}
              chosenId={group?.id ?? null}
              onChoose={(id) => setChoice({ of: 'a_group', id })}
            />
          </PairList>
        </>
      )}
    </PairPopupShell>
  )
}
