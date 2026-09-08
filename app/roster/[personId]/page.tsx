import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CHANGE_YOUR_PASSWORD } from '../../account/copy'
import { ClipboardField } from '../../intake-forms/clipboard-field'
import { AccountMenu, initialsOf, NotAnAdmin, PageShell } from '../../shell'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getRosterReader } from '~/service/container'
import { personId as asPersonId } from '~/domain/ids'
import { intakeReopenLink } from '~/domain/outbound-copy'
import { appBaseUrl } from '~/platform/supabase/credentials'
import type { RosterEntry } from '~/service/ports'
import {
  AWAITING_ACCEPTANCE,
  DISCIPLED_BY,
  DISCIPLING,
  displayPhone,
  firstTimeLabel,
  intakeLinkInstruction,
  NO_ACCOUNT,
  NO_INTAKE_LINK_STANDING,
  OFFERED_TO_MENTOR,
  pairingSizeLabel,
  participationStatusLabel,
  RESET_PASSWORD,
  REINVITED,
  whoTheyAre,
} from '../copy'
import { isDiscipler } from '../lists'

export const dynamic = 'force-dynamic'

/**
 * One Person, everything the Roster knows about them, and every act an Admin
 * takes about one Person. The Roster row used to carry four buttons and render
 * the issued Intake link as a toast inside a table cell (ticket 36 reviewed it as
 * the heaviest column being the least used); this page takes all of it, and the
 * row keeps the one act that belongs to a list, which is Pair.
 *
 * Reached from the name on the row. The routes that used to send an Admin back to
 * the Roster after acting on one Person -- the Intake link, a new invitation, a
 * password reset -- send them here, so the result lands beside the act.
 */
