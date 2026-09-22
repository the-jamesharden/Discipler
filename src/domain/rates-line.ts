import type { OutboundMessageDraft } from './effects'
import type { PersonId } from './ids'
import { carriesRatesLine, withoutRatesLine } from './outbound-copy'
import { calendarMonthOf } from './week'

/**
 * **The rates line, once a month** (Text wording, ticket 01; James, 2026-09-21).
 * *Msg & data rates may apply. Reply STOP to opt out, HELP for help.* reaches a
 * Person at most once in a calendar month, on the first text of that month that
 * would carry it, and is left off the rest.
 *
 * Which texts *may* carry it is the copy's to say, and is unchanged: the ones that
 * compose it. Whether one *does* is decided here, once every text a command queues
 * is known, because the answer depends on what else is going to the same Person --
 * in this command and earlier in the month -- and no single composer can see that.
 */

/**
 * What a text says about the line, stated by whoever queues it.
 *
 * `always` -- the Welcome Message, which is first contact and the opt-in receipt,
 *   and the `HELP` response, whose whole purpose is saying how to make it stop.
 *   Carriers ask for the line on both however recently it was sent, so the month
 *   never takes it off; each still counts as the Person having had it.
 * `once_a_month` -- everything else that composes it: the Starter Messages, the
 *   group-joined text, a resume, a check-in's opening question.
 * `never` -- a text composed without it.
 */
export type RatesLineOccasion = 'always' | 'once_a_month' | 'never'

/**
 * What the queue remembers, for the Persons a command is about to text: when each
 * was last queued a text carrying the line that has not been withheld, and the
 * Ministry's clock, which says which month that was.
 *
 * A Person absent from the map has never had it, or had it only on texts that were
 * withheld at send time and so never read.
 */
export interface RatesLineHistory {
  readonly timeZone: string
  readonly lastCarriedAt: ReadonlyMap<PersonId, Date>
}

/**
 * A text as the queue stores it: the words it will actually send, and the fact of
 * whether they carry the line, which is what the next month's decision reads.
 */
export type SettledMessage = Omit<OutboundMessageDraft, 'ratesLine'> & {
  readonly carriesRatesLine: boolean
}

/**
 * The month is the Ministry's, not UTC's -- the same month the check-in rule
 * always used. A Sydney ministry texting at 9am local on the 1st is at 23:00 UTC
 * on the last day of the month before, and resolving in UTC would put the 1st's
 * text in the month the Person already had the line in.
 */
export const ratesLineIsDue = (
  lastCarriedAt: Date | null,
  at: Date,
  timeZone: string,
): boolean =>
  lastCarriedAt === null || calendarMonthOf(lastCarriedAt, timeZone) !== calendarMonthOf(at, timeZone)

/**
 * Whose history a command's texts need read before they can be settled. Only the
 * Persons with a text that may be left off: an `always` text needs no history to
 * decide, and a text to nobody on the Roster has none to read.
 */
export const whoseRatesLineIsAsked = (
  drafts: readonly OutboundMessageDraft[],
): readonly PersonId[] => [
  ...new Set(
    drafts.flatMap((draft) =>
      draft.ratesLine === 'once_a_month' && draft.personId !== null ? [draft.personId] : [],
    ),
  ),
]

const later = (a: Date | undefined, b: Date): Date => (a && a.getTime() > b.getTime() ? a : b)

/**
 * Every text a command queues, settled against what the Person has already had.
 *
 * **Per Person, not per relationship.** A Leader of three relationships has one
 * phone and reads one line a month, whichever relationship's text reaches them
 * first.
 *
 * **Once between the texts of one command.** An `always` text anywhere in the
 * command counts before any `once_a_month` one is decided, so a Person sent both in
 * one act reads the line once rather than twice seconds apart. Among the
 * `once_a_month` texts the first in the command carries it, which is the first the
 * queue sends.
 *
 * A text to nobody on the Roster keeps it: there is no Person to have had it, and
 * leaving a disclosure off on a guess is the one wrong answer here that matters.
 *
 * A draft whose words do not agree with what it says about the line is refused
 * outright, because the fact recorded on the row would then be false.
 */
export const settleRatesLine = (
  drafts: readonly OutboundMessageDraft[],
  history: RatesLineHistory,
): readonly SettledMessage[] => {
  for (const draft of drafts) {
    const composedWithIt = carriesRatesLine(draft.body)
    if (composedWithIt !== (draft.ratesLine !== 'never')) {
      throw new Error(
        `A text says it is '${draft.ratesLine}' for the rates line and was composed ${composedWithIt ? 'with' : 'without'} it`,
      )
    }
  }

  const had = new Map(history.lastCarriedAt)
  for (const draft of drafts) {
    if (draft.ratesLine === 'always' && draft.personId !== null) {
      had.set(draft.personId, later(had.get(draft.personId), draft.enqueuedAt))
    }
  }

  return drafts.map(({ ratesLine, ...draft }): SettledMessage => {
    if (ratesLine === 'never') return { ...draft, carriesRatesLine: false }
    if (ratesLine === 'always' || draft.personId === null) {
      return { ...draft, carriesRatesLine: true }
    }

    const due = ratesLineIsDue(had.get(draft.personId) ?? null, draft.enqueuedAt, history.timeZone)
    if (!due) return { ...draft, body: withoutRatesLine(draft.body), carriesRatesLine: false }

    had.set(draft.personId, later(had.get(draft.personId), draft.enqueuedAt))
    return { ...draft, carriesRatesLine: true }
  })
}
