import { isUsPhone } from './phone-check'
import type { PhoneNumber } from './roster'
import type { NewHistoryEvent } from './history'
import type { MinistryId } from './ids'

/**
 * The setup meter: seven steps that say how far a church has got with Discipler
 * (`.scratch/exponential-launch/spec.md`, "Setup meter and onboarding").
 *
 * **It belongs to the church and is read from what the church has stored.** No step
 * is a counter or a flag: each is the question "does this church's history hold this
 * fact?", asked afresh by `app.setup_meter_of` on every page, and history only grows,
 * so a step cannot be undone by ending a relationship or removing a person. Which of
 * those steps an Admin has already watched tick is the one thing kept per Admin, on
 * their membership, because it says nothing about the church.
 *
 * What each step reads is in the migration
 * (`supabase/migrations/20261104102600_the_setup_meter.sql`), beside the reads.
 */

/** In the order the bar draws them. The names are what the database stores as seen. */
export const SETUP_STEPS = [
  'check_in_time',
  'tour',
  'test_check_in',
  'roster',
  'intake',
  'relationship',
  'accepted',
] as const

export type SetupStep = (typeof SETUP_STEPS)[number]

/**
 * The three facts nothing recorded before the meter, as `ministry_event` types.
 *
 * Tickets 27 and 28 have only to append theirs, with `tourFinished` and
 * `testCheckInSent` below: the meter reads them already, and the bar's buttons appear
 * with one line in `app/setup-meter-copy.ts`. An event rather than ticket 28's own
 * table, so that the meter names nothing that does not exist yet.
 */
export const SETUP_HISTORY = {
  /** Settings saved with nothing changed. A save that changes something says `ministry.settings_changed`. */
  checkInTimeConfirmed: 'setup.check_in_time_confirmed',
  /** An Admin pressed Done on the tour's last step. Leaving it early records nothing. */
  tourFinished: 'setup.tour_finished',
  /** An Admin sent themselves a test check-in. */
  testCheckInSent: 'setup.test_check_in_sent',
} as const

/** For ticket 27, when an Admin presses Done on the tour's last step. */
export const tourFinished = ({
  ministryId,
  finishedBy,
  at,
}: {
  readonly ministryId: MinistryId
  readonly finishedBy: string
  readonly at: Date
}): NewHistoryEvent => ({
  ministryId,
  occurredAt: at,
  type: SETUP_HISTORY.tourFinished,
  subjectType: 'ministry',
  subjectId: ministryId,
  payload: { finishedBy },
})

/** For ticket 28, when an Admin sends themselves a test check-in. */
export const testCheckInSent = ({
  ministryId,
  sentBy,
  at,
}: {
  readonly ministryId: MinistryId
  readonly sentBy: string
  readonly at: Date
}): NewHistoryEvent => ({
  ministryId,
  occurredAt: at,
  type: SETUP_HISTORY.testCheckInSent,
  subjectType: 'ministry',
  subjectId: ministryId,
  payload: { sentBy },
})

/** Where one Admin stands with their church's meter. */
export type SetupMeter =
  /** They have seen the badge, so the bar is gone for good for them. */
  | { readonly shown: false }
  | {
      readonly shown: true
      /** Every step the church has done, in the bar's order. */
      readonly done: readonly SetupStep[]
      /** Those this Admin has not yet watched tick. */
      readonly unseen: readonly SetupStep[]
      /** The church's check-in day and hour, for the badge's words. */
      readonly checkIn: { readonly day: number; readonly hour: number }
    }

/** A step's answer read as a boolean only when it is one: a missing step is not an undone one. */
const stepsDone = (done: Readonly<Record<string, unknown>>): readonly SetupStep[] =>
  SETUP_STEPS.filter((step) => {
    const value = done[step]
    if (typeof value !== 'boolean') {
      throw new Error(`The setup meter arrived with no answer for the step ${step}`)
    }
    return value
  })

const wholeNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`The setup meter arrived with no ${field}`)
  }
  return value
}

/**
 * Whether this Admin can never send a test check-in, because their own phone cannot receive
 * a Verify code (`isUsPhone`). Without this a live church with a Canadian Admin would stay
 * below 100% for good (James, 2026-11-05). No phone on file is a thing they can fix, so it
 * does not count. Everybody else's step stays the church's.
 */
const cannotSendATest = (ownPhone: unknown): boolean => {
  if (ownPhone === undefined) throw new Error('The setup meter arrived with no answer for the Admin’s phone')
  if (ownPhone === null) return false
  if (typeof ownPhone !== 'string') throw new Error('The setup meter arrived with a phone that is not a phone')
  return !isUsPhone(ownPhone as PhoneNumber)
}

/** The `setup` part of a page's document (`app.setup_meter_of`). */
export const setupMeterOf = (row: Readonly<Record<string, unknown>>): SetupMeter => {
  if (row.finished === true) return { shown: false }

  const answered = row.done
  if (answered === null || typeof answered !== 'object') {
    throw new Error('The setup meter arrived with no steps')
  }
  if (!Array.isArray(row.seen)) throw new Error('The setup meter arrived with nothing about what was seen')

  const done = stepsDone({
    ...(answered as Readonly<Record<string, unknown>>),
    ...(cannotSendATest(row.own_phone) ? { test_check_in: true } : {}),
  })
  const seen: readonly unknown[] = row.seen

  return {
    shown: true,
    done,
    unseen: done.filter((step) => !seen.includes(step)),
    checkIn: {
      day: wholeNumber(row.day, 'check-in day'),
      hour: wholeNumber(row.hour, 'check-in hour'),
    },
  }
}

/** The comma-separated steps a page says this Admin has now watched tick. */
export const readSeenSteps = (raw: string | null): readonly SetupStep[] => {
  const named = new Set((raw ?? '').split(','))
  return [...named].filter((name): name is SetupStep => (SETUP_STEPS as readonly string[]).includes(name))
}
