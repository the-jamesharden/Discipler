import { PairingRefused, type PairingRefusal } from '~/domain/errors'
import type { PersonId } from '~/domain/ids'
import { oneToOnesFor, type SeparateSubmission } from '~/domain/separate-pairings'
import type { CommandService } from './command-service'

/**
 * What became of a set of one-to-ones. Three answers, because there are three
 * things an Admin can be told: none of it was made and here is why, all of it was
 * made, or -- the bad one -- some of it was.
 */
export type SeparatePairingsOutcome =
  /**
   * Nothing was formed. `about` is the Disciple whose one-to-one was refused, and
   * null where the refusal is of the submission itself.
   */
  | {
      readonly status: 'refused'
      readonly refusal: PairingRefusal
      readonly about: PersonId | null
    }
  | { readonly status: 'formed'; readonly formed: number }
  /**
   * Every pairing passed its check, and a formation after the first still failed.
   * What was formed stays formed, since nothing un-forms a relationship. `about` is
   * the Disciple it stopped at. `refusal` is null where what stopped it was not a
   * refusal at all, and `fault` is then what was thrown: it cannot be rethrown
   * without losing the count of what landed, so it is handed to the caller to log.
   */
  | {
      readonly status: 'partly_formed'
      readonly formed: readonly PersonId[]
      readonly notFormed: readonly PersonId[]
      readonly refusal: PairingRefusal | null
      readonly fault?: unknown
      readonly about: PersonId
    }

/**
 * Manual pairing, ticket 21. One Discipler and several Disciples, formed as one
 * one-to-one each, all of them or none.
 *
 * There is no batch command: `execute` takes one command and is one transaction,
 * so a set of N is N transactions and cannot be made atomic from here. What makes
 * it all or none is that every pairing is checked before any is formed, through
 * the same formation rolled back (ticket 03, ADR-0025), so no pairing rule is
 * decided a second time on this side of the boundary.
 *
 * A check answers for the database as it stands, so a formation can still be
 * refused after a set that passed: another Admin pairs that Disciple first,
 * somebody texts STOP. It stops there. Carrying on would form more of a set the
 * Admin chose against a Roster that has since moved, and they are about to be told
 * it moved. What is reported is what landed, never what was asked for.
 */
export const formSeparately = async (
  service: Pick<CommandService, 'checkPairing' | 'execute'>,
  submission: SeparateSubmission,
): Promise<SeparatePairingsOutcome> => {
  const split = oneToOnesFor(submission)
  if ('refusal' in split) return { status: 'refused', refusal: split.refusal, about: null }

  const pairings = split.pairings.map((command) => {
    const [about] = command.participantIds
    if (about === undefined) throw new Error('A one-to-one was split off with no Disciple in it')
    return { command, about }
  })

  for (const { command, about } of pairings) {
    const refusal = await service.checkPairing(command)
    if (refusal) return { status: 'refused', refusal, about }
  }

  const formed: PersonId[] = []
  for (const { command, about } of pairings) {
    try {
      await service.execute(command)
    } catch (error) {
      const refusal = error instanceof PairingRefused ? error.refusal : null

      // Nothing has landed, so this is what forming one pairing would have been: a
      // refusal the Admin can act on, or a fault that is thrown as one always is.
      if (formed.length === 0) {
        if (refusal === null) throw error
        return { status: 'refused', refusal, about }
      }

      return {
        status: 'partly_formed',
        formed,
        notFormed: pairings.slice(formed.length).map((each) => each.about),
        refusal,
        ...(refusal === null ? { fault: error } : {}),
        about,
      }
    }
    formed.push(about)
  }

  return { status: 'formed', formed: formed.length }
}
