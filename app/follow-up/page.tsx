import Link from 'next/link'
import { redirect } from 'next/navigation'
import { personIdFrom } from '~/domain/ids'
import { RELATIONSHIP_OUTCOMES } from '~/domain/relationships'
import { getCareNeededReader } from '~/service/container'
import type { CareMember, CareNeededItem } from '~/service/ports'
import { LIST_OF_SIDE, pairPopupHref } from '../roster/lists'
import { AdminShell, NotAnAdmin } from '../shell'
import { ReinviteButton } from './reinvite-button'
import {
  CANCEL,
  CARE_NEEDED_HEADING,
  CHOOSE_A_GROUP,
  careOutcomeMessage,
  careRefusalMessage,
  concernLine,
  concernTag,
  CONTACT_INFO,
  COPY_IT_BY_HAND,
  COPY_LINK_TO_REINVITE,
  declinedTitle,
  END,
  ENDING_EXPLANATION,
  followUpLine,
  followUpTag,
  itemCount,
  LINK_COPIED,
  NEEDS_CARE_LINE,
  needsCareTag,
  NOTHING_NEEDS_ATTENTION,
  numberNotShared,
  outcomeLabel,
  readConcerns,
  READS_AS_A_CONCERN,
  REASON_PLACEHOLDER,
  RESOLVE,
  RESUME,
  SEE_CONTACT_DETAILS,
  stalledLine,
  stalledTag,
  whoIsInIt,
  PAIR_BY_HAND,
  PLACE_IN_THIS_GROUP,
  placementLine,
} from './copy'

export const dynamic = 'force-dynamic'

/**
 * Care Needed: the Follow-Up tab. Everything `listCareNeeded` returns, one card
 * per item, from all three sources -- open Follow-Up Items, relationships whose
 * derived state is Stalled, and unresolved Concerns as a count with no text.
 *
 * Every action is a form POST to a route handler beside this page, which runs one
 * command and redirects back here. *See contact details* is the whole of Nudge:
 * it reveals the Person's number through the consent check and sends nothing
 * (ADR-0010). Concern text is never on this page; reading it is an audited act
 * with a page of its own.
 */

/** The reveal a route just answered, so this page shows it on the item it belongs to. */
interface Revealed {
  readonly personId: string
  readonly fullName: string
  readonly phone: string | null
}

const ContactReveal = ({
  members,
  revealed,
  relationshipId,
}: {
  readonly members: readonly CareMember[]
  readonly revealed: Revealed | null
  readonly relationshipId: string
}) => (
  <>
    {members
      .filter((member) => member.role === 'participant')
      .map((member) => (
        <form key={member.personId} method="post" action="/follow-up/contact">
          <input type="hidden" name="personId" value={member.personId} />
          <input type="hidden" name="relationshipId" value={relationshipId} />
          <button type="submit" className="fu-btn">
            {members.filter((each) => each.role === 'participant').length > 1
              ? `${SEE_CONTACT_DETAILS}: ${member.fullName}`
              : SEE_CONTACT_DETAILS}
          </button>
        </form>
      ))}
    {revealed && members.some((member) => member.personId === revealed.personId) ? (
      <p className="fu-reveal" role="status">
        {/* One sentence for every way a number can be absent, because an Admin who
            could tell them apart would be reading a consent decision by inference. */}
        {revealed.phone
          ? `${revealed.fullName}: ${revealed.phone}`
          : numberNotShared(revealed.fullName)}
      </p>
    ) : null}
  </>
)

