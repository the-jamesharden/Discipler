import type { PersonId } from '~/domain/ids'
import type { InboundSnapshot } from '~/domain/keywords'

/**
 * A Person an inbound text could be from, holding nothing and having asked for
 * nothing.
 *
 * Every `sms.inbound` command needs one, because the keyword routes are read before
 * a reply is interpreted as a check-in answer and they cannot decide anything
 * without knowing what the sender holds. Most tests are about the conversation
 * rather than the keywords and want the empty answer to all of it, which is what
 * this is -- the keyword tests build their own.
 */
export const anInboundSnapshot = (
  over: Partial<InboundSnapshot> & { readonly personId: PersonId },
): InboundSnapshot => ({
  holds: [],
  exchange: null,
  lastAcknowledgedAt: null,
  optedOut: false,
  mayBeTexted: true,
  ...over,
})
