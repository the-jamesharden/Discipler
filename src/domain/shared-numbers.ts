/**
 * The shared numbers: one set of Discipler-owned numbers every church sends from
 * (Exponential launch, ticket 06). Each (phone, church) is given one of them the
 * first time that church texts that phone and keeps it, and a phone in two
 * churches hears from a different number for each, so its replies never mix and a
 * `STOP` to one church leaves the other running. Which number is given is the
 * database's to decide (`app.sending_number_for`), because only it can see every
 * church's assignments at once.
 *
 * What is decided here is when the set is running near capacity, which is what
 * support@ is told about so a number is added when volume needs one, not when a
 * church signs up.
 */

/**
 * How many (phone, church) pairs one shared number is meant to carry. Not a limit
 * anything enforces -- a number past it still sends -- but the load at which another
 * number is wanted. Two hundred is the long-standing per-number guidance for a long
 * code, kept here as the conservative reading while the launch runs on a Low Volume
 * registration; a check-in day texts each pair a few times.
 */
export const RECIPIENTS_PER_SHARED_NUMBER = 200

/**
 * How full the set is when support@ is told: four in five, so a number can be
 * bought and added before the last fifth is used.
 */
export const NEAR_CAPACITY_SHARE = 0.8

/** What the database knows about the shared set, across every church. */
export interface SharedNumberLoad {
  /** The numbers in the shared set. */
  readonly numbers: number
  /** Every (phone, church) pair given a number so far. */
  readonly recipients: number
  /** The most churches any one phone has been given a number for. */
  readonly mostChurchesOnOnePhone: number
}

/**
 * The two ways the set runs out. `recipients`: the numbers carry most of what they
 * are meant to. `one_phone`: the person in the most churches has one number left
 * that none of their churches has used, and a phone needs a different number for
 * every church that texts it.
 */
export type CapacityConcern = 'recipients' | 'one_phone'

export const capacityConcerns = (load: SharedNumberLoad): readonly CapacityConcern[] => {
  const concerns: CapacityConcern[] = []

  if (load.recipients >= load.numbers * RECIPIENTS_PER_SHARED_NUMBER * NEAR_CAPACITY_SHARE) {
    concerns.push('recipients')
  }

  // Only once somebody has a number at all: an empty set is the first concern's.
  if (load.mostChurchesOnOnePhone > 0 && load.numbers - load.mostChurchesOnOnePhone <= 1) {
    concerns.push('one_phone')
  }

  return concerns
}
