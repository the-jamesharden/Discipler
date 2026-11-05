/**
 * Keeping things from playing behind the onboarding modal (Exponential launch, ticket
 * 27). The setup bar's confetti, its badge and the unpaired pop-up all play as a page
 * mounts and are then marked as seen, so behind the modal an Admin would lose them.
 *
 * Asked of the page and not passed down, because those three sit in different places and
 * two of them are in the shell, which knows nothing of this page's address.
 */

const THE_WINDOW = '.onb-bg'
const CLOSED = 'discipler:onboarding-closed'

/**
 * Runs `then` now, or when the modal closes if it is open. Returns what stops it waiting.
 * The modal comes in the same answer from the server as whatever is asking, so it is
 * already on the page by the time anybody's effect runs.
 */
export const afterOnboardingCloses = (then: () => void): (() => void) => {
  if (!document.querySelector(THE_WINDOW)) {
    then()
    return () => undefined
  }
  document.addEventListener(CLOSED, then, { once: true })
  return () => document.removeEventListener(CLOSED, then)
}

export const sayOnboardingClosed = () => document.dispatchEvent(new Event(CLOSED))
