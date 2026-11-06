import type { Clock } from '~/domain/clock'
import { TestCheckInRefused } from '~/domain/errors'
import { isUsPhone } from '~/domain/phone-check'
import { testCheckInQuestion, testCheckInSubject } from '~/domain/outbound-copy'
import {
  needsTheAgreement,
  testCheckInRefusal,
  testCheckInsLeftToday,
  testCheckInsSentToday,
  type TestCheckInRefusal,
} from '~/domain/test-check-in'
import type { CommandService } from './command-service'
import type { PhoneCheck, PhoneCheckAdmin, PhoneCheckRefusal } from './phone-check'

/**
 * Pressing the test check-in's button (Exponential launch, ticket 28): the order of its
 * decision, which is the one thing here that is neither a rule of the domain nor a route.
 *
 * Whatever would refuse the test is said before a Verify code is asked for, so that no
 * Admin types a code only to be told no. The agreement is kept before the first text of
 * any kind goes to the phone, and that includes the code, because the agreement names
 * sign-in codes. And `test_check_in.send` decides again from a fresh read under its locks:
 * what is read here only says what to do next.
 */

/** What the card draws when the modal opens. */
export interface TestCheckInCard {
  /** The phone a test would text. Null where this Admin has no Roster row with one. */
  readonly phone: string | null
  readonly needsAgreement: boolean
  readonly sentToday: number
  readonly left: number
  /** What is already true as the card opens, so there is nothing to press for. */
  readonly refusal: Extract<TestCheckInRefusal, 'test_check_in.no_phone' | 'test_check_in.limit_reached'> | null
  /** The first text as this church's test would send it today, for the card's phone. */
  readonly firstText: string
}

export type TestCheckInAnswer =
  | { readonly sent: true; readonly left: number }
  | { readonly verify: true; readonly phone: string }
  | { readonly refusal: TestCheckInRefusal | PhoneCheckRefusal; readonly triesLeft?: number }

export interface TestCheckIn {
  card(admin: PhoneCheckAdmin): Promise<TestCheckInCard>
  /** The button. `agreed` says the agreement was on the screen they pressed it from. */
  press(admin: PhoneCheckAdmin, how: { readonly agreed: boolean }): Promise<TestCheckInAnswer>
  /** Confirm and send: the code they typed, and the test if it is right. */
  confirm(admin: PhoneCheckAdmin, typed: string): Promise<TestCheckInAnswer>
}

export const createTestCheckIn = ({
  commands,
  phoneCheck,
  clock,
}: {
  readonly commands: Pick<CommandService, 'execute' | 'testCheckInStanding'>
  readonly phoneCheck: PhoneCheck
  readonly clock: Clock
}): TestCheckIn => {
  const send = async (admin: PhoneCheckAdmin, sentToday: number): Promise<TestCheckInAnswer> => {
    try {
      await commands.execute({
        type: 'test_check_in.send',
        ministryId: admin.ministryId,
        sentBy: admin.userId,
      })
    } catch (error) {
      if (error instanceof TestCheckInRefused) return { refusal: error.refusal }
      throw error
    }
    return { sent: true, left: testCheckInsLeftToday(sentToday + 1) }
  }

  const agree = (admin: PhoneCheckAdmin): Promise<unknown> =>
    commands.execute({
      type: 'test_check_in.agree',
      ministryId: admin.ministryId,
      sentBy: admin.userId,
    })

  return {
    async card(admin) {
      const { standing, voice } = await commands.testCheckInStanding(admin.ministryId, admin.userId)
      const now = clock.now()
      const sentToday = testCheckInsSentToday(standing.sentAt, now, standing.timeZone)
      const refusal = testCheckInRefusal(standing, now)
      return {
        phone: standing.phone,
        needsAgreement: needsTheAgreement(standing),
        sentToday,
        left: testCheckInsLeftToday(sentToday),
        refusal:
          refusal === 'test_check_in.no_phone' || refusal === 'test_check_in.limit_reached' ? refusal : null,
        firstText: testCheckInQuestion({
          ministryName: voice.name,
          leaderNoun: voice.leaderNoun,
          subject: testCheckInSubject(voice.participantNoun),
          words: voice.checkInWords,
          discloseOptOut: false,
        }),
      }
    },

    async press(admin, { agreed }) {
      const [{ standing }, status] = await Promise.all([
        commands.testCheckInStanding(admin.ministryId, admin.userId),
        phoneCheck.status(admin),
      ])
      const now = clock.now()

      const refusal = testCheckInRefusal(standing, now)
      if (refusal) return { refusal }

      const needsIt = needsTheAgreement(standing)
      if (needsIt && !agreed) return { refusal: 'test_check_in.agreement_needed' }

      const sentToday = testCheckInsSentToday(standing.sentAt, now, standing.timeZone)

      if (status.verified) {
        if (needsIt) await agree(admin)
        return send(admin, sentToday)
      }

      // Before the agreement, which is about texting a number Verify cannot reach.
      if (status.phone && !isUsPhone(status.phone)) return { refusal: 'phone_check.not_us' }

      if (needsIt) await agree(admin)
      const sending = await phoneCheck.sendCode(admin)
      if ('refusal' in sending) return { refusal: sending.refusal }
      return 'sent' in sending ? { verify: true, phone: sending.sent } : send(admin, sentToday)
    },

    async confirm(admin, typed) {
      const checking = await phoneCheck.confirmCode(admin, typed)
      if (!('verified' in checking)) {
        return checking.refusal === 'phone_check.wrong_code'
          ? { refusal: checking.refusal, triesLeft: checking.triesLeft }
          : { refusal: checking.refusal }
      }
      const { standing } = await commands.testCheckInStanding(admin.ministryId, admin.userId)
      return send(admin, testCheckInsSentToday(standing.sentAt, clock.now(), standing.timeZone))
    },
  }
}
