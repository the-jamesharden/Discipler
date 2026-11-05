import { SETUP_STEPS, type SetupMeter } from './setup-meter'

/**
 * What one Admin's onboarding modal needs (Exponential launch, ticket 27), which comes
 * with the page's one read as a part of the setup meter's answer.
 *
 * `opened` is the only thing kept about the modal, on the Admin's membership: it decides
 * whether their next Overview opens it, with the welcome video. Everything else here is
 * the church's own settings, so the modal's words follow them.
 */
export interface Onboarding {
  readonly opened: boolean
  readonly checkIn: { readonly day: number; readonly hour: number }
  readonly leaderNoun: string
  readonly participantNoun: string
  /** What the church's texts open with: "{this} via Discipler:". */
  readonly readsAs: string
}

const present = <T>(value: T | null | undefined, field: string): T => {
  if (value === null || value === undefined) throw new Error(`The onboarding part of the page has no ${field}`)
  return value
}

/** The `setup` part of a page's document (`app.setup_meter_of`). */
export const onboardingOf = (row: Readonly<Record<string, unknown>>): Onboarding => {
  const part = present(row.onboarding, 'onboarding') as Readonly<Record<string, unknown>>
  return {
    opened: present(part.opened, 'opened') === true,
    checkIn: { day: present(part.day, 'day') as number, hour: present(part.hour, 'hour') as number },
    leaderNoun: present(part.leader_noun, 'leader noun') as string,
    participantNoun: present(part.participant_noun, 'participant noun') as string,
    readsAs: present(part.reads_as, 'name its texts read as') as string,
  }
}

/**
 * How many of the seven steps the church has done. An Admin who has seen the badge is
 * told nothing else by the meter, because the bar is gone for them, and they have seen
 * it because all seven are done.
 */
export const stepsDoneOf = (meter: SetupMeter): number =>
  meter.shown ? meter.done.length : SETUP_STEPS.length

/** Whether the church has finished the tour, which the modal's first card shows. */
export const tourIsDone = (meter: SetupMeter): boolean => !meter.shown || meter.done.includes('tour')

/** Whether the church has sent a test check-in, which the modal's second card shows. */
export const testCheckInIsDone = (meter: SetupMeter): boolean =>
  !meter.shown || meter.done.includes('test_check_in')
