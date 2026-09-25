import type { MemberRole } from '~/domain/relationships'
import type { RosterEntry, RosterRelationship } from '~/service/ports'
import { CANNOT_BE_PAIRED, pairingTagSaid, type NotPairable } from './copy'
import { whyNotPairable } from './lists'

/**
 * What a person's page says they do, under their name (Roles per pairing, ticket
 * 03): one tag per open pairing and per group, each with its direction, and no
 * single word for what the person is. *On the Roster as* and the Participation
 * Status chip went with it, because *Ready to Pair* on somebody who leads says the
 * opposite of what they do.
 *
 * Participation Status still decides Pair, and says itself here only where it is
 * why Pair is missing: *Awaiting Intake* and *Opted out*, tagged as the Roster tags
 * them, from `whyNotPairable` and no second rule. What they said at Intake is said
 * under *At Intake* and never as a tag, and a plan an import made is not a pairing.
 */
export type PageTag =
  | {
      readonly kind: 'state'
      readonly state: NotPairable
      readonly said: string
    }
  | {
      readonly kind: 'pairing'
      readonly relationshipId: RosterRelationship['relationshipId']
      readonly direction: string
      readonly who: string
      /** Drawn apart from a one-to-one. */
      readonly isAGroup: boolean
    }

/**
 * A group, by the live count of Disciples in it, as the size pill beside the same
 * pairing counts them. What it was formed as is a capacity declaration and words
 * nothing (ADR-0004), so a group fallen to one Disciple is tagged as a one-to-one.
 */
const isAGroupNow = (pairing: Pick<RosterRelationship, 'participantCount'>): boolean =>
  pairing.participantCount > 1

const RANK: Record<MemberRole, number> = { leader: 0, participant: 2 }

/**
 * The order a person's page says their pairings in, in the tags and in the
 * Pairings card alike: what they lead first, and within each side the one-to-ones
 * before the groups, so the groups, drawn apart, sit together at the end of their
 * side. Otherwise the reader's own order, which is stable.
 */
export const inPageOrder = <T extends Pick<RosterRelationship, 'role' | 'participantCount'>>(
  held: readonly T[],
): readonly T[] => {
  const rank = (pairing: T): number => RANK[pairing.role] + (isAGroupNow(pairing) ? 1 : 0)
  return [...held].sort((a, b) => rank(a) - rank(b))
}

export const tagsOnAPersonsPage = (person: RosterEntry): readonly PageTag[] => {
  const state = whyNotPairable(person)
  return [
    ...(state === null ? [] : [{ kind: 'state', state, said: CANNOT_BE_PAIRED[state] } as const]),
    ...inPageOrder(person.relationships).map((pairing) => {
      const isAGroup = isAGroupNow(pairing)
      return {
        kind: 'pairing',
        relationshipId: pairing.relationshipId,
        ...pairingTagSaid(pairing, isAGroup),
        isAGroup,
      } as const
    }),
  ]
}
