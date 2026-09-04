import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AccountMenu, PageShell } from '../shell'
import { SLOT_HOURS, WEEKDAYS } from '~/domain/intake'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getLeaderDashboardReader } from '~/service/container'
import type { RelationshipLed } from '~/service/ports'
import {
  emptyDashboard,
  hourLabel,
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
 *
 * The design's state pill -- Healthy, Stalled, Needs Care -- is not shown here. The
 * reader carries only `paused`, on purpose: how a relationship is doing is the
 * Admin's reading and lives on Care Needed. Email is not shown either; a contact
 * is a name and a number, and the number is null where the Person has not agreed
 * to share it.
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
const PERSON_COLOURS = ['#2d5016', '#8a5a2b', '#3a5a8f', '#7a3a63', '#4b6b2a', '#8f3b3b']

const colourFor = (index: number) => PERSON_COLOURS[index % PERSON_COLOURS.length]!

const Overlay = ({ relationship }: { relationship: RelationshipLed }) => {
  const { overlay } = relationship
  const otherCount = overlay.people.length - 1
  const colourOf = new Map(overlay.people.map((person, index) => [person.personId, index]))
  const oneParticipant =
    overlay.people.filter((person) => person.role === 'participant').length === 1

  // Green and yellow are the one-Participant reading and are drawn as fills; every
  // cell also carries one dot per person available in it. On a co-led group with a
  // single Participant both appear at once, which is the point: the fill answers
  // *can you and Ruth meet*, and the dots say who else marked the slot.
  const classOf = (slot: (typeof overlay.slots)[number]) =>
    [
      slot.shading === 'mutual' ? 'all' : slot.shading === 'participant_only' ? 'partial' : '',
      slot.recommended ? 'best' : '',
    ]
      .filter((name) => name !== '')
      .join(' ')

  return (
    <>
      <ul className="avail-legend">
        {oneParticipant ? (
          <>
            <li>
              <i style={{ background: 'var(--green-fit)' }} /> You both prefer this time
            </li>
            <li>
              <i style={{ background: 'var(--yellow-fit)' }} /> They are free, you are not
            </li>
          </>
        ) : null}
        <li>
          <i style={{ background: 'var(--cell)' }} /> Not available
        </li>
        <li>
          <i style={{ boxShadow: 'inset 0 0 0 2px var(--primary)', background: 'transparent' }} />{' '}
          Your best overlap
        </li>
      </ul>

      <div className="grid-wrap">
        <table className="avail">
          <caption className="visually-hidden">
            Everyone’s availability, on one grid. Nothing here schedules anything.
          </caption>
          <thead>
            <tr>
              {/* Days down the vertical axis and times of day across the horizontal,
                  which is the axis assignment ticket 31 fixed: twelve hourly columns
                  from 8am to 8pm. */}
              <th scope="col">
                <span className="visually-hidden">Day</span>
              </th>
              {SLOT_HOURS.map((hour) => (
                <th key={hour} scope="col">
                  {hourLabel[hour]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day) => (
              <tr key={day}>
                <th scope="row">{weekdayLabel[day]}</th>
                {SLOT_HOURS.map((hour) => {
                  const slot = overlay.slots.find(
                    (cell) => cell.day === day && cell.hour === hour,
                  )!
                  return (
                    <td key={hour} className={classOf(slot)}>
                      {/* The cell says who is in it in words as well as in colour.
                          A grid whose only content is a fill is unreadable to
                          anybody not seeing the colours. */}
                      <span className="visually-hidden">
                        {`${slotLabel(day, hour)}: `}
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
      <p className="muted" role="status">
        {overlaySummary({
          recommended: overlay.recommended
            ? slotLabel(overlay.recommended.day, overlay.recommended.hour)
            : null,
          everyoneCanMeet: overlay.everyoneCanMeet,
          otherCount,
        })}
      </p>
    </>
  )
}

const Relationship = ({ relationship }: { relationship: RelationshipLed }) => {
  const others = relationship.contacts.filter((contact) => !contact.isYou)
  const participants = others.filter((contact) => contact.role === 'participant')
  const heading = participants.length === 1 ? 'Your mentee' : 'Your group'

  return (
    <div className="lead-block">
      <div className="lead-grid">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">{heading}</h2>
            <span className="muted">{relationship.ministryName}</span>
          </div>

          {/* A paused relationship stays on the list, visibly marked, for the whole
              pause. Pausing never removes, archives, ends or hides it, and everyone in
              it stays where they are. */}
          {relationship.paused ? (
            <p className="notice" role="status">
              <span className="pill paused">{pausedLabel}</span> {pausedExplanation}
            </p>
          ) : null}

          {others.length === 0 ? (
            <p className="empty">Nobody else is in this relationship at the moment.</p>
          ) : null}

          {others.map((contact) => (
            <div key={contact.personId} className="mentee-card">
              <div className="mentee-top">
                <div>
                  <div className="mentee-name">{contact.fullName}</div>
                  <div className="mentee-since">
                    {contact.role === 'leader' ? 'Leads this with you (co-leader)' : 'Being discipled'}
                  </div>
                </div>
              </div>
              {/* Checked at the moment of display, never assumed from enrolment.
                  One sentence covers declined, withdrawn, never asked and no number
                  on file, because a Leader who could tell them apart would be
                  reading a consent decision by inference. */}
              <div className="mentee-contact">
                {contact.phone ?? <span className="muted">{numberWithheld}</span>}
              </div>
            </div>
          ))}

          {/* Drawn inline rather than behind a button. The page already draws it
              and it is the one thing a Leader comes here for. */}
          <h3>Availability</h3>
          <Overlay relationship={relationship} />
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Resources</h2>
          </div>
          {relationship.material ? (
            <div className="mat-panel">
              <div className="mat-title">{relationship.material.title}</div>
              {relationship.material.body ? (
                <p className="material-body">{relationship.material.body}</p>
              ) : null}
              {relationship.material.pdfUrl ? (
                <p className="mat-meta">
                  <a href={relationship.material.pdfUrl}>
                    {relationship.material.pdfFilename ?? 'Download the PDF'}
                  </a>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mat-panel">
              <p className="empty">{noMaterial}. Your ministry will set one up.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function RelationshipsPage() {
  const resolution = await resolveAdmin()
  if (resolution.status === 'signed-out') redirect('/login')

  const led = await getLeaderDashboardReader().listRelationshipsLed()

  // Whoever is reading: the first relationship's own contact. Said by first name,
  // as the design does. A Leader leading nothing has no contact row to read a
  // name off, and the greeting says nothing rather than guessing one.
  const me = led[0]?.contacts.find((contact) => contact.isYou)?.fullName ?? null
  const firstName = me?.split(/\s+/)[0] ?? null

  return (
    <PageShell
      title={firstName ? `Welcome, ${firstName}` : 'Your relationships'}
      subtitle="Your mentorship dashboard"
      wide
      actions={
        <>
          {/* The way back, for the one person who has one. A plain Leader has no
              Admin surface and is offered no link to it -- and their menu offers
              no Ministry group either: this is the one page a Leader has. */}
          {resolution.status === 'admin' ? <Link href="/overview">Ministry overview</Link> : null}
          <AccountMenu ministry={resolution.status === 'admin'} />
        </>
      }
    >
      {led.length === 0 ? (
        <div className="card">
          {/* Not an error and not a missing permission. A Leader whose last
              relationship ended reaches exactly this, with nothing revoked. */}
          <p className="empty">{emptyDashboard}</p>
        </div>
      ) : (
        led.map((relationship) => (
          <Relationship key={relationship.relationshipId} relationship={relationship} />
        ))
      )}
    </PageShell>
  )
}
