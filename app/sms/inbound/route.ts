import { NextResponse, type NextRequest } from 'next/server'
import { getCommandService, getInboundReader } from '~/service/container'

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
  const from = form.get('From')
  const body = form.get('Body')

  // A malformed callback is not a conversation. Answered rather than refused,
  // because a delivery vendor retries a failure and there is nothing here to
  // succeed at on the second attempt.
  if (typeof from !== 'string' || typeof body !== 'string') return acknowledged()

  // A number Discipler does not hold, or one held by more than one Person --
  // which is ticket 26's, and until it lands resolves to nobody rather than to a
  // guess. Either way there is nothing to act on and nothing to say.
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
