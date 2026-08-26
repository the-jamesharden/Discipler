import type { MinistryId } from './ids'

/**
 * Every external trigger enters through this one boundary, and this union is the
 * complete list of ways the world can change something. The spec names the full
 * set: Intake submitted, Person imported, relationship created, relationship
 * cancelled, Leader accepted, inbound SMS received, Admin action taken, and the
 * scheduled tick.
 *
 * The walking skeleton carries only the tick. Each remaining command arrives with
 * the ticket that gives it behaviour, rather than being stubbed out ahead of the
 * rules it is supposed to enforce.
 */
export type Command = {
  readonly type: 'scheduled.tick'
  readonly ministryId: MinistryId
}
