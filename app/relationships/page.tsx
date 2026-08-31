import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DAY_BLOCKS, WEEKDAYS } from '~/domain/intake'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getLeaderDashboardReader } from '~/service/container'
import type { RelationshipLed } from '~/service/ports'
import {
  dayBlockShortLabel,
  emptyDashboard,
  numberWithheld,
  noMaterial,
  overlaySummary,
  pausedExplanation,
  pausedLabel,
  slotLabel,
  weekdayLabel,
} from './copy'

export const dynamic = 'force-dynamic'

/**
 * The Leader Dashboard: the relationships this person leads, and for each one three
 * things and nothing else -- the availability overlay, the Material assigned to it,
 * and the name and phone number of everyone in it.
 *
 * There is no third surface in V1 and this is not one for Participants: being
 * discipled grants no surface at all. A Person who leads two relationships and is a
 * Participant in a third sees the two, and nothing of the third.
 */

/**
 * Everyone in the relationship carries their own colour, so a Leader can see at a
 * glance which slots gather the most people. Positions rather than names: the
 * overlay draws the Leader first, so the first colour is always theirs and a Leader
 * reading two relationships finds themselves the same colour on both.
 *
 * Six, because a group is small by construction. A seventh person wraps rather than
 * failing, which is the right way round -- an unreadable pair of colours is a worse
 * screen, not a broken one.
 */
const PERSON_COLOURS = ['#2f5d50', '#8a5a2b', '#3a5a8f', '#7a3a63', '#4b6b2a', '#8f3b3b']

const colourFor = (index: number) => PERSON_COLOURS[index % PERSON_COLOURS.length]!

const Overlay = ({ relationship }: { relationship: RelationshipLed }) => {
  const { overlay } = relationship
  const otherCount = overlay.people.length - 1
  const colourOf = new Map(overlay.people.map((person, index) => [person.personId, index]))

  // Green and yellow are the one-Participant reading and are drawn as fills; a group
  // is drawn as one dot per person. The two never appear together, because the
  // overlay only ever shades a grid with exactly one Participant on it.
  const shadeOf = (shading: string) =>
    shading === 'mutual' ? '#cfe8d8' : shading === 'participant_only' ? '#f7e6b5' : undefined

  return (
    <>
      <div className="grid-scroll">
        <table className="overlay">
          <caption className="subtle">
            Everyone’s availability, on one grid. Nothing here schedules anything.
          </caption>
          <thead>
            <tr>
              {/* Days down the vertical axis and times of day across the horizontal,
                  which is the axis assignment the spec fixes. */}
              <th scope="col">Day</th>
              {DAY_BLOCKS.map((block) => (
                <th key={block} scope="col">
                  {dayBlockShortLabel[block]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day) => (
              <tr key={day}>
                <th scope="row">{weekdayLabel[day]}</th>
                {DAY_BLOCKS.map((block) => {
                  const slot = overlay.slots.find(
                    (cell) => cell.day === day && cell.block === block,
                  )!
                  return (
                    <td
                      key={block}
                      className={slot.recommended ? 'slot recommended' : 'slot'}
                      style={{ background: shadeOf(slot.shading) }}
                    >
                      {/* The cell says who is in it in words as well as in colour.
                          A grid whose only content is a fill is unreadable to
                          anybody not seeing the colours. */}
                      <span className="visually-hidden">
                        {`${slotLabel(day, block)}: `}
                        {slot.available.length === 0
                          ? 'nobody'
                          : slot.available
                              .map(
                                (person) =>
                                  overlay.people.find((who) => who.personId === person)!.fullName,
                              )
                              .join(', ')}
                        {slot.recommended ? '. Your best overlap.' : ''}
                      </span>
                      <span aria-hidden="true" className="dots">
                        {slot.available.map((person) => (
                          <span
                            key={person}
                            className="dot"
                            style={{ background: colourFor(colourOf.get(person)!) }}
                          />
                        ))}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="legend">
        {overlay.people.map((person, index) => (
          <li key={person.personId}>
            <span className="dot" style={{ background: colourFor(index) }} aria-hidden="true" />
            {person.fullName}
            {person.isYou ? ' (you)' : person.role === 'leader' ? ' (co-leader)' : ''}
          </li>
        ))}
      </ul>

      {/* The suggestion, and the case where there is nothing to suggest. Said in a
          sentence rather than left to the highlight, because a highlighted cell on
          its own reads as *this is the time* -- and where no slot gathers everyone
          including the Leader, that would be a recommendation Discipler must not
          make. */}
      <p role="status">
        {overlaySummary({
          recommended: overlay.recommended
            ? slotLabel(overlay.recommended.day, overlay.recommended.block)
            : null,
          everyoneCanMeet: overlay.everyoneCanMeet,
          otherCount,
        })}
      </p>
    </>
  )
}

const Relationship = ({ relationship }: { relationship: RelationshipLed }) => {
  const participants = relationship.contacts.filter((contact) => contact.role === 'participant')

  return (
    <div className="panel">
      <h2>
        {participants.length === 0
          ? 'This relationship'
          : participants.map((contact) => contact.fullName).join(', ')}
      </h2>
      <p className="subtle">{relationship.ministryName}</p>

      {/* A paused relationship stays on the list, visibly marked, for the whole
          pause. Pausing never removes, archives, ends or hides it, and everyone in
          it stays where they are. */}
      {relationship.paused ? (
        <p className="badge" role="status">
          {pausedLabel} — {pausedExplanation}
        </p>
      ) : null}

      <h3>Availability</h3>
      <Overlay relationship={relationship} />

      <h3>Material</h3>
      {relationship.material ? (
        <>
          <p>{relationship.material.title}</p>
          {relationship.material.body ? (
            <p className="material-body">{relationship.material.body}</p>
          ) : null}
          {relationship.material.pdfUrl ? (
            <p>
              <a href={relationship.material.pdfUrl}>
                {relationship.material.pdfFilename ?? 'Download the PDF'}
              </a>
            </p>
          ) : null}
        </>
      ) : (
        <p className="empty">{noMaterial}</p>
      )}

      <h3>Who is in this</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {relationship.contacts.map((contact) => (
            <tr key={contact.personId}>
              <td>
                {contact.fullName}
                {contact.isYou ? ' (you)' : contact.role === 'leader' ? ' (co-leader)' : ''}
              </td>
              {/* Checked at the moment of display, never assumed from enrolment.
                  One sentence covers declined, withdrawn, never asked and no number
                  on file, because a Leader who could tell them apart would be
                  reading a consent decision by inference. */}
              <td>{contact.phone ?? <span className="empty">{numberWithheld}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function RelationshipsPage() {
  const resolution = await resolveAdmin()
  if (resolution.status === 'signed-out') redirect('/login')

  const led = await getLeaderDashboardReader().listRelationshipsLed()

  return (
    <main>
      <h1>Your relationships</h1>
      <p className="subtle">Discipler</p>

      {/* The way back, for the one person who has one. A plain Leader has no
          Roster and is offered no link to it. */}
      {resolution.status === 'admin' ? (
        <p>
          <Link href="/roster">Roster</Link>
        </p>
      ) : null}

      {led.length === 0 ? (
        <div className="panel">
          {/* Not an error and not a missing permission. A Leader whose last
              relationship ended reaches exactly this, with nothing revoked. */}
          <p className="empty">{emptyDashboard}</p>
        </div>
      ) : (
        led.map((relationship) => (
          <Relationship key={relationship.relationshipId} relationship={relationship} />
        ))
      )}
    </main>
  )
}
