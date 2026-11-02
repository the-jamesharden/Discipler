/**
 * Every email Discipler sends, from the values it carries to the inbox it lands in
 * (Exponential launch, ticket 10). The vendor is behind `EmailTransport` and the
 * one sender in `src/service/email-sender.ts` is the only thing that reaches it;
 * this module is what decides what an email may say and where it may go.
 *
 * An email is plain text written in code. The values it carries -- a church's name,
 * a code, a link, the words somebody typed into a form -- are passed through
 * `EmailField` on the way in, and the only things that make a subject or a body
 * are the `emailSubject` and `emailBody` template tags, which take nothing but
 * fields. So a value that was never escaped cannot be put in an email by accident:
 * the compiler refuses it, and so does the tag at run time for anything cast past
 * the compiler.
 *
 * **No email carries congregation data**: no name from the Roster, no phone number,
 * no Concern and no referred church's name. Resend keeps what it sends, and an
 * inbox is read by whoever can read it. The types refuse the congregation data the
 * domain brands (a phone number, a Person's own words for a goal, a Person or
 * Concern ID), and every field has any phone number taken out of it. A name is a
 * plain string everywhere in the domain, so nothing can tell a congregant's name
 * from a church's: an email says "something needs your attention" and links into
 * the signed-in app, and never names who.
 */
import type { Branded } from './branded'
import type { ConcernId, PersonId } from './ids'
import type { OtherGoal } from './intake'
import type { PhoneNumber } from './roster'

/** Thrown for anything in an email's place that `EmailField` did not make. */
export class UnescapedEmailField extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnescapedEmailField'
  }
}

/**
 * What the domain brands as congregation data. A field refuses these at compile
 * time; a later brand for a congregant's data belongs in this list.
 */
type CongregationData = PhoneNumber | OtherGoal | PersonId | ConcernId

/** `T` itself, or `never` when it is congregation data. */
type NotCongregationData<T extends string> = T extends CongregationData ? never : T

/** The longest one line of an email may be, a church's name included. */
export const EMAIL_LINE_LONGEST = 200

/** The most of somebody's typing one email carries. */
export const EMAIL_QUOTED_LONGEST = 5000

const PHONE_REMOVED = '[phone number removed]'

/**
 * A phone number as somebody would write one: E.164, or ten North American digits
 * with or without the usual punctuation, standing on their own rather than inside
 * a longer run of letters and digits (an ID, a token). A date, an amount, a
 * six-digit code and a UUID do not match.
 */
const PHONE_SHAPED =
  /(?<![\w+])(?:\+\d{8,15}|\+?1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?!\w)/g

/**
 * Characters that change how text reads without being seen: the direction
 * overrides and isolates that make "gpj.exe" read as "exe.jpg", zero-width
 * spaces and joiners, and the byte-order mark.
 */
const INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g

/** Every control character but the line feed, which `quoted` keeps. */
const CONTROL_BUT_LINE_FEED = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g

const removePhoneNumbers = (text: string): string => text.replace(PHONE_SHAPED, PHONE_REMOVED)

const cut = (text: string, longest: number): string =>
  text.length <= longest ? text : `${text.slice(0, longest - 3).trimEnd()}...`

const oneLine = (raw: string): string =>
  cut(
    removePhoneNumbers(
      raw
        .replace(/[\r\n\t\u2028\u2029\u0085]/g, ' ')
        .replace(INVISIBLE, '')
        .replace(CONTROL_BUT_LINE_FEED, '')
        .replace(/\s+/g, ' ')
        .trim(),
    ),
    EMAIL_LINE_LONGEST,
  )

/**
 * One value in an email, escaped. There is no other way to make one: the
 * constructor is private, and each static method below says what the value is and
 * escapes it for that.
 *
 * A field cannot be read into an ordinary string -- `${field}` outside the tags
 * throws -- because an untagged template is the one way a field would reach an
 * email without the tag checking every other value beside it.
 */
export class EmailField {
  readonly #text: string
  readonly #multiline: boolean

  private constructor(text: string, multiline: boolean) {
    this.#text = text
    this.#multiline = multiline
  }