export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>
  searchParams: Promise<{
    /** The Intake link was just issued, so this page shows it. */
    intakeLink?: string
    /** A new invitation was just sent. The route sets this only when a text went out. */
    reinvited?: string
  }>
}) {
  const resolution = await resolveAdmin()

  if (resolution.status === 'not-an-admin') return <NotAnAdmin title="Roster" />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin
  const { personId } = await params
  const query = await searchParams

  // The whole Roster and one row of it. There is no single-Person reader, and one
  // read policed by the Roster's own function is the read that cannot show an
  // Admin a Person of another Ministry.
  const roster = await getRosterReader().listRoster(admin.ministryId)
  const person = roster.find((entry) => entry.personId === personId)
  if (!person) notFound()

  // The live link, only when the Admin has just asked for it. Reading it on every
  // load would put a credential on a page nobody is acting on, and the query
  // string carries the fact that one was asked for, never the token.
  const issued = query.intakeLink
    ? await getRosterReader().liveIntakeLink(admin.ministryId, asPersonId(person.personId))
    : null
  const issuedLink = issued
    ? { url: intakeReopenLink(appBaseUrl(), issued.token), expiresAt: issued.expiresAt }
    : null

  return (
    <PageShell
      title={person.fullName}
      subtitle={admin.ministryName}
      back={{ href: '/roster', label: 'Back to the Roster' }}
      actions={<AccountMenu ministry />}
    >
      {query.reinvited ? (
        <p className="toast" role="status">{REINVITED(person.fullName)}</p>
      ) : null}

      <div className="two-up">
        <div className="card">
          <div className="card-head">
            <div className="person">
              <span className="avatar" aria-hidden="true">{initialsOf(person.fullName)}</span>
              <h2 className="card-title">{person.fullName}</h2>
            </div>
            <span className={`rs rs-${person.participationStatus}`}>
              {participationStatusLabel[person.participationStatus]}
            </span>
          </div>
          {/* What they are on the Roster, and why. A Discipler is a fact -- they
              lead somebody, they offered to on the form, or an import paired them
              as one -- and this is the one place that says which fact, so an Admin
              reading a Discipler who is discipled by nobody as Ready to Pair can
              see what the word rests on. */}
          <dl className="kv">
            <dt>On the Roster as</dt>
            <dd>{whoTheyAre(person)}</dd>
            <dt>Email</dt>
            <dd>{person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : '-'}</dd>
            <dt>Phone</dt>
            <dd>{person.phone ? <a href={`tel:${person.phone}`}>{displayPhone(person.phone)}</a> : '-'}</dd>
            <dt>At Intake</dt>
            <dd>{atIntake(person)}</dd>
          </dl>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Pairings</h2>
            {/* Offered on the state and not on the list: somebody Ready to Pair may
                be paired, as the Discipler where they are one and as the Disciple
                otherwise, and the pairing screen lets the Admin change that. */}
            {person.participationStatus === 'ready_to_pair' ? (
              <Link
                className="btn sec small"
                href={`/roster/pair?${new URLSearchParams(
                  isDiscipler(person) ? { leaderId: person.personId } : { with: person.personId },
                )}`}
              >
                Pair
              </Link>
            ) : null}
          </div>
          {person.relationships.length === 0 ? (
            <p className="blocked">Unpaired</p>
          ) : (
            <ul className="bare">
              {person.relationships.map((relationship) => (
                <li key={relationship.relationshipId}>
                  {relationship.role === 'leader'
                    ? `${DISCIPLING} ${relationship.participantNames.join(', ')}`
                    : `${DISCIPLED_BY} ${relationship.leaderNames.join(', ')}`}
                  <span className="pill n">{pairingSizeLabel(relationship.participantCount)}</span>
                  {relationship.awaitingAcceptance ? (
                    <span className="muted">{` - ${AWAITING_ACCEPTANCE}`}</span>
                  ) : null}
                  {/* Offered on the state and the role together, never on either
                      alone. A Disciple is sent no link at all (ADR-0011), so there
                      is nothing to send them again; and on an accepted pairing
                      there is nobody left to ask. */}
                  {relationship.awaitingAcceptance && relationship.role === 'leader' ? (
                    <form action="/roster/reinvite" method="post">
                      <input type="hidden" name="relationshipId" value={relationship.relationshipId} />
                      <input type="hidden" name="personId" value={person.personId} />
                      <button type="submit" className="sec small">Send a new invitation</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Intake</h2>
            {/* The link that reopens their own Intake. Offered whatever their
                state, because the two things it corrects -- a wrong number and an
                availability that has changed -- are as likely before Intake as
                after it. */}
            <form method="post" action="/roster/intake-link">
              <input type="hidden" name="personId" value={person.personId} />
              <button type="submit" className="sec small">Intake link</button>
            </form>
          </div>
          {issuedLink ? (
            <div className="toast" role="status">
              {/* Shown rather than sent. The Admin passes it on however they are
                  already in touch with this Person, which is the point: texting it
                  to the number on file would reach whoever holds the number being
                  corrected. */}
              <p className="muted">{intakeLinkInstruction(person.fullName, issuedLink.expiresAt)}</p>
              <ClipboardField id="intake-link" value={issuedLink.url} />
            </div>
          ) : query.intakeLink ? (
            <p className="muted">{NO_INTAKE_LINK_STANDING}</p>
          ) : (
            <p className="muted">
              {person.participationStatus === 'no_intake_submitted'
                ? 'Has not completed Intake. Send them the link, and they land on the Roster as ready to pair when they have.'
                : 'Has completed Intake. The link reopens their own form with their answers already in it.'}
            </p>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Account</h2>
          </div>
          {/* Offered only where there is an account to reset, which is most of a
              Roster not having one: an account exists for a Discipler who accepted
              an invitation and for an Admin who was provisioned, and for nobody
              else. On the Admin's own page the act is a different one -- resetting
              your own password is not a recovery, you are holding a session as you
              ask -- so it offers the self-service change instead. */}
          {person.holdsAnAccount ? (
            person.personId === admin.personId ? (
              <p>
                <Link className="btn sec" href="/account">{CHANGE_YOUR_PASSWORD}</Link>
              </p>
            ) : (
              <p>
                <Link className="btn sec" href={`/roster/reset/${person.personId}`}>{RESET_PASSWORD}</Link>
              </p>
            )
          ) : (
            <p className="muted">{NO_ACCOUNT}</p>
          )}
        </div>
      </div>
    </PageShell>
  )
}

/** What the Person said on the form, as one line, or that no form has asked them. */
const atIntake = (person: RosterEntry): string => {
  const said = [
    ...(person.declaredSide === 'mentor' ? [OFFERED_TO_MENTOR] : []),
    ...(person.firstTime === null ? [] : [firstTimeLabel(person.firstTime)]),
  ]
  if (said.length > 0) return said.join(' · ')
  return person.participationStatus === 'no_intake_submitted' ? 'Nothing yet' : 'Completed'
}

