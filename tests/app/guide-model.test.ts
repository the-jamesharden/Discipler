import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GUIDE_MODEL_ID, createGatewayGuideModel } from '~/platform/ai-gateway/guide-model'

/**
 * The real AI SDK and gateway provider, with a stand-in for `fetch` where the gateway
 * would be (Exponential launch, ticket 31), so what would leave the process is what is
 * read here and nothing does leave it. No test anywhere calls a provider.
 */

interface Sent {
  readonly url: string
  readonly headers: Headers
  readonly body: Record<string, unknown>
}

const answers = (status: number, json: unknown) => {
  const sent: Sent[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    sent.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })
  }
  return { sent, model: createGatewayGuideModel({ fetch, apiKey: 'a-stand-in-not-a-key' }) }
}

const ANSWER = {
  content: [{ type: 'text', text: 'Open Settings.\n\nSource: /help/settings' }],
  finishReason: { unified: 'stop', raw: 'end_turn' },
  usage: {
    inputTokens: { total: 900, noCache: 100, cacheRead: 800, cacheWrite: 0 },
    outputTokens: { total: 40, text: 40, reasoning: 0 },
  },
  warnings: [],
}

const asking = {
  instructions: 'The instructions.',
  history: [{ question: 'An earlier question', answer: 'An earlier answer' }],
  question: 'How do I change the check-in time?',
}

describe('the guide’s model', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is Claude Sonnet 5.5, by the name in the gateway’s own list', async () => {
    const { sent, model } = answers(200, ANSWER)
    await model.answer(asking)
    expect(GUIDE_MODEL_ID).toBe('anthropic/claude-sonnet-5.5')
    expect(sent[0]!.headers.get('ai-language-model-id')).toBe(GUIDE_MODEL_ID)
  })

  it('requires zero data retention on the request, from the one provider the privacy policy names', async () => {
    const { sent, model } = answers(200, ANSWER)
    await model.answer(asking)
    expect(sent[0]!.body.providerOptions).toMatchObject({
      gateway: { zeroDataRetention: true, only: ['anthropic'] },
    })
  })

  it('offers no tools', async () => {
    const { sent, model } = answers(200, ANSWER)
    await model.answer(asking)
    expect(sent[0]!.body.tools).toBeUndefined()
  })

  it('sends the instructions, the chat and the question, and nothing else that was said', async () => {
    const { sent, model } = answers(200, ANSWER)
    await model.answer(asking)
    const prompt = sent[0]!.body.prompt as readonly { readonly role: string; readonly content: unknown }[]
    expect(prompt.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(prompt[0]!.content).toBe('The instructions.')
    expect(JSON.stringify(prompt[1]!.content)).toContain('An earlier question')
    expect(JSON.stringify(prompt[2]!.content)).toContain('An earlier answer')
    expect(JSON.stringify(prompt[3]!.content)).toContain('How do I change the check-in time?')
  })

  it('asks for little thinking and a short answer', async () => {
    const { sent, model } = answers(200, ANSWER)
    await model.answer(asking)
    expect(sent[0]!.body.reasoning).toBe('low')
    expect(sent[0]!.body.maxOutputTokens).toBe(2048)
  })

  it('answers with the words and the token counts', async () => {
    const { model } = answers(200, ANSWER)
    expect(await model.answer(asking)).toEqual({
      outcome: 'answered',
      text: 'Open Settings.\n\nSource: /help/settings',
      usage: { inputTokens: 900, cachedInputTokens: 800, outputTokens: 40 },
    })
  })

  it.each([
    ['past the budget', 'quota_for_entity_exceeded'],
    ['out of credits', 'insufficient_funds'],
  ])('reads a 402 %s as spent, without trying again', async (_why, type) => {
    const { sent, model } = answers(402, { error: { type, message: 'Refused.' } })
    expect(await model.answer(asking)).toEqual({ outcome: 'spent' })
    expect(sent).toHaveLength(1)
  })

  it.each([
    ['a fault at the gateway', 500, { error: { type: 'internal_server_error', message: 'Broken.' } }],
    ['a refused credential', 401, { error: { type: 'authentication_error', message: 'No.' } }],
    ['a body nobody can read', 502, 'not an error'],
  ])('reads %s as failed', async (_what, status, body) => {
    const { model } = answers(status, body)
    expect(await model.answer(asking)).toEqual({ outcome: 'failed' })
  })

  it('reads an answer cut short as paid for with nothing to show', async () => {
    const { model } = answers(200, { ...ANSWER, finishReason: { unified: 'length', raw: 'max_tokens' } })
    expect(await model.answer(asking)).toEqual({ outcome: 'billed_with_no_answer' })
  })

  it('reads an answer the model’s safeguards declined as paid for with nothing to show', async () => {
    const { model } = answers(200, { ...ANSWER, finishReason: { unified: 'content-filter', raw: 'refusal' } })
    expect(await model.answer(asking)).toEqual({ outcome: 'billed_with_no_answer' })
  })

  it('reads a request that never left as failed, with no credential at hand', async () => {
    const hadKey = process.env.AI_GATEWAY_API_KEY
    delete process.env.AI_GATEWAY_API_KEY
    const fetch = vi.fn<typeof globalThis.fetch>()
    try {
      expect(await createGatewayGuideModel({ fetch }).answer(asking)).toEqual({ outcome: 'failed' })
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      if (hadKey !== undefined) process.env.AI_GATEWAY_API_KEY = hadKey
    }
  })

  it('logs no word of the question or the vendor’s message', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { model } = answers(500, { error: { type: 'internal_server_error', message: 'Quoting the request' } })
    await model.answer(asking)
    const said = JSON.stringify(logged.mock.calls)
    expect(said).not.toContain('check-in time')
    expect(said).not.toContain('Quoting the request')
  })
})
