import { NextResponse, type NextRequest } from 'next/server'
import { IntakeRefused } from '~/domain/errors'
import type { IntakeFormFields } from '~/domain/intake'
import { intakeLinkToken } from '~/domain/intake-link'
import { getCommandService, getIntakeReader } from '~/service/container'

/**
 * The same form POST the Ministry-wide route handles, submitted by somebody the
 * token names. It differs in one thing and that thing is who: the command carries
 * the token, so the submission lands on that Person's own record instead of being
 * matched back to a name and a number that may be exactly what they are correcting.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params

  // Checked against a real link rather than trusted out of the URL, for the reason
  // the Ministry-wide route checks the Ministry: a fabricated token must not reach
  // the boundary as a command against an identifier of its own.
  const page = await getIntakeReader().readReopenedIntakePage(token)
  if (!page) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  const submitted = await request.formData()
  const text = (name: string): string | null => {
    const value = submitted.get(name)
    return typeof value === 'string' ? value : null
  }

  const form: IntakeFormFields = {
    fullName: text('fullName'),
    phone: text('phone'),
    email: text('email'),
    ageBand: text('ageBand'),
    gender: text('gender'),
    goalId: text('goalId'),
    availability: submitted
      .getAll('availability')
      .filter((value): value is string => typeof value === 'string'),
    smsConsent: text('smsConsent') !== null,
    contactSharing: text('contactSharing'),
    // A link a pastor sent, which is what this is. There is no third route to
    // consent and reopening a form does not invent one.
    source: 'pastor_link',
  }

  try {
    await getCommandService().execute({
      type: 'intake.submit',
      ministryId: page.ministryId,
      form,
      token: intakeLinkToken(token),
    })
  } catch (error) {
    if (error instanceof IntakeRefused) {
      // Codes back to the form, which owns the wording. Nothing the Person typed
      // travels in the query string -- their name and number are not going in a URL.
      const params = new URLSearchParams({ refused: error.refusals.join(' ') })
      return NextResponse.redirect(
        new URL(`/intake/reopen/${token}?${params}`, request.url),
        { status: 303 },
      )
    }
    throw error
  }

  // Its own confirmation, and not the one a first submission lands on. That page
  // promises a text, and the Welcome Message is first contact -- which for almost
  // everybody arriving here it is not. An Admin may send this link to somebody who
  // never submitted at all, and they *do* get greeted; this page simply does not
  // promise either way, which is the only honest thing one page can say about both.
  return NextResponse.redirect(
    new URL(`/intake/reopen/${token}/done`, request.url),
    { status: 303 },
  )
}
