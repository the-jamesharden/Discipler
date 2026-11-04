import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, type TestClock } from '~/domain/clock'
import type { EmailEnvelope } from '~/domain/email'
import { EMAIL_CODE } from '~/domain/launch-terms'
import {
  HUMAN_CHECK_ACTIONS,
  HUMAN_PASS_LIFETIME_MINUTES,
  SEND_CAP_WINDOW_MINUTES,
  VERIFIED_LIFETIME_MINUTES,
} from '~/domain/sign-up-attempt'
import { createSignUpCodeKeeper } from '~/platform/sign-up-code-keeper'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport, HumanCheck, PendingSignups } from '~/service/ports'
import { createSignUp, type SignUp } from '~/service/sign-up'

/**
 * Sign-up's first three steps (Exponential launch, ticket 11), written once and run
 * twice: against an in-memory store with no lock in `tests/domain`, and against the
 * real tables in `tests/integration`. Cloudflare is a fake at the `HumanCheck` port
 * and Resend a recording fake at the `EmailTransport` port, so neither is ever called.
 */

export const GOOD_TOKEN = 'a-token-cloudflare-passes'

export const createScriptedHumanCheck = () => {
  const asked: { token: string; action: string }[] = []
  const humanCheck: HumanCheck = {
    async verify(token, action) {
      asked.push({ token, action })
      return token === GOOD_TOKEN
    },
  }
  return { humanCheck, asked }
}

export const createRecordingEmail = () => {
  const delivered: EmailEnvelope[] = []
  let failing: Error | null = null
  let delayMs = 0
  const transport: EmailTransport = {
    async deliver(envelope) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
      if (failing) throw failing
      delivered.push(envelope)
    },
  }
  return {
    transport,
    delivered,
    failWith: (error: Error | null) => {
      failing = error
    },
    takeThisLong: (ms: number) => {
      delayMs = ms
    },
  }
}

export const codeIn = (envelope: EmailEnvelope | undefined): string => {
  const code = /^\d{6}$/m.exec(envelope?.text ?? '')?.[0]
  if (!code) throw new Error('That email held no code.')
  return code
}

const random = () => Math.random().toString(36).slice(2, 10)

export const anAddress = () => `pastor.${random()}@grace.example`

/** A network no other test or earlier run has counted against, as Vercel would report it. */
export const aNetworkAddress = () => {
  const group = () => Math.floor(Math.random() * 0x10000).toString(16)
  return `2001:db8:${group()}:${group()}::1`
}

/** A code that is not this one, by the fewest digits. */
export const notThe = (code: string) => (code === '000000' ? '000001' : '000000')

const US_PHONE = '+12055550100'

export interface SignUpScenarioStore {
  readonly store: PendingSignups
  giveAccount(email: string): Promise<void>
}

export const buildHarness = (backing: SignUpScenarioStore) => {
  const clock: TestClock = createTestClock(new Date())
  const human = createScriptedHumanCheck()
  const email = createRecordingEmail()
  const signUp: SignUp = createSignUp({
    signUps: backing.store,
    humanCheck: human.humanCheck,
    keeper: createSignUpCodeKeeper(() => 'a-test-secret-that-is-long-enough-to-use'),
    sender: createEmailSender(email.transport),
    clock,
  })

  const attempt = async () => {
    const passed = await signUp.passHumanCheck(GOOD_TOKEN)
    if (!('attempt' in passed)) throw new Error('The human check did not pass.')
    return passed.attempt
  }

  /** An attempt that has asked for a code, and the code it was sent. */
  const attemptWithCode = async (address = anAddress(), network: string | null = aNetworkAddress()) => {
    const token = await attempt()
    const answer = await signUp.sendCode({ attempt: token, email: address, phone: US_PHONE, network })
    expect(answer).toEqual({ sent: address, resendInSeconds: EMAIL_CODE.resendAfterSeconds })
    return { token, address, code: codeIn(email.delivered.at(-1)) }
  }

  return { clock, human, email, signUp, attempt, attemptWithCode }
}

