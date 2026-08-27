import type { MinistryId, PersonId } from './ids'

/**
 * Every external trigger enters through this one boundary, and this union is the
 * complete list of ways the world can change something. The spec names the full
 * set: Intake submitted, Person imported, relationship created, relationship
 * cancelled, Leader accepted, inbound SMS received, Admin action taken, and the
 * scheduled tick.
 *
 * Each command arrives with the ticket that gives it behaviour, rather than being
 * stubbed out ahead of the rules it is supposed to enforce.
 */
export type Command =
  | {
      readonly type: 'scheduled.tick'
      readonly ministryId: MinistryId
    }
  /**
   * The spreadsheet itself is the payload, unread. Reading it is a rule about what
   * Discipler will accept as a Person -- a name, a number it can text -- and that
   * belongs on the same side of the boundary as every other rule, where it is
   * driven by tests with no upload anywhere near it.
   */
  | {
      readonly type: 'person.import'
      readonly ministryId: MinistryId
      readonly csv: string
    }
  /**
   * One command for all three pairing routes -- accepting a suggestion, pairing two
   * people from the Roster, selecting several people together. They differ in how
   * the Admin arrived at the names, which is a property of the screen and not of
   * the relationship being formed.
   */
  | {
      readonly type: 'relationship.create'
      readonly ministryId: MinistryId
      readonly leaderId: PersonId
      readonly participantIds: readonly PersonId[]
    }
