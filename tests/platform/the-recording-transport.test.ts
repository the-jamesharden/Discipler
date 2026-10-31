import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecordingTransport } from '~/platform/recording-transport'

/**
 * The transport staging uses instead of Twilio (Exponential launch, ticket 02):
 * every text is written down and none is sent.
 *
 * It answers the way a vendor that accepted the message answers, so the sending
 * layer above it marks the row sent exactly as it would in production. A staging
 * run then exercises the same queue, the same consent checks and the same "one
 * conversation per phone" holds as production, and differs only in the last step.
 */

afterEach(() => vi.restoreAllMocks())

describe('recording a text instead of sending it', () => {
  it('writes down who it was from, who it was to and what it said', async () => {
    const recorded: unknown[] = []
    const transport = createRecordingTransport((text) => recorded.push(text))

    await transport.deliver('+15550000001', '+15551230000', 'Riverside Chapel: hello')

    expect(recorded).toEqual([
      { from: '+15550000001', to: '+15551230000', body: 'Riverside Chapel: hello' },
    ])
  })

  it('never calls out to anybody', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch')
    const transport = createRecordingTransport(() => {})

    await transport.deliver('+15550000001', '+15551230000', 'hello')

    expect(fetched).not.toHaveBeenCalled()
  })

  it('writes to the log by default, one line a text, so a staging run can be read in the deployment’s logs', async () => {
    const logged = vi.spyOn(console, 'info').mockImplementation(() => {})

    await createRecordingTransport().deliver('+15550000001', '+15551230000', 'Line one\nLine two')

    expect(logged).toHaveBeenCalledTimes(1)
    const [line] = logged.mock.calls[0] as [string]
    expect(line).not.toContain('\n')
    expect(line).toContain('+15551230000')
    expect(line).toContain('Line one\\nLine two')
  })
})
