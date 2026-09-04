import type { FollowUpRefusal, GroupRefusal, PairingRefusal } from '~/domain/errors'
import type { Gender } from '~/domain/intake'
import { REFUSALS } from '../roster/copy'

/**
 * Everything the Intake forms page says in words: the two links, the captions under
 * their QR codes, the Groups panel that decides what the group link offers, and the
 * people waiting to be admitted through it. All of it lived in `app/roster/copy.ts`
 * while these sat at the foot of the Roster; ticket 32 gave them a page of their own
 * and the words moved with them.
 */

/** The heading, and the words on every link to the page. */
export const INTAKE_FORMS = 'Intake forms'

/**
 * What is printed under each QR code, so the square answers *which form is this*
 * on its own.
 *
 * The Ministry's name and the form's, because both are questions somebody standing
 * in front of the poster may have and neither is answered by a square. An Admin
 * holds two of these and prints one; a room reads the one that got printed.
 */
export const qrCodeCaption = {
  // The original link, which since ticket 29 opens the group form. Captioned for
  // what it opens now, so a room reads which form it is scanning.
  intake: (ministryName: string) => `${ministryName} — Join a group`,
  discipleship: (ministryName: string) => `${ministryName} — Discipleship`,
}

/**
 * The Groups panel: every live group, named or not, with the two things an Admin
 * decides about each. An unnamed group is said to be unnamed rather than left
 * blank, because that is the thing to fix -- the group link offers a group by name
 * and nothing else, so an unnamed one is on no link at all.
 */
export const GROUPS_HEADING = 'Groups'
export const GROUPS_EXPLANATION =
  'Every group that has not ended. A group with a name is offered on the group link '
  + 'above; an unnamed one is not, and is asked about each week by listing who is in '
  + 'it rather than by name. Ticking the box means somebody who picks the group on the '
  + 'link asks to join rather than joins, and waits for you under “Waiting to join a '
  + 'group” above.'
export const UNNAMED_GROUP = 'Unnamed group'
export const GROUP_NAME_LABEL = 'What this group is called'
export const GROUP_NAME_HINT = 'This appears on the group link, which anybody may open.'
export const REQUIRE_APPROVAL_LABEL = 'Ask me before anyone joins through the link'
export const SAVE_GROUP = 'Save'
export const GROUP_SAVED = 'Saved.'
export const declaredGenderLabel: Record<'mixed' | Gender, string> = {
  mixed: 'Mixed',
  male: 'Men',
  female: 'Women',
}

/**
 * The panel of people waiting to be admitted. Shown only when somebody is: an
 * empty panel would be a heading about nothing.
 */
export const WAITING_HEADING = 'Waiting to join a group'
export const WAITING_EXPLANATION =
  'Each of these picked a group you have set to ask first. Admitting them adds them to '
  + 'the group and tells its leader; declining closes the request and tells nobody — '
  + 'that is a conversation to have, and you have their number on the Roster.'
export const ADMIT = 'Admit'
export const DECLINE = 'Decline'
export const admitted = (fullName: string): string =>
  `${fullName} is in. Their leader has been told.`
export const alreadyIn = (fullName: string): string =>
  `${fullName} was already in that group, so the request was closed and nobody was told.`
export const declinedRequest = (fullName: string): string =>
  `${fullName}’s request was closed. Nobody has been told.`
export const askedToJoin = (groupName: string | null): string =>
  groupName === null ? 'asked to join a group that has since lost its name' : `asked to join ${groupName}`

const GROUP_REFUSALS: Record<GroupRefusal, string> = {
  'group.relationship_not_found': 'That group is not on this Roster any more.',
  'group.name_missing': 'Give the group a name. It cannot be saved without one.',
  'group.relationship_ended': 'That group has ended, so there is nothing left to change.',
  'group.request_not_found':
    'That request has already been answered. The Roster shows where things stand.',
  'group.request_group_ended':
    'That group has ended since they asked, so there is nothing to admit them to. Decline '
    + 'the request to close it.',
}

export const groupRefusalMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return GROUP_REFUSALS[code as GroupRefusal] ?? 'That could not be saved.'
}

const FOLLOW_UP_REFUSALS: Record<FollowUpRefusal, string> = {
  'follow_up.not_found': 'That request is gone.',
  'follow_up.already_resolved': 'Somebody answered that request before you did.',
  'follow_up.resolver_is_not_in_this_ministry': 'This account cannot answer requests here.',
}

/**
 * Why an admission could not go through: the request itself, or the membership
 * the database refused -- which is a pairing refusal, said in the pairing's own
 * words, because it is the same rule refusing the same thing.
 */
export const admissionRefusalMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return (
    GROUP_REFUSALS[code as GroupRefusal]
    ?? FOLLOW_UP_REFUSALS[code as FollowUpRefusal]
    ?? REFUSALS[code as PairingRefusal]
    ?? 'That request could not be answered.'
  )
}
