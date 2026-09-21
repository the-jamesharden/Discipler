import type { RosterEntry, RosterRelationship } from '~/service/ports'

/**
 * What Unpair does on one line of a person's Pairings card (James, 2026-09-21).
 * The button is one word and the model has three acts under it, each with rules of
 * its own, so which one a line gets is decided here and nowhere else. Pure over
 * the Roster: the person page draws from it, and the route reads the Roster again
 * and acts from it, so what was offered and what happens are one rule.
 *
 * - **cancel**: a pairing nobody has accepted never started. It is withdrawn, for
 *   everybody in it, and records no outcome because it has none.
 * - **end**: a pairing that has started ends with an outcome, which is what lets a
 *   Ministry count later how many finished well (*An Ending Records an Outcome as
 *   Well as a Reason*). The last Disciple leaving is an ending, and so is the one
 *   Discipler who leads it leaving.
 * - **leave**: one Disciple out of a group that goes on without them.
 *
 * Whatever the act, nobody is sent anything and nothing is deleted.
 */
export type UnpairAct = 'cancel' | 'end' | 'leave'

/**
 * What the button asks before it acts. One press where nothing of anybody else's
 * ends; the outcome where a pairing that ran is ending; and a plain confirmation
 * where a group that never started is withdrawn for everybody in it.
 */
export type UnpairAsks = 'nothing' | 'outcome' | 'confirmation'

export interface Unpair {
  readonly act: UnpairAct
  readonly asks: UnpairAsks
  /** Who else it ends for, by name, for the question to say. Empty where it ends for nobody. */
  readonly endsItFor: readonly string[]
}

/** Everybody else on the Roster holding this relationship in this role. */
const othersIn = (
  roster: readonly RosterEntry[],
  person: Pick<RosterEntry, 'personId'>,
  relationship: Pick<RosterRelationship, 'relationshipId'>,
  role: RosterRelationship['role'],
): readonly RosterRelationship[] =>
  roster
    .filter((each) => each.personId !== person.personId)
    .flatMap((each) => each.relationships)
    .filter((each) => each.relationshipId === relationship.relationshipId && each.role === role)

/**
 * What Unpair does on this line of this person's page, or null where the line
 * offers none. Three lines offer none, each because no act the product has fits:
 *
 * - a Disciple in a group nobody has accepted. Cancelling is the whole group's,
 *   and a departure is refused from a relationship that has not started.
 * - a Discipler invited to a group that is already running. Theirs is an
 *   invitation, which they decline or which runs out (Manual pairing, recut ticket 06).
 * - a Discipler who leads a group beside another who has accepted. The group should
 *   go on without them, and a leader cannot leave a relationship yet.
 */
export const unpairFor = (
  roster: readonly RosterEntry[],
  person: Pick<RosterEntry, 'personId'>,
  relationship: RosterRelationship,
): Unpair | null => {
  const otherSide = relationship.role === 'leader' ? relationship.participantNames : relationship.leaderNames
  const isAGroup = relationship.countsAsAGroup || relationship.participantCount > 1

  if (relationship.awaitingAcceptance) {
    // True on a Discipler's own line while the group runs without them: read off a
    // Disciple's line, which says it only where the relationship itself waits.
    const runsWithoutThem =
      relationship.role === 'leader' &&
      othersIn(roster, person, relationship, 'participant').some((each) => !each.awaitingAcceptance)
    if (runsWithoutThem) return null
    if (!isAGroup) return { act: 'cancel', asks: 'nothing', endsItFor: otherSide }
    return relationship.role === 'leader' ? { act: 'cancel', asks: 'confirmation', endsItFor: otherSide } : null
  }

  if (relationship.role === 'participant') {
    return relationship.participantCount > 1
      ? { act: 'leave', asks: 'nothing', endsItFor: [] }
      : { act: 'end', asks: 'outcome', endsItFor: otherSide }
  }

  const ledWithAnother = othersIn(roster, person, relationship, 'leader').some((each) => !each.awaitingAcceptance)
  return ledWithAnother ? null : { act: 'end', asks: 'outcome', endsItFor: otherSide }
}
