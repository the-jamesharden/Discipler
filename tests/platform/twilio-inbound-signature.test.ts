import { describe, expect, it } from 'vitest'
import { calledUrl, signatureMatches, twilioSignature } from '~/platform/twilio/inbound-signature'

/**
 * The other half of the vendor boundary: what Twilio sends *in*, and how Discipler
 * satisfies itself the message is Twilio's.
 *
 * Driven with no server and no network, for the reason `twilio-transport.test.ts`
 * gives -- the algorithm is a pure function of the token, the URL and the form, and
 * that is what makes it testable at all. The webhook's end of it is covered over
 * HTTP in `tests/integration/inbound-over-http.test.ts`.
 */

const token = 'a-twilio-auth-token'
const url = 'https://discipler.example/sms/inbound'
const form = { From: '+15550100001', Body: 'PAUSE' }

describe('the signature Twilio sends', () => {
  it('matches the vendor’s published example', () => {
    // Twilio's own worked example from its security documentation. A hand-rolled
    // implementation is only worth having if it agrees with the vendor on a case
    // the vendor published, so this is the fixture that says the algorithm is
    // right rather than merely self-consistent.
    expect(
      twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', {
        Digits: '1234',
        To: '+18005551212',
        From: '+14158675309',
        Caller: '+14158675309',
        CallSid: 'CA1234567890ABCDE',
      }),
    ).toBe('RSOYDt4T1cUTdK1PDd93/VVr8B8=')
  })

  it('accepts the signature it would have produced', () => {
    expect(signatureMatches(token, twilioSignature(token, url, form), url, form)).toBe(true)
  })

  it('refuses a request with no signature at all', () => {
    // The state the route was in before this existed: anybody could post.
    expect(signatureMatches(token, null, url, form)).toBe(false)
    expect(signatureMatches(token, '', url, form)).toBe(false)
  })

  it('refuses a body edited after signing', () => {
    // The forgery that matters: a real callback replayed with `STOP` in it, or a
    // `C` raising a Concern against somebody who said nothing.
    const signature = twilioSignature(token, url, form)

    expect(signatureMatches(token, signature, url, { ...form, Body: 'STOP' })).toBe(false)
  })

  it('refuses a sender edited after signing', () => {
    const signature = twilioSignature(token, url, form)

    expect(signatureMatches(token, signature, url, { ...form, From: '+15550100002' })).toBe(false)
  })

  it('refuses a signature made with a different token', () => {
    expect(signatureMatches(token, twilioSignature('another-token', url, form), url, form)).toBe(
      false,
    )
  })

  it('refuses one signed for a different URL', () => {
    const signature = twilioSignature(token, 'https://elsewhere.example/sms/inbound', form)

    expect(signatureMatches(token, signature, url, form)).toBe(false)
  })

  it('does not depend on the order the form arrived in', () => {
    // Twilio sorts before signing, so a form read back in another order is the same
    // request. Getting this wrong would refuse genuine callbacks intermittently,
    // which is the failure that gets a signature check switched off.
    const reordered = { Body: form.Body, From: form.From }

    expect(signatureMatches(token, twilioSignature(token, url, form), url, reordered)).toBe(true)
  })
})

describe('the URL the signature is checked against', () => {
  it('prefers the forwarded host and scheme a proxy reports', () => {
    // Behind TLS termination the request arrives as plain `http` on an internal
    // host. Signing over that mismatches every genuine callback.
    const headers = new Headers({
      'x-forwarded-host': 'discipler.example',
      'x-forwarded-proto': 'https',
    })

    expect(calledUrl('http://10.0.0.7:3000/sms/inbound', headers)).toBe(
      'https://discipler.example/sms/inbound',
    )
  })

  it('takes the scheme nearest the caller when proxies have chained', () => {
    const headers = new Headers({
      'x-forwarded-host': 'discipler.example',
      'x-forwarded-proto': 'https, http',
    })

    expect(calledUrl('http://10.0.0.7:3000/sms/inbound', headers)).toBe(
      'https://discipler.example/sms/inbound',
    )
  })

  it('keeps the query string, which Twilio signs as part of the URL', () => {
    const headers = new Headers({ host: 'discipler.example' })

    expect(calledUrl('http://discipler.example/sms/inbound?ministry=abc', headers)).toBe(
      'http://discipler.example/sms/inbound?ministry=abc',
    )
  })

  it('falls back to the request’s own host where nothing was forwarded', () => {
    expect(calledUrl('http://127.0.0.1:3000/sms/inbound', new Headers())).toBe(
      'http://127.0.0.1:3000/sms/inbound',
    )
  })
})