  /**
   * One line: a church's name, the first name of whoever the email is to, a page's
   * address on a bug report. Every line break, control and invisible character is
   * folded away, a phone number is taken out, and it is cut at
   * `EMAIL_LINE_LONGEST`.
   */
  static line<T extends string>(raw: T & NotCongregationData<T>): EmailField {
    return new EmailField(oneLine(raw), false)
  }

  /**
   * Words somebody typed into a Discipler form, the support form's message
   * above all. Their lines are kept, but every one is quoted with `> `, so nothing
   * typed can pass for a line Discipler wrote -- a signature, a link to "reset
   * here", a forged reply. Controls and invisible characters go, as does any
   * phone number, runs of blank lines fold to one, and it is cut at
   * `EMAIL_QUOTED_LONGEST`.
   */
  static quoted<T extends string>(raw: T & NotCongregationData<T>): EmailField {
    const lines = cut(
      removePhoneNumbers(
        raw
          .replace(/\r\n?|[\u2028\u2029\u0085]/g, '\n')
          .replace(/\t/g, ' ')
          .replace(INVISIBLE, '')
          .replace(CONTROL_BUT_LINE_FEED, ''),
      ),
      EMAIL_QUOTED_LONGEST,
    )
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())

    const kept = lines
      .filter((line, index) => line !== '' || (index > 0 && lines[index - 1] !== ''))
      .join('\n')
      .trim()
      .split('\n')

    return new EmailField(kept.map((line) => (line === '' ? '>' : `> ${line}`)).join('\n'), true)
  }

  /**
   * A link into Discipler: a reset link, Checkout's "Start", "Open Billing". Only
   * to `trydiscipler.com` or a subdomain of it over https, or to a developer's own
   * machine, and never with a sign-in in the address, so no email can send
   * anybody somewhere that only looks like Discipler. Taken as a `URL`, which has
   * already escaped what a URL needs.
   */
  static link(url: URL): EmailField {
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const discipler = url.hostname === 'trydiscipler.com' || url.hostname.endsWith('.trydiscipler.com')
    const allowed =
      (url.protocol === 'https:' && (discipler || local)) || (url.protocol === 'http:' && local)

    if (!allowed || url.username !== '' || url.password !== '') {
      throw new UnescapedEmailField('An email links only to Discipler.')
    }
    return new EmailField(url.href, false)
  }

  /** Sign-up's one-time code: six digits and nothing else (ticket 11). */
  static code(raw: string): EmailField {
    if (!/^\d{6}$/.test(raw)) throw new UnescapedEmailField('A code is six digits.')
    return new EmailField(raw, false)
  }

  /** The escaped value, for the tags and for a test to read. */
  get text(): string {
    return this.#text
  }

  /** Whether `value` was made by this class, rather than shaped like it. */
  static isField(value: unknown): value is EmailField {
    return typeof value === 'object' && value !== null && #text in value
  }

  /** Whether the field spans lines, which a subject may not. */
  static isMultiline(field: EmailField): boolean {
    return field.#multiline
  }

  toString(): never {
    throw new UnescapedEmailField(
      'An email field was read into an ordinary string. Compose with emailSubject or emailBody.',
    )
  }
}

const fieldsIn = (fields: readonly unknown[]): EmailField[] =>
  fields.map((field, index) => {
    if (!EmailField.isField(field)) {
      throw new UnescapedEmailField(
        `Value ${index + 1} of an email is not an EmailField. Escape it with EmailField first.`,
      )
    }
    return field
  })

const interleave = (strings: TemplateStringsArray, fields: readonly EmailField[]): string =>
  strings.reduce((text, literal, index) => {
    const field = fields[index]
    return text + literal + (field ? field.text : '')
  }, '')

/** A subject composed by `emailSubject`, and nothing else. */
export class EmailSubject {
  readonly #text: string

  private constructor(text: string) {
    this.#text = text
  }

  /** @internal Only `emailSubject` calls this. */
  static compose(strings: TemplateStringsArray, fields: readonly unknown[]): EmailSubject {
    const escaped = fieldsIn(fields)
    if (strings.some((literal) => /[\r\n]/.test(literal))) {
      throw new UnescapedEmailField('An email subject is one line.')
    }
    if (escaped.some(EmailField.isMultiline)) {
      throw new UnescapedEmailField('A quoted field cannot go in an email subject.')
    }
    return new EmailSubject(interleave(strings, escaped))
  }

