'use client'

import { useState } from 'react'
import { displayPhone, PAIR_POPUP } from './copy'
import { CLEAR } from './import-copy'
import type { PairSide } from './lists'
import type { RosterView } from './menu'
import { EveryoneElse, ListedFirst, PairList, PairPopupShell, PairRow, useHydrated } from './pair-popup'
import { PairGroups, type PairPopupGroup } from './pair-popup-groups'

/**
 * The Pair popup on *Is discipled* (Manual pairing, ticket 12, and Roles per
 * pairing, ticket 01): one person is chosen to disciple them with a round mark, a
 * sentence says what is about to be made, and the button is the same act. No shape
 * toggle ever appears on this side, and nothing else is asked.
 *
 * Anybody can be chosen (Roles per pairing, ticket 01). The list opens on whoever
 * disciples somebody already, or offered to, and everybody else the gender rule
 * allows is folded under *Everyone else*.
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

/** One person who could disciple them, as the popup lists them. Nothing the Roster behind it does not already show this Admin. */
export interface PairPopupDiscipler {
  readonly id: string
  readonly fullName: string
  readonly email: string | null
  readonly phone: string | null
  /** How many people they already lead. */
  readonly leads: number
  /** Whether they head the list, as disciplining somebody already or having offered to, or are folded under Everyone else. */
  readonly listedFirst: boolean
  /** What they are discipled in now, in words, for the row's second line, or none. What they lead is `leads`. */
  readonly doingNow: readonly string[]
  /** What they are sent if chosen, and what they go on doing, for the sentence. */
  readonly invited: string
  /** Why they cannot be chosen, already in words, or null where they can (Manual pairing, ticket 23). */
  readonly greyed: string | null
}

export const PairPopupFromADisciple = ({
  person,
  view,
  sideHrefs,
  disciplers,
  groups,
  refusal,
  chosenBefore,
  groupChosenBefore,
}: {
  /** Whose row was pressed: the Disciple this popup pairs. */
  readonly person: { readonly id: string; readonly fullName: string }
  /** What the Roster's menu shows behind the popup. */
  readonly view: RosterView
  /** The popup's own address on each side, for the side chooser. */
  readonly sideHrefs: Readonly<Record<PairSide, string>>
  readonly disciplers: readonly PairPopupDiscipler[]
  /** The groups this Disciple could be put into: every one the Ministry has that they are not already in. */
  readonly groups: readonly PairPopupGroup[]
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
  const first = disciplers.filter((each) => each.listedFirst)
  const everyoneElse = disciplers.filter((each) => !each.listedFirst)
  // Open on a choice a refusal restored there, or where nobody is listed above it. Read once.
  const [foldOpensOpen] = useState(
    () => first.length === 0 || everyoneElse.some((each) => each.id === discipler?.id),
  )

  const rowOf = (each: PairPopupDiscipler) => (
    <PairRow
      key={each.id}
      mark="radio"
      name="leaderId"
      person={each}
      details={[each.email, each.phone ? displayPhone(each.phone) : null, PAIR_POPUP.leads(each.leads)]}
      also={each.doingNow}
      greyed={each.greyed}
      // With a group the server sent chosen, a refused join restored, the form
      // points at the route that joins, and a person marked beside it would be
      // posted there and ignored. Held until script runs.
      held={!hydrated && group !== null}
      checked={each.id === discipler?.id}
      onChange={() => setChoice({ of: 'a_discipler', id: each.id })}
    />
  )

  return (
    <PairPopupShell
      person={person}
      view={view}
      side={{ current: 'disciple', hrefs: sideHrefs }}
      refusal={refusal}
      // What is chosen decides the act, and so the route and what it is told: a
      // one-to-one names the Disciple as its participant, and a join as the Person.
      postsTo={group ? 'join' : 'create'}
      posts={group ? { personId: person.id } : { participantId: person.id }}
      summary={
        group
          ? { said: PAIR_POPUP.joinGroup(person.fullName, group), bold: null }
          : discipler
            ? {
                said: `${PAIR_POPUP.oneToOne(discipler.fullName, person.fullName)} ${discipler.invited}`,
                bold: PAIR_POPUP.willDisciple(discipler.fullName, [person.fullName]),
              }
            : null
      }
      submit={{
        label: group ? PAIR_POPUP.addToGroup : discipler ? PAIR_POPUP.createOneToOne : PAIR_POPUP.nothingChosen,
        disabled: hydrated && group === null && discipler === null,
      }}
      // Held by its top edge, as the other side is (Roles per pairing, ticket 01), so
      // the side chooser switches between two boxes that start in the same place,
      // and the sentence appearing grows it downward.
      grows
    >
      <p className="pair-intro">{PAIR_POPUP.chooseADiscipler(person.fullName)}</p>

      {disciplers.length === 0 && groups.length === 0 ? (
        <p className="empty">{PAIR_POPUP.nobodyToChoose}</p>
      ) : (
        <>
          <div className="pair-toolbar">
            <span>
              {PAIR_POPUP.counts(PAIR_POPUP.listed('disciple', first.length, everyoneElse.length), groups.length)}
            </span>
            {/* The only way to take a round mark back, and it needs script. */}
            {hydrated ? (
              <button type="button" className="ghost-btn small" onClick={() => setChoice(null)}>
                {CLEAR}
              </button>
            ) : null}
          </div>

          <PairList exactlyOne>
            {first.length > 0 ? <ListedFirst side="disciple">{first.map(rowOf)}</ListedFirst> : null}
            {everyoneElse.length > 0 ? (
              <EveryoneElse count={everyoneElse.length} opensOpen={foldOpensOpen}>
                {everyoneElse.map(rowOf)}
              </EveryoneElse>
            ) : null}
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
