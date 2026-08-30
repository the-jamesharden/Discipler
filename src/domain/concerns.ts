import type { CheckInPromptId } from './check-in'
import type { ConcernId, MinistryId, PersonId, RelationshipId } from './ids'

/**
 * A Concern is a Leader saying, in their own words, that something is wrong. It
 * is the most sensitive text in the product and is treated differently from every
 * other record because of it.
 *
 * Four properties, and no other record in Discipler has them: the text is reached
 * one Person at a time rather than in a list, so reading it takes deliberate
 * effort; it is cleared when resolved, with no way to keep it, so a Ministry
 * does not accumulate a permanent file of people's hardest weeks; *viewing* is audited as
 * well as resolving; and several outstanding on one relationship show as a count.
 *
 * Which is why this is not a `follow_up_item`. Nothing in that table shares any of
 * the four, and clear-on-resolve is a destructive update that has no business
 * sitting beside durable admin records. Care Needed unions the two.
 *
 * A Concern is also not a state. `Needs Care` is the state, it lasts the week the
 * Concern was raised in, and the badge outlives it -- a relationship can read
 * Healthy, or Stalled weeks later, with unresolved Concerns standing beside it.
 */
export interface NewConcern {
  readonly id: ConcernId
  readonly ministryId: MinistryId
  readonly relationshipId: RelationshipId
  /**
   * Who raised it. The Leader answering `C` today; recorded rather than assumed,
   * because a Participant check-in would raise one the same way and the two must
   * be tellable apart without reading the prose.
   */
  readonly raisedBy: PersonId
  readonly raisedAt: Date
  /**
   * The reply that carried the words. Recorded because the prompt row keeps the
   * raw reply as it arrived, so it holds a second copy of the same prose -- and
   * clearing one while the other stands is a gesture rather than a rule. This is
   * how the resolution finds it.
   */
  readonly promptId: CheckInPromptId
  /** The Leader's own words, unparsed. Never in a history payload. */
  readonly detail: string
}

/**
 * An Admin opening one Concern's text.
 *
 * Recorded because reading it is an act. Every other read in Discipler is
 * invisible and this one is not: a Ministry should be able to answer who read what
 * somebody said about their marriage, and the answer must not be *we do not keep
 * that*. Recorded per viewing rather than as a flag, because the second Admin to
 * read it is a fact as much as the first.
 */
export interface ConcernViewing {
  readonly ministryId: MinistryId
  readonly concernId: ConcernId
  /** The Admin's account, as the session named it. */
  readonly viewedBy: string
  readonly viewedAt: Date
}

/**
 * An Admin closing one, which is the only thing that closes one. A Concern never
 * clears itself and no answered check-in clears it -- that is the whole difference
 * between a badge and the derived Stalled state beside it.
 *
 * Resolving clears the Leader's words. There is no field for keeping them and no
 * caller that may ask: a Ministry does not accumulate a permanent file of people's
 * hardest weeks, and an exception nobody can take is the only kind that cannot be
 * taken by habit. The Concern itself is never deleted -- how many were raised and
 * how fast they closed stay answerable. What goes is the prose, and nothing else.
 */
export interface ConcernResolution {
  readonly ministryId: MinistryId
  readonly concernId: ConcernId
  /** The Admin's account, as the session named it. */
  readonly resolvedBy: string
  readonly resolvedAt: Date
}
