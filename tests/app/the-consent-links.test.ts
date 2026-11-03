import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CONSENT_VERSION } from '~/domain/consent'
import { Agreements, NOTHING_PREFILLED } from '../../app/intake/fields'

/**
 * The SMS agreement's links to the Privacy Policy and the Terms of Service, as the
 * public opt-in page's sample shows them. Every form draws `Agreements`, so one
 * rendering stands for all three.
 *
 * The form and `docs/consent-language.md` are only correct together, which is what
 * the last two tests hold: a record names a version, and the doc is where that
 * version's words are read back from.
 */

const html = renderToStaticMarkup(
  createElement(Agreements, { ministryName: 'Riverside Chapel', prefill: NOTHING_PREFILLED }),
)
const agreement = html.match(/<label class="check"><input[^>]*name="smsConsent"[^>]*\/><span>(.*?)<\/span><\/label>/)?.[1]
const doc = readFileSync(
  fileURLToPath(new URL('../../docs/consent-language.md', import.meta.url)),
  'utf8',
)

const asText = (markup: string): string => markup.replace(/<[^>]+>/g, '')

describe('the SMS agreement', () => {
  it('ends by pointing at the Privacy Policy and the Terms of Service', () => {
    expect(asText(agreement ?? '')).toMatch(
      /Reply STOP to opt out or HELP for help\. See our Privacy Policy and Terms of Service\.$/,
    )
  })

  it.each([
    ['Privacy Policy', 'https://trydiscipler.com/privacy/'],
    ['Terms of Service', 'https://trydiscipler.com/terms/'],
  ])('links %s in a new tab, so a half-filled form is not lost', (words, href) => {
    expect(agreement).toContain(
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${words}</a>`,
    )
  })

  it('reads in the doc exactly as it reads on the form', () => {
    const statement = doc.match(/^> (I agree to receive text messages from .*)$/m)?.[1] ?? ''
    const asWritten = statement
      .replace('**{{ministry_name}}**', 'Riverside Chapel')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    expect(asWritten).toBe(asText(agreement ?? ''))
  })

  it('is the wording of the version the doc names as current', () => {
    expect(doc).toContain(`\`consent_version = "${CONSENT_VERSION}"\``)
  })

  it('leaves the words of the earlier version in the doc, for the records that name it', () => {
    const earlier = doc.slice(doc.indexOf('### `2026-09-v1`'))

    expect(earlier).toMatch(/^> I agree to receive text messages from .* Reply STOP to opt out or HELP for help\.$/m)
  })
})
