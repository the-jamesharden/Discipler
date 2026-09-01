import { NextResponse, type NextRequest } from 'next/server'
import { IntakeRefused } from '~/domain/errors'
import type { IntakeFormFields } from '~/domain/intake'
import { getCommandService, getIntakeReader } from '~/service/container'
import { answersAsQuery, LAST_STEP, readVia, readWizardAnswers } from '../../../wizard-answers'
import { consentSourceOf, submittedIntakeForm, textField } from '../../../submitted-form'

/**
 * The wizard's last step, and the only write it makes. Every earlier screen has
 * been carrying its answers forward, so what arrives here is one whole form -- and
 * a wizard somebody closed at step three has left nothing behind at all.
 *
 * The path is declared here rather than read out of the body, the same way the
 * reopen route declares its own source. Which form a Person was answering is a fact
 * about the route that was posted to; read as a hidden input it would be a claim
 * anybody could type into a request, and `consent_record` is the one table whose
 * whole job is to be read back in an audit.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ministry: string }> },
) {
  const { ministry } = await context.params

  // Checked against a real Ministry rather than trusted out of the URL, for the
  // reason the single-page route checks it: a fabricated link must not reach the
  // boundary as a command against an identifier of its own.
  const page = await getIntakeReader().readIntakePage(ministry)
  if (!page) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  const submitted = await request.formData()
  const via = textField(submitted, 'via')

  const form: IntakeFormFields = submittedIntakeForm(submitted, {
    source: consentSourceOf(via),
    intakePath: 'discipleship',
  })

  try {
    await getCommandService().execute({
      type: 'intake.submit',
      ministryId: page.ministryId,
      form,
    })
  } catch (error) {
    if (error instanceof IntakeRefused) {
      // Back to the last step, with the answers the earlier screens carried and
      // nothing that was typed on this one. Those answers were in the URL already
      // -- that is how the wizard moves between screens -- and a name and a number
      // are not joining them.
      //
      // Read off the form this route already built rather than out of the request a
      // second time: one place decides what each field on the wire is called, and a
      // second reader of the same body is a second place for that to be got wrong.
      const answers = readWizardAnswers({
        side: form.declaredSide ?? undefined,
        ageBand: form.ageBand ?? undefined,
        gender: form.gender ?? undefined,
        experience: form.experience ?? undefined,
        availability: [...form.availability],
      })
      const params = answersAsQuery(answers, readVia(via), LAST_STEP)
      params.set('refused', error.refusals.join(' '))

      return NextResponse.redirect(
        new URL(`/intake/${page.ministryId}/discipleship?${params}`, request.url),
        { status: 303 },
      )
    }
    throw error
  }

  const done = new URLSearchParams()
  // The side, so the last page can say what it is they are waiting for. It is one
  // of two words and neither is anybody's name.
  if (form.declaredSide === 'mentor' || form.declaredSide === 'mentee') {
    done.set('side', form.declaredSide)
  }

  return NextResponse.redirect(
    new URL(`/intake/${page.ministryId}/discipleship/done?${done}`, request.url),
    { status: 303 },
  )
}
