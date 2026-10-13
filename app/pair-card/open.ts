import type { ConcernId } from '~/domain/ids'
import { getCommandService } from '~/service/container'
import type { PairCard, SignedInAdmin } from '~/service/ports'

/** One Concern's words as the card opened, or null where they were cleared since. */
export interface ConcernWords {
  readonly concernId: ConcernId
  readonly words: string | null
}

/**
 * Opening the card reads its Concerns (Pastor feedback, ticket 07), and the read
 * is recorded exactly as *Read the concern* recorded it on Follow-Up: through
 * `CommandService.openConcern`, which writes the viewing in the same transaction
 * that returns the words, one Concern at a time. The words are shown because they
 * were read, never the other way round, so a card that shows them has left the
 * trace a Ministry can be asked about.
 *
 * Every page that opens the card calls this once per load, after its one read.
 * A refresh reads them again and records a second viewing, which is true: they
 * were read again. Only for a Concern the card itself carries, which the page's
 * own document named for this Admin's Ministry.
 */
export const readTheConcerns = async (
  card: PairCard,
  admin: SignedInAdmin,
): Promise<readonly ConcernWords[]> => {
  const read: ConcernWords[] = []
  for (const concern of card.concerns) {
    const words = await getCommandService().openConcern({
      type: 'concern.view',
      ministryId: admin.ministryId,
      concernId: concern.id,
      viewedBy: admin.userId,
    })
    read.push({ concernId: concern.id, words })
  }
  return read
}
