import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PhoneCode } from '~/domain/phone-check'
import type { PhoneNumber } from '~/domain/roster'
import { createRecordingVerifier, RECORDED_PHONE_CODE } from '~/platform/recording-verifier'

/**
 * The phone verifier staging uses instead of Twilio Verify (Exponential launch,
 * ticket 02): a code is written down and none is texted, and the one code it
 * accepts is a constant, so an Admin's phone can be checked on staging end to end
 * with no phone ringing anywhere.
 */

afterEach(() => vi.restoreAllMocks())

const phone = '+15551230000' as PhoneNumber

describe('recording a Verify code instead of texting it', () => {
  it('writes down the phone and the code to enter, and answers as a sent verification', async () => {
    const recorded: unknown[] = []
    const verifier = createRecordingVerifier((code) => recorded.push(code))

    const sending = await verifier.sendCode(phone)

    expect(sending).toEqual({ sent: expect.any(String) })
    expect(recorded).toEqual([{ to: phone, code: RECORDED_PHONE_CODE }])
  })

  it('approves the recorded code and calls every other code wrong', async () => {
    const verifier = createRecordingVerifier(() => {})
    const sending = await verifier.sendCode(phone)
    const sid = 'sent' in sending ? sending.sent : ''

    expect(await verifier.checkCode(sid, RECORDED_PHONE_CODE)).toBe('approved')
    expect(await verifier.checkCode(sid, '123456' as PhoneCode)).toBe('wrong')
  })

  it('never calls out to anybody', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch')
    const verifier = createRecordingVerifier(() => {})

    const sending = await verifier.sendCode(phone)
    const sid = 'sent' in sending ? sending.sent : ''
    await verifier.checkCode(sid, RECORDED_PHONE_CODE)
    await verifier.cancel(sid)

    expect(fetched).not.toHaveBeenCalled()
  })

  it('writes to the log by default, so the code can be read in the deployment’s logs', async () => {
    const logged = vi.spyOn(console, 'info').mockImplementation(() => {})

    await createRecordingVerifier().sendCode(phone)

    expect(logged).toHaveBeenCalledTimes(1)
    const [line] = logged.mock.calls[0] as [string]
    expect(line).toContain(phone)
    expect(line).toContain(RECORDED_PHONE_CODE)
  })
})