const minutes = (count: number) => count * 60_000
const seconds = (count: number) => count * 1000

export const describeSignUpScenarios = (makeBacking: () => Promise<SignUpScenarioStore> | SignUpScenarioStore) => {
  let backing: SignUpScenarioStore
  let h: ReturnType<typeof buildHarness>

  beforeEach(async () => {
    backing = await makeBacking()
    h = buildHarness(backing)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  describe('the human check', () => {
    it('opens no attempt and sends nothing on a token Cloudflare refuses', async () => {
      expect(await h.signUp.passHumanCheck('a-forged-token')).toEqual({ refusal: 'signup.not_human' })
      expect(h.human.asked).toEqual([{ token: 'a-forged-token', action: HUMAN_CHECK_ACTIONS.startSignUp }])
      expect(h.email.delivered).toEqual([])
    })

    it('sends no code without an attempt that passed it', async () => {
      for (const attempt of [null, undefined, '', 'not-an-attempt', 'a'.repeat(43)]) {
        const answer = await h.signUp.sendCode({
          attempt,
          email: anAddress(),
          phone: US_PHONE,
          network: aNetworkAddress(),
        })
        expect(answer).toEqual({ refusal: 'signup.human_check_needed' })
      }
      expect(h.email.delivered).toEqual([])
    })

    it('lapses if no code is asked for in time', async () => {
      const token = await h.attempt()
      h.clock.advanceBy(minutes(HUMAN_PASS_LIFETIME_MINUTES))

      expect(await h.signUp.standing(token)).toEqual({ step: 'human_check' })
      expect(
        await h.signUp.sendCode({ attempt: token, email: anAddress(), phone: US_PHONE, network: aNetworkAddress() }),
      ).toEqual({ refusal: 'signup.human_check_needed' })
      expect(h.email.delivered).toEqual([])
    })

    it('is spent on one address, so another address goes back through it', async () => {
      const { token } = await h.attemptWithCode()
      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))

      expect(
        await h.signUp.sendCode({ attempt: token, email: anAddress(), phone: US_PHONE, network: aNetworkAddress() }),
      ).toEqual({ refusal: 'signup.human_check_needed' })
      expect(h.email.delivered).toHaveLength(1)
    })
  })

  describe('what is typed on page two', () => {
    it('refuses what is not an email or a phone, before it counts anything', async () => {
      const token = await h.attempt()
      const asking = (email: string, phone: string) =>
        h.signUp.sendCode({ attempt: token, email, phone, network: aNetworkAddress() })

      expect(await asking('not an address', US_PHONE)).toEqual({ refusal: 'signup.bad_email' })
      expect(await asking(anAddress(), '12')).toEqual({ refusal: 'signup.bad_phone' })
      expect(await asking(anAddress(), '+14165550100')).toEqual({ refusal: 'signup.phone_not_us' })
      expect(await asking(anAddress(), '+447911123456')).toEqual({ refusal: 'signup.phone_not_us' })
      expect(h.email.delivered).toEqual([])
      expect(await h.signUp.standing(token)).toEqual({ step: 'email_and_phone', email: null })
    })
  })

  describe('the code', () => {
    it('is six digits, sent to the address given, and proves it', async () => {
      const { token, address, code } = await h.attemptWithCode()

      expect(code).toMatch(/^\d{6}$/)
      expect(h.email.delivered[0]).toMatchObject({ kind: 'emailCode', to: [address] })
      expect(await h.signUp.standing(token)).toEqual({
        step: 'code',
        email: address,
        code: 'live',
        triesLeft: EMAIL_CODE.tries,
        resendInSeconds: EMAIL_CODE.resendAfterSeconds,
      })

      expect(await h.signUp.confirmCode({ attempt: token, typed: code })).toEqual({ verified: address })
      expect(await h.signUp.standing(token)).toEqual({ step: 'account', email: address, phone: US_PHONE })
    })

    it('takes a pasted code with spaces in it', async () => {
      const { token, address, code } = await h.attemptWithCode()
      const typed = ` ${code.slice(0, 3)} ${code.slice(3)} `

      expect(await h.signUp.confirmCode({ attempt: token, typed })).toEqual({ verified: address })
    })

    it('from one attempt does not verify another attempt’s email', async () => {
      const first = await h.attemptWithCode()
      const second = await h.attemptWithCode()

      expect(await h.signUp.confirmCode({ attempt: second.token, typed: first.code })).toEqual({
        refusal: 'signup.wrong_code',
        triesLeft: EMAIL_CODE.tries - 1,
      })
      expect(await h.signUp.standing(second.token)).toMatchObject({ step: 'code' })

      expect(await h.signUp.confirmCode({ attempt: first.token, typed: first.code })).toEqual({
        verified: first.address,
      })
    })

    it('from one attempt does not verify the same email on another attempt', async () => {
      const address = anAddress()
      const first = await h.attemptWithCode(address)
      const second = await h.attemptWithCode(address)

      expect(await h.signUp.confirmCode({ attempt: second.token, typed: first.code })).toMatchObject({
        refusal: 'signup.wrong_code',
      })
    })

    it('fails on the sixth try even when it is the right code', async () => {
      const { token, code } = await h.attemptWithCode()
      const wrong = notThe(code)

      for (const triesLeft of [4, 3, 2, 1]) {
        expect(await h.signUp.confirmCode({ attempt: token, typed: wrong })).toEqual({
          refusal: 'signup.wrong_code',
          triesLeft,
        })
      }
      expect(await h.signUp.confirmCode({ attempt: token, typed: wrong })).toEqual({
        refusal: 'signup.too_many_tries',
      })

      expect(await h.signUp.confirmCode({ attempt: token, typed: code })).toEqual({
        refusal: 'signup.too_many_tries',
      })
      expect(await h.signUp.standing(token)).toMatchObject({ code: 'tries_used', triesLeft: 0 })
    })

    it('can be asked for again after five wrong tries, and the new one works', async () => {
      const { token, address, code } = await h.attemptWithCode()
      for (let i = 0; i < EMAIL_CODE.tries; i++) {
        await h.signUp.confirmCode({ attempt: token, typed: notThe(code) })
      }

      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      expect(await h.signUp.resendCode({ attempt: token, network: aNetworkAddress() })).toMatchObject({ sent: address })
      const next = codeIn(h.email.delivered.at(-1))

      expect(await h.signUp.standing(token)).toMatchObject({ code: 'live', triesLeft: EMAIL_CODE.tries })
      expect(await h.signUp.confirmCode({ attempt: token, typed: next })).toEqual({ verified: address })
    })

    it('spends no try on what cannot be a code', async () => {
      const { token, code } = await h.attemptWithCode()

      for (const typed of ['', '12345', '1234567', 'abcdef']) {
        expect(await h.signUp.confirmCode({ attempt: token, typed })).toEqual({ refusal: 'signup.malformed_code' })
      }
      expect(await h.signUp.standing(token)).toMatchObject({ triesLeft: EMAIL_CODE.tries })
      expect(await h.signUp.confirmCode({ attempt: token, typed: code })).toHaveProperty('verified')
    })

    it('expires after ten minutes and works until then', async () => {
      const lasts = await h.attemptWithCode()
      h.clock.advanceBy(minutes(EMAIL_CODE.lifetimeMinutes) - 1)
      expect(await h.signUp.confirmCode({ attempt: lasts.token, typed: lasts.code })).toHaveProperty('verified')

      const lapses = await h.attemptWithCode()
      h.clock.advanceBy(minutes(EMAIL_CODE.lifetimeMinutes))
      expect(await h.signUp.confirmCode({ attempt: lapses.token, typed: lapses.code })).toEqual({
        refusal: 'signup.code_expired',
      })
      expect(await h.signUp.standing(lapses.token)).toMatchObject({ code: 'expired', resendInSeconds: 0 })
    })

    it('is single use', async () => {
      const { token, code } = await h.attemptWithCode()
      await h.signUp.confirmCode({ attempt: token, typed: code })

      expect(await h.signUp.confirmCode({ attempt: token, typed: code })).toEqual({
        refusal: 'signup.already_verified',
      })
      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      expect(await h.signUp.resendCode({ attempt: token, network: aNetworkAddress() })).toEqual({
        refusal: 'signup.already_verified',
      })
      expect(h.email.delivered).toHaveLength(1)
    })

    it('says so when nothing has been sent to check against', async () => {
      const token = await h.attempt()
      expect(await h.signUp.confirmCode({ attempt: token, typed: '123456' })).toEqual({ refusal: 'signup.no_code' })
      expect(await h.signUp.resendCode({ attempt: token, network: aNetworkAddress() })).toEqual({
        refusal: 'signup.no_code',
      })
      expect(await h.signUp.confirmCode({ attempt: null, typed: '123456' })).toEqual({
        refusal: 'signup.human_check_needed',
      })
    })
  })

  describe('a new code', () => {
    it('waits a minute after the last one', async () => {
      const { token, address } = await h.attemptWithCode()

      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds - 1))
      expect(await h.signUp.resendCode({ attempt: token, network: aNetworkAddress() })).toEqual({
        refusal: 'signup.resend_too_soon',
        resendInSeconds: 1,
      })
      expect(h.email.delivered).toHaveLength(1)

      h.clock.advanceBy(seconds(1))
      expect(await h.signUp.resendCode({ attempt: token, network: aNetworkAddress() })).toEqual({
        sent: address,
        resendInSeconds: EMAIL_CODE.resendAfterSeconds,
      })
      expect(h.email.delivered).toHaveLength(2)
    })

    it('ends the old code, and is a different email to Resend', async () => {
      const { token, code } = await h.attemptWithCode()
      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      await h.signUp.resendCode({ attempt: token, network: aNetworkAddress() })
      const next = codeIn(h.email.delivered[1])

      if (next !== code) {
        expect(await h.signUp.confirmCode({ attempt: token, typed: code })).toMatchObject({
          refusal: 'signup.wrong_code',
        })
      }
      expect(h.email.delivered[0]!.idempotencyKey).not.toBe(h.email.delivered[1]!.idempotencyKey)
      expect(await h.signUp.confirmCode({ attempt: token, typed: next })).toHaveProperty('verified')
    })

    it('is what page two asking again for the same address amounts to', async () => {
      const { token, address } = await h.attemptWithCode()
      const again = () =>
        h.signUp.sendCode({ attempt: token, email: address.toUpperCase(), phone: US_PHONE, network: aNetworkAddress() })

      expect(await again()).toMatchObject({ refusal: 'signup.resend_too_soon' })
      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      expect(await again()).toHaveProperty('sent')
    })
  })

  describe('the caps', () => {
    const askFreshly = async (address: string, network: string | null) => {
      const token = await h.attempt()
      return h.signUp.sendCode({ attempt: token, email: address, phone: US_PHONE, network })
    }

    it('hold one address to its emails an hour, across attempts and networks and spellings', async () => {
      const address = anAddress()
      for (let i = 0; i < EMAIL_CODE.perEmailPerHour; i++) {
        expect(await askFreshly(i % 2 ? address.toUpperCase() : address, aNetworkAddress())).toHaveProperty('sent')
      }

      expect(await askFreshly(address, aNetworkAddress())).toEqual({ refusal: 'signup.too_many_codes' })
      expect(h.email.delivered).toHaveLength(EMAIL_CODE.perEmailPerHour)

      h.clock.advanceBy(minutes(SEND_CAP_WINDOW_MINUTES))
      expect(await askFreshly(address, aNetworkAddress())).toHaveProperty('sent')
    })

    it('hold one network to its emails an hour, across addresses', async () => {
      const network = aNetworkAddress()
      for (let i = 0; i < EMAIL_CODE.perNetworkPerHour; i++) {
        expect(await askFreshly(anAddress(), network)).toHaveProperty('sent')
      }

      expect(await askFreshly(anAddress(), network)).toEqual({ refusal: 'signup.too_many_codes' })
      expect(await askFreshly(anAddress(), aNetworkAddress())).toHaveProperty('sent')

      h.clock.advanceBy(minutes(SEND_CAP_WINDOW_MINUTES))
      expect(await askFreshly(anAddress(), network)).toHaveProperty('sent')
    })

    it('still hold an address when the network cannot be told', async () => {
      const address = anAddress()
      for (let i = 0; i < EMAIL_CODE.perEmailPerHour; i++) {
        expect(await askFreshly(address, null)).toHaveProperty('sent')
      }
      expect(await askFreshly(address, null)).toEqual({ refusal: 'signup.too_many_codes' })
    })
  })

  describe('an address that already has an account', () => {
    it('answers the same, and its owner is told instead of sent a code', async () => {
      const taken = anAddress()
      await backing.giveAccount(taken)
      const free = anAddress()
      const network = aNetworkAddress()

      const asTaken = await h.attempt()
      const asFree = await h.attempt()
      const answerTaken = await h.signUp.sendCode({ attempt: asTaken, email: taken, phone: US_PHONE, network })
      const answerFree = await h.signUp.sendCode({ attempt: asFree, email: free, phone: US_PHONE, network })

      const shape = (answer: typeof answerTaken, address: string) =>
        JSON.stringify(answer).replaceAll(address, '<the address>')
      expect(shape(answerTaken, taken)).toBe(shape(answerFree, free))

      const notice = h.email.delivered[0]!
      expect(notice).toMatchObject({
        kind: 'signUpAttemptNotice',
        to: [taken],
        subject: 'Someone tried to sign up with your email',
      })
      expect(notice.text).not.toMatch(/\d{6}/)
      expect(h.email.delivered[1]).toMatchObject({ kind: 'emailCode', to: [free] })
    })

    it('finds the account in any spelling of the address', async () => {
      const taken = anAddress()
      await backing.giveAccount(taken)

      const token = await h.attempt()
      await h.signUp.sendCode({
        attempt: token,
        email: taken.toUpperCase(),
        phone: US_PHONE,
        network: aNetworkAddress(),
      })

      expect(h.email.delivered[0]).toMatchObject({ kind: 'signUpAttemptNotice' })
    })

    it('reads like any other attempt from then on, and no code ever proves it', async () => {
      const taken = anAddress()
      await backing.giveAccount(taken)
      const free = await h.attemptWithCode()
      const token = await h.attempt()
      await h.signUp.sendCode({ attempt: token, email: taken, phone: US_PHONE, network: aNetworkAddress() })

      const standing = (await h.signUp.standing(token)) as { email: string }
      const freeStanding = (await h.signUp.standing(free.token)) as { email: string }
      expect({ ...standing, email: '' }).toEqual({ ...freeStanding, email: '' })

      const wrong = notThe(free.code)
      expect(await h.signUp.confirmCode({ attempt: token, typed: free.code })).toEqual(
        await h.signUp.confirmCode({ attempt: free.token, typed: wrong }),
      )
      expect(await h.signUp.standing(token)).toMatchObject({ step: 'code', triesLeft: 4 })

      for (let code = 0; code < EMAIL_CODE.tries - 1; code++) {
        expect(await h.signUp.confirmCode({ attempt: token, typed: String(code).padStart(6, '0') })).toHaveProperty(
          'refusal',
        )
      }
      expect(await h.signUp.readyToOpen({ attempt: token, humanToken: GOOD_TOKEN })).toEqual({
        refusal: 'signup.not_verified',
      })
    })

    it('counts against the same caps and the same wait', async () => {
      const taken = anAddress()
      await backing.giveAccount(taken)

      const token = await h.attempt()
      const asking = () =>
        h.signUp.sendCode({ attempt: token, email: taken, phone: US_PHONE, network: aNetworkAddress() })
      expect(await asking()).toHaveProperty('sent')
      expect(await asking()).toEqual({
        refusal: 'signup.resend_too_soon',
        resendInSeconds: EMAIL_CODE.resendAfterSeconds,
      })

      for (let i = 1; i < EMAIL_CODE.perEmailPerHour; i++) {
        h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
        expect(await asking()).toHaveProperty('sent')
      }
      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      expect(await asking()).toEqual({ refusal: 'signup.too_many_codes' })
    })
  })

  describe('when the email or the secret fails', () => {
    it('leaves no wait behind, so asking again works at once', async () => {
      const token = await h.attempt()
      const address = anAddress()
      const asking = () =>
        h.signUp.sendCode({ attempt: token, email: address, phone: US_PHONE, network: aNetworkAddress() })

      h.email.failWith(new Error('Resend is down'))
      expect(await asking()).toEqual({ refusal: 'signup.not_sent' })
      expect(await h.signUp.standing(token)).toEqual({ step: 'email_and_phone', email: address })

      h.email.failWith(null)
      expect(await asking()).toHaveProperty('sent')
      const code = codeIn(h.email.delivered[0])
      expect(await h.signUp.confirmCode({ attempt: token, typed: code })).toEqual({ verified: address })
    })

    it('answers the same for an address with an account', async () => {
      const taken = anAddress()
      await backing.giveAccount(taken)
      const token = await h.attempt()

      h.email.failWith(new Error('Resend is down'))
      expect(
        await h.signUp.sendCode({ attempt: token, email: taken, phone: US_PHONE, network: aNetworkAddress() }),
      ).toEqual({ refusal: 'signup.not_sent' })
    })
  })

  describe('before a church opens', () => {
    it('asks for a second, fresh token of its own kind', async () => {
      const { token, address, code } = await h.attemptWithCode()
      await h.signUp.confirmCode({ attempt: token, typed: code })
      h.human.asked.length = 0

      expect(await h.signUp.readyToOpen({ attempt: token, humanToken: 'a-forged-token' })).toEqual({
        refusal: 'signup.not_human',
      })
      expect(h.human.asked).toEqual([{ token: 'a-forged-token', action: HUMAN_CHECK_ACTIONS.openChurch }])

      const ready = await h.signUp.readyToOpen({ attempt: token, humanToken: GOOD_TOKEN })
      expect(ready).toEqual({
        ready: { pendingSignupId: expect.any(String), email: address, phone: US_PHONE, agreedAt: expect.any(Date) },
      })
    })

    it('refuses an attempt that has not proven its address, without spending the token', async () => {
      const { token } = await h.attemptWithCode()
      h.human.asked.length = 0

      expect(await h.signUp.readyToOpen({ attempt: token, humanToken: GOOD_TOKEN })).toEqual({
        refusal: 'signup.not_verified',
      })
      expect(await h.signUp.readyToOpen({ attempt: null, humanToken: GOOD_TOKEN })).toEqual({
        refusal: 'signup.not_verified',
      })
      expect(h.human.asked).toEqual([])
    })

    it('does not keep a proven address for ever', async () => {
      const { token, code } = await h.attemptWithCode()
      await h.signUp.confirmCode({ attempt: token, typed: code })

      h.clock.advanceBy(minutes(VERIFIED_LIFETIME_MINUTES))
      expect(await h.signUp.standing(token)).toEqual({ step: 'human_check' })
      expect(await h.signUp.readyToOpen({ attempt: token, humanToken: GOOD_TOKEN })).toEqual({
        refusal: 'signup.not_verified',
      })
    })
  })

  describe('the time of the consent', () => {
    const OTHER_PHONE = '+12055550101'

    const agreedAtOf = async (token: Awaited<ReturnType<typeof h.attempt>>) =>
      (await backing.store.read(token))?.agreedAt

    it('is when "Email me a code" was pressed, and a resend keeps it', async () => {
      const pressed = h.clock.now()
      const { token, address } = await h.attemptWithCode()
      expect(await agreedAtOf(token)).toEqual(pressed)

      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      expect(await h.signUp.resendCode({ attempt: token, network: aNetworkAddress() })).toHaveProperty('sent', address)

      expect((await backing.store.read(token))?.codeSentAt).toEqual(h.clock.now())
      expect(await agreedAtOf(token)).toEqual(pressed)
    })

    it('stays when it is pressed again with the same phone', async () => {
      const pressed = h.clock.now()
      const { token, address } = await h.attemptWithCode()

      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      await h.signUp.sendCode({ attempt: token, email: address, phone: US_PHONE, network: aNetworkAddress() })

      expect(await agreedAtOf(token)).toEqual(pressed)
    })

    it('moves when it is pressed again with a different phone, since the consent is for that number', async () => {
      const { token, address } = await h.attemptWithCode()

      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      const pressedAgain = h.clock.now()
      await h.signUp.sendCode({ attempt: token, email: address, phone: OTHER_PHONE, network: aNetworkAddress() })

      expect(await agreedAtOf(token)).toEqual(pressedAgain)
    })

    it('is what `readyToOpen` hands on, with the phone it was for', async () => {
      const pressed = h.clock.now()
      const { token, code } = await h.attemptWithCode()
      h.clock.advanceBy(minutes(3))
      await h.signUp.confirmCode({ attempt: token, typed: code })

      expect(await h.signUp.readyToOpen({ attempt: token, humanToken: GOOD_TOKEN })).toMatchObject({
        ready: { phone: US_PHONE, agreedAt: pressed },
      })
    })
  })

  describe('the logs', () => {
    const everyLogMethod = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const

    it('never hold a code, on any path, a failed send included', async () => {
      const written: string[] = []
      for (const method of everyLogMethod) {
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          written.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg))).join(' '))
        })
      }
      const capture = (chunk: unknown) => {
        written.push(String(chunk))
        return true
      }
      vi.spyOn(process.stdout, 'write').mockImplementation(capture)
      vi.spyOn(process.stderr, 'write').mockImplementation(capture)

      const seen: string[] = []

      // Sent, tried wrongly, proven.
      const first = await h.attemptWithCode()
      seen.push(first.code)
      await h.signUp.confirmCode({ attempt: first.token, typed: notThe(first.code) })
      await h.signUp.confirmCode({ attempt: first.token, typed: first.code })

      // A vendor whose refusal quotes everything it was handed.
      const second = await h.attemptWithCode()
      seen.push(second.code)
      h.clock.advanceBy(seconds(EMAIL_CODE.resendAfterSeconds))
      const leaking = h.email.transport.deliver
      h.email.transport.deliver = async (envelope) => {
        seen.push(codeIn(envelope))
        throw Object.assign(new Error(`Refused, because of: ${envelope.text}`), {
          name: 'EmailNotDelivered',
          status: 422,
          reason: 'validation_error',
        })
      }
      await h.signUp.resendCode({ attempt: second.token, network: aNetworkAddress() })
      h.email.transport.deliver = leaking

      expect(seen).toHaveLength(3)
      expect(written.join('\n')).toContain('did not go: EmailNotDelivered 422 validation_error')
      for (const code of seen) expect(written.join('\n')).not.toContain(code)
      expect(written.join('\n')).not.toContain(second.address)
    })
  })
}
