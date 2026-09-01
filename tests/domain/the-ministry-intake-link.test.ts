import { describe, expect, it } from 'vitest'
import { ministryId } from '~/domain/ids'
import { CONSENT_SOURCES } from '~/domain/intake'
import { ministryIntakeLink, ministryIntakeQrLink } from '~/domain/outbound-copy'

/**
 * The one link a whole Ministry hands out, and the same link with the one thing on
 * it that a consent record will later be asked about.
 *
 * These are two functions rather than one with a flag, because they are handed to
 * an Admin side by side and the difference between them is the whole point: a
 * compliance review asks which of `pastor_link` and `qr_code` a Person's consent
 * was recorded under, and the answer is decided by which of these two was printed.
 */

const ministry = ministryId('9d1b0c44-2f5e-4a67-8c3d-71ea45b90f28')
const baseUrl = 'https://discipler.example'

describe('the Ministry’s Intake link', () => {
  it('is the base URL and the Ministry, and nothing else', () => {
    expect(ministryIntakeLink(baseUrl, ministry)).toBe(`${baseUrl}/intake/${ministry}`)
  })

  it('does not care whether the base URL was given with a trailing slash', () => {
    expect(ministryIntakeLink('https://discipler.example/', ministry)).toBe(
      ministryIntakeLink(baseUrl, ministry),
    )
  })

  it('carries no token, because the link is the Ministry’s and not a Person’s', () => {
    // The whole Ministry gets this one. It is printed on a bulletin and put on a
    // screen in front of a room, so anything secret on it would be secret from
    // nobody.
    expect(ministryIntakeLink(baseUrl, ministry)).not.toContain('reopen')
  })
})

describe('the QR code’s link', () => {
  it('is the same link, and differs only in saying it was scanned', () => {
    expect(ministryIntakeQrLink(baseUrl, ministry)).toBe(
      `${ministryIntakeLink(baseUrl, ministry)}?via=qr`,
    )
  })

  it('does not care whether the base URL was given with a trailing slash', () => {
    expect(ministryIntakeQrLink('https://discipler.example/', ministry)).toBe(
      ministryIntakeQrLink(baseUrl, ministry),
    )
  })

  it('says `qr`, which is the word the form turns into a consent source', () => {
    // The form maps `qr` onto `qr_code` and a bare link onto `pastor_link`. If the
    // word here drifted, every consent record scanned off a poster would be
    // recorded as though a pastor had sent it -- silently, because the form passes
    // an unrecognised route through for the domain to refuse and `via` absent is
    // not unrecognised.
    expect(new URL(ministryIntakeQrLink(baseUrl, ministry)).searchParams.get('via')).toBe('qr')
    expect(CONSENT_SOURCES).toContain('qr_code')
  })
})