const EndForm = ({ relationshipId }: { readonly relationshipId: string }) => (
  <details>
    <summary className="fu-btn danger">{END}</summary>
    <form method="post" action="/follow-up/relationship/end" className="notice" style={{ marginTop: '0.5rem' }}>
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <p>{ENDING_EXPLANATION}</p>
      <div className="field">
        <label className="label" htmlFor={`outcome:${relationshipId}`}>
          Outcome
        </label>
        <select id={`outcome:${relationshipId}`} name="outcome" required defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {RELATIONSHIP_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcomeLabel[outcome]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor={`reason:${relationshipId}`}>
          Reason
        </label>
        <textarea id={`reason:${relationshipId}`} name="reason" required placeholder={REASON_PLACEHOLDER} />
      </div>
      <button type="submit">{END}</button>
    </form>
  </details>
)

/**
 * *Wants a group*, as S-8 draws it (Group form exits, ticket 01): the groups open
 * to them in a dropdown with **Place in this group**, and **Resolve**. Nothing
 * else: there is no relationship to end, and their number is on their Roster
 * page behind the same consent rule as everywhere else.
 */
const PlacementItem = ({ item }: { readonly item: Extract<CareNeededItem, { source: 'follow_up' }> }) => {
  const placement = item.placement
  return (
    <li className="fu review" id={`item-${item.id}`}>
      <div className="fu-tags">
        <span className="fu-tag review">{followUpTag[item.payload.kind]}</span>
        {item.personName ? <span className="fu-who">{item.personName}</span> : null}
      </div>
      <p className="fu-line">
        {placement
          ? placementLine(item.raisedAt, placement)
          : followUpLine(item.payload, item.personName, item.waitedDays)}
      </p>
      <div className="fu-actions">
        {placement && item.personId && placement.groups.length > 0 ? (
          <form method="post" action="/follow-up/place" className="mat-assign fu-place">
            <input type="hidden" name="personId" value={item.personId} />
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
            <button type="submit" className="fu-btn">
              {PLACE_IN_THIS_GROUP}
            </button>
          </form>
        ) : null}
        <form method="post" action="/follow-up/resolve">
          <input type="hidden" name="itemId" value={item.id} />
          <button type="submit" className="fu-btn danger">
            {RESOLVE}
          </button>
        </form>
      </div>
    </li>
  )
}

const Item = ({ item, revealed }: { readonly item: CareNeededItem; readonly revealed: Revealed | null }) => {
  if (item.source === 'follow_up' && item.payload.kind === 'group_placement_wanted') {
    return <PlacementItem item={item} />
  }

  if (item.source === 'follow_up') {
    const relationship = item.relationshipId
    const kind = item.payload.kind
    // A Leader whose invitation was withdrawn, by declining or at two weeks. Red,
    // with the left edge and the tag a Concern has (James, 2026-09-21): until
    // then red on this tab meant a Concern and nothing else, and everything else
    // a Follow-Up Item can say is still the grey of something to review.
    const red = READS_AS_A_CONCERN.has(kind)
    return (
      <li
        className={red ? 'fu care-concern' : 'fu review'}
        id={relationship && !red ? `relationship-${relationship}` : `item-${item.id}`}
      >
        <div className="fu-tags">
          <span className={red ? 'fu-tag concern' : 'fu-tag review'}>{followUpTag[kind]}</span>
          {kind === 'match_declined' ? (
            <span className="fu-who">{declinedTitle(item.personName, item.invited?.leadsAGroup ?? true)}</span>
          ) : item.personName && kind !== 'invitation_expired' ? (
            <span className="fu-who">{item.personName}</span>
          ) : null}
        </div>
        <p className="fu-line">
          {followUpLine(item.payload, item.personName, item.waitedDays, item.awaiting, item.invited)}
        </p>
        <div className="fu-actions">
          {/*
            No number is shown here for either red item. **Contact info** opens
            their page from the Roster, which shows it behind the same consent
            rule as everywhere else.
          */}
          {item.personId && kind !== 'relationship_unaccepted' && !red ? (
            <ContactReveal
              members={[{ personId: item.personId, fullName: item.personName ?? 'Them', role: 'participant' }]}
              revealed={revealed}
              relationshipId={relationship ?? ''}
            />
          ) : null}
          <form method="post" action="/follow-up/resolve">
            <input type="hidden" name="itemId" value={item.id} />
            <button type="submit" className="fu-btn">
              {RESOLVE}
            </button>
          </form>
          {kind === 'match_declined' && item.personId ? (
            <Link className="fu-btn" href={`/roster/${item.personId}`}>
              {CONTACT_INFO}
            </Link>
          ) : null}
          {kind === 'invitation_expired' && relationship && item.personId ? (
            <ReinviteButton
              relationshipId={relationship}
              personId={item.personId}
              label={COPY_LINK_TO_REINVITE}
              copied={LINK_COPIED}
              copyByHand={COPY_IT_BY_HAND}
            />
          ) : null}
          {relationship && kind === 'pause_expired' ? (
            <form method="post" action="/follow-up/relationship/resume">
              <input type="hidden" name="relationshipId" value={relationship} />
              <button type="submit" className="fu-btn">
                {RESUME}
              </button>
            </form>
          ) : null}
          {kind === 'intended_pairing_refused' && item.personId ? (
            // The Pair popup for them on the Disciple's side, as the old Pair page's
            // link had them (Manual pairing, recut ticket 05).
            <Link className="fu-btn" href={pairPopupHref(LIST_OF_SIDE.disciple, item.personId)}>
              {PAIR_BY_HAND}
            </Link>
          ) : null}
          {/*
            Not on a group already running, where cancelling is refused: it would
            end the group over one Leader who has not answered.
          */}
          {relationship && kind === 'relationship_unaccepted' && !item.awaiting?.running ? (
            <form method="post" action="/follow-up/relationship/cancel">
              <input type="hidden" name="relationshipId" value={relationship} />
              <button type="submit" className="fu-btn danger">
                {CANCEL}
              </button>
            </form>
          ) : null}
          {relationship && kind !== 'relationship_unaccepted' && kind !== 'group_join_requested' && !red ? (
            <EndForm relationshipId={relationship} />
          ) : null}
        </div>
      </li>
    )
  }

  if (item.source === 'relationship') {
    // Stalled reads amber and Needs Care reads red, which is the prototype's own
    // colour discipline. Red was only ever a Concern until 2026-09-21, when James
    // asked that a Leader's declined or expired invitation read red as well; those
    // two are Follow-Up Items, drawn above.
    const stalled = item.state === 'stalled'
    return (
      <li className={stalled ? 'fu care-stalled' : 'fu care-concern'} id={`relationship-${item.relationshipId}`}>
        <div className="fu-tags">
          <span className={stalled ? 'fu-tag stalled' : 'fu-tag concern'}>
            {stalled ? stalledTag : needsCareTag}
          </span>
          <span className="fu-who">{whoIsInIt(item.leaderNames, item.participantNames)}</span>
        </div>
        {stalled ? (
          item.reasons.map((reason) => (
            <p key={reason.kind} className="fu-line">
              {stalledLine(reason)}
            </p>
          ))
        ) : (
          <p className="fu-line">{NEEDS_CARE_LINE}</p>
        )}
        {stalled && item.openConcerns > 0 ? <p className="fu-line">{concernLine(item.openConcerns)}</p> : null}
        <div className="fu-actions">
          <ContactReveal members={item.members} revealed={revealed} relationshipId={item.relationshipId} />
          <EndForm relationshipId={item.relationshipId} />
        </div>
      </li>
    )
  }

  return (
    <li className="fu care-concern" id={`relationship-${item.relationshipId}`}>
      <div className="fu-tags">
        <span className="fu-tag concern">{concernTag(item.concerns.length)}</span>
        <span className="fu-who">
          {whoIsInIt(
            item.members.filter((member) => member.role === 'leader').map((member) => member.fullName),
            item.participantNames,
          )}
        </span>
      </div>
      <p className="fu-line">{concernLine(item.concerns.length)}</p>
      <div className="fu-actions">
        {/* A POST, because reading a Concern is an audited act: the viewing is
            recorded in the same transaction that returns the words, and the words
            render on a page of their own. */}
        <form method="post" action="/follow-up/concern/view">
          <input type="hidden" name="relationshipId" value={item.relationshipId} />
          {item.concerns.map((concern) => (
            <input key={concern.id} type="hidden" name="concernId" value={concern.id} />
          ))}
          <button type="submit" className="fu-btn">
            {readConcerns(item.concerns.length)}
          </button>
        </form>
        <ContactReveal members={item.members} revealed={revealed} relationshipId={item.relationshipId} />
        <EndForm relationshipId={item.relationshipId} />
      </div>
    </li>
  )
}

export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; reveal?: string }>
}) {
  const query = await searchParams

  // One read, with the one number a reveal answers inside it: the query string
  // holds the Person the route named, never the number, and the number is read
  // through the consent check at the moment of display. Whatever arrives in the
  // query string is whatever somebody typed there, so the reveal is honoured only
  // for a Person the list itself names.
  const asked = personIdFrom(query.reveal)
  const page = await getCareNeededReader().readFollowUpPage(asked)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={CARE_NEEDED_HEADING} />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { items, revealed: contact } = page.page

  const member = asked
    ? items
        .flatMap((item): readonly CareMember[] =>
          item.source === 'follow_up'
            ? item.personId
              ? [{ personId: item.personId, fullName: item.personName ?? 'Them', role: 'participant' }]
              : []
            : item.members,
        )
        .find((each) => each.personId === asked)
    : undefined
  const revealed: Revealed | null = member
    ? { personId: member.personId, fullName: member.fullName, phone: contact?.phone ?? null }
    : null

  const outcome = careOutcomeMessage(query.done)
  const refusal = careRefusalMessage(query.error)

  return (
    <AdminShell admin={admin} current="follow-up" followUpCount={items.length}>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{CARE_NEEDED_HEADING}</h2>
          <span className="muted">{itemCount(items.length)}</span>
        </div>

        {refusal ? (
          <p className="toast error" role="alert">
            {refusal}
          </p>
        ) : null}
        {outcome ? (
          <p className="toast" role="status">
            {outcome}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className="empty">{NOTHING_NEEDS_ATTENTION}</p>
        ) : (
          <ul className="fu-list">
            {items.map((item, index) => (
              <Item key={`${item.source}:${index}`} item={item} revealed={revealed} />
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  )
}