  get text(): string {
    return this.#text
  }

  static isSubject(value: unknown): value is EmailSubject {
    return typeof value === 'object' && value !== null && #text in value
  }
}

/** A body composed by `emailBody`, and nothing else. */
export class EmailBody {
  readonly #text: string

  private constructor(text: string) {
    this.#text = text
  }

  /** @internal Only `emailBody` calls this. */
  static compose(strings: TemplateStringsArray, fields: readonly unknown[]): EmailBody {
    return new EmailBody(interleave(strings, fieldsIn(fields)))
  }

  get text(): string {
    return this.#text
  }

  static isBody(value: unknown): value is EmailBody {
    return typeof value === 'object' && value !== null && #text in value
  }
}

/**
 * An email's subject, from Discipler's own words and escaped fields only:
 * `` emailSubject`Your free trial ends ${date}` ``.
 */
export const emailSubject = (
  strings: TemplateStringsArray,
  ...fields: readonly EmailField[]
): EmailSubject => EmailSubject.compose(strings, fields)

/**
 * An email's plain-text body, from Discipler's own words and escaped fields only.
 */
export const emailBody = (
  strings: TemplateStringsArray,
  ...fields: readonly EmailField[]
): EmailBody => EmailBody.compose(strings, fields)

/** Thrown for an email that cannot go where it says, or cannot be keyed. */
export class EmailRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailRefused'
  }
}

/**
 * Who every email is from: `Discipler <hello@notify.trydiscipler.com>` in
 * production. The domain is the deployment's (`RESEND_EMAIL_DOMAIN`), because it
 * is the one Resend verified; the name and mailbox are Discipler's.
 */
export const EMAIL_FROM_NAME = 'Discipler'
export const EMAIL_FROM_MAILBOX = 'hello'

/** Where every reply goes, whichever inbox an email was sent to. */
export const SUPPORT_ADDRESS = 'support@trydiscipler.com'

/** Who reads a church-plant application. */
export const FOUNDER_ADDRESSES = ['james@trydiscipler.com', 'lerone@trydiscipler.com'] as const

/**
 * Who an email goes to: support@, the two founders, or the church's Admin at the
 * address the caller gives. The first two are fixed here, so no caller can send
 * an alert or an application anywhere else.
 */
export type EmailRoute = 'support' | 'founders' | 'admin'

/**
 * Every kind of email Discipler sends, and where each goes (spec, Email). This
 * is the one place a kind is added: name it here with its route, then compose
 * its subject and body with `emailSubject` and `emailBody` where the ticket that
 * sends it lives, and send it through `EmailSender`.
 */
export const EMAIL_KINDS = {
  /** The test James sends once the DNS records are in (ticket 10). */
  deliverabilityCheck: 'support',
  /** A church signed itself up (tickets 17 and 18). */
  newSignUp: 'support',
  /** The Help menu's form, one kind per choice on it (ticket 25). */
  supportRequest: 'support',
  bugReport: 'support',
  featureRequest: 'support',
  /** The shared numbers are running near capacity (ticket 06). */
  numbersNearCapacity: 'support',
  /** Twilio's daily cap was reached for the first time today (ticket 07). */
  dailyCapReached: 'support',
  /** The Twilio balance fell below its floor, or a day's spend passed its mark (ticket 08). */
  twilioBalanceLow: 'support',
  twilioSpendPassed: 'support',
  /** A church on $97 stayed above 200 people for a whole month (ticket 14). */
  over200FollowUp: 'support',
  /** A church-plant application, with no approve link in it (ticket 19). */
  churchPlantApplication: 'founders',
  /** Sign-up's 6-digit code, and the notice sent instead when the address has an account (ticket 11). */
  emailCode: 'admin',
  signUpAttemptNotice: 'admin',
  /** The one-time reset link (ticket 22). */
  passwordReset: 'admin',
  /** The next-day reminder to finish Checkout (ticket 18). */
  checkoutReminder: 'admin',
  /** Seven days before a trial ends (ticket 33). */
  trialEnding: 'admin',
  /** A church-plant application approved or declined (ticket 19). */
  churchPlantDecision: 'admin',
} as const satisfies Record<string, EmailRoute>

