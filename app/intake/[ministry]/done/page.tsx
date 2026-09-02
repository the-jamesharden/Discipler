import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import { Centred } from '../../../shell'
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

  const heading = !group ? 'You’re all set' : joined ? JOINED_HEADING : REQUESTED_HEADING
  const message = !group
    ? doneMessageWithoutAGroup(page.ministryName)
    : joined
      ? joinedMessage(group.name, group.leaderFirstNames)
      : requestedMessage(page.ministryName, group.name)

  return (
    <Centred>
      <div className="tick" aria-hidden="true">
        ✓
      </div>
      <h1 style={{ textAlign: 'center' }}>{heading}</h1>
      <p className="muted" style={{ textAlign: 'center' }}>
        {message} We’ve sent you a text to confirm.
      </p>
      <p className="card-note">You can close this page.</p>
    </Centred>
  )
}
