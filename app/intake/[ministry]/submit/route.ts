import { NextResponse, type NextRequest } from 'next/server'
import { IntakeRefused } from '~/domain/errors'
import type { IntakeFormFields } from '~/domain/intake'
import { consentSourceOf, submittedIntakeForm, textField } from '../../submitted-form'
import { getCommandService, getIntakeReader } from '~/service/container'

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

  const form: IntakeFormFields = submittedIntakeForm(submitted, {
    source: consentSourceOf(textField(submitted, 'via')),
    // This is the form that asks nothing about sides, and it writes a null path
    // saying so. Ticket 29 is what turns it into the group form.
    intakePath: null,
  })

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
