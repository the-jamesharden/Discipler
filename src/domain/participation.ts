/**
 * Participation Status is person-level and answers exactly one question: *is this
 * person being discipled*. It is derived from Intake, consent and open participant
 * memberships -- never stored as a flag, never set by the importer, and never set
 * by leading a relationship. A Person leading two relationships and being discipled
 * by nobody reads `Ready to Pair`.
 *
 * The derivation itself is one SQL function, because every input to it lives in the
 * database and a copy of the rule in application code is a second answer waiting to
 * disagree with the first. What lives here is the vocabulary: the four values, and
 * the wording a screen shows for each.
 */
export type ParticipationStatus =
  | 'no_intake_submitted'
  | 'ready_to_pair'
  | 'paired'
  | 'opted_out'

export const PARTICIPATION_STATUSES: readonly ParticipationStatus[] = [
  'no_intake_submitted',
  'ready_to_pair',
  'paired',
  'opted_out',
]

export const isParticipationStatus = (value: unknown): value is ParticipationStatus =>
  PARTICIPATION_STATUSES.includes(value as ParticipationStatus)
