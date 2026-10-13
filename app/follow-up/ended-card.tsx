import Link from 'next/link'
import type { EndedConcerns, FollowUpCard } from '~/service/ports'
import type { ConcernWords } from '../pair-card/open'
import { CLOSE, pairTitle } from '../pair-card/copy'
import { ConcernBand, HeadLine, ReadingLine } from '../pair-card/pair-card'
import { endedCardLine, whoIsInIt } from './copy'
import { WhatHasHappened } from './what-has-happened'

/**
 * The card of a relationship that has ended with Concerns still unresolved.
 * Ending a pair resolves none of them, and its badge stays on Follow-Up until an
 * Admin does, so the badge opens this: the same card over the page, with each
 * Concern's words as it opened and **Resolve**, who has read them, and *What has
 * happened*. No people, facts or End relationship, because the pair is over.
 *
 * Opening it reads the words and records the reading, as the pair card does.
 */
export const EndedCard = ({
  card,
  ended,
  words,
  now,
  close,
  back,
  notice,
}: {
  readonly card: FollowUpCard
  readonly ended: EndedConcerns
  readonly words: readonly ConcernWords[]
  readonly now: Date
  readonly close: string
  readonly back: string
  readonly notice: { readonly tone: 'done' | 'refused'; readonly said: string } | null
}) => {
  const { item } = ended
  const leaders = item.members.filter((member) => member.role === 'leader').map((member) => member.fullName)
  // Ending a pair ends its memberships, so who was in it is usually gone from
  // the history; who raised the Concerns is not.
  const raisers = [...new Set(item.concerns.flatMap((concern) => (concern.raisedByName ? [concern.raisedByName] : [])))]
  const title =
    item.members.length === 0 && raisers.length > 0 ? pairTitle(raisers) : whoIsInIt(leaders, item.participantNames)

  return (
    <div className="modal-bg open" data-testid="pair-card">
      {/* Out of the tab order: the X already says Close to a keyboard. */}
      <Link className="modal-backdrop" href={close} scroll={false} aria-hidden="true" tabIndex={-1} />

      <div className="modal paircard" role="dialog" aria-modal="true" aria-labelledby="pc-title">
        <div className="pc-head">
          <div>
            <HeadLine line={endedCardLine(item.concerns.length)} />
            <h2 id="pc-title" className="card-title">
              {title}
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

        {item.concerns.map((concern) => (
          <ConcernBand
            key={concern.id}
            concern={concern}
            words={words}
            label={null}
            back={back}
            now={now}
            timeZone={card.timeZone}
          />
        ))}
        <ReadingLine readerName={ended.readerName} readings={ended.readings} now={now} timeZone={card.timeZone} />

        <WhatHasHappened happened={card.happened} now={now} timeZone={card.timeZone} />
      </div>
    </div>
  )
}
