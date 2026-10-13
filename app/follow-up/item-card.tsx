import Link from 'next/link'
import type { FollowUpCard } from '~/service/ports'
import { CLOSE } from '../pair-card/copy'
import { HeadLine, Person } from '../pair-card/pair-card'
import { followUpTag, itemCardLine, READS_AS_A_CONCERN } from './copy'
import { ItemBand } from './item-band'
import { WhatHasHappened } from './what-has-happened'

/**
 * The card of an item with no pair to open (Pastor feedback, ticket 10): about
 * a Person alone (*Wants a group*, *Texted a keyword*, *Pair not made*), or
 * about a relationship that has since ended. The same card as the pair card,
 * over the page and closing back to it, with what there is: the item as its
 * band, the Person it is about as a person is drawn on the pair card, with no
 * side because they are on no pair here, and *What has happened*. No facts and
 * no End relationship, because there is no pair to have them.
 *
 * Opening it is the reveal: their contact details come through the consent
 * check Nudge reads, and are left out where they have not agreed. Never on an
 * item that reads red, which showed no number before either.
 */
export const ItemCard = ({
  card,
  now,
  close,
  back,
  notice,
}: {
  readonly card: FollowUpCard
  readonly now: Date
  readonly close: string
  readonly back: string
  readonly notice: { readonly tone: 'done' | 'refused'; readonly said: string } | null
}) => {
  const [item] = card.items
  if (!item) return null
  const red = READS_AS_A_CONCERN.has(item.payload.kind)
  const found = card.subjects.find((subject) => subject.personId === item.personId) ?? null
  const subject = found && red ? { ...found, phone: null, email: null } : found

  return (
    <div className="modal-bg open" data-testid="pair-card">
      {/* Out of the tab order: the X already says Close to a keyboard. */}
      <Link className="modal-backdrop" href={close} scroll={false} aria-hidden="true" tabIndex={-1} />

      <div className="modal paircard" role="dialog" aria-modal="true" aria-labelledby="pc-title">
        <div className="pc-head">
          <div>
            <HeadLine line={itemCardLine(item.raisedAt, now, card.timeZone)} />
            <h2 id="pc-title" className="card-title">
              {item.personName ?? followUpTag[item.payload.kind]}
            </h2>
          </div>
          <Link className="modal-close" href={close} scroll={false} aria-label={CLOSE}>
            ✕
          </Link>
        </div>

        {notice ? (
          <p
            className={notice.tone === 'refused' ? 'toast error pc-notice' : 'toast pc-notice'}
            role={notice.tone === 'refused' ? 'alert' : 'status'}
          >
            {notice.said}
          </p>
        ) : null}

        <ItemBand item={item} back={back} paused={false} subject={null} />

        {subject ? (
          <div className="pc-people one-side">
            <div className="pc-side">
              <Person person={subject} />
            </div>
          </div>
        ) : null}

        <WhatHasHappened happened={card.happened} now={now} timeZone={card.timeZone} />
      </div>
    </div>
  )
}
