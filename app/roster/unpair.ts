import type { RosterEntry, RosterRelationship } from '~/service/ports'

/**
 * What Unpair does on one line of a person's Pairings card (James, 2026-09-21).
 * The button is one word and the model has four acts under it, each with rules of
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
 * - **leave**: one person out of a group that goes on without them. A Disciple,
 *   whether or not the group has started; or a Discipler, where another who has
 *   accepted goes on leading it.
 * - **withdraw**: a Discipler invited to a group that is already running leads
 *   nothing yet. What they hold is an invitation, and it is taken back.
 *
 * Whatever the act, nobody is sent anything and nothing is deleted.
 */
export type UnpairAct = 'cancel' | 'end' | 'leave' | 'withdraw'

/**
 * What the button asks before it acts. One press where nothing of anybody else's
 * changes; the outcome where a pairing that ran is ending; and a plain
 * confirmation where it is weightier than it looks: a group that never started
 * withdrawn for everybody in it, or a Discipler who stops leading one, who can
 * only come back by being invited and accepting again.
 */
export type UnpairAsks = 'nothing' | 'outcome' | 'confirmation'

export interface Unpair {
  readonly act: UnpairAct
  readonly asks: UnpairAsks
  /** Who else it ends for, by name, for the question to say. Empty where it ends for nobody. */
  readonly endsItFor: readonly string[]
  /** Who goes on leading it, by name, where a Discipler leaves a group that goes on. Empty everywhere else. */
  readonly ledOnBy: readonly string[]
}

/** Everybody else on the Roster holding this relationship in this role, with how they hold it. */
const othersIn = (
  roster: readonly RosterEntry[],
  person: Pick<RosterEntry, 'personId'>,
  relationship: Pick<RosterRelationship, 'relationshipId'>,
  role: RosterRelationship['role'],
): readonly { readonly fullName: string; readonly awaitingAcceptance: boolean }[] =>
  roster
    .filter((each) => each.personId !== person.personId)
    .flatMap((each) =>
      each.relationships
        .filter((held) => held.relationshipId === relationship.relationshipId && held.role === role)
        .map(({ awaitingAcceptance }) => ({ fullName: each.fullName, awaitingAcceptance })),
    )

/**
 * What Unpair does on this line of this person's page, or null where the line
 * offers none. One line offers none: the last Disciple of a group nobody has
 * accepted. Taking them out is the whole of it being withdrawn, which is on its
 * Discipler's page, where the question can say who it is withdrawn for.
 */
export const unpairFor = (
  roster: readonly RosterEntry[],
  person: Pick<RosterEntry, 'personId'>,
  relationship: RosterRelationship,
): Unpair | null => {
  const otherSide = relationship.role === 'leader' ? relationship.participantNames : relationship.leaderNames
  const isAGroup = relationship.countsAsAGroup || relationship.participantCount > 1
  const others = { endsItFor: [], ledOnBy: [] }

  if (relationship.awaitingAcceptance) {
    // True on a Discipler's own line while the group runs without them: read off a
    // Disciple's line, which says it only where the relationship itself waits.
    const runsWithoutThem =
      relationship.role === 'leader' &&
      othersIn(roster, person, relationship, 'participant').some((each) => !each.awaitingAcceptance)
    if (runsWithoutThem) return { act: 'withdraw', asks: 'nothing', ...others }
    if (!isAGroup) return { act: 'cancel', asks: 'nothing', ...others, endsItFor: otherSide }
    if (relationship.role === 'leader') return { act: 'cancel', asks: 'confirmation', ...others, endsItFor: otherSide }
    return relationship.participantCount > 1 ? { act: 'leave', asks: 'nothing', ...others } : null
  }

  if (relationship.role === 'participant') {
    return relationship.participantCount > 1
      ? { act: 'leave', asks: 'nothing', ...others }
      : { act: 'end', asks: 'outcome', ...others, endsItFor: otherSide }
  }

  // Only a Discipler who has accepted is somebody a group can be left with: one
  // still to answer leads nothing yet.
  const ledOnBy = othersIn(roster, person, relationship, 'leader')
    .filter((each) => !each.awaitingAcceptance)
    .map((each) => each.fullName)
  return ledOnBy.length > 0
    ? { act: 'leave', asks: 'confirmation', ...others, ledOnBy }
    : { act: 'end', asks: 'outcome', ...others, endsItFor: otherSide }
}
