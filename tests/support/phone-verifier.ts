import type { PhoneCode } from '~/domain/phone-check'
import type { PhoneNumber } from '~/domain/roster'
import type { PhoneCodeSending, PhoneCodeVerdict, PhoneVerifier } from '~/service/ports'

/**
 * Twilio as a script: what it answers to a send and to each code. The code it
 * texted is `123456` and everything else is wrong, until a test says otherwise.
 */
export const createScriptedVerifier = () => {
  const sent: PhoneNumber[] = []
  const checked: { sid: string; code: PhoneCode }[] = []
  const canceled: string[] = []
  let nextSid = 1
  let sending: () => Promise<PhoneCodeSending> = async () => ({ sent: `VE${nextSid++}` })
  let judging: (code: PhoneCode) => Promise<PhoneCodeVerdict> = async (code) =>
    code === '123456' ? 'approved' : 'wrong'

  const verifier: PhoneVerifier = {
    async sendCode(to) {
      sent.push(to)
      return sending()
    },
    async checkCode(sid, code) {
      checked.push({ sid, code })
      return judging(code)
    },
    async cancel(sid) {
      canceled.push(sid)
    },
  }

  return {
    verifier,
    sent,
    checked,
    canceled,
    answerSendsWith: (answer: () => Promise<PhoneCodeSending>) => {
      sending = answer
    },
    judgeWith: (answer: (code: PhoneCode) => Promise<PhoneCodeVerdict>) => {
      judging = answer
    },
  }
}
