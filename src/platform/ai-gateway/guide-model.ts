import { APICallError, createGateway, generateText } from 'ai'
import type { GuideModel, GuideModelAnswer } from '~/service/ports'

/**
 * The one place a model is called (Exponential launch, ticket 31): Claude Sonnet 5.5
 * through the Vercel AI Gateway.
 *
 * Authentication is the gateway provider's own. On a Vercel deployment it uses the
 * project's OIDC token, so production needs no key, and off Vercel it reads
 * `AI_GATEWAY_API_KEY`. With neither it fails before anything leaves the process, which
 * is a failed answer like any other.
 *
 * **What makes it safe is what is not here.** No tools are passed, so it can change
 * nothing and look nothing up. What it is given is the three arguments of `answer`, and
 * none of them is able to hold a church's name, an Admin's name or a Roster row, because
 * `src/service/ask-discipler.ts` has none to hand it.
 *
 * Nothing about a failure is logged but its name and status: a vendor's message can
 * quote the request, and the logs never carry chat text.
 */

/** The gateway's name for it, from its model list, which writes the version with a dot. */
export const GUIDE_MODEL_ID = 'anthropic/claude-sonnet-5.5'

/** A short answer about a help page. Past this it has gone wrong, and is a failed answer. */
const LONGEST_ANSWER_TOKENS = 2048

/** Under the route's own `maxDuration`, so an Admin is told sorry rather than left waiting. */
const LONGEST_WAIT_MS = 45_000

/** The gateway refuses with 402 past a budget (`quota_for_entity_exceeded`) or the credits (`insufficient_funds`). */
const PAYMENT_REQUIRED = 402

/**
 * What the gateway answered, if it answered, on an error the SDK may have wrapped in a retry
 * or a cause. Only the API call error knows: the gateway's own errors write 500 or 408 on a
 * failure that never had a response.
 */
const statusOf = (error: unknown, depth = 0): number | null => {
  if (APICallError.isInstance(error)) return error.statusCode ?? null
  if (error === null || typeof error !== 'object' || depth > 4) return null
  const { lastError, cause } = error as { readonly lastError?: unknown; readonly cause?: unknown }
  return statusOf(lastError, depth + 1) ?? statusOf(cause, depth + 1)
}

/**
 * The SDK's names for a credential that is missing or refused, outside production and in it.
 * It drops the status from both, and a request with no credential never left.
 */
const CREDENTIAL_ERRORS: ReadonlySet<string> = new Set(['GatewayAuthenticationError', 'GatewayError'])

/** A clear no: nothing ran, so nothing was paid for. */
const wasRefused = (error: unknown, status: number | null): boolean =>
  status === null ? error instanceof Error && CREDENTIAL_ERRORS.has(error.name) : status >= 400

export const createGatewayGuideModel = (
  /** The way a test reaches a stand-in. Production names neither. */
  connection: { readonly fetch?: typeof globalThis.fetch; readonly apiKey?: string } = {},
): GuideModel => {
  const gateway = createGateway(connection)

  return {
    async answer({ instructions, history, question }): Promise<GuideModelAnswer> {
      try {
        const { text, finishReason, usage } = await generateText({
          model: gateway(GUIDE_MODEL_ID),
          instructions,
          messages: [
            ...history.flatMap((exchange) => [
              { role: 'user' as const, content: exchange.question },
              { role: 'assistant' as const, content: exchange.answer },
            ]),
            { role: 'user' as const, content: question },
          ],
          // A question about a help page repays little thinking.
          reasoning: 'low',
          maxOutputTokens: LONGEST_ANSWER_TOKENS,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(LONGEST_WAIT_MS),
          providerOptions: {
            gateway: {
              // Required on every request: a provider that would keep the text is never used.
              zeroDataRetention: true,
              // The one provider the privacy policy names. All four that serve this model
              // have zero data retention, but the policy says Anthropic, so the others
              // would be a promise broken quietly by a fallback.
              only: ['anthropic'],
              // The help docs are the same long prefix on every question.
              caching: 'auto',
            },
          },
        })

        // Cut short, or declined by the model's safeguards: there is no whole answer to show.
        if (finishReason !== 'stop' || text.trim() === '') {
          console.error(`Ask Discipler's model gave no whole answer: ${finishReason}`)
          return { outcome: 'billed_with_no_answer' }
        }

        return {
          outcome: 'answered',
          text,
          usage: {
            inputTokens: usage.inputTokens ?? 0,
            cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          },
        }
      } catch (error) {
        const status = statusOf(error)
        console.error(
          `Ask Discipler's model failed: ${error instanceof Error ? error.name : 'unknown'} ${status ?? 'no status'}`,
        )
        if (status === PAYMENT_REQUIRED) return { outcome: 'spent' }
        // A timeout or a lost connection cannot prove the model was not paid for.
        return { outcome: wasRefused(error, status) ? 'failed' : 'billed_with_no_answer' }
      }
    },
  }
}
