import Link from 'next/link'
import { Fragment } from 'react'
import { goalAsShown } from '~/domain/discipleship-goals'
import { A_GROUP } from '~/domain/relationships'
import type { PairCard as Card, PairCardPerson } from '~/service/ports'
import { EndForm } from '../follow-up/end-form'
import { followUpLine, RESUME } from '../follow-up/copy'
import { Mail, Message, Phone } from '../icons'
import { initialsOf } from '../initials'
import { cardPill } from '../overview/need'
import { displayPhone } from '../roster/copy'
import {
  AGE,
  callFirst,
  callThem,
  CLOSE,
  checkInLine,
  concernLabel,
  disciplesLabel,
  END_RELATIONSHIP,
  groupLine,
  HOPING_FOR,
  kindLine,
  LAST_CHECK_IN,
  MATERIAL,
  materialLine,
  NO_CHECK_IN_YET,
  pairTitle,
  PAUSE_EXPIRED,
  readingLine,
  RESOLVE_AND_CLEAR,
  ROLE,
  stallLabel,
  stallSentence,
  textThem,
  WORDS_CLEARED,
} from './copy'
import type { ConcernWords } from './open'

/**
 * The pair card (Pastor feedback, ticket 07): one pair over the page that opened
 * it, the Discipler on the left and the Disciple on the right, stacking on a
 * phone. The head says what the pair is and since when, and the state; straight
 * under the names, a band for whatever needs the Admin -- each unresolved
 * Concern with its words and **Resolve**, the stall with the condition that
 * fired and how long it has held, an expired Pause with **Resume** -- then the
 * two people, the facts, and **End relationship** at the foot.
 *
 * It is the opening page's own address (`?card=` on the Overview), so the server
 * sends it open, a refresh keeps it open, it works without script, and every way
 * out is a link back to the page behind it, as the Pair popup and the import
 * dialog are. Every action is an ordinary form to the route the Follow-Up tab
 * already posts to, carrying `back` so the route returns here.
 *
 * A Group opens the same card in its group form (Pastor feedback, ticket 08):
 * the Group's name, the gender it declared and since when, its leader in full as
 * a person is on a pair, and under *Disciples · N* a row per Disciple with their
 * name and phone, which opens without script to the rest of what the card knows
 * of them. Everything else, the band, the facts and the foot, is the pair's.
 *
 * Shared: Check-Ins and Follow-Up open the same card (tickets 09 and 10), with
 * their own address for `back` and `close`.
 */
