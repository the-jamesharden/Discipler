import type { ParticipationStatus } from '~/domain/participation'

/**
 * The Roster's wording for a derived status. It lives beside the page that renders
 * it rather than in the domain, for the same reason sign-in failures do: the
 * derivation deals in facts, and the screen decides how to say them.
 */
export const participationStatusLabel: Record<ParticipationStatus, string> = {
  no_intake_submitted: 'No Intake Submitted',
  ready_to_pair: 'Ready to Pair',
  paired: 'Paired',
  opted_out: 'Opted Out',
}
