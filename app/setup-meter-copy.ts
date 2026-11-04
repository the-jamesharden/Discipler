import { SETUP_STEPS, type SetupMeter, type SetupStep } from '~/domain/setup-meter'
import { IMPORT_DIALOG_ID } from './roster/import-copy'
import { DAYS, hourLabel } from './settings/copy'

/**
 * Everything the setup meter says, and where each of its buttons goes
 * (`.scratch/exponential-launch/issues/26-the-setup-meter-and-the-badge.md`, in the
 * words `.lavish/onboarding/build.mjs` draws).
 *
 * **A step's button shows the moment it has an address, as the top nav's items do
 * (`./top-nav-menus`), so no control goes nowhere.** Tickets 27 and 28 each set one
 * line below, and record their fact with `tourFinished` or `testCheckInSent` from
 * `~/domain/setup-meter`, and nothing else about the bar changes.
 *
 * Until then those two steps are listed with no button, and "Next:" passes over them:
 * a step nobody can do yet is not the next thing to do.
 *
 * Here rather than in the client component that draws them: a server page cannot read
 * a constant out of a client module.
 */

interface StepCopy {
  readonly words: string
  readonly button: string
  /** Where the button goes, or null while there is nowhere yet. */
  readonly href: string | null
}

const STEP_COPY: Record<SetupStep, StepCopy> = {
  check_in_time: { words: 'Confirm your check-in time', button: 'Edit settings', href: '/settings#check-in' },
  tour: { words: 'Take the 2-minute tour', button: 'Start the tour', href: null }, // Ticket 27.
  test_check_in: { words: 'Send yourself a test check-in', button: 'Send test', href: null }, // Ticket 28.
  roster: { words: 'Add people to your Roster', button: 'Add people', href: `/roster#${IMPORT_DIALOG_ID}` },
  intake: { words: 'Get your first Intake back', button: 'Share your link', href: '/intake-forms' },
  // The empty Overview says the same: "Pair someone from the Roster to begin."
  relationship: { words: 'Create your first relationship', button: 'Pair someone', href: '/roster' },
  // The Roster says who is awaiting acceptance from the first day. Follow-Up only does
  // once `ACCEPTANCE_ESCALATION_DAYS` have passed, and would show nothing until then.
  accepted: { words: 'First relationship accepted', button: 'See who is waiting', href: '/roster' },
}

export const SETUP_TITLE = 'Jumpstart discipleship'

export const setupPercent = (done: number): number => Math.round((done / SETUP_STEPS.length) * 100)

export const setupCount = (done: number): string =>
  `${setupPercent(done)}% complete · ${done} of ${SETUP_STEPS.length}`

export interface SetupStepView {
  readonly step: SetupStep
  readonly words: string
  readonly done: boolean
  /** The button's words and address. Null for a done step, and for one with nowhere to go yet. */
  readonly action: { readonly button: string; readonly href: string } | null
}

/** What the bar and the badge draw, as plain values a client component can be handed. */
export interface SetupMeterView {
  readonly count: string
  readonly filled: number
  readonly steps: readonly SetupStepView[]
  /** The first step not done that can be acted on, or null where none can be. */
  readonly next: SetupStep | null
  readonly unseen: readonly SetupStep[]
  readonly badge: { readonly title: string; readonly body: string; readonly thanks: string } | null
}

export const setupMeterView = (
  meter: SetupMeter & { readonly shown: true },
  ministryName: string,
): SetupMeterView => {
  const steps = SETUP_STEPS.map((step): SetupStepView => {
    const { words, button, href } = STEP_COPY[step]
    const done = meter.done.includes(step)
    return { step, words, done, action: !done && href !== null ? { button, href } : null }
  })
  const finished = meter.done.length === SETUP_STEPS.length
  const day = DAYS.find((known) => known.value === meter.checkIn.day)?.label ?? ''

  return {
    count: setupCount(meter.done.length),
    filled: (meter.done.length / SETUP_STEPS.length) * 100,
    steps,
    next: steps.find((step) => step.action !== null)?.step ?? null,
    unseen: meter.unseen,
    badge: finished
      ? {
          title: `${ministryName} is up and running`,
          body: `All seven steps are done, and your first relationship has been accepted. Check-ins go out every ${day} at ${hourLabel(meter.checkIn.hour)}.`,
          thanks: 'Thank you!',
        }
      : null,
  }
}
