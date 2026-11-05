/**
 * Where the onboarding lives (Exponential launch, ticket 27). On its own because the top
 * nav and the setup bar, which both send people here, reach the browser, and the modal
 * and everything it reads should not.
 */

/** What `?onboarding=` says when Restart onboarding, or the end of the tour, asks for the modal. */
export const RESTARTED = 'cards'

/** The modal, straight to its cards. */
export const RESTART_ONBOARDING = `/overview?onboarding=${RESTARTED}`

/** Under `/overview`, so it takes no new top-level name from the churches' short names. */
export const TOUR_ADDRESS = '/overview/tour'
export const TOUR_DONE_ADDRESS = '/overview/tour/done'
