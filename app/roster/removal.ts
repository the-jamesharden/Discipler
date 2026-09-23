import type { PairingToLetGo } from '~/domain/removal'
import type { RosterEntry } from '~/service/ports'
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
  /** Who goes back to unpaired because this pairing ends. Empty where it goes on without them. */
  readonly endsFor: readonly string[]
}

export const whatARemovalLetsGo = (
  roster: readonly RosterEntry[],
  person: RosterEntry,
): readonly PairingARemovalLetsGo[] =>
  person.relationships.map((relationship) => {
    const unpair = unpairFor(roster, person, relationship)
    const act = unpair?.act ?? 'cancel'
    const ends = act === 'cancel' || act === 'end'
    return {
      relationshipId: relationship.relationshipId,
      act,
      isAGroup: relationship.countsAsAGroup || relationship.participantCount > 1,
      name: relationship.name,
      withNames: relationship.withNames,
      endsFor: !ends
        ? []
        : unpair
          ? unpair.endsItFor
          : relationship.role === 'leader'
            ? relationship.participantNames
            : relationship.leaderNames,
    }
  })
