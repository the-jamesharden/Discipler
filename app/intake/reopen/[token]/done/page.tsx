import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'

/**
 * What a Person sees after correcting their own details.
 *
 * Its own page rather than the one a first submission lands on, because that page
 * says a text is on its way and no text is: the Welcome Message is first contact
 * and a re-submission is not first contact. Telling somebody to expect a confirmation
 * that never arrives is worse than saying nothing.
 */
export default async function ReopenIntakeDonePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const page = await getIntakeReader().readReopenedIntakePage(token)
  if (!page) notFound()

  return (
    <main>
      <h1>Thanks — that’s updated</h1>
      <div className="panel">
        <p>
          {page.ministryName} has your new details. Nothing else changes: if you are
          already meeting with someone, you still are.
        </p>
        <p className="subtle">You can close this page.</p>
      </div>
    </main>
  )
}
