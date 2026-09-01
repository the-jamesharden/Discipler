import { notFound } from 'next/navigation'
import { DECLARED_SIDES, isOneOf } from '~/domain/intake'
import { getIntakeReader } from '~/service/container'
import { DONE_HEADING, doneMessage, doneMessageWithoutASide } from '../../../copy'
import { firstValue } from '../../../wizard-answers'

/**
 * What a Person sees the moment the wizard submits. The Welcome Message is already
 * on its way to them; this page says the same thing to the screen they are still
 * looking at, because a text arriving in a few seconds is not an acknowledgement.
 *
 * It says what happens next in the words of the side they declared -- a mentee is
 * waiting for a mentor, a mentor for somebody to mentor -- and it promises no date,
 * because the Ministry pairs people and Discipler does not.
 */
export default async function DiscipleshipIntakeDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ ministry: string }>
  searchParams: Promise<{ side?: string | string[] }>
}) {
  const { ministry } = await params
  const { side: raw } = await searchParams

  const page = await getIntakeReader().readIntakePage(ministry)
  if (!page) notFound()

  // Compared against the two answers rather than rendered, like every other value
  // that arrived in a query string. A side nothing recognises is null rather than a
  // guess, for the reason nothing else on this path guesses one: the consent record
  // is not backfilled with a side and neither is the sentence describing it.
  const asked = firstValue(raw)
  const side = isOneOf(DECLARED_SIDES, asked) ? asked : null

  return (
    <main>
      <h1>{DONE_HEADING}</h1>
      <div className="panel">
        <p>
          {side === null
            ? doneMessageWithoutASide(page.ministryName)
            : doneMessage[side](page.ministryName)}
        </p>
        <p>We’ve sent you a text to confirm.</p>
        <p className="subtle">You can close this page.</p>
      </div>
    </main>
  )
}
