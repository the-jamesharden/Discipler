import { SETUP_STEPS } from '~/domain/setup-meter'
import { askDisciplerIsOn } from '~/platform/ask-discipler-switch'
import type { SignedInAdmin } from '~/service/ports'
import { AskDisciplerBubble, type AskDisciplerSetup } from './ask-discipler-bubble'
import { setupMeterView } from './setup-meter-copy'

/**
 * Ask Discipler's bubble, in the bottom-right corner of every Admin page (Exponential
 * launch, ticket 31). Everything it draws came with the page's one read
 * (`docs/adr/0023-a-page-is-one-read.md`); the chat is read when it is opened.
 *
 * Before the church reaches 100% it leads with the next setup step. An Admin who has
 * seen the badge reads as done, whichever way they got there.
 */
const setupFor = (admin: SignedInAdmin): AskDisciplerSetup | null => {
  if (!admin.setup.shown || admin.setup.done.length === SETUP_STEPS.length) return null

  const view = setupMeterView(admin.setup, admin.ministryName)
  const next = view.steps.find((step) => step.step === view.next)

  return {
    done: admin.setup.done.length,
    of: SETUP_STEPS.length,
    next: next?.action ? { words: next.words, button: next.action.button, href: next.action.href } : null,
  }
}

export const AskDiscipler = ({ admin }: { readonly admin: SignedInAdmin }) =>
  askDisciplerIsOn(process.env) ? (
    <AskDisciplerBubble setup={setupFor(admin)} tucked={admin.askDisciplerTucked} />
  ) : null
