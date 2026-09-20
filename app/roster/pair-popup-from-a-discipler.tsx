'use client'

import { useState } from 'react'
import { displayPhone, firstTimeLabel, PAIR_POPUP, type RosterList } from './copy'
import { CLEAR } from './import-copy'
import { PairList, PairPopupShell, PairRow, useHydrated } from './pair-popup'

/**
 * The Pair popup, from a Discipler (Manual pairing, ticket 23): the list of
 * Disciples with boxes, and one tick that makes the one-to-one the other side
 * makes, in the same sentence and on the same button. Nothing else is asked: no
 * gender, no name, no Material.
 *
 * Two or more ticked has no shape to become yet. The button stays disabled and a
 * line says the choice of shape is coming; the toggle that chooses one replaces
 * that line.
 *
 * This file is the Discipler's side and nothing else. What it shares with the
 * Disciple's side is `./pair-popup`. No row opens it yet: it is reached by its
 * address, and a Discipler's row keeps opening the old Pair page.
 */

/** One Disciple as the popup lists them. Nothing the Roster behind it does not already show this Admin. */
export interface PairPopupDisciple {
  readonly id: string
  readonly fullName: string
  readonly email: string | null
  readonly phone: string | null
  /** What they said about whether this is their first time, or null where nobody asked. Ranks and filters nobody. */
  readonly firstTime: boolean | null
  /** The groups they are already in, which hides nobody and greys nobody. */
  readonly groups: readonly { readonly name: string | null; readonly leaders: readonly { readonly fullName: string }[] }[]
  /** Why they cannot be ticked, already in words, or null where they can. */
  readonly greyed: string | null
}

export const PairPopupFromADiscipler = ({
  person,
  list,
  disciples,
  refusal,
  tickedBefore,
}: {
  /** Whose popup this is: the Discipler being paired. */
  readonly person: { readonly id: string; readonly fullName: string }
  readonly list: RosterList
  readonly disciples: readonly PairPopupDisciple[]
  readonly refusal: string | undefined
  /** Who was ticked on a submission that came back refused. */
  readonly tickedBefore: readonly string[]
}) => {
  // A tick that came back from a refusal and is greyed now is not restored: the
  // row says why, and a box nobody can tick is not ticked.
  const [tickedIds, setTickedIds] = useState<readonly string[]>(
    disciples.filter((each) => tickedBefore.includes(each.id) && each.greyed === null).map(({ id }) => id),
  )
  const hydrated = useHydrated()
  const ticked = disciples.filter((each) => tickedIds.includes(each.id))
  const only = ticked.length === 1 ? ticked[0]! : null

  return (
    <PairPopupShell
      person={person}
      list={list}
      refusal={refusal}
      posts={{ leaderId: person.id }}
      summary={only ? PAIR_POPUP.oneToOne(person.fullName, only.fullName) : null}
      submit={{
        label: only ? PAIR_POPUP.createOneToOne : PAIR_POPUP.nothingChosen,
        // Two or more is disabled as the server sends it: there is nothing yet for
        // that post to become. Nothing ticked is disabled only where script runs,
        // so an Admin without it can still tick one and post.
        disabled: ticked.length > 1 || (hydrated && ticked.length === 0),
      }}
    >
      <p className="pair-intro">{PAIR_POPUP.chooseDisciples(person.fullName)}</p>

      {disciples.length === 0 ? (
        <p className="empty">{PAIR_POPUP.noDisciples}</p>
      ) : (
        <>
          <div className="pair-toolbar">
            <span>{PAIR_POPUP.disciples(disciples.length)}</span>
            {/* Unticks everything. There is no Select all. */}
            {hydrated ? (
              <button type="button" className="link-btn" onClick={() => setTickedIds([])}>
                {CLEAR}
              </button>
            ) : null}
          </div>

          <PairList exactlyOne={false}>
            {disciples.map((disciple) => (
              <PairRow
                key={disciple.id}
                mark="checkbox"
                name="participantId"
                person={disciple}
                details={[
                  disciple.email,
                  disciple.phone ? displayPhone(disciple.phone) : null,
                  disciple.firstTime === null ? null : firstTimeLabel(disciple.firstTime),
                  ...disciple.groups.map((group) => PAIR_POPUP.inGroup(group)),
                ]}
                greyed={disciple.greyed}
                checked={tickedIds.includes(disciple.id)}
                onChange={(checked) =>
                  setTickedIds((before) =>
                    checked ? [...before, disciple.id] : before.filter((id) => id !== disciple.id),
                  )
                }
              />
            ))}
          </PairList>
        </>
      )}

      {ticked.length > 1 ? <p className="pair-hint">{PAIR_POPUP.shapeIsComing}</p> : null}
    </PairPopupShell>
  )
}
