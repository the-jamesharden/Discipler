import { NextResponse, type NextRequest } from 'next/server'
import { IntakeRefused } from '~/domain/errors'
import { readIntakeForm, type IntakeFormFields } from '~/domain/intake'
import { ownQuestionsOf, removedQuestions, requiredOn, stillKept, type QuestionKey } from '~/domain/intake-form'
import { getCommandService, getIntakeReader, settlePlannedPairings } from '~/service/container'
import {
  discipleshipWizardFor,
  readPreview,
  readVersion,
  readVia,
} from '../../../wizard-answers'
import { consentSourceOf, ownAnswersAsQuery, submittedIntakeForm, textField } from '../../../submitted-form'

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
 *
 * The version of the Ministry's form the Person opened arrives with the answers,
 * as it travelled between screens, and the submission is read against that
 * version (Pastor feedback, ticket 11). An Admin's preview is read the same way
 * and goes no further: nothing is written, nobody is texted, and it lands on the
 * same done page a newcomer would.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ministry: string }> },
) {
  const { ministry } = await context.params

  const submitted = await request.formData()
  const via = textField(submitted, 'via')
  const preview = readPreview(textField(submitted, 'preview'))

  // Checked against a real Ministry rather than trusted out of the URL, for the
  // reason the single-page route checks it: a fabricated link must not reach the
  // boundary as a command against an identifier of its own.
  const page = await getIntakeReader().readIntakePage(
    ministry,
    readVersion(textField(submitted, 'v')),
  )
  if (!page) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  const wizard = discipleshipWizardFor(page.form)
  const pin = { version: page.form.version, preview }

  const form: IntakeFormFields = submittedIntakeForm(submitted, {
    source: consentSourceOf(via),
    intakePath: 'discipleship',
  })

  // Back to the last step, with the answers the earlier screens carried and
  // nothing that was typed on this one. Those answers were in the URL already --
  // that is how the wizard moves between screens -- and a name and a number are
  // not joining them.
  //
  // Read off the form this route already built rather than out of the request a
  // second time: one place decides what each field on the wire is called, and a
  // second reader of the same body is a second place for that to be got wrong.
  const backToTheForm = (refusals: readonly string[]) => {
    const answers = wizard.readAnswers({
      ...ownAnswersAsQuery(form),
      side: form.declaredSide ?? undefined,
      ageBand: form.ageBand ?? undefined,
      gender: form.gender ?? undefined,
      experience: form.experience ?? undefined,
      availability: [...form.availability],
    })
    const params = wizard.answersAsQuery(answers, readVia(via), wizard.LAST_STEP, pin)
    params.set('refused', refusals.join(' '))

    return NextResponse.redirect(
      new URL(`/intake/${page.ministryId}/discipleship?${params}`, request.url),
      { status: 303 },
    )
  }

  if (preview) {
    // Read as the real thing is, so an Admin trying the form meets its refusals,
    // and then nothing: no command, no Person, no text.
    const reading = readIntakeForm(
      form,
      requiredOn(page.form),
      ownQuestionsOf(page.form),
      new Set(removedQuestions(page.form)),
    )
    if ('refusals' in reading) return backToTheForm(reading.refusals)
    return NextResponse.redirect(
      new URL(`/intake/${page.ministryId}/discipleship/done?${await doneQuery(form, pin, page.ministryId)}`, request.url),
      { status: 303 },
    )
  }

  try {
    await getCommandService().execute({
      type: 'intake.submit',
      ministryId: page.ministryId,
      form,
      formVersion: page.form.version,
    })
  } catch (error) {
    if (error instanceof IntakeRefused) return backToTheForm(error.refusals)
    throw error
  }

  // A pairing an import planned may have been waiting on exactly this submission.
  // Settled at once rather than on the hour (ADR-0022), after the submission's own
  // transaction and never inside it.
  await settlePlannedPairings(page.ministryId)

  return NextResponse.redirect(
    new URL(`/intake/${page.ministryId}/discipleship/done?${await doneQuery(form, pin, page.ministryId)}`, request.url),
    { status: 303 },
  )
}

/**
 * What the done page is told. The side, so it can say what it is they are waiting
 * for, and the rest of what the confirmation card summarises: each one is a word
 * from a short list the done page checks against, or a count. The name and the
 * number are not among them -- those are not going in a URL -- and the done page
 * says so in words instead. The version, for the form's own thank-you.
 *
 * Only what was kept: an answer to a question the Ministry's form has stopped
 * asking since this version opened was dropped on submit, so the summary does
 * not list it either. Read against the form as it stands now, by the same rule
 * the submission was kept by.
 */
const doneQuery = async (
  form: IntakeFormFields,
  pin: { readonly version: number; readonly preview: boolean },
  ministry: string,
): Promise<URLSearchParams> => {
  const current = await getIntakeReader().readIntakePage(ministry)
  const kept: (key: QuestionKey) => boolean = current ? stillKept(current.form) : () => true

  const done = new URLSearchParams()
  if ((form.declaredSide === 'mentor' || form.declaredSide === 'mentee') && kept('side')) {
    done.set('side', form.declaredSide)
  }
  if (form.ageBand && kept('ageBand')) done.set('ageBand', form.ageBand)
  if (form.gender && kept('gender')) done.set('gender', form.gender)
  if (form.experience && kept('experience')) done.set('experience', form.experience)
  // None where the form no longer asks when somebody is free (ticket 13), which
  // the summary then leaves out rather than saying *no hours*.
  const ticked = new Set(kept('availability') ? form.availability : [])
  if (ticked.size > 0) {
    done.set('hours', String(ticked.size))
    done.set('days', String(new Set([...ticked].map((key) => key.split(':')[0])).size))
  }
  done.set('v', String(pin.version))
  if (pin.preview) done.set('preview', '1')
  return done
}

