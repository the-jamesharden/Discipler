/**
 * The setup videos: short Loom or YouTube videos the team records, listed on the
 * Setup videos help page in this order (`.scratch/exponential-launch/spec.md`,
 * "Search, nav and Settings"). Adding one is adding a line here.
 *
 * Empty until the first is recorded, and the page says so rather than showing an
 * empty list. The welcome video the onboarding plays is listed here too once it
 * exists (ticket 27).
 */
export interface SetupVideo {
  readonly title: string
  /** Where it plays: a Loom or YouTube address. */
  readonly url: string
}

export const SETUP_VIDEOS: readonly SetupVideo[] = []
