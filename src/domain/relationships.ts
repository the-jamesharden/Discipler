import type { Gender } from './intake'
import type { MinistryId, PersonId, RelationshipId } from './ids'

/**
 * M Leaders and N Participants. A one-to-one is two people -- one Leader, one
 * Participant -- and anything else is a group. There is no separate group entity and
 * no group code path: message copy and state derivation both read how many
 * Participants a relationship has *now*, never the kind recorded when it was formed.
 */

export type RelationshipKind = 'one_to_one' | 'group'

export const MEMBER_ROLES = ['leader', 'participant'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

/**
 * The check an adapter makes before it believes a role that came out of a query.
 * Beside the type rather than in whichever file happened to need it first, the same
 * shape `participation.ts` uses for the four statuses: a role this product does not
 * recognise must not be rendered as one it does.
 */
export const isMemberRole = (value: unknown): value is MemberRole =>
  MEMBER_ROLES.includes(value as MemberRole)

export interface NewMembership {
  readonly personId: PersonId
  readonly role: MemberRole
  readonly startedAt: Date
}

export interface NewRelationship {
  readonly id: RelationshipId
  readonly ministryId: MinistryId
  /**
   * A capacity declaration, fixed at formation and immutable afterwards. Read by the
   * participation-cap constraints, by the absolute gender match -- which binds the
   * two people in a one-to-one -- by the pairing scorer, and by nothing else.
   * `declaredGender` below is the other half of the gender rule and reads no kind at
   * all. See docs/adr/0004-relationship-kind-as-capacity-declaration.md.
   */
  readonly kind: RelationshipKind
  /**
   * The gender every member of this relationship must be, or null where it declares
   * none. Null is *mixed*, and it is also what a one-to-one carries when nobody was
   * asked -- a one-to-one's gender is implied by the two people in it, and the
   * absolute match between them is a separate rule that binds either way.
   *
   * Immutable after creation, for the reason `kind` is. Read by the constraint that
   * enforces it and by nothing else.
   */
  readonly declaredGender: Gender | null
  /**
   * What the Ministry calls this group, or null for a one-to-one, which is called
   * by the two people in it. Required of a group at the boundary and editable
   * afterwards: a name is a label, not a ministry event, so changing it overwrites
   * no history. It is what the group Intake link offers and what the weekly
   * check-in asks about.
   */
  readonly name: string | null
  /**
   * Whether picking this group on the Intake form asks to join rather than joins.
   * Off unless the Admin says otherwise, and editable afterwards, because it is the
   * pastor's switch and not a safety binding. Meaningless on a one-to-one, which
   * the group link never offers, and false there.
   */
  readonly joinRequiresApproval: boolean
  readonly createdAt: Date
  readonly members: readonly NewMembership[]
}

/**
 * Derived once, at formation, and frozen. A one-to-one is one Leader and one
 * Participant; every other shape is a group, including two Leaders over a single
 * Participant. Deriving it from the Participant count alone would have called that
 * shape a one-to-one, and a one-to-one holds exactly one Leader -- so the
 * relationship would have been refused by the cap that describes it.
 */
export const kindFor = (leaderCount: number, participantCount: number): RelationshipKind =>
  leaderCount === 1 && participantCount === 1 ? 'one_to_one' : 'group'

/**
 * Whether the Admin forming this relationship has to say what gender it is.
 *
 * Two people imply it: a one-to-one is a men's relationship or a women's one by
 * virtue of who is in it, the absolute match enforces that whatever was declared,
 * and asking would be asking somebody to retype what they just selected. Every
 * other shape has to be told, because *this is a women's group that currently has
 * one member* is a true thing about a group that nothing in its membership says.
 *
 * Beside `kindFor` because it is the same question asked once more: this file is
 * the one place permitted to know what a kind is, and a caller branching on the
 * literal would be the fence break ADR-0004 exists to stop.
 */
export const needsAGenderDeclaration = (
  leaderCount: number,
  participantCount: number,
): boolean => kindFor(leaderCount, participantCount) !== 'one_to_one'

/**
 * Whether the Admin forming this relationship has to name it. The same shapes that
 * declare a gender: a one-to-one is called by the two people in it and is never
 * offered on the group link, so it has nothing a name would be for. Asked here
 * beside its sibling for the reason that one is -- this file is the one place
 * permitted to know what a kind is.
 */
export const needsAName = needsAGenderDeclaration

/**
 * What the boundary accepts as a group's name: something, once trimmed. The
 * database carries the same rule as `relationship_name_is_not_blank`.
 */
export const readGroupName = (raw: string | null | undefined): string | null => {
  const name = raw?.trim() ?? ''
  return name === '' ? null : name
}

/**
 * The two thresholds a relationship nobody has accepted crosses, both measured
 * from when it was created -- never from when any one Leader was invited -- and
 * both evaluated by the scheduled tick.
 *
 * They are an escalation, not two copies of the same message. At two days the
 * Leader is reminded, because the likeliest reason nothing has happened is a text
 * that scrolled away. At five days it stops being their problem to solve and
 * surfaces to an Admin, who can chase them or cancel it -- and the item stays up
 * until the Admin acts, which a second text to the Leader would not.
 */
export const ACCEPTANCE_REMINDER_DAYS = 2
export const ACCEPTANCE_ESCALATION_DAYS = 5

/**
 * How a relationship finished. Exactly two values, deliberately: *did this
 * complete or break down* is a binary question a Ministry asks in counts, and a
 * third value invites a taxonomy nobody has agreed -- after which every row
 * written before it was added is unclassifiable.
 *
 * It stands beside the free-text reason rather than replacing it. The reason is
 * what happened in the Ministry's own words; this is the part that can be counted.
 */
export type RelationshipOutcome = 'completed' | 'discontinued'

export const RELATIONSHIP_OUTCOMES: readonly RelationshipOutcome[] = [
  'completed',
  'discontinued',
]

/**
 * Checked, not trusted. The union above is a compile-time guard and an ending
 * command is built from a request body, so nothing between the two has actually
 * looked at the word -- and the database, which holds this as an enum, would
 * refuse a stranger as a Postgres error rather than as a refusal a surface can
 * render.
 */
export const isRelationshipOutcome = (value: unknown): value is RelationshipOutcome =>
  RELATIONSHIP_OUTCOMES.includes(value as RelationshipOutcome)
