import { notFound } from 'next/navigation'
import { getIntakeReader } from '~/service/container'
import { Centred } from '../../../shell'
import {
  doneMessageWithoutAGroup,
  JOINED_HEADING,
  joinedMessage,
  placementWantedMessage,
  REQUESTED_HEADING,
  requestedMessage,
} from '../../copy'
import { firstValue, readPreview, readVersion } from '../../wizard-machine'
import { PreviewNotice } from '../../wizard-shell'

/**
 * What a Person sees the moment the group form submits. The Welcome Message is
 * already on its way to them and says nothing about the group -- it is the consent
 * receipt -- so this page is the only place they learn what happened: that they
 * are in the group and who leads it, or that the church will be in touch.
 *
 * The group arrives as an identifier in the query string and is looked up against
 * the groups the link offers, never rendered. A group nothing recognises is said
 * without a name rather than in a guess.
 *
 * Under it, the thank-you of the version of the Ministry's groups form they
 * answered, where the Ministry has written one (Pastor feedback, ticket 11).
 */
export default async function GroupIntakeDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ ministry: string }>
  searchParams: Promise<{
    groupId?: string | string[]
    outcome?: string | string[]
    v?: string | string[]
    preview?: string | string[]
  }>
}) {
  const { ministry } = await params
  const query = await searchParams

  const page = await getIntakeReader().readGroupIntakePage(ministry, readVersion(query.v))
  if (!page) notFound()
  const preview = readPreview(query.preview)

  const asked = firstValue(query.groupId)
  const group = page.groups.find((each) => each.relationshipId === asked) ?? null
  const outcome = firstValue(query.outcome)
  const joined = outcome === 'joined'
  // No group in mind (Group form exits, ticket 01): the Ministry has been told,
  // and nothing says a group was joined.
  const placement = !group && outcome === 'placement'

  const heading = placement
    ? REQUESTED_HEADING
    : !group
      ? 'You’re all set'
      : joined
        ? JOINED_HEADING
        : REQUESTED_HEADING
  const message = placement
    ? placementWantedMessage(page.ministryName)
    : !group
      ? doneMessageWithoutAGroup(page.ministryName)
      : joined
        ? joinedMessage(group.name, group.leaderFirstNames)
        : requestedMessage(page.ministryName, group.name)

  return (
    <Centred ministryName={page.ministryName}>
      {preview ? <PreviewNotice /> : null}
      <div className="tick" aria-hidden="true">
        ✓
      </div>
      <h1 style={{ textAlign: 'center' }}>{heading}</h1>
      <p className="muted" style={{ textAlign: 'center' }}>
        {message} We’ve texted you to confirm.
      </p>
      {page.form.thankYou ? (
        <p className="muted" style={{ textAlign: 'center' }}>
          {page.form.thankYou}
        </p>
      ) : null}
      <p className="card-note">You can close this page.</p>
    </Centred>
  )
}
