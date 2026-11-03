import type { SupportFormRefusal, SupportKind } from '~/domain/support-form'
import { SUPPORT_EMAIL } from '../../roster/import-copy'

/**
 * What the support form says (Exponential launch, ticket 25). "Contact support" is the
 * Help menu's row in mock-up 2. The mock-up draws no form behind it, so every other
 * word here is a draft for James.
 *
 * A plain module, because a server page cannot read a constant from a `'use client'`
 * one, and `app/top-nav-menus.ts` reads the two below.
 */

export const CONTACT_SUPPORT = 'Contact support'

export const CONTACT_SUPPORT_PAGE = '/help/contact'

/** The search parameter that says which page the Help menu was opened on. */
export const FROM_PAGE = 'from'

export const CONTACT_SUBTITLE = 'Discipler'

export const KIND_QUESTION = 'What can we help with?'

/** As `app/help/content/getting-help.md` says them. */
export const KIND_LABELS: Readonly<Record<SupportKind, string>> = {
  support: 'Ask a question',
  bug: 'Report a bug',
  feature: 'Suggest an idea',
}

export const MESSAGE_LABEL = 'Your message'

export const MESSAGE_HINT =
  'Please leave out the names and phone numbers of people in your church. We can help without them.'

export const EMAIL_LABEL = 'Your email'

export const EMAIL_HINT = 'So we can write back.'

export const SEND = 'Send'

export const SENDING = 'Sending...'

/** On a bug report only, in the words `app/help/content/getting-help.md` already promises. */
export const ATTACHED_WITH_A_PAGE = (page: string) =>
  `This includes the page you were on (${page}) and your browser, so we can find it, and never anything on the page.`

export const ATTACHED_WITH_NO_PAGE = 'This includes your browser, so we can find it, and never anything on the page.'

export const SENT_TITLE = 'Thank you'

export const SENT = (email: string) => `We have your message, and we'll write back to ${email}.`

/** Where somebody goes on from the form, signed in or not. */
export const BACK_TO_HELP = 'Help center'

/** Somebody not signed in, on a deployment with no Turnstile key to check them with. */
export const FORM_IS_SHUT = {
  before: 'This form is not open right now. Please write to ',
  email: SUPPORT_EMAIL,
  after: " and we'll help.",
} as const

export const NEEDS_A_SCRIPT = `This form needs JavaScript. Please write to ${SUPPORT_EMAIL} and we'll help.`

/** The human check has not answered yet, which is a second or two. */
export const STILL_CHECKING = 'One moment, please. We are still checking this browser. Please press Send again.'

/** Whatever could not be read as an answer: a fault, not a refusal. */
export const NOT_SENT = `We couldn't send that just now. Please try again in a minute, or write to ${SUPPORT_EMAIL}.`

/** A `Record`, so a refusal added to the domain and left unworded fails the build. */
export const SUPPORT_REFUSALS: Readonly<Record<SupportFormRefusal, string>> = {
  'support.bad_kind': 'Please choose what we can help with.',
  'support.no_message': 'Please tell us what is going on.',
  'support.message_too_long': 'That is a little too long for one message. Please shorten it.',
  'support.bad_email': 'Please check your email address, so we can write back.',
  'support.not_human': `We couldn't confirm this browser. Please reload the page and try again, or write to ${SUPPORT_EMAIL}.`,
  'support.too_many': `That is a lot of messages in one hour. Please try again later, or write to ${SUPPORT_EMAIL}.`,
}
