import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { openEnvelope } from '~/domain/email'
import { readAttemptToken, readSignUpCode, signUpAttemptNotice, codeEmail } from '~/domain/sign-up-attempt'
import { createSignUpCodeKeeper } from '~/platform/sign-up-code-keeper'
import { createEmailSender } from '~/service/email-sender'
import { createSignUp } from '~/service/sign-up'
import { createInMemoryPendingSignups } from '../support/pending-signups-in-memory'
import {
  aNetworkAddress,
  anAddress,
  buildHarness,
  createRecordingEmail,
  createScriptedHumanCheck,
  describeSignUpScenarios,
  GOOD_TOKEN,
} from '../support/sign-up-scenarios'

describe('the email code at sign-up', () => {
  describeSignUpScenarios(() => createInMemoryPendingSignups())
})

describe('the two answers to "send me a code"', () => {
  const US_PHONE = '+12055550100'

  afterEach(() => vi.restoreAllMocks())

  it('take the same steps in the same order', async () => {
    const memory = createInMemoryPendingSignups()
    const h = buildHarness(memory)
    const taken = anAddress()
    await memory.giveAccount(taken)
    const ask = async (email: string) => {
      const attempt = await h.attempt()
      memory.calls.length = 0
      await h.signUp.sendCode({ attempt, email, phone: US_PHONE, network: aNetworkAddress() })
      return [...memory.calls]
    }

    const forTaken = await ask(taken)
    const forFree = await ask(anAddress())

    expect(forTaken).toEqual(forFree)
    expect(h.email.delivered.map((envelope) => envelope.kind)).toEqual(['signUpAttemptNotice', 'emailCode'])
  })

  it('both wait on the email, so they take about the same time', async () => {
    const memory = createInMemoryPendingSignups()
    const human = createScriptedHumanCheck()
    const email = createRecordingEmail()
    const keeper = createSignUpCodeKeeper(() => 'a-test-secret-that-is-long-enough-to-use')
    const signUp = createSignUp({
      signUps: memory.store,
      humanCheck: human.humanCheck,
      keeper,
      sender: createEmailSender(email.transport),
      clock: createTestClock(new Date()),
    })
    // A vendor slow enough to be the whole of the time, so an answer that skipped
    // the email would be plain against the one that waited.
    const vendorMs = 100
    email.takeThisLong(vendorMs)
    const taken = anAddress()
    await memory.giveAccount(taken)

    const timeOf = async (address: string) => {
      const passed = await signUp.passHumanCheck(GOOD_TOKEN)
      const attempt = 'attempt' in passed ? passed.attempt : null
      const started = performance.now()
      await signUp.sendCode({ attempt, email: address, phone: US_PHONE, network: aNetworkAddress() })
      return performance.now() - started
    }
    const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!

    const forTaken: number[] = []
    const forFree: number[] = []
    for (let i = 0; i < 5; i++) {
      forTaken.push(await timeOf(taken))
      forFree.push(await timeOf(anAddress()))
    }

    expect(median(forTaken)).toBeGreaterThanOrEqual(vendorMs - 5)
    expect(median(forFree)).toBeGreaterThanOrEqual(vendorMs - 5)
    expect(Math.abs(median(forTaken) - median(forFree))).toBeLessThan(vendorMs / 2)
  })
})

describe('the secret behind a code', () => {
  it('refuses to send when it is unset, for an address with or without an account', async () => {
    const memory = createInMemoryPendingSignups()
    const human = createScriptedHumanCheck()
    const email = createRecordingEmail()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = process.env.SIGN_UP_CODE_SECRET
    delete process.env.SIGN_UP_CODE_SECRET
    try {
      const signUp = createSignUp({
        signUps: memory.store,
        humanCheck: human.humanCheck,
        keeper: createSignUpCodeKeeper(),
        sender: createEmailSender(email.transport),
        clock: createTestClock(new Date()),
      })
      const taken = anAddress()
      await memory.giveAccount(taken)
      for (const address of [taken, anAddress()]) {
        const passed = await signUp.passHumanCheck(GOOD_TOKEN)
        const attempt = 'attempt' in passed ? passed.attempt : null
        expect(
          await signUp.sendCode({ attempt, email: address, phone: '+12055550100', network: aNetworkAddress() }),
        ).toEqual({ refusal: 'signup.not_sent' })
        expect(await signUp.standing(attempt)).toEqual({ step: 'email_and_phone', email: null })
      }
      expect(email.delivered).toEqual([])
    } finally {
      if (before === undefined) delete process.env.SIGN_UP_CODE_SECRET
      else process.env.SIGN_UP_CODE_SECRET = before
      vi.restoreAllMocks()
    }
  })
})

describe('reading what comes back from a browser', () => {
  it('takes only what could be a code', () => {
    expect(readSignUpCode('012345')).toBe('012345')
    expect(readSignUpCode('012 345')).toBe('012345')
    expect(readSignUpCode('012-345')).toBe('012345')
    expect(readSignUpCode('01234')).toBeNull()
    expect(readSignUpCode('0123456')).toBeNull()
    expect(readSignUpCode('01234a')).toBeNull()
  })

  it('takes only what could be an attempt', () => {
    expect(readAttemptToken('a'.repeat(43))).toBe('a'.repeat(43))
    expect(readAttemptToken('a'.repeat(42))).toBeNull()
    expect(readAttemptToken(`${'a'.repeat(42)};`)).toBeNull()
    expect(readAttemptToken(null)).toBeNull()
    expect(readAttemptToken(undefined)).toBeNull()
  })
})

describe('the two emails', () => {
  const open = (message: ReturnType<typeof codeEmail>, kind: 'emailCode' | 'signUpAttemptNotice') =>
    openEnvelope({
      kind,
      to: 'pastor@grace.example' as never,
      once: 'attempt-1/1',
      ...message,
    } as Parameters<typeof openEnvelope>[0])

  it('carry a code in the body and never the subject', () => {
    const envelope = open(codeEmail('012345'), 'emailCode')

    expect(envelope.text).toMatch(/^012345$/m)
    expect(envelope.subject).toBe('Your Discipler code')
    expect(envelope.text).toContain('It works for 10 minutes.')
  })

  it('say nothing of a code to the owner of an account, and link nowhere', () => {
    const envelope = open(signUpAttemptNotice(), 'signUpAttemptNotice')

    expect(envelope.subject).toBe('Someone tried to sign up with your email')
    expect(envelope.text).toContain('No code was sent')
    expect(envelope.text).not.toMatch(/\d/)
    expect(envelope.text).not.toMatch(/https?:/)
  })
})
