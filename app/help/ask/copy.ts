import { FEW_QUESTIONS_LEFT } from '~/domain/ask-discipler'
import { AI_GUIDE_QUESTIONS_PER_DAY } from '~/domain/launch-terms'

/**
 * Everything Ask Discipler says on screen, in the words James approved in mock-up 4
 * (`.lavish/ai-guide/build.mjs`, and the spec's "Decided in the mock-up 4 review").
 *
 * Here rather than in the client component that draws them: a server page cannot read a
 * constant out of a client module, and the instructions the model is given quote one.
 */
export const ASK = {
  name: 'Ask Discipler',
  subtitle: 'Answers from the Help center',
  startOnboarding: 'Start your onboarding here!',
  close: 'Close',
  send: 'Send',
  yourQuestion: 'Your question',
  tuck: 'Tuck Ask Discipler away',
  untuck: 'Show Ask Discipler',
  placeholder: 'Ask about Discipler…',
  limitBox: 'You can ask again tomorrow',
  warning: "Please don't paste names, phone numbers or prayer requests.",
  tryAsking: 'Try asking',
  yourNextStep: 'Your next step',
  helpCenter: 'Help center',
  helloBefore: 'Hi! I can walk you through setting up Discipler, or answer any question about how it works.',
  helloAfter: 'Hi! Ask me anything about how Discipler works.',
  startersBefore: [
    'How do check-ins work?',
    'How do I add people to my Roster?',
    'How do I pair a discipler with a disciple?',
  ],
  startersAfter: [
    'What does Needs Follow-Up mean?',
    'How do check-ins work?',
    'How do I change the check-in time?',
  ],
  failed: "Sorry, I couldn't answer just now. Please try again in a minute.",
  limitLine: `That's ${AI_GUIDE_QUESTIONS_PER_DAY} questions today, the most for one day. You can ask again tomorrow.`,
  limitBeforeLink: 'The ',
  limitAfterLink: ' has every answer I give, any time.',
} as const

/** The first thing it says when asked about a particular person, word for word. */
export const ABOUT_A_PERSON =
  "I can't see anyone in your church, so I can't answer about a particular person or relationship. Their row on Check-Ins shows every answer they have sent."

export const sourceLabel = (title: string | null): string =>
  title === null ? ASK.helpCenter : `${ASK.helpCenter}: ${title}`

/** Under the box, from a few left down, and nothing before that. */
export const questionsLeftLine = (left: number | null): string | null => {
  if (left === null || left === 0 || left > FEW_QUESTIONS_LEFT) return null
  return left === 1 ? '1 question left today' : `${left} questions left today`
}

export const stepsDoneLine = (done: number, of: number): string => `${done} of ${of} done`
