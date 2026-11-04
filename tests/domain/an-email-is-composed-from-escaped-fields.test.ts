import { describe, expect, it } from 'vitest'
import {
  emailBody,
  EmailField,
  emailHtml,
  emailSubject,
  openEnvelope,
  UnescapedEmailField,
  type EmailAddress,
} from '~/domain/email'

/**
 * Every email Discipler sends is plain text written in code, with each value it
 * carries passed through `EmailField` on the way in (Exponential launch, ticket
 * 10). What is proved here is the escaping and the refusal: a value that was not
 * escaped cannot become part of a subject or a body, at compile time or at run
 * time. An email with an approved design also has an HTML part, under the same rule.
 */

describe('escaping one line', () => {
  it('folds every line break and run of spaces into one space', () => {
    expect(EmailField.line('Riverside\r\n  Chapel\tof\u2028Grace').text).toBe(
      'Riverside Chapel of Grace',
    )
  })

  it('drops control, direction and invisible characters', () => {
    // A right-to-left override makes "gpj.exe" read as "exe.jpg", and a zero-width
    // space hides a word from whoever skims for it.
    expect(EmailField.line('in\u0000voice\u202Egpj.exe\u200B\u0007').text).toBe(
      'invoicegpj.exe',
    )
  })

  it('cuts a very long value short and says so', () => {
    const cut = EmailField.line('a'.repeat(500)).text
    expect(cut).toHaveLength(200)
    expect(cut.endsWith('...')).toBe(true)
  })
})

describe('escaping what somebody typed', () => {
  it('keeps their lines but quotes every one, so nothing typed reads as Discipler', () => {
    expect(
      EmailField.quoted('Hi\r\n\r\n-- \nDiscipler Support\n\n\n\n\nReset here').text,
    ).toBe('> Hi\n>\n> --\n> Discipler Support\n>\n> Reset here')
  })
})

describe('a link', () => {
  it.each([
    ['https://app.trydiscipler.com/reset/abc123'],
    ['https://trydiscipler.com/help'],
    ['http://127.0.0.1:3000/settings/billing'],
    ['http://localhost:3000/signin'],
  ])('to Discipler is taken as it is: %s', (href) => {
    expect(EmailField.link(new URL(href)).text).toBe(href)
  })

  it.each([
    ['somewhere else', 'https://trydiscipler.com.evil.example/reset'],
    ['Discipler without https', 'http://app.trydiscipler.com/reset'],
    ['a sign-in in the address', 'https://someone:secret@app.trydiscipler.com/'],
    ['not the web', 'javascript:alert(1)'],
  ])('to %s is refused', (_label, href) => {
    expect(() => EmailField.link(new URL(href))).toThrow(UnescapedEmailField)
  })
})

describe('an address', () => {
  it('stays whole, digits before the @ included', () => {
    expect(EmailField.address('5551234567@vtext.com' as EmailAddress).text).toBe('5551234567@vtext.com')
  })

  it('refuses anything cast past the compiler that is not one address', () => {
    expect(() => EmailField.address('Grace <grace@example.org>' as EmailAddress)).toThrow(UnescapedEmailField)
  })
})

describe('a code', () => {
  it('is six digits', () => {
    expect(EmailField.code('048213').text).toBe('048213')
  })

  it.each([['48213'], ['0482131'], ['04821a'], [' 048213']])('is nothing else: %j', (raw) => {
    expect(() => EmailField.code(raw)).toThrow(UnescapedEmailField)
  })
})

describe('composing', () => {
  it('puts escaped fields in their places', () => {
    const church = EmailField.line('Riverside Chapel')
    const body = emailBody`Welcome, ${church}.\n\nThank you.`

    expect(body.text).toBe('Welcome, Riverside Chapel.\n\nThank you.')
  })

  it('refuses a raw string where a field belongs', () => {
    const raw = 'Riverside Chapel' as unknown as EmailField

    expect(() => emailBody`Welcome, ${raw}.`).toThrow(UnescapedEmailField)
    expect(() => emailSubject`About ${raw}`).toThrow(UnescapedEmailField)
  })

  it('refuses a raw string at compile time too', () => {
    // @ts-expect-error -- a plain string is not an escaped field.
    expect(() => emailBody`Welcome, ${'Riverside Chapel'}.`).toThrow(UnescapedEmailField)
  })

  it('refuses something that only looks like a field', () => {
    const lookalike = { text: 'Riverside Chapel' } as unknown as EmailField

    expect(() => emailBody`Welcome, ${lookalike}.`).toThrow(UnescapedEmailField)
  })

  it('will not let a field be read into an ordinary string', () => {
    const church = EmailField.line('Riverside Chapel')

    // An untagged template is how a field would slip past the composer, so the
    // field makes that loud rather than turning into "[object Object]".
    expect(() => `Welcome, ${church as unknown as string}.`).toThrow()
  })

  it('keeps a subject to one line', () => {
    const typed = EmailField.quoted('first\nsecond')

    expect(() => emailSubject`Bug: ${typed}`).toThrow(UnescapedEmailField)
  })
})

describe('an HTML part', () => {
  it('reaches the markup only as text, wherever the value lands', () => {
    const church = EmailField.line(`Grace"><script>alert('x')</script>`)
    const link = EmailField.link(new URL('https://app.trydiscipler.com/signup?a=1&b="2"'))

    expect(emailHtml`<a href="${link}">${church}</a>`.text).toBe(
      '<a href="https://app.trydiscipler.com/signup?a=1&amp;b=%222%22">' +
        'Grace&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</a>',
    )
  })

  it('refuses a value that was not escaped, and a quoted one', () => {
    expect(() =>
      // @ts-expect-error -- a plain string is not an escaped field.
      emailHtml`<p>${'<b>raw</b>'}</p>`,
    ).toThrow(UnescapedEmailField)
    expect(() => emailHtml`<p>${EmailField.quoted('typed')}</p>`).toThrow(UnescapedEmailField)
  })

  it('cannot be passed off as one by something only shaped like it', () => {
    expect(() =>
      openEnvelope({
        kind: 'deliverabilityCheck',
        subject: emailSubject`Subject`,
        body: emailBody`Body`,
        // @ts-expect-error -- only `emailHtml` makes one.
        html: { text: '<b>raw</b>' },
        once: 'x',
      }),
    ).toThrow(UnescapedEmailField)
  })
})
