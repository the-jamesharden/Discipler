import type { PairingToLetGo } from '~/domain/removal'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import { unpairFor } from './unpair'

/**
 * What removing one Person does to each pairing they hold (Remove from the
 * Roster, ticket 01): the act, read by the rule Unpair uses on that line of their
 * page, and who else goes back to unpaired because of it. Pure over the Roster,
 * so the question the page asks and the acts the route takes are one rule.
 *
 * The one line Unpair offers nothing on -- the last Disciple of a group nobody
 * has accepted -- is that group withdrawn, which is the only way it can lose
 * them, and it is withdrawn for whoever was invited to lead it.
 */
export interface PairingARemovalLetsGo extends PairingToLetGo {
  /** A group, and not a one-to-one: what the question names on a line of its own. */
  readonly isAGroup: boolean
  /** What the Ministry calls the group, where it calls it anything. */
  readonly name: string | null
  /** Everybody else in it, for naming a group nobody named. */
  readonly withNames: readonly string[]
  /** It ends, for everybody in it, rather than going on without them. */
  readonly ends: boolean
  /**
   * Who goes back to unpaired because this pairing ends: the other side, less
   * anybody who still holds a pairing in that role once the removal is done.
   * Empty where it goes on without them.
   */
  readonly endsFor: readonly string[]
}

/**
 * The other side of a pairing that ends, by name, less whoever keeps another
 * pairing in the same role that this removal does not also end: a Discipler who
 * leads other groups is not unpaired by losing one. Somebody the Roster does not
 * list is taken to hold nothing else.
 */
const backToUnpaired = (
  roster: readonly RosterEntry[],
  person: Pick<RosterEntry, 'personId'>,
  relationship: RosterRelationship,
  ending: ReadonlySet<RosterRelationship['relationshipId']>,
): readonly string[] => {
  const role = relationship.role === 'leader' ? 'participant' : 'leader'
  const stillPaired = roster
    .filter(
      (each) =>
        each.personId !== person.personId &&
        each.relationships.some((held) => held.relationshipId === relationship.relationshipId && held.role === role) &&
        each.relationships.some((held) => held.role === role && !ending.has(held.relationshipId)),
    )
    .map((each) => each.fullName)
  // By name, one for one, so two people of the same name are told apart by count.
  return (role === 'participant' ? relationship.participantNames : relationship.leaderNames).filter((name) => {
    const at = stillPaired.indexOf(name)
    if (at === -1) return true
    stillPaired.splice(at, 1)
    return false
  })
}

export const whatARemovalLetsGo = (
  roster: readonly RosterEntry[],
  person: RosterEntry,
): readonly PairingARemovalLetsGo[] => {
  const acts = person.relationships.map((relationship) => {
    const act = unpairFor(roster, person, relationship)?.act ?? 'cancel'
    return { relationship, act, ends: act === 'cancel' || act === 'end' }
  })
  const ending = new Set(acts.flatMap(({ relationship, ends }) => (ends ? [relationship.relationshipId] : [])))
  return acts.map(({ relationship, act, ends }) => ({
    relationshipId: relationship.relationshipId,
    act,
    isAGroup: relationship.countsAsAGroup || relationship.participantCount > 1,
    name: relationship.name,
    withNames: relationship.withNames,
    ends,
    endsFor: ends ? backToUnpaired(roster, person, relationship, ending) : [],
  }))
}
