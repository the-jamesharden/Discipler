import type { WaitingOnYou } from '~/domain/waiting-on-you'
import { EVERYONE, rosterHref } from '../roster/menu'

/**
 * What the unpaired pop-up says, and where its buttons go (Exponential launch,
 * ticket 29), word for word as mock-up 3 draws it
 * (`.lavish/onboarding/s6-popup.html` and `s6-popup-one.html`). The counts are
 * the domain's (`~/domain/waiting-on-you`); this decides how to say them.
 */

export const WAITING_ON_YOU = {
  head: 'Waiting on you',
  /** What a screen reader calls the card. */
  label: 'People waiting on you',
  dismiss: 'Dismiss',
} as const

/** One line of the card: the count in bold, then the rest of the sentence. */
export interface WaitingLine {
  readonly lead: string
  readonly rest: string
}

export interface WaitingAction {
  readonly label: string
  readonly href: string
  /** The first button is the green one; any after it are the plain ones. */
  readonly primary: boolean
}

/** Pair them opens Suggested Pairs. */
export const PAIR_THEM = { label: 'Pair them', href: '/suggested-pairs' } as const

/**
 * Send Intake links opens the Roster ticked to *Awaiting Intake*: the people
 * whose Participation Status is No Intake Submitted and nobody else, at an
 * address of its own (`./roster/menu`).
 */
export const SEND_INTAKE_LINKS = {
  label: 'Send Intake links',
  href: rosterHref({ ...EVERYONE, pairings: ['awaiting-intake'] }),
} as const

const toPairLine = (count: number): WaitingLine =>
  count === 1
    ? { lead: '1 person is', rest: " ready to pair and isn't in a relationship yet." }
    : { lead: `${count} people are`, rest: " ready to pair and aren't in a relationship yet." }

const awaitingIntakeLine = (count: number): WaitingLine => ({
  lead: count === 1 ? "1 person hasn't" : `${count} people haven't`,
  rest: ' filled in their Intake form yet.',
})

/**
 * The card's lines and buttons: one line for each count above zero, each with
 * its own button, in that order. Only called when somebody is waiting
 * (`isAnybodyWaiting`).
 */
export const theCard = (waiting: WaitingOnYou) => {
  const said = [
    ...(waiting.toPair > 0 ? [{ line: toPairLine(waiting.toPair), action: PAIR_THEM }] : []),
    ...(waiting.awaitingIntake > 0
      ? [{ line: awaitingIntakeLine(waiting.awaitingIntake), action: SEND_INTAKE_LINKS }]
      : []),
  ]
  return {
    lines: said.map(({ line }) => line),
    actions: said.map(({ action }, index): WaitingAction => ({ ...action, primary: index === 0 })),
  }
}
