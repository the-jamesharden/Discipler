import { redirect } from 'next/navigation'
import { personId as asPersonId } from '~/domain/ids'
import { RELATIONSHIP_OUTCOMES } from '~/domain/relationships'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getCareNeededReader } from '~/service/container'
import type { CareMember, CareNeededItem } from '~/service/ports'
import { AdminShell, NotAnAdmin } from '../shell'
import {
  CANCEL,
  CARE_NEEDED_HEADING,
  CARE_NEEDED_LEAD,
  careOutcomeMessage,
  careRefusalMessage,
  concernLine,
  concernTag,
  END,
  ENDING_EXPLANATION,
  followUpLine,
  followUpTag,
  itemCount,
  NEEDS_CARE_LINE,
  needsCareTag,
  NOTHING_NEEDS_ATTENTION,
  numberNotShared,
  outcomeLabel,
  readConcerns,
  REASON_PLACEHOLDER,
  RESOLVE,
  RESUME,
  SEE_CONTACT_DETAILS,
  stalledLine,
  stalledTag,
  whoIsInIt,
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

const Item = ({ item, revealed }: { readonly item: CareNeededItem; readonly revealed: Revealed | null }) => {
  if (item.source === 'follow_up') {
    const relationship = item.relationshipId
    const kind = item.payload.kind
    return (
      <li className="fu review" id={relationship ? `relationship-${relationship}` : `item-${item.id}`}>
        <div className="fu-tags">
          <span className="fu-tag review">{followUpTag[kind]}</span>
          {item.personName ? <span className="fu-who">{item.personName}</span> : null}
        </div>
        <p className="fu-line">{followUpLine(item.payload, item.personName, item.waitedDays)}</p>
        <div className="fu-actions">
          {item.personId && kind !== 'relationship_unaccepted' ? (
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
          {relationship && kind === 'pause_expired' ? (
            <form method="post" action="/follow-up/relationship/resume">
              <input type="hidden" name="relationshipId" value={relationship} />
              <button type="submit" className="fu-btn">
                {RESUME}
              </button>
            </form>
          ) : null}
          {relationship && kind === 'relationship_unaccepted' ? (
            <form method="post" action="/follow-up/relationship/cancel">
              <input type="hidden" name="relationshipId" value={relationship} />
              <button type="submit" className="fu-btn danger">
                {CANCEL}
              </button>
            </form>
          ) : null}
          {relationship && kind !== 'relationship_unaccepted' && kind !== 'group_join_requested' ? (
            <EndForm relationshipId={relationship} />
          ) : null}
        </div>
      </li>
    )
  }

  if (item.source === 'relationship') {
    // Stalled reads amber and Needs Care reads red, which is the prototype's own
    // colour discipline: red is only ever a Concern.
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
  const resolution = await resolveAdmin()
  if (resolution.status === 'not-an-admin') return <NotAnAdmin title={CARE_NEEDED_HEADING} />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin
  const query = await searchParams
  const items = await getCareNeededReader().listCareNeeded(admin.ministryId)

  // The one number a reveal answers, read here for the Person the route named
  // and never carried in the URL: the query string holds the Person, and the
  // number is read through the consent check at the moment of display.
  const asked = query.reveal
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
    ? {
        personId: member.personId,
        fullName: member.fullName,
        phone:
          (await getCareNeededReader().contactToShare(admin.ministryId, asPersonId(member.personId)))
            ?.phone ?? null,
      }
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
        <p className="card-lead">{CARE_NEEDED_LEAD}</p>

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
