import type { Branded } from './branded'
import type { MinistryId, PersonId } from './ids'

/**
 * The link an Admin hands a Person so they can reopen their own Intake form,
 * prefilled, and correct what it says. It is bound to the Person record and
 * possession of the link is the whole of the authentication -- the same shape as an
 * Invitation Link, and for the same reason: this is a Person with no account, and
 * giving them one to change their own phone number would be the wrong trade.
 *
 * It is the only route by which a Participant's availability changes. There is no
 * Participant dashboard and no SMS path for it in V1.
 *
 * Never consumed, unlike an Invitation Link. That one reveals a match and is spent
 * when the Leader has an account of their own; this one is a Person's way back to
 * their own answers, and somebody who corrects their number today and their
 * availability next week is doing the thing it exists for, twice. It ends by
 * expiring and by nothing else.
 */

export type IntakeLinkToken = Branded<string, 'IntakeLinkToken'>

export const intakeLinkToken = (value: string): IntakeLinkToken => value as IntakeLinkToken

/**
 * The same fortnight an Invitation Link gets. One window, so a congregant handed
 * either of Discipler's two links has the same amount of time to act on it.
 *
 * A window rather than none, because this is a bearer credential: whoever holds the
 * URL sees and edits that Person's own answers, and a link with no end is one that
 * is still live in a forwarded text two years from now. The cost is that the only
 * route by which availability changes has a fuse on it -- which is why an expired
 * link says *ask for a new one* rather than 404ing, and why an Admin asking again
 * mints one. The ticket did not settle a lifetime; this is the implementation's
 * choice and the comment on the ticket says so.
 */
export const INTAKE_LINK_LIFETIME_DAYS = 14

const DAY_IN_MS = 24 * 60 * 60 * 1000

export interface NewIntakeLink {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly token: IntakeLinkToken
  readonly createdAt: Date
  readonly expiresAt: Date
}

export const issueIntakeLink = ({
  ministryId,
  personId,
  token,
  at,
}: {
  readonly ministryId: MinistryId
  readonly personId: PersonId
  readonly token: IntakeLinkToken
  readonly at: Date
}): NewIntakeLink => ({
  ministryId,
  personId,
  token,
  createdAt: at,
  expiresAt: new Date(at.getTime() + INTAKE_LINK_LIFETIME_DAYS * DAY_IN_MS),
})

/**
 * Two states rather than three. An Invitation Link needs `consumed` because a
 * Leader who already has an account is sent to sign in rather than to an Admin;
 * nothing spends this one, so the only question is whether it has run out.
 */
export type IntakeLinkState = 'live' | 'expired'

export const intakeLinkState = (expiresAt: Date, now: Date): IntakeLinkState =>
  now.getTime() > expiresAt.getTime() ? 'expired' : 'live'
