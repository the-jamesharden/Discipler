import { describe, expect, it } from 'vitest'
import { asEmailAddress, openEnvelope } from '~/domain/email'
import { PASSWORD_RESET_LINK_MINUTES } from '~/domain/launch-terms'
import {
  passwordResetEmail,
  passwordResetLinkExpiry,
  readPasswordResetToken,
} from '~/domain/password-reset'

/**
 * The reset email, as mock-up 6's `m1-reset-email.html` draws it (Exponential launch,
 * ticket 22). Its words are James's. What the route does with it is
 * `tests/integration/forgot-password.test.ts`.
 */

const TOKEN = 'a'.repeat(43)

const envelope = () =>
  openEnvelope(
    passwordResetEmail({
      once: '00000000-0000-4000-8000-0000000000aa',
      to: asEmailAddress('pastor.dan@gracechurch.org')!,
      link: new URL(`https://app.trydiscipler.com/login/forgot/${TOKEN}`),
      logo: new URL('https://app.trydiscipler.com/discipler-logo.png'),
    }),
  )

const SENTENCES = [
  'Reset your password',
  `Somebody asked to reset the password on your Discipler account. If that was you, choose a new one here. This link works once, for ${PASSWORD_RESET_LINK_MINUTES} minutes.`,
  "If it wasn't you, you can ignore this email, and your password stays as it is.",
  'If you need a hand, reply to this email.',
  "You're receiving this because a password reset was asked for on your Discipler account at app.trydiscipler.com.",
]

/** The markup's words, its one escape undone, as somebody reads them. */
const wordsOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#39;', "'")
    .replace(/\s+/g, ' ')

describe('the reset email', () => {
  it('goes to the Admin, with replies to support@ and the mock-up\'s subject', () => {
    const email = envelope()

    expect(email.to).toEqual(['pastor.dan@gracechurch.org'])
    expect(email.replyTo).toBe('support@trydiscipler.com')
    expect(email.subject).toBe('Reset your Discipler password')
    expect(email.idempotencyKey).toBe('passwordReset/00000000-0000-4000-8000-0000000000aa')
  })

  it.each(SENTENCES)('says %j in both parts', (sentence) => {
    const email = envelope()

    expect(email.text).toContain(sentence)
    expect(wordsOf(email.html!)).toContain(sentence)
  })

  it('carries the link in both parts, the button naming what it does', () => {
    const email = envelope()
    const link = `https://app.trydiscipler.com/login/forgot/${TOKEN}`

    expect(email.text).toContain(`Choose a new password: ${link}`)
    expect(email.html).toMatch(new RegExp(`<a href="${link}"[^>]*>Choose a new password</a>`))
  })

  it('holds nothing but its own sentences and the link: no address, no church, no phone', () => {
    const email = envelope()
    const everything = `${email.subject}\n${email.text}\n${email.html}`

    expect(everything).not.toContain('pastor.dan')
    expect(everything).not.toContain('gracechurch')
    expect(everything).not.toMatch(/\+\d{8,}/)
  })

  it('will not link anywhere but Discipler', () => {
    expect(() =>
      passwordResetEmail({
        once: 'one',
        to: asEmailAddress('pastor.dan@gracechurch.org')!,
        link: new URL('https://discipler.example/login/forgot/x'),
        logo: new URL('https://app.trydiscipler.com/discipler-logo.png'),
      }),
    ).toThrow('An email links only to Discipler.')
  })
})

describe('a reset link', () => {
  it('runs out after the constant says, to the millisecond', () => {
    const at = new Date('2026-11-04T10:00:00.000Z')

    expect(passwordResetLinkExpiry(at).getTime() - at.getTime()).toBe(PASSWORD_RESET_LINK_MINUTES * 60_000)
  })

  it.each([
    ['too short', 'a'.repeat(42)],
    ['too long', 'a'.repeat(44)],
    ['outside base64url', `${'a'.repeat(42)}/`],
    ['a path', '../../../etc/passwd'],
    ['empty', ''],
    ['missing', undefined],
  ])('is not read from something %s', (_name, raw) => {
    expect(readPasswordResetToken(raw)).toBeNull()
  })

  it('is read from 43 base64url characters', () => {
    expect(readPasswordResetToken(TOKEN)).toBe(TOKEN)
  })
})
