import { NextResponse, type NextRequest } from 'next/server'
import { calledUrl, signatureMatches } from '~/platform/twilio/inbound-signature'
import { getCommandService, getInboundReader } from '~/service/container'

/**
 * Only Twilio may speak here.
 *
 * A number is public, and this route acts on the say-so of one: `STOP` opts a
 * congregant out of their Ministry, `PAUSE` suspends a relationship, `C` raises a
 * Concern against somebody's name. Unverified, anybody who knows a mobile number
 * can do all three as that person.
 *
 * **An unset token is a closed door**, exactly as `CRON_SECRET` is at `/cron/tick`
 * and for the same reason: a deployment that forgot to configure it must not be one
 * where anybody can drive the webhook. The tests sign their requests rather than
 * being let past.
 */
const fromTwilio = (request: NextRequest, parameters: Readonly<Record<string, string>>) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false

  return signatureMatches(
    authToken,
    request.headers.get('x-twilio-signature'),
    calledUrl(request.url, request.headers),
    parameters,
  )
}

/**
 * The one webhook. Every inbound text arrives here -- a check-in answer, a
 * keyword, a message to nobody in particular -- because a phone has one number to
 * reply to and the delivery vendor has one place to send it.
 *
 * Resolution is the sender's number to a Person, and then their open Check-In
 * Sequence to the question awaiting a reply. Nothing here resolves to *the
 * Person's relationship*: a Leader may hold several, and only the position in
 * their sequence says which one a `1` is about. That second half is the domain's;
 * this route does the first, because a text carries no session and the unit of
 * work has to name its Ministry before it opens.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()

  // Every form field is signed, not only the two read below -- Twilio signs what it
  // sent, so a subset would never match.
  const parameters = Object.fromEntries(
    [...form.entries()].flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])),
  )

  // Refused outright rather than acknowledged. A malformed callback is answered with
  // an empty TwiML below because a retry cannot help it; an unsigned one is a caller
  // with no business here, and telling it `200 OK` would be telling it the forgery
  // worked.
  if (!fromTwilio(request, parameters)) {
    return new NextResponse(null, { status: 403 })
  }

  const from = form.get('From')
  const body = form.get('Body')

  // A malformed callback is not a conversation. Answered rather than refused,
  // because a delivery vendor retries a failure and there is nothing here to
  // succeed at on the second attempt.
  if (typeof from !== 'string' || typeof body !== 'string') return acknowledged()

  // A number Discipler does not hold, or one held by more than one Person.
  // Resolving the second by guessing would file one congregant's answer against
  // another's relationship, so it resolves to nobody instead.
  //
  // **That second case is unowned, and is not ticket 26's.** Ticket 08a deferred
  // it there; ticket 26 builds the import report's resolution screen and its own
  // text keeps the shared number as a legitimate permanent state -- *two rows
  // sharing a number with different names are still both imported, that is the
  // couple case ADR-0005 protects*. So a household on one phone is a state the
  // product creates deliberately and whose replies land here and stop: the check-in
  // answers are dropped, and the derivation then reports the relationship as gone
  // silent. No ticket in 01-26 closes that.
  const sender = await getInboundReader().resolveSender(from)
  if (!sender) return acknowledged()

  await getCommandService().execute({
    type: 'sms.inbound',
    ministryId: sender.ministryId,
    personId: sender.personId,
    body,
  })

  return acknowledged()
}

/**
 * An empty TwiML document: received, and nothing to send back down this
 * connection. Everything Discipler says in reply is enqueued by the command and
 * sent by the sending layer, which is what keeps the opt-out and consent checks
 * in one place instead of on the way out of a webhook.
 */
const acknowledged = () =>
  new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  })
