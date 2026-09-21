import type { Branded } from './branded'
import type { MinistryId, PersonId, RelationshipId } from './ids'

/**
 * The Invitation Link. It is bound to the Person record rather than to an email
 * address, and possession of the phone it was sent to is the authentication --
 * so the token is the whole credential and nothing else stands behind it.
 *
 * One link means the same thing whichever side of the relationship its holder
 * stands on: *this reveals this relationship to this person, with no session*. A
 * Leader's link carries them to acceptance; a Participant's carries them to a way
 * of saying the match is not right. The role is read from their membership, so
 * there is nothing here to disagree with it.
 */

export type InvitationToken = Branded<string, 'InvitationToken'>

export const invitationToken = (value: string): InvitationToken => value as InvitationToken

/**
 * The spec allows seven to fourteen days and this takes the far end of it. The
 * link is the only way in, it arrives by text among everything else on a phone,
 * and the cost of the longer window is a week of a token that reveals one match
 * to whoever holds one phone -- against an Admin re-issuing by hand for somebody
 * who was on holiday.
 */
export const INVITATION_LIFETIME_DAYS = 14

const DAY_IN_MS = 24 * 60 * 60 * 1000

export interface NewInvitation {
  readonly ministryId: MinistryId
  readonly relationshipId: RelationshipId
  readonly personId: PersonId
  readonly token: InvitationToken
  readonly createdAt: Date
  readonly expiresAt: Date
}

export interface IssueInvitation {
  readonly ministryId: MinistryId
  readonly relationshipId: RelationshipId
  readonly personId: PersonId
  readonly token: InvitationToken
  readonly at: Date
}

export const issueInvitation = ({
  ministryId,
  relationshipId,
  personId,
  token,
  at,
}: IssueInvitation): NewInvitation => ({
  ministryId,
  relationshipId,
  personId,
  token,
  createdAt: at,
  expiresAt: new Date(at.getTime() + INVITATION_LIFETIME_DAYS * DAY_IN_MS),
})

/**
 * How an invitation that was never accepted ended (Manual pairing, recut ticket
 * 06; decided by James on 2026-09-21). Its Leader declined on the page the link
 * opens, or nobody answered and the tick withdrew it when its fortnight ran out.
 * Either way their unaccepted leader membership ended with it.
 */
export const INVITATION_WITHDRAWALS = ['declined', 'expired'] as const

export type WithdrawnAs = (typeof INVITATION_WITHDRAWALS)[number]

export const isWithdrawnAs = (value: unknown): value is WithdrawnAs =>
  INVITATION_WITHDRAWALS.some((withdrawal) => withdrawal === value)

/**
 * Four states rather than a boolean, because the page has to say four different
 * things. A link that has run out sends its holder back to an Admin; a link that
 * has already been used sends them to sign in; a link its holder declined says
 * the Ministry has been told; a token that names nothing at all is none of them,
 * and is not this function's to answer.
 */
export type InvitationState = 'live' | 'expired' | 'consumed' | 'declined'

export interface ResolvedInvitation {
  readonly expiresAt: Date
  readonly consumedAt: Date | null
  /** How it was withdrawn, or null where it has not been. */
  readonly withdrawnAs: WithdrawnAs | null
}

export const invitationState = (
  { expiresAt, consumedAt, withdrawnAs }: ResolvedInvitation,
  now: Date,
): InvitationState => {
  // Consumed wins over expired when a link is both. The Leader has an account;
  // telling them their link ran out would send them to an Admin for nothing.
  if (consumedAt) return 'consumed'
  if (withdrawnAs === 'declined') return 'declined'
  // One the tick withdrew had run out, which is all its holder needs to be told.
  if (withdrawnAs === 'expired') return 'expired'
  return hasRunOut(expiresAt, now) ? 'expired' : 'live'
}

/**
 * Whether a link's window has closed. Said once, because acceptance and the
 * tick's withdrawal both read it and must never both be true of one instant: a
 * link is live up to and including its expiry, and run out after it.
 */
export const hasRunOut = (expiresAt: Date, now: Date): boolean =>
  now.getTime() > expiresAt.getTime()
