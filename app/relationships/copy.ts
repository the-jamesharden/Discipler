import type { DayBlock, Weekday } from '~/domain/intake'

/**
 * The Leader Dashboard's wording, kept beside the page that renders it for the
 * reason every other `copy.ts` in this app is: a sentence a Leader reads is
 * changed in one place, and a screen never assembles one out of fragments that
 * cannot be searched for.
 */

/** The axes, spelled the way a person says them rather than the way they are stored. */
export const weekdayLabel: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/**
 * Named blocks, not clock times. A person answering *when could you meet* is
 * describing the shape of their day and not committing to an hour, so a label that
 * said "6-9am" would be promising a precision the answer does not have. See
 * `docs/adr/0006-the-availability-grid.md`.
 */
export const dayBlockLabel: Record<DayBlock, string> = {
  early_morning: 'Early morning',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

/** The short form for the column headings, where the full one will not fit. */
export const dayBlockShortLabel: Record<DayBlock, string> = {
  early_morning: 'Early',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

export const slotLabel = (day: Weekday, block: DayBlock): string =>
  `${weekdayLabel[day]} ${dayBlockLabel[block].toLowerCase()}`

/**
 * What the grid says about the slot it highlights, and about the case where it has
 * nothing to highlight.
 *
 * Both sentences end the same way on purpose. Discipler suggests and the Leader
 * decides -- it does not book a time, send an invitation, or hold a slot -- so
 * every wording here has to read as a starting point rather than as an arrangement
 * somebody has already made.
 */
export const overlaySummary = (args: {
  readonly recommended: string | null
  readonly everyoneCanMeet: boolean
  /** How many other people are on the grid -- a co-leader counts like anybody else. */
  readonly otherCount: number
}): string => {
  if (args.otherCount === 0) {
    return 'Nobody else is currently in this relationship.'
  }

  if (!args.recommended) {
    return args.otherCount === 1
      ? 'No slot works for both of you. Their availability is on the grid, and you can still reach out about a time.'
      : 'No slot works for you and anybody here. Everyone’s availability is on the grid, and you can still reach out about a time.'
  }

  if (!args.everyoneCanMeet) {
    return args.otherCount === 1
      ? `${args.recommended} is your best overlap.`
      : `${args.recommended} is your best overlap, but no slot works for everyone including you. You choose the time.`
  }

  return `${args.recommended} works for everyone including you. You choose the time and send the invitation.`
}

/**
 * Why a number is not on the screen. One sentence for four states -- declined,
 * withdrawn, never asked, no number on file -- because a Leader who could tell them
 * apart would be reading a consent decision by inference.
 */
export const numberWithheld = 'Number not shared'

export const kindLabel = {
  one_to_one: 'One-to-one',
  group: 'Group',
} as const

/** The mark a paused relationship carries for the whole pause. */
export const pausedLabel = 'Paused'

export const pausedExplanation =
  'Weekly check-ins are paused for this relationship. Everyone is still in it, and nothing has ended.'

export const noMaterial = 'No material assigned yet'

export const emptyDashboard =
  'You are not currently leading any relationships. When an admin pairs you with someone, you will be sent a link.'
