import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'

/**
 * What a Person sees the moment they submit. The Welcome Message is already on its
 * way to them; this page says the same thing to the screen they are still looking
 * at, because a text arriving in a few seconds is not an acknowledgement.
 */
export default async function IntakeDonePage({
  params,
}: {
  params: Promise<{ ministry: string }>
}) {
  const { ministry } = await params
  const page = await getIntakeReader().readIntakePage(ministry)
  if (!page) notFound()

  return (
    <main>
      <h1>You’re all set</h1>
      <div className="panel">
        <p>
          Thanks — {page.ministryName} has what they need. We’ve sent you a text to confirm,
          and you’ll hear from us again once you’ve been matched with someone to meet with.
        </p>
        <p className="subtle">You can close this page.</p>
      </div>
    </main>
  )
}