export type EmailKind = keyof typeof EMAIL_KINDS

/** An address that has been through `asEmailAddress`. */
export type EmailAddress = Branded<string, 'EmailAddress'>

/** The longest address the mail standards allow. */
const ADDRESS_LONGEST = 254

const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

/**
 * One ordinary address, or null. No display name, no list and nothing a header
 * could be split on: the address goes into `to` and nowhere else, and an address
 * that needed quoting is not one an Admin types. The domain is lower-cased because
 * it is case-blind; the local part is the mail server's to judge, so it is kept.
 */
export const asEmailAddress = (raw: string): EmailAddress | null => {
  const trimmed = raw.trim()
  if (trimmed.length > ADDRESS_LONGEST || !ADDRESS.test(trimmed)) return null
  const at = trimmed.lastIndexOf('@')
  return `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}` as EmailAddress
}

type AddressedTo<K extends EmailKind> = (typeof EMAIL_KINDS)[K] extends 'admin'
  ? { readonly to: EmailAddress }
  : { readonly to?: never }

/**
 * One email, ready to send. `once` is what makes it the message it is -- a
 * church's ID and a month, an attempt's ID -- and becomes Resend's idempotency
 * key, so a retry within 24 hours does not send it twice. Longer than that is the
 * sending ticket's to remember. It holds IDs only: Resend keeps its keys.
 */
export type Email<K extends EmailKind = EmailKind> = K extends EmailKind
  ? {
      readonly kind: K
      readonly subject: EmailSubject
      readonly body: EmailBody
      readonly once: string
    } & AddressedTo<K>
  : never

/** Resend refuses a key longer than this. */
const KEY_LONGEST = 256

const ONCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/

/** An opened email, as the vendor is handed it. Only `openEnvelope` makes one. */
export class EmailEnvelope {
  readonly #opened = true

  private constructor(
    readonly kind: EmailKind,
    readonly to: readonly string[],
    readonly replyTo: string,
    readonly subject: string,
    readonly text: string,
    readonly idempotencyKey: string,
  ) {}

  /** @internal Only `openEnvelope` calls this. */
  static open(email: Email): EmailEnvelope {
    const route: EmailRoute | undefined = Object.hasOwn(EMAIL_KINDS, email.kind)
      ? EMAIL_KINDS[email.kind]
      : undefined
    if (!route) throw new EmailRefused(`Discipler sends no email of kind ${String(email.kind)}.`)

    if (!EmailSubject.isSubject(email.subject)) {
      throw new UnescapedEmailField('An email subject was not composed with emailSubject.')
    }
    if (!EmailBody.isBody(email.body)) {
      throw new UnescapedEmailField('An email body was not composed with emailBody.')
    }

    const once = String(email.once)
    const idempotencyKey = `${email.kind}/${once}`
    if (!ONCE.test(once) || idempotencyKey.length > KEY_LONGEST || removePhoneNumbers(once) !== once) {
      throw new EmailRefused(
        `An email's once must be IDs joined by "/", with no address or phone number in it.`,
      )
    }

    return new EmailEnvelope(
      email.kind,
      recipientsOf(route, email.to),
      SUPPORT_ADDRESS,
      email.subject.text,
      email.body.text,
      idempotencyKey,
    )
  }

  static isEnvelope(value: unknown): value is EmailEnvelope {
    return typeof value === 'object' && value !== null && #opened in value
  }
}

const recipientsOf = (route: EmailRoute, to: unknown): readonly string[] => {
  if (route !== 'admin') {
    if (to !== undefined) {
      throw new EmailRefused('An email to support@ or the founders goes where its kind says.')
    }
    return route === 'support' ? [SUPPORT_ADDRESS] : [...FOUNDER_ADDRESSES]
  }

  const address = typeof to === 'string' ? asEmailAddress(to) : null
  if (!address || address !== to) {
    throw new EmailRefused('An email to an Admin needs an address that went through asEmailAddress.')
  }
  return [address]
}

/**
 * Checks an email and opens it for the vendor: the route its kind decides, every
 * reply to support@, and the subject and body as the tags composed them. Refuses
 * anything the tags did not make, so the sender refuses it too.
 */
export const openEnvelope = (email: Email): EmailEnvelope => EmailEnvelope.open(email)
