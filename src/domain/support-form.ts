import {
  asEmailAddress,
  emailBody,
  EmailField,
  EMAIL_LINE_LONGEST,
  EMAIL_QUOTED_LONGEST,
  emailSubject,
  type Email,
  type EmailAddress,
  type EmailKind,
} from './email'
import { SUPPORT_SUBMISSIONS } from './launch-terms'
import { RESERVED_SHORT_NAMES } from './short-name'

/**
 * The Help menu's form for getting help, reporting a bug or asking for a feature
 * (Exponential launch, ticket 25): what it accepts, what a bug report attaches, and
 * what reaches support@.
 *
 * **What a person types is the one thing in an email nobody can vouch for.** It goes
 * through `EmailField.quoted`, so every line of it is marked as theirs, controls and
 * invisible characters go, and any phone number is taken out. A name cannot be taken
 * out, because a name is a plain string and nothing can tell it from any other word.
 * So the form asks people to leave names out, and a name somebody types anyway does
 * reach support@. That is a limit of the rule "no email carries congregation names",
 * recorded on the ticket, and nothing here loosens the sender to get round it.
 *
 * What the form attaches by itself carries no such risk: a bug report's address is
 * the path alone, with anything that is not a route word replaced, and nothing from
 * the page is ever read.
 */

export const SUPPORT_KINDS = ['support', 'bug', 'feature'] as const

export type SupportKind = (typeof SUPPORT_KINDS)[number]

const isSupportKind = (value: string): value is SupportKind =>
  (SUPPORT_KINDS as readonly string[]).includes(value)

/** Stands in for a segment of an address that is somebody's or something's ID. */
export const ADDRESS_ID = '{id}'

/** A segment that is a word of a route: a person's ID or a token cannot look like it. */
const ROUTE_WORD = /^[a-z]{1,32}(?:-[a-z]{1,32})*$/

/**
 * The address a bug report attaches, or null when it is not one of Discipler's pages.
 *
 * The path alone, because a query string can hold what somebody searched for, and
 * with every segment after the first that is not a plain route word replaced, because
 * `/roster/{person}` names a Person by ID and `/invitation/{token}` holds a secret.
 * The first must be a route the app has (`RESERVED_SHORT_NAMES` is every one, and a
 * test holds it to that), so the browser cannot send a name as a page. It is read
 * twice, on the link and on the way in, because what arrives is whatever somebody
 * typed.
 */
