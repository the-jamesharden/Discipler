import { NextResponse, type NextRequest } from 'next/server'
import { IntakeRefused, PairingRefused } from '~/domain/errors'
import { GROUP_PATH, type IntakeFormFields } from '~/domain/intake'
import { getCommandService, getIntakeReader } from '~/service/container'
import { groupWizard } from '../../group-wizard-answers'
import { consentSourceOf, submittedIntakeForm, textField } from '../../submitted-form'
import { readVia } from '../../wizard-machine'

/**
 * The group form's last step, and the only write it makes. An ordinary form POST
 * from somebody with no account: the Ministry comes from the link rather than
 * from a session, because there is no session -- possession of the link is how a
 * Person reaches their own Ministry's form and nothing more.
 *
 * The path is declared here rather than read out of the body, the same way the
 * discipleship route and the reopen route declare theirs. Which form a Person was
 * answering is a fact about the route that was posted to; read as a hidden input
 * it would be a claim anybody could type into a request, and `consent_record` is
 * the one table whose whole job is to be read back in an audit.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ministry: string }> },
) {
  const { ministry } = await context.params

  // Checked against a real Ministry rather than trusted out of the URL, so a
  // fabricated link cannot reach the boundary as a command against an identifier
  // of its own.
  const page = await getIntakeReader().readGroupIntakePage(ministry)
  if (!page) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  const submitted = await request.formData()
  const via = textField(submitted, 'via')

  const form: IntakeFormFields = submittedIntakeForm(submitted, {
    source: consentSourceOf(via),
    intakePath: GROUP_PATH,
  })

  // Back to the last step, with the answers the earlier screens carried and
  // nothing that was typed on this one. Read off the form this route already
  // built rather than out of the request a second time: one place decides what
  // each field on the wire is called.
  const backToTheForm = (refusals: readonly string[]) => {
    const answers = groupWizard.readAnswers(
      {
        ageBand: form.ageBand ?? undefined,
        gender: form.gender ?? undefined,
        groupId: form.groupId ?? undefined,
        availability: [...form.availability],
      },
      { groupId: page.groups.map((group) => group.relationshipId) },
    )
    const params = groupWizard.answersAsQuery(answers, readVia(via), groupWizard.LAST_STEP)
    params.set('refused', refusals.join(' '))
    return NextResponse.redirect(new URL(`/intake/${page.ministryId}?${params}`, request.url), {
      status: 303,
    })
  }

  // What the submission did about the group, read off what the command decided
  // rather than off the group's switch: a Person already in the group they named
  // joined nothing and asked for nothing, and the page must not tell them they
  // are on a list they are not on.
  let asked = false
  try {
    const { effects } = await getCommandService().execute({
      type: 'intake.submit',
      ministryId: page.ministryId,
      form,
    })
    asked = effects.some((effect) => effect.kind === 'followUp.raise')
  } catch (error) {
    if (error instanceof IntakeRefused) return backToTheForm(error.refusals)
    // The membership itself refused, past every check the form made: the caps,
    // the Intake gate or the gender rule at the insert. Reachable only by a race
    // or a body Discipler did not serve, and said the way a closed door is.
    if (error instanceof PairingRefused) return backToTheForm(['intake.group_unavailable'])
    throw error
  }

  // What the last page can say: which group, and whether they are in it or
  // waiting. Read off the page rather than off the body, and carried as the
  // group's identifier, which the done page looks up rather than renders.
  const chosen = page.groups.find((group) => group.relationshipId === form.groupId)
  const done = new URLSearchParams()
  if (chosen) {
    done.set('groupId', chosen.relationshipId)
    // *Joined* covers somebody who was already in it: they are in it, which is
    // what the page says.
    done.set('outcome', asked ? 'requested' : 'joined')
  }

  return NextResponse.redirect(
    new URL(`/intake/${page.ministryId}/done?${done}`, request.url),
    { status: 303 },
  )
}
