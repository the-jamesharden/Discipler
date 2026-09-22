import type { Tier } from '~/domain/suggestions'

/**
 * What the Suggested Pairs tab says. The wording is the design prototype's
 * (`.scratch/core-operating-loop/design/discipler-dashboard-v10.html`), with the
 * Roster's words for the two sides in place of its *Mentor* and *Mentee*.
 *
 * The reason on each card is not here: it is written by the ranking, which is the
 * only place a reason can be made (ADR-0001).
 */
export const SUGGESTED_PAIRS = 'Suggested pairs'
export const ONE_TO_ONE_ONLY =
  'One-to-one only. Relationships with more than one participant are formed manually.'
export const NO_SUGGESTIONS = 'No suggestions right now.'

/** The three labels, and no number beside any of them. */
export const TIER_LABEL: Record<Tier, string> = {
  excellent: 'Excellent fit',
  good: 'Good fit',
  recommended: 'Recommended',
}

export const LEADS = 'Discipler'
export const IS_LED = 'Disciple'

/** Opens the Pair popup with both people chosen: the Admin still forms it there. */
export const CREATE_RELATIONSHIP = 'Create relationship'

export const NO_SCHEDULE_OVERLAP = 'No Schedule Overlap'
export const NO_SCHEDULE_OVERLAP_NOTE =
  'These people share no availability with any eligible leader, so they cannot be ranked. Listed for visibility, not as a fit — you can still pair them manually.'
export const PAIR = 'Pair'

/** `Intake Sep 1`, beside a name on the No Schedule Overlap list. */
export const intakeOn = (date: string): string => `Intake ${date}`
