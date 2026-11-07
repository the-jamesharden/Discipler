import type { Environment } from './deployment'

/**
 * Whether Ask Discipler is on this deployment (Exponential launch, ticket 31). Off until
 * AI Gateway is turned on for the project with its monthly budget, so a live Admin never
 * sees a guide that can only say sorry, and no question is sent before the spend has its
 * cap.
 *
 * `ASK_DISCIPLER_ON=true` and nothing else turns it on, so an unset variable and a typo
 * leave it off. Off, the bubble is not drawn and its routes answer 404, and Help leaves
 * out its page (`helpPagesShown` in `app/help/library.ts`). The test runs turn it on,
 * because the bubble is what they test.
 */
export const askDisciplerIsOn = (env: Environment): boolean => env.ASK_DISCIPLER_ON === 'true'
