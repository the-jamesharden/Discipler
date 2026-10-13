import Link from 'next/link'
import { redirect } from 'next/navigation'
import { looksLikeAnId } from '~/domain/ids'
import { getCareNeededReader } from '~/service/container'
import type { FollowUpCard } from '~/service/ports'
import { readTheConcerns, type ConcernWords } from '../pair-card/open'
import { PairCard } from '../pair-card/pair-card'
import { AdminShell, NotAnAdmin } from '../shell'
import {
  CARE_NEEDED_HEADING,
  careOutcomeMessage,
  careRefusalMessage,
  itemCount,
  NOTHING_NEEDS_ATTENTION,
} from './copy'
import { anchorOf, cardOf, frontOf } from './front'
import { EndedCard } from './ended-card'
import { ItemBand } from './item-band'
import { ItemCard } from './item-card'
import { WhatHasHappened } from './what-has-happened'

export const dynamic = 'force-dynamic'

/**
 * Care Needed: the Follow-Up tab. Everything `listCareNeeded` returns, from all
 * three sources -- open Follow-Up Items, relationships whose derived state is
 * Stalled, and unresolved Concerns -- one button per item (Pastor feedback,
 * ticket 10): its tag, the names, one line of reason, how long it has held and
 * an arrow, and nothing else to press. A Concern's words are never on the list.
 *
 * Pressing an item opens its card over the page: this same page at `?card=`, so
 * the address says which card is open, it works without script, and closing it
 * is a link back to the item. Everything about a live relationship opens that
 * relationship's pair card, or group card, in its fuller Follow-Up form: every
 * open item on it a band with the actions the list used to carry, and *What
 * has happened* under the facts. An item about a Person alone opens a card of
 * its own.
 *
 * Opening the card is the reveal *See contact details* was, through the same
 * consent check, recording nothing because Nudge recorded nothing (ADR-0010);
 * and it reads the Concern's words, recording the reading as *Read the concern*
 * did. Every action is an ordinary form to the route beside this page, which
 * runs one command and returns to the card.
 */
export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; done?: string; error?: string }>
}) {
  const query = await searchParams
  // Whatever arrives in the address is whatever somebody typed there: a uuid or
  // nothing, and the card is read only for what this Admin's Ministry holds.
  const asked = query.card !== undefined && looksLikeAnId(query.card) ? query.card.toLowerCase() : null

  const page = await getCareNeededReader().readFollowUpPage(asked)
  if (page.status === 'not-an-admin') return <NotAnAdmin title={CARE_NEEDED_HEADING} />
  if (page.status === 'signed-out') redirect('/login')

  const { admin } = page
  const { items, liveRelationships, card } = page.page

  // Opening the card reads its Concerns, and records the reading as *Read the
  // concern* did. After the read and never instead of it.
  const words = card?.pair
    ? await readTheConcerns(card.pair.concerns, admin)
    : card?.ended
      ? await readTheConcerns(card.ended.item.concerns, admin)
      : []
  const now = new Date()

  const outcome = careOutcomeMessage(query.done)
  const refusal = careRefusalMessage(query.error)
  const notice = refusal
    ? { tone: 'refused' as const, said: refusal }
    : outcome
      ? { tone: 'done' as const, said: outcome }
      : null

  // The first item that opens each card carries the anchor the card closes back to.
  const anchored = new Set<string>()

  return (
    <AdminShell admin={admin} current="follow-up" followUpCount={items.length}>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{CARE_NEEDED_HEADING}</h2>
          <span className="muted">{itemCount(items.length)}</span>
        </div>

        {/* What a card's action did, said here once the card it came from has
            gone: the item resolved, or the relationship cancelled or ended. */}
        {notice && !card ? (
          <p className={notice.tone === 'refused' ? 'toast error' : 'toast'} role={notice.tone === 'refused' ? 'alert' : 'status'}>
            {notice.said}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className="empty">{NOTHING_NEEDS_ATTENTION}</p>
        ) : (
          <ul className="fu-list">
            {items.map((item, index) => {
              const front = frontOf(item, items, liveRelationships, now)
              const own = item.source === 'follow_up' && cardOf(item, liveRelationships) === item.id
              const anchor = anchorOf(front.card, own)
              const first = !anchored.has(anchor)
              anchored.add(anchor)
              return (
                <li key={`${item.source}:${index}`}>
                  {/* No prefetch: opening a card reads its Concern and records the
                      reading, which only an Admin's press may do. */}
                  <Link
                    id={first ? anchor : undefined}
                    className={`fu fu-open ${front.tone}`}
                    href={`/follow-up?card=${front.card}`}
                    scroll={false}
                    prefetch={false}
                  >
                    <span className="fu-body">
                      <span className="fu-tags">
                        <span className={`fu-tag ${front.tagTone}`}>{front.tag}</span>
                      </span>
                      <span className="fu-who">{front.who}</span>
                      <span className="fu-line">{front.line}</span>
                    </span>
                    {front.held ? <span className="fu-age">{front.held}</span> : null}
                    <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {card ? <TheCard card={card} words={words} now={now} notice={notice} /> : null}
    </AdminShell>
  )
}

/** The card the address names: the pair card in its fuller form, an ended pair's Concerns, or an item's own. */
const TheCard = ({
  card,
  words,
  now,
  notice,
}: {
  readonly card: FollowUpCard
  readonly words: readonly ConcernWords[]
  readonly now: Date
  readonly notice: { readonly tone: 'done' | 'refused'; readonly said: string } | null
}) => {
  const back = `/follow-up?card=${card.key}`
  // Back to the item it was opened from: without script the browser scrolls
  // there, and with it the page has not moved.
  const close = `/follow-up#${anchorOf(card.key, card.pair === null && card.ended === null)}`

  if (card.ended) {
    return <EndedCard card={card} ended={card.ended} words={words} now={now} close={close} back={back} notice={notice} />
  }
  if (!card.pair) return <ItemCard card={card} now={now} close={close} back={back} notice={notice} />

  const pair = card.pair
  const onTheCard = new Set<string>(pair.people.map((person) => person.personId))
  return (
    <PairCard
      card={pair}
      words={words}
      now={now}
      close={close}
      back={back}
      notice={notice}
      followUp={{
        bands: card.items.map((item) => (
          <ItemBand
            key={item.id}
            item={item}
            back={back}
            paused={pair.state === 'paused'}
            subject={
              item.personId && !onTheCard.has(item.personId)
                ? (card.subjects.find((subject) => subject.personId === item.personId) ?? null)
                : null
            }
          />
        )),
        history: <WhatHasHappened happened={card.happened} now={now} timeZone={card.timeZone} />,
      }}
    />
  )
}
