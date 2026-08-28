import { NextResponse, type NextRequest } from 'next/server'
import { IntakeRefused } from '~/domain/errors'
import type { IntakeFormFields } from '~/domain/intake'
import { getCommandService, getIntakeReader } from '~/service/container'

/** What the form's hidden field means. There is no third route to Intake. */
const ROUTES: Record<string, string> = { link: 'pastor_link', qr: 'qr_code' }

/**
 * An ordinary form POST from somebody with no account. The Ministry comes from the
 * link rather than from a session, because there is no session -- possession of the
 * link is how a Person reaches their own Ministry's form and nothing more. It grants
 * no read of anybody's data: this route only writes what the Person typed about
 * themselves.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ ministry: string }> }) {
  const { ministry } = await context.params

  // Checked against a real Ministry rather than trusted out of the URL, so a
  // fabricated link cannot enqueue a command against an identifier of its own.
  const page = await getIntakeReader().readIntakePage(ministry)
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
    // Exactly the two routes, and nothing else mapped onto them. The page decides
    // which one the visitor arrived by -- a bare link is the pastor-sent one, which
    // is the documented primary path -- and says so in the form. Anything else
    // arriving here is passed through unchanged so the domain refuses it, because
    // `consent_record.source` is not defaulted and a write that cannot say how a
    // Person came to agree must fail rather than guess.
    source: ROUTES[text('via') ?? ''] ?? text('via'),
  }

  try {
    await getCommandService().execute({
      type: 'intake.submit',
      ministryId: page.ministryId,
      form,
    })
  } catch (error) {
    if (error instanceof IntakeRefused) {
      // Codes back to the form, which owns the wording. Nothing the Person typed
      // travels in the query string -- their name and number are not going in a URL.
      const params = new URLSearchParams({ refused: error.refusals.join(' ') })
      if (form.source === 'qr_code') params.set('via', 'qr')
      return NextResponse.redirect(
        new URL(`/intake/${page.ministryId}?${params}`, request.url),
        { status: 303 },
      )
    }
    throw error
  }

  return NextResponse.redirect(
    new URL(`/intake/${page.ministryId}/done`, request.url),
    { status: 303 },
  )
}
