import type { FollowUpRefusal, GroupRefusal, MaterialAssignmentRefusal } from '~/domain/errors'
import type { Gender } from '~/domain/intake'
import { SHORT_NAME_LONGEST, type ShortNameRefusal } from '~/domain/short-name'
import { refusalIn } from '../refusals'
import { REFUSALS } from '../roster/copy'

/**
 * Everything the Intake forms page says in words: the short name and the two links
 * built from it, the captions under their QR codes, the Groups panel that decides what the group link offers, and the
 * people waiting to be admitted through it. All of it lived in `app/roster/copy.ts`
 * while these sat at the foot of the Roster; ticket 32 gave them a page of their own
 * and the words moved with them.
 */

/**
 * The two words the Groups panel says about a group's leader, as the Roster said
 * them until ticket 36. Kept here because this page is now their only reader:
 * the Roster says Discipler and Disciple, and the sweep of the other Admin
 * screens is a ticket of its own.
 */
export const LEADS = 'Leads'
export const AWAITING_LEADER_ACCEPTANCE = 'Awaiting Leader Acceptance'

/** The heading, and the words on every link to the page. */
export const INTAKE_FORMS = 'Intake forms'

/**
 * The card at the top of the page (Pastor feedback, ticket 04): the Ministry's
 * short name, then the two forms side by side, each with its QR code, its
 * readable link and the two things an Admin does with them. James's Lavish
 * review of 2026-10-12 settled it with no helper sentences, so these are labels.
 */
export const SHORT_NAME_LABEL = "Your church's short name"
export const SAVE_SHORT_NAME = 'Save'
/**
 * Said once the name has changed. The second sentence is the one worry an Admin
 * has at that moment, and the product's answer to it.
 */
export const SHORT_NAME_SAVED =
  'Saved. Links and QR codes printed with the old name still open your forms.'
export const COPY_LINK = 'Copy link'
export const LINK_COPIED = 'Copied.'
export const DOWNLOAD_QR_CODE = 'Download QR code'

/** The two forms, by the names the tiles give them. */
export const MENTOR_AND_MENTEE_FORM = 'Mentor and mentee form'
export const GROUPS_FORM = 'Groups form'

/** What a screen reader is told each square is. */
export const qrCodeAlt = (form: string, ministryName: string): string =>
  `QR code opening the ${form.toLowerCase()} for ${ministryName}`

/**
 * What is printed under each QR code, so the square answers *which form is this*
 * on its own.
 *
 * The Ministry's name and the form's, because both are questions somebody standing
 * in front of the poster may have and neither is answered by a square. An Admin
 * holds two of these and prints one; a room reads the one that got printed. The
 * form is named as its tile names it.
 */
export const qrCodeCaption = {
  mentorAndMentee: (ministryName: string) => `${ministryName} - ${MENTOR_AND_MENTEE_FORM}`,
  groups: (ministryName: string) => `${ministryName} - ${GROUPS_FORM}`,
}

/**
 * What each downloaded square is called: the link it opens, spelled as a file,
 * so an Admin with both in a folder of downloads can tell which is which.
 */
export const qrCodeFilename = {
  mentorAndMentee: (shortName: string) => `${shortName}-qr-code.svg`,
  groups: (shortName: string) => `${shortName}-groups-qr-code.svg`,
}

/**
 * Why a short name was refused, in the Admin's words. The boundary and the
 * database deal in codes; each sentence says what to do about it.
 */
const SHORT_NAME_REFUSALS: Record<ShortNameRefusal, string> = {
  'short_name.missing': 'Give your church a short name. Both links are built from it.',
  'short_name.unreadable':
    'A short name uses only lowercase letters, digits and single dashes between words, like grace-church.',
  'short_name.too_long': `A short name can be at most ${SHORT_NAME_LONGEST} characters, so it is easy to say and to type.`,
  'short_name.reserved':
    'That short name is one of Discipler’s own pages, so it cannot be a church’s. Try another.',
  'short_name.taken':
    'Another church has that short name, or had it once and its printed links still use it. Try another.',
}

/** The sentence for a refusal that came back on the query string, or null. */
export const shortNameRefusalMessage = (code: string | undefined): string | null =>
  refusalIn(SHORT_NAME_REFUSALS, code)

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
/**
 * The Material field on an accepted group's card (Materials, ticket 03, S-6), and
 * the line an unaccepted group's card shows in its place. The field saves with
 * the name and the toggle in the one press.
 */
export const GROUP_MATERIAL_LABEL = 'Material'
export const GROUP_MATERIAL_HINT =
  "Shown beneath the group's name on the link, and on the leader's dashboard."
export const workingThroughItSince = (date: string): string => `Working through it since ${date}.`
export const materialOnceAccepted = (leaderFirstNames: readonly string[]): string =>
  `A material can be assigned once ${leaderFirstNames.length === 0 ? 'its leader' : leaderFirstNames.join(' and ')} has accepted. `
  + 'The group is not on the link until then either.'

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

/**
 * The Material field's refusals, said on the groups card. The name and the toggle
 * have saved by the time one of these comes back, so each says what did not.
 * The Material already running is never one: choosing it writes nothing, and
 * the route says nothing about it.
 */
const GROUP_MATERIAL_REFUSALS: Record<Exclude<MaterialAssignmentRefusal, 'material.already_running'>, string> = {
  'material.relationship_not_found': 'That group is not on this Roster any more.',
  'material.relationship_not_accepted':
    'The name was saved. A material can be assigned once the leader has accepted.',
  'material.relationship_ended': 'That group has ended, so there is nothing left to change.',
  'material.not_found':
    'The name was saved. That material is no longer on the list; somebody may have removed it.',
  'material.assigner_is_not_in_this_ministry': 'This account cannot assign materials here.',
}

export const groupRefusalMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return (
    refusalIn(GROUP_REFUSALS, code)
    ?? refusalIn(GROUP_MATERIAL_REFUSALS, code)
    ?? 'That could not be saved.'
  )
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
    refusalIn(GROUP_REFUSALS, code)
    ?? refusalIn(FOLLOW_UP_REFUSALS, code)
    ?? refusalIn(REFUSALS, code)
    ?? 'That request could not be answered.'
  )
}
