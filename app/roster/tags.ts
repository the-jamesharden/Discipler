import type { RosterEntry, RosterRelationship } from '~/service/ports'
import { CANNOT_BE_PAIRED, pairingTagSaid, type NotPairable } from './copy'
import { inPairingOrder, isAGroupNow, whyNotPairable } from './lists'

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
 *
 * A group is one by the live count of Disciples (`isAGroupNow`), and the order is
 * the one every screen says pairings in (`inPairingOrder`), both in `./lists`.
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

export const tagsOnAPersonsPage = (person: RosterEntry): readonly PageTag[] => {
  const state = whyNotPairable(person)
  return [
    ...(state === null ? [] : [{ kind: 'state', state, said: CANNOT_BE_PAIRED[state] } as const]),
    ...inPairingOrder(person.relationships).map((pairing) => {
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
