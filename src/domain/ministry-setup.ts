import type { Branded } from './branded'
import { INVITATION_LIFETIME_DAYS, invitationState, type InvitationState } from './invitations'

/**
 * The Ministry Setup Link: how a Ministry comes into existence.
 *
 * Whoever runs Discipler mints one, naming the church, the number it sends from
 * and the phone its first Admin signs in with. The Admin opens it, types their
 * name and a password, and that one submit opens the Ministry. It is the shape of
 * the Invitation Link pointed at a pastor instead of a Leader, and it keeps every
 * property of one that matters: possession of the link is the whole
 * authentication, the phone is fixed on the token and never typed, it runs out
 * after a fixed window, and it is spent by account creation rather than by being
 * opened.
 *
 * It is not a sign-up surface. A Ministry still exists only because an operator
 * said so; the link moves the typing of the password to the person who owns it.
 */

export type MinistrySetupToken = Branded<string, 'MinistrySetupToken'>

export const ministrySetupToken = (value: string): MinistrySetupToken =>
  value as MinistrySetupToken

/**
 * The same window as an Invitation Link, for the same reason: the link is the only
 * way in, it is sent by hand among everything else in somebody's inbox, and the
 * cost of the longer window is a fortnight of a token that opens one church --
 * against an operator minting again for a pastor who was away.
 */
export const MINISTRY_SETUP_LIFETIME_DAYS = INVITATION_LIFETIME_DAYS

const DAY_IN_MS = 24 * 60 * 60 * 1000

export interface NewMinistrySetup {
  readonly token: MinistrySetupToken
  readonly ministryName: string
  /** Both numbers already read into the form the Ministry and the account store. */
  readonly sendingNumber: string
  readonly adminPhone: string
  readonly createdAt: Date
  readonly expiresAt: Date
}

export interface IssueMinistrySetup {
  readonly token: MinistrySetupToken
  readonly ministryName: string
  readonly sendingNumber: string
  readonly adminPhone: string
  readonly at: Date
}

export const issueMinistrySetup = ({
  token,
  ministryName,
  sendingNumber,
  adminPhone,
  at,
}: IssueMinistrySetup): NewMinistrySetup => ({
  token,
  ministryName,
  sendingNumber,
  adminPhone,
  createdAt: at,
  expiresAt: new Date(at.getTime() + MINISTRY_SETUP_LIFETIME_DAYS * DAY_IN_MS),
})

/**
 * The same three states as an Invitation Link, decided the same way, because the
 * page has the same three things to say: a link that has run out sends its holder
 * back to the operator, a spent one sends them to sign in, and a token that names
 * nothing is neither.
 */
export type MinistrySetupState = InvitationState

export const ministrySetupState = (
  link: { readonly expiresAt: Date; readonly consumedAt: Date | null },
  now: Date,
): MinistrySetupState => invitationState(link, now)
