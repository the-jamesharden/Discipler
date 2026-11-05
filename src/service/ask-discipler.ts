import type { Clock } from '~/domain/clock'
import {
  EXCHANGES_REMEMBERED,
  chatsKeptSince,
  questionsLeftAfter,
  readQuestion,
  spendMonthOf,
} from '~/domain/ask-discipler'
import { AI_GUIDE_QUESTIONS_PER_DAY } from '~/domain/launch-terms'
import { whyNotSent } from './email-sender'
import type { AskDisciplerStore, GuideModel, SupportAlerts } from './ports'

/**
 * From what an Admin typed to what the guide answered (Exponential launch, ticket 31).
 *
 * **A question holds its place before the model is asked, and gives it up if the answer
 * fails.** So thirty questions a day stays thirty however fast they arrive, a failed
 * answer does not count toward them, and no lock is held while a vendor thinks.
 *
 * **What reaches the model is the instructions and the Admin's own chat.** The request
 * has no church's name, Admin's name or Roster row in it to pass on: the IDs here go to
 * the store, and only `instructions`, `history` and `question` go to the model.
 *
 * Logs hold counts and token use, and never what anybody typed or was told.
 */

export type GuideAnswer =
  | { readonly kind: 'answered'; readonly text: string; readonly questionsLeft: number }
  /** The day's questions are used up, and the model was not asked. */
  | { readonly kind: 'limit' }
  /** Nothing to show, and nothing was counted. */
  | { readonly kind: 'failed'; readonly questionsLeft: number | null }

export interface AskDiscipler {
  ask(request: {
    readonly ministryId: string
    readonly userId: string
    readonly sessionId: string
    readonly typed: string
    readonly instructions: string
  }): Promise<GuideAnswer>
  setTucked(request: {
    readonly ministryId: string
    readonly userId: string
    readonly tucked: boolean
  }): Promise<void>
  /** The tick's pass: deletes what has been kept long enough, and says how much. */
  sweep(): Promise<number>
}

export const createAskDiscipler = ({
  store,
  model,
  alerts,
  clock,
}: {
  readonly store: AskDisciplerStore
  readonly model: GuideModel
  readonly alerts: Pick<SupportAlerts, 'askDisciplerSpendStopped'>
  readonly clock: Clock
}): AskDiscipler => {
  /**
   * Support@ hears once a month. Recorded before the email, so a crowd of Admins asking
   * at once sends one; a send that fails takes the record back, so the next question
   * tries again. Never throws: the Admin is being told sorry whatever happens here.
   */
  const tellSupportOnce = async (at: Date): Promise<void> => {
    const month = spendMonthOf(at)
    try {
      if (!(await store.recordSpendStop(month, at))) return
    } catch (error) {
      console.error(`Recording Ask Discipler's spend stop failed: ${error instanceof Error ? error.name : 'unknown'}`)
      return
    }
    try {
      await alerts.askDisciplerSpendStopped({ month })
    } catch (error) {
      console.error(`Telling support Ask Discipler stopped failed: ${whyNotSent(error)}`)
      await store.forgetSpendStop(month).catch(() => undefined)
    }
  }

  return {
    async ask({ ministryId, userId, sessionId, typed, instructions }) {
      const question = readQuestion(typed)
      if (question === null) return { kind: 'failed', questionsLeft: null }

      const asked = await store.holdAPlace({
        ministryId,
        userId,
        sessionId,
        question,
        at: clock.now(),
        most: AI_GUIDE_QUESTIONS_PER_DAY,
        remembering: EXCHANGES_REMEMBERED,
      })
      if (asked === null) return { kind: 'limit' }

      const said = await model.answer({ instructions, history: asked.history, question })

      if (said.outcome !== 'answered') {
        await store.giveUpThePlace({ ministryId, userId, id: asked.id })
        if (said.outcome === 'spent') await tellSupportOnce(clock.now())
        return { kind: 'failed', questionsLeft: questionsLeftAfter(asked.askedToday - 1) }
      }

      await store.keepAnswer({ ministryId, userId, id: asked.id, answer: said.text, at: clock.now() })

      console.info(
        `Ask Discipler answered: ${asked.askedToday} asked today, ${said.usage.inputTokens} tokens in (${said.usage.cachedInputTokens} cached), ${said.usage.outputTokens} out`,
      )

      return { kind: 'answered', text: said.text, questionsLeft: questionsLeftAfter(asked.askedToday) }
    },

    setTucked(request) {
      return store.setTucked(request)
    },

    sweep() {
      return store.deleteAskedBefore(chatsKeptSince(clock.now()))
    },
  }
}