export const PairCard = ({
  card,
  words,
  now,
  close,
  back,
  notice,
}: {
  readonly card: Card
  /** The Concerns' words, read as the card opened; one per Concern on the card. */
  readonly words: readonly ConcernWords[]
  readonly now: Date
  /** The page behind the card, which the X and the backdrop return to. */
  readonly close: string
  /** This card's own address, which a form's route returns to. */
  readonly back: string
  /** What a route just did, or why it could not, already in words. */
  readonly notice: { readonly tone: 'done' | 'refused'; readonly said: string } | null
}) => {
  const { timeZone } = card
  const names = card.people.map((person) => person.fullName)
  // A Group is called by its name; one with none, which no formation makes
  // today, by its people, as a pair is.
  const title = card.shape === A_GROUP ? (card.name ?? pairTitle(names)) : pairTitle(names)
  const head =
    card.shape === A_GROUP
      ? groupLine(card.declaredGender, card.pairedAt, now, timeZone)
      : kindLine(card.shape, card.pairedAt, now, timeZone)
  // A card red only for its Concern says so rather than *Healthy*, as the grid does.
  const pill = cardPill(card) ?? { state: 'needs_care' as const, label: 'Concern' }
  const leaders = card.people.filter((person) => person.role === 'leader')
  const disciples = card.people.filter((person) => person.role === 'participant')
  const sides = [leaders, disciples]
  const leader = leaders[0]?.fullName ?? 'The Discipler'

  // The reading this opening recorded, and the latest by anybody else: whether
  // somebody has already picked up the phone, not this Admin's own refreshes.
  const thisReading = { by: card.readerName, at: now }
  const other = card.readings.find((reading) => !reading.byThisReader)
  const earlier = other ? { by: other.viewerName, at: other.viewedAt } : null

  return (
    <div className="modal-bg open" data-testid="pair-card">
      {/* Out of the tab order: the X already says Close to a keyboard. */}
      <Link className="modal-backdrop" href={close} scroll={false} aria-hidden="true" tabIndex={-1} />

      <div className="modal paircard" role="dialog" aria-modal="true" aria-labelledby="pc-title">
        <div className="pc-head">
          <div>
            <p className="pc-kind">
              {/* A narrow card wraps the line between its parts, never inside one. */}
              {head.split(' · ').map((part, index, parts) =>
                index < parts.length - 1 ? (
                  <Fragment key={index}>
                    <span>{`${part} ·`}</span>{' '}
                  </Fragment>
                ) : (
                  <span key={index}>{part}</span>
                ),
              )}
            </p>
            <h2 id="pc-title" className="card-title">{title}</h2>
            <span className={`pill ${pill.state}`}>{pill.label}</span>
          </div>
          <Link className="modal-close" href={close} scroll={false} aria-label={CLOSE}>
            ✕
          </Link>
        </div>

        {notice ? (
          <p className={notice.tone === 'refused' ? 'toast error pc-notice' : 'toast pc-notice'} role={notice.tone === 'refused' ? 'alert' : 'status'}>
            {notice.said}
          </p>
        ) : null}

        {card.concerns.map((concern) => {
          const said = words.find((each) => each.concernId === concern.id)?.words ?? null
          return (
            <div key={concern.id} className="pc-band concern">
              <p className="pc-band-label">{concernLabel(concern.raisedByName, concern.raisedAt, now, timeZone)}</p>
              <p className="pc-quote">{said === null ? WORDS_CLEARED : `“${said}”`}</p>
              <form method="post" action="/follow-up/concern/resolve" className="btn-row">
                <input type="hidden" name="concernId" value={concern.id} />
                <input type="hidden" name="back" value={back} />
                <button type="submit" className="small">
                  {RESOLVE_AND_CLEAR}
                </button>
              </form>
            </div>
          )
        })}
        {card.concerns.length > 0 ? (
          <p className="pc-audit">{readingLine(thisReading, earlier, now, timeZone)}</p>
        ) : null}

        {card.reasons.map((reason) => {
          const sentence = stallSentence(reason, leader)
          return (
            <div key={reason.kind} className="pc-band stalled">
              <p className="pc-band-label">{stallLabel(reason)}</p>
              <p>
                {sentence.before}
                <strong>{sentence.figure}</strong>
                {sentence.after}
              </p>
            </div>
          )
        })}

        {card.pauseExpired ? (
          <div className="pc-band review">
            <p className="pc-band-label">{PAUSE_EXPIRED}</p>
            <p>{followUpLine({ kind: 'pause_expired', periodWeeks: card.pauseExpired.periodWeeks }, null, null)}</p>
            <form method="post" action="/follow-up/relationship/resume" className="btn-row">
              <input type="hidden" name="relationshipId" value={card.relationshipId} />
              <input type="hidden" name="back" value={back} />
              <button type="submit" className="small">
                {RESUME}
              </button>
            </form>
          </div>
        ) : null}

        {card.shape === A_GROUP ? (
          <>
            {/* The leader in full, and a co-leader beneath them. */}
            <div className="pc-people one-side">
              <div className="pc-side">
                {leaders.map((person) => (
                  <Person key={person.personId} person={person} />
                ))}
              </div>
            </div>
            <div className="pc-group">
              <p className="pc-group-label">{disciplesLabel(disciples.length)}</p>
              {disciples.map((person) => (
                <Member key={person.personId} person={person} />
              ))}
            </div>
          </>
        ) : (
          <div className="pc-people">
            {sides.map((people, index) => (
              <div key={index} className="pc-side">
                {people.map((person) => (
                  <Person key={person.personId} person={person} />
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="pc-facts">
          <dl className="pc-kv">
            <dt>{LAST_CHECK_IN}</dt>
            <dd>{card.lastCheckIn ? checkInLine(card.lastCheckIn, timeZone) : NO_CHECK_IN_YET}</dd>
            <dt>{MATERIAL}</dt>
            <dd>{materialLine(card.material, timeZone)}</dd>
          </dl>
        </div>

        {/* Nothing to end before a Leader has accepted: that is cancelled, from Follow-Up. */}
        {card.state !== 'awaiting_leader_acceptance' ? (
          <div className="pc-actions">
            <EndForm relationshipId={card.relationshipId} back={back} summary={END_RELATIONSHIP} summaryClassName="pc-end" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** One person: who, on which side, how to reach them, and what they said at Intake. */
const Person = ({ person }: { readonly person: PairCardPerson }) => (
  <div className="pc-person">
    <div className="person">
      <span className={person.role === 'leader' ? 'avatar' : 'avatar alt'} aria-hidden="true">
        {initialsOf(person.fullName)}
      </span>
      <div>
        <div className="pc-name">{person.fullName}</div>
        <span className="pc-role">{ROLE[person.role]}</span>
      </div>
    </div>
    <Contact person={person} call={displayPhone} />
    <Answers person={person} />
  </div>
)

/**
 * One Disciple of a Group: a row with their name and phone, which opens to how
 * to reach them and what they said at Intake. A `<details>`, so it opens without
 * script. The number on the row is words, not a link, because the row itself is
 * the button; the opened row carries **Call** and **Text**. A Disciple the card
 * knows nothing more of is a row that does not open.
 */
const Member = ({ person }: { readonly person: PairCardPerson }) => {
  const row = (
    <>
      <span className="avatar alt" aria-hidden="true">
        {initialsOf(person.fullName)}
      </span>
      <span className="pc-member-who">
        <span className="pc-name">{person.fullName}</span>
        {person.phone ? <span className="pc-row-phone">{displayPhone(person.phone)}</span> : null}
      </span>
    </>
  )
  const opens = person.phone || person.email || person.ageBand || goalAsShown(person.goal, person.goalOther)
  return opens ? (
    <details className="pc-member">
      <summary className="pc-member-row">
        {row}
        <svg className="pc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="pc-member-body">
        <Contact person={person} call={() => callFirst(person.fullName)} />
        <Answers person={person} />
      </div>
    </details>
  ) : (
    <div className="pc-member">
      <div className="pc-member-row">{row}</div>
    </div>
  )
}

/**
 * How to reach somebody: Call, Text and their email. A missing number or email
 * is left out, never announced. `call` is what the Call link says: the number
 * on a pair, where nothing else shows it, and *Call Mia* on a Group's row, which
 * already does.
 */
const Contact = ({
  person,
  call,
}: {
  readonly person: PairCardPerson
  readonly call: (phone: string) => string
}) =>
  person.phone || person.email ? (
    <div className="pc-contact">
      {person.phone ? (
        <>
          <a href={`tel:${person.phone}`} aria-label={callThem(person.fullName)}>
            <Phone />
            <span>{call(person.phone)}</span>
          </a>
          <a href={`sms:${person.phone}`}>
            <Message />
            <span>{textThem(person.fullName)}</span>
          </a>
        </>
      ) : null}
      {person.email ? (
        <a href={`mailto:${person.email}`}>
          <Mail />
          <span>{person.email}</span>
        </a>
      ) : null}
    </div>
  ) : null

/** Their age band and goal off their latest Intake, each left out where they gave none. */
const Answers = ({ person }: { readonly person: PairCardPerson }) => {
  const goal = goalAsShown(person.goal, person.goalOther)
  return person.ageBand || goal ? (
    <dl className="pc-kv">
      {person.ageBand ? (
        <>
          <dt>{AGE}</dt>
          <dd>{person.ageBand}</dd>
        </>
      ) : null}
      {goal ? (
        <>
          <dt>{HOPING_FOR}</dt>
          <dd>{goal}</dd>
        </>
      ) : null}
    </dl>
  ) : null
}
