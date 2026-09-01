import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import {
  doneMessageWithoutAGroup,
  JOINED_HEADING,
  joinedMessage,
  REQUESTED_HEADING,
  requestedMessage,
} from '../../copy'
import { firstValue } from '../../wizard-machine'

/**
 * What a Person sees the moment the group form submits. The Welcome Message is
 * already on its way to them and says nothing about the group -- it is the consent
 * receipt -- so this page is the only place they learn what happened: that they
 * are in the group and who leads it, or that the church will be in touch.
 *
 * The group arrives as an identifier in the query string and is looked up against
 * the groups the link offers, never rendered. A group nothing recognises is said
 * without a name rather than in a guess.
 */
export default async function GroupIntakeDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ ministry: string }>
  searchParams: Promise<{ groupId?: string | string[]; outcome?: string | string[] }>
}) {
  const { ministry } = await params
  const query = await searchParams

  const page = await getIntakeReader().readGroupIntakePage(ministry)
  if (!page) notFound()

  const asked = firstValue(query.groupId)
  const group = page.groups.find((each) => each.relationshipId === asked) ?? null
  const joined = firstValue(query.outcome) === 'joined'

  if (!group) {
    return (
      <main>
        <h1>You’re all set</h1>
        <div className="panel">
          <p>{doneMessageWithoutAGroup(page.ministryName)}</p>
          <p>We’ve sent you a text to confirm.</p>
          <p className="subtle">You can close this page.</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <h1>{joined ? JOINED_HEADING : REQUESTED_HEADING}</h1>
      <div className="panel">
        <p>
          {joined
            ? joinedMessage(group.name, group.leaderFirstNames)
            : requestedMessage(page.ministryName, group.name)}
        </p>
        <p>We’ve sent you a text to confirm.</p>
        <p className="subtle">You can close this page.</p>
      </div>
    </main>
  )
}