export const pageAddressOf = (raw: string | null | undefined): string | null => {
  const path = raw?.trim().split(/[?#]/)[0]
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null
  if (path === '/') return '/'

  const [first, ...rest] = path.slice(1).split('/').filter((segment) => segment !== '')
  if (!first || !RESERVED_SHORT_NAMES.includes(first)) return null

  const address = `/${[first, ...rest.map((segment) => (ROUTE_WORD.test(segment) ? segment : ADDRESS_ID))].join('/')}`
  return address.length <= EMAIL_LINE_LONGEST ? address : null
}

/** Why a submission was not taken. The screen owns the sentences. */
export type SupportFormRefusal =
  | 'support.bad_kind'
  | 'support.no_message'
  | 'support.message_too_long'
  | 'support.bad_email'
  /** Cloudflare did not pass the token, or its secret is unset. */
  | 'support.not_human'
  /** The hourly limit, on this Admin or this network. */
  | 'support.too_many'

/** What somebody typed, and what their request said about itself. */
export interface TypedSupportForm {
  readonly kind: string
  readonly message: string
  readonly email: string
  readonly page: string | null
  readonly browser: string | null
}

export interface SupportFormFields {
  readonly kind: SupportKind
  readonly message: string
  /** Where to write back. In the email's body, and never in a header. */
  readonly replyTo: EmailAddress
  /** On a bug report only, the same as `browser`. */
  readonly pageAddress: string | null
  readonly browser: string | null
}

/**
 * A submission as it is kept and emailed. `churchName` comes from the session or the
 * church's row, and is null for one nobody signed in to send.
 */
export interface SupportSubmission extends SupportFormFields {
  readonly id: string
  readonly churchName: string | null
}

export type SupportFormReading =
  | { readonly fields: SupportFormFields }
  | { readonly refusal: Extract<SupportFormRefusal, 'support.bad_kind' | 'support.no_message' | 'support.message_too_long' | 'support.bad_email'> }

/**
 * The form as Discipler takes it, or the first thing wrong with it, in the order the
 * form asks. The message is kept as typed but for the one character a Postgres text
 * cannot hold; its limit is the most one email carries, so nothing kept is cut from
 * what support@ reads.
 */
export const readSupportForm = (typed: TypedSupportForm): SupportFormReading => {
  if (!isSupportKind(typed.kind)) return { refusal: 'support.bad_kind' }

  const message = typed.message.replace(/\u0000/g, '').trim()
  if (message === '') return { refusal: 'support.no_message' }
  if (message.length > EMAIL_QUOTED_LONGEST) return { refusal: 'support.message_too_long' }

  const replyTo = asEmailAddress(typed.email)
  if (!replyTo) return { refusal: 'support.bad_email' }

  const isBug = typed.kind === 'bug'
  return {
    fields: {
      kind: typed.kind,
      message,
      replyTo,
      pageAddress: isBug ? pageAddressOf(typed.page) : null,
      browser: isBug ? typed.browser?.trim().slice(0, EMAIL_LINE_LONGEST) || null : null,
    },
  }
}

/** Anything that came in before this is older than the privacy policy promises to keep it. */
export const submissionsKeptSince = (now: Date): Date => {
  const since = new Date(now)
  const day = since.getUTCDate()
  since.setUTCMonth(since.getUTCMonth() - SUPPORT_SUBMISSIONS.keptMonths)
  // A 29 February a year on is 1 March; the day before it is the same calendar date
  // as near as a shorter month has one.
  if (since.getUTCDate() !== day) since.setUTCDate(0)
  return since
}

/** The hourly limits are counted back from now. */
export const LIMIT_WINDOW_MS = 60 * 60 * 1000

const EMAIL_KIND_OF: Readonly<Record<SupportKind, EmailKind & ('supportRequest' | 'bugReport' | 'featureRequest')>> = {
  support: 'supportRequest',
  bug: 'bugReport',
  feature: 'featureRequest',
}

const TITLE_OF: Readonly<Record<SupportKind, string>> = {
  support: 'Support request',
  bug: 'Bug report',
  feature: 'Feature request',
}

const NOT_KNOWN = 'Not known'
const NOBODY_SIGNED_IN = 'Nobody was signed in, so nothing here is proved, the address included.'

/**
 * The email to support@. **Nothing submitted goes into a header:** the subject is the
 * kind and the first part of Discipler's own ID, so two messages do not thread as one,
 * and the sender's `reply_to` stays support@ for every email. So the address to write
 * back to is in the body, and the body says so.
 */
export const supportEmail = (submission: SupportSubmission): Email => {
  const title = EmailField.line(TITLE_OF[submission.kind])
  const shortReference = EmailField.line(submission.id.slice(0, 8))
  const reference = EmailField.line(submission.id)
  const from = EmailField.line(
    submission.churchName === null ? NOBODY_SIGNED_IN : `Church: ${submission.churchName}`,
  )
  const replyTo = EmailField.address(submission.replyTo)
  const message = EmailField.quoted(submission.message)

  const body =
    submission.kind === 'bug'
      ? emailBody`${title} through Discipler's form.

Reference: ${reference}
${from}
Write back to: ${replyTo}
Page: ${EmailField.line(submission.pageAddress ?? NOT_KNOWN)}
Browser: ${EmailField.line(submission.browser ?? NOT_KNOWN)}

What they wrote, in their own words:

${message}

Pressing Reply reaches support@, not them. Write to the address above.`
      : emailBody`${title} through Discipler's form.

Reference: ${reference}
${from}
Write back to: ${replyTo}

What they wrote, in their own words:

${message}

Pressing Reply reaches support@, not them. Write to the address above.`

  return {
    kind: EMAIL_KIND_OF[submission.kind],
    subject: emailSubject`${title} ${shortReference}`,
    body,
    once: submission.id,
  }
}
