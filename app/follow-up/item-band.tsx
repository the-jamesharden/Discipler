import Link from 'next/link'
import type { FollowUpCareItem, CardSubject } from '~/service/ports'
import { Contact } from '../pair-card/pair-card'
import { displayPhone } from '../roster/copy'
import { pairPopupHref } from '../roster/lists'
import {
  CANCEL,
  CHOOSE_A_GROUP,
  CONTACT_INFO,
  COPY_IT_BY_HAND,
  COPY_LINK_TO_REINVITE,
  itemBandLabel,
  itemLine,
  LINK_COPIED,
  PAIR_BY_HAND,
  PLACE_IN_THIS_GROUP,
  READS_AS_A_CONCERN,
  RESOLVE,
  RESUME,
} from './copy'
import { ReinviteButton } from './reinvite-button'

/**
 * One open Follow-Up Item as a band on its card (Pastor feedback, ticket 10):
 * what it is, everything its sentence says, and the actions the list offered it
 * before, moved here and nothing new. The item's own action comes first, and
 * **Resolve** beside it, because it is the only thing that closes an item.
 * Every form carries `back`, so its route returns to this card.
 *
 * - *Resume relationship* on an expired Pause, while it is still paused.
 * - *Copy link to re-invite leader* on an invitation that ran out.
 * - *Cancel relationship* on one nobody accepted, unless it is a group already
 *   running, where cancelling is refused: it would end the group over one Leader
 *   who has not answered.
 * - The groups open to them, with *Place in this group*, on *Wants a group*.
 * - *Pair by hand* on a pairing an import could not make.
 * - *Contact info* on a declined invitation, which opens their Roster page.
 *
 * Somebody the item is about who is not one of the card's people (asking to
 * join, invited to lead) has their contact details in the band, through the
 * consent check, as *See contact details* gave them; never on the two items
 * that read red, which showed no number before either.
 */
export const ItemBand = ({
  item,
  back,
  paused,
  subject,
}: {
  readonly item: FollowUpCareItem
  /** The card's own address. */
  readonly back: string
  /** Whether the relationship is paused now, which is when Resume can do anything. */
  readonly paused: boolean
  /** Who it is about, where the card does not already show them. */
  readonly subject: CardSubject | null
}) => {
  const kind = item.payload.kind
  const red = READS_AS_A_CONCERN.has(kind)
  const relationship = item.relationshipId
  const placement = item.placement

  const places = placement !== null && item.personId !== null && placement.groups.length > 0
  const reinvites = kind === 'invitation_expired' && relationship !== null && item.personId !== null
  const resumes = kind === 'pause_expired' && relationship !== null && paused
  const cancels = kind === 'relationship_unaccepted' && relationship !== null && !item.awaiting?.running
  const pairs = kind === 'intended_pairing_refused' && item.personId !== null
  // Its own action is the one drawn solid; Resolve beside it is quiet. Where
  // Resolve is all there is, it is the one action.
  const resolveClass = places || reinvites || resumes || cancels || pairs ? 'small sec' : 'small'

  return (
    <div className={red ? 'pc-band concern' : 'pc-band review'}>
      <p className="pc-band-label">{itemBandLabel(kind, subject?.fullName ?? null)}</p>
      <p>{itemLine(item)}</p>
      {subject && !red ? <Contact person={subject} call={displayPhone} /> : null}
      <div className="btn-row">
        {places && placement && item.personId ? (
          <form method="post" action="/follow-up/place" className="fu-place">
            <input type="hidden" name="personId" value={item.personId} />
            <input type="hidden" name="back" value={back} />
            <select name="groupId" aria-label="Group" required defaultValue="">
              <option value="" disabled>
                {CHOOSE_A_GROUP}
              </option>
              {placement.groups.map((group) => (
                <option key={group.relationshipId} value={group.relationshipId}>
                  {group.name}
                </option>
              ))}
            </select>
            <button type="submit" className="small">
              {PLACE_IN_THIS_GROUP}
            </button>
          </form>
        ) : null}
        {reinvites && relationship && item.personId ? (
          <ReinviteButton
            relationshipId={relationship}
            personId={item.personId}
            back={back}
            label={COPY_LINK_TO_REINVITE}
            copied={LINK_COPIED}
            copyByHand={COPY_IT_BY_HAND}
          />
        ) : null}
        {resumes && relationship ? (
          <form method="post" action="/follow-up/relationship/resume">
            <input type="hidden" name="relationshipId" value={relationship} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="small">
              {RESUME}
            </button>
          </form>
        ) : null}
        {cancels && relationship ? (
          <form method="post" action="/follow-up/relationship/cancel">
            <input type="hidden" name="relationshipId" value={relationship} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="small">
              {CANCEL}
            </button>
          </form>
        ) : null}
        {pairs && item.personId ? (
          // The Pair popup for them on *Is discipled*, as the old Pair page's link
          // had them (Manual pairing, recut ticket 05), whatever the preset would
          // say of them (Roles per pairing, ticket 01).
          <Link className="btn small" href={pairPopupHref(item.personId, 'disciple')}>
            {PAIR_BY_HAND}
          </Link>
        ) : null}
        {kind === 'match_declined' && item.personId ? (
          <Link className="btn small sec" href={`/roster/${item.personId}`}>
            {CONTACT_INFO}
          </Link>
        ) : null}
        <form method="post" action="/follow-up/resolve">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className={resolveClass}>
            {RESOLVE}
          </button>
        </form>
      </div>
    </div>
  )
}
