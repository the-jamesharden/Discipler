import { notFound } from 'next/navigation'
import { isDeclaredSide, type DeclaredSide } from '~/domain/intake'
import { getIntakeReader } from '~/service/container'
import { DONE_HEADING, doneMessage } from '../../../copy'

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
  // that arrived in a query string. A side nothing recognises falls back to the
  // mentee wording, which is the commoner case and says nothing untrue: they are on
  // the list and the Ministry will be in touch.
  const asked = Array.isArray(raw) ? raw[0] : raw
  const side: DeclaredSide = isDeclaredSide(asked) ? asked : 'mentee'

  return (
    <main>
      <h1>{DONE_HEADING}</h1>
      <div className="panel">
        <p>{doneMessage[side](page.ministryName)}</p>
        <p>We’ve sent you a text to confirm.</p>
        <p className="subtle">You can close this page.</p>
      </div>
    </main>
  )
}
