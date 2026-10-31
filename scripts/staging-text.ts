/**
 * Sends staging a text, the way Twilio would send one (Exponential launch, ticket 02).
 *
 * Staging has no number and Twilio never calls it, so a reply to a check-in, a
 * `STOP` or a `PAUSE` is tried there by posting what Twilio would have posted to
 * `/sms/inbound`, signed with Twilio's scheme under staging's own
 * `STAGING_SMS_SIGNING_SECRET`. The route refuses anything unsigned, so this is the
 * only way in. Staging sits behind Vercel's sign-in, which the automation bypass
 * secret gets past.
 *
 *   STAGING_URL=https://staging.trydiscipler.com \
 *   STAGING_SMS_SIGNING_SECRET=... VERCEL_AUTOMATION_BYPASS_SECRET=... \
 *     npm run staging:text -- "+15551234567" "1"
 *
 * The first argument is the phone the text is from, the second what it says, and an
 * optional third is the Discipler number it was sent to.
 */
import { twilioSignature } from '../src/platform/twilio/inbound-signature'

const [from, body, to] = process.argv.slice(2)
const { STAGING_URL, STAGING_SMS_SIGNING_SECRET, VERCEL_AUTOMATION_BYPASS_SECRET } = process.env

if (!from || body === undefined || !STAGING_URL || !STAGING_SMS_SIGNING_SECRET) {
  console.error(
    'Usage: STAGING_URL=... STAGING_SMS_SIGNING_SECRET=... [VERCEL_AUTOMATION_BYPASS_SECRET=...] ' +
      'staging-text.ts <from phone> <body> [<to number>]',
  )
  process.exit(2)
}

// Exactly the URL the route will rebuild from the forwarded host, with no query
// string: Twilio signs the URL as called, and the bypass goes in a header so as not
// to become part of it.
const url = new URL('/sms/inbound', STAGING_URL).toString()
const parameters: Record<string, string> = { From: from, Body: body, ...(to ? { To: to } : {}) }

const response = await fetch(url, {
  method: 'POST',
  redirect: 'manual',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'x-twilio-signature': twilioSignature(STAGING_SMS_SIGNING_SECRET, url, parameters),
    ...(VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': VERCEL_AUTOMATION_BYPASS_SECRET }
      : {}),
  },
  body: new URLSearchParams(parameters),
})

// 200 is taken (whatever it led to is in the staging logs and database); 403 is a
// signature staging did not accept; a 401 or a redirect is Vercel's sign-in.
console.log(`${response.status} ${response.statusText}`)
process.exit(response.status === 200 ? 0 : 1)
