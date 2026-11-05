/**
 * The setup videos: short Loom or YouTube videos the team records, listed on the
 * Setup videos help page in this order (`.scratch/exponential-launch/spec.md`,
 * "Search, nav and Settings"). Adding one is adding a line here.
 *
 * Empty until the first is recorded, and the page says so rather than showing an
 * empty list. The welcome video the onboarding plays is listed here too once it
 * exists.
 */
export interface SetupVideo {
  readonly title: string
  /** Where it plays: a Loom or YouTube address. */
  readonly url: string
}

/**
 * James's welcome video, which plays inside the onboarding modal the first time it opens
 * for an Admin (Exponential launch, ticket 27). A Loom or YouTube address, or one that
 * ends in a video file.
 *
 * Empty until it is recorded, and while it is empty the modal opens straight to its
 * cards. The repo is public, so this address is too.
 */
export const WELCOME_VIDEO_URL: string = ''

export const WELCOME_VIDEO_TITLE = 'A welcome from James'

export const SETUP_VIDEOS: readonly SetupVideo[] = WELCOME_VIDEO_URL
  ? [{ title: WELCOME_VIDEO_TITLE, url: WELCOME_VIDEO_URL }]
  : []
