import { COMMON_PASSWORDS } from './common-passwords'
import { PASSWORD_WORDS } from './password-words'
import { asPhoneNumber, type PhoneNumber } from './roster'

/**
 * What an account is, stated where the domain can see it. The thing that creates
 * one lives at the platform edge -- it needs the key that can mint a user -- but
 * the rule about a password and the codes a refusal travels as are decisions this
 * product made, not decisions Supabase made, and the surfaces that render them
 * should not have to reach through an adapter to find out what they are.
 *
 * One form for every user, with one box for who they are and a password. An Admin who
 * signed up with an email may type either that or their phone, and everybody else
 * types their phone: `docs/adr/0030-an-admin-signs-in-with-email-or-phone.md`, which
 * supersedes ADR-0008 for an Admin with a verified email and leaves it standing for
 * everybody else.
 */

/**
 * What was typed into "Email or phone", read. An email is whatever holds an `@`, in
 * lower case, which is how Supabase Auth keeps one, and is never checked further: a
 * mistyped address and an address nobody holds are the same answer, so a check here
 * would only add a second sentence that says less. Anything else goes through the one
 * reading of a phone number, and null is a typo the person can fix.
 */
export type SignInEntry = { readonly email: string } | { readonly phone: PhoneNumber }

export const readSignInEntry = (typed: string): SignInEntry | null => {
  const entry = typed.trim()
  if (entry.includes('@')) return { email: entry.toLowerCase() }

  const phone = asPhoneNumber(entry)
  return phone ? { phone } : null
}

/**
 * Why minting an account was refused. Codes, never prose -- the page renders its
 * own wording, like every refusal.
 */
export type AccountCreationRefusal =
  | NewPasswordRefusal
  /**
   * Discipler holds no number for this Person, so there is nothing to sign in
   * with -- and nothing to text them either. It is an Admin's to fix.
   */
  | 'account.no_number_on_file'
  /** A number already signs somebody in. Their way forward is to sign in with it. */
  | 'account.already_exists'

/**
 * Why a reset was refused. Named apart from the three above rather than folded in
 * with them, because the two sets reach different screens: an Invitation Link's
 * page can be refused for a number already in use and can never be refused for a
 * Person resetting themselves, and a `Record` over the whole union would have each
 * surface wording refusals it cannot receive -- which is the exhaustiveness those
 * records exist for, spent on sentences nobody will read.
 */
export type PasswordResetRefusal =
  /**
   * There is no account on this Person to reset. A Leader who never accepted their
   * Invitation Link holds none, and neither does anybody an import put on the
   * Roster -- so this is the race behind an action the Roster only offers on rows
   * that hold one.
   *
   * It is also what an Admin gets for a Person their own Roster does not hold. The
   * two are one code deliberately: from the acting Admin's side there is nothing on
   * this Roster to reset either way, and a refusal that told them apart would
   * disclose that somebody else's Ministry holds that Person.
   */
  | 'account.no_account'
  /**
   * An Admin resetting their own password. It is not a recovery -- they are holding
   * a session as they ask -- and it belongs on the self-service surface rather than
   * on a Roster row.
   */
  | 'account.cannot_reset_yourself'

/**
 * Why a person's own change of password was refused. A third set, for the reason
 * the second one is: the self-service form can be refused for a wrong current
 * password and can never be refused for resetting yourself, and a `Record` over
 * the whole union would have it wording sentences it cannot receive.
 */
export type PasswordChangeRefusal =
  /** The same rule the invitation form applies, through the same function. */
  | NewPasswordRefusal
  /**
   * The two new passwords are not the same. Success ends every session, so a
   * mistyped new password would lock the person out until an Admin resets them --
   * and for a Ministry's sole Admin there is no path back at all. The second field
   * is the one guard the product can offer before the door closes.
   */
  | 'account.passwords_differ'
  /**
   * Not what the account's password currently is. Sessions here run to about a
   * year, so *signed in* is a weak proof of presence: without this check a
   * borrowed unlocked phone is a permanent account takeover.
   */
  | 'account.current_password_wrong'
  /**
   * Too many wrong current passwords from this account or this network lately, so
   * the platform was not asked (Exponential launch, ticket 13). The sign-in
   * guessing limit, applied to the one other place a password is checked.
   */
  | 'account.too_many_attempts'

/** Everything an account can be refused for, wherever it was asked. */
export type AccountRefusal =
  | AccountCreationRefusal
  | PasswordResetRefusal
  | PasswordChangeRefusal

/**
 * Whether this account may be reset by this actor, and why not. Null is *go ahead*.
 *
 * One rule in one place, because three things ask it: the screen that offers the
 * reset, the route that performs it, and the command that records it. They ask at
 * three different moments -- render, guard, record -- and the whole design rests on
 * all three answering the same way, so a third refusal is added here rather than in
 * each of them.
 *
 * `null` for the account means *there is nothing on this Roster to reset*, which
 * covers a Person this Ministry does not hold as well as one holding no account. See
 * `account.no_account` for why those are deliberately one answer.
 */
export const passwordResetRefusal = (
  accountToReset: string | null,
  actor: string,
): PasswordResetRefusal | null =>
  accountToReset === null
    ? 'account.no_account'
    : accountToReset === actor
      ? 'account.cannot_reset_yourself'
      : null

/**
 * Why a password somebody chose is refused. One set, because one rule applies
 * wherever a person chooses a password -- an Invitation Link, a Ministry Setup
 * Link, a change of their own, and sign-up once it exists -- and every one of those
 * surfaces can receive all three (Exponential launch, ticket 12; Q28).
 */
export type NewPasswordRefusal =
  | 'account.password_too_short'
  /**
   * Longer than Supabase Auth can store. Far past anything typed by hand; it is a
   * pasted passphrase or a password manager set very long.
   */
  | 'account.password_too_long'
  /** One of the passwords in `common-passwords.ts`, whatever its capitals. */
  | 'account.password_too_common'

/** Short enough to type on a phone, long enough to be worth having. */
export const SHORTEST_PASSWORD = 8

/**
 * The longest password there is room for, in UTF-8 bytes rather than characters.
 *
 * Not a choice of Discipler's. Supabase Auth hashes with bcrypt, which reads 72
 * bytes and no more, and GoTrue answers a longer password with a 500 rather than a
 * refusal -- so this is where a person is told instead. It clears the "at least
 * 64" the launch spec asks for; the ticket's 100-character example does not fit,
 * which ticket 12's comments record.
 */
export const LONGEST_PASSWORD_BYTES = 72

/**
 * Built on first use rather than at import, because most of what imports this
 * module wants `SHORTEST_PASSWORD` for a form's `minLength` and never asks.
 */
let commonPasswords: ReadonlySet<string> | undefined

const isCommon = (password: string): boolean => {
  commonPasswords ??= new Set(COMMON_PASSWORDS.split('\n'))
  return commonPasswords.has(password.toLowerCase())
}

/**
 * The rule on a password somebody chose, and the only one. Null is *go ahead*.
 *
 * Exported for every place a password is set, so that sign-up, a reset by email
 * and anything after them ask this rather than restate it: at least
 * `SHORTEST_PASSWORD` characters, no more than `LONGEST_PASSWORD_BYTES`, and not a
 * common password in any capitals. Nothing about which kinds of character it
 * holds, which is the advice NIST SP 800-63B gives and the launch spec adopts.
 *
 * Length first, so a short common password is refused for its length: that is the
 * rule the person can act on without having to guess what else is on the list.
 */
export const newPasswordRefusal = (password: string): NewPasswordRefusal | null =>
  password.length < SHORTEST_PASSWORD
    ? 'account.password_too_short'
    : new TextEncoder().encode(password).length > LONGEST_PASSWORD_BYTES
      ? 'account.password_too_long'
      : isCommon(password)
        ? 'account.password_too_common'
        : null

/**
 * The form's own rules on a new password, checked first and together, before the
 * platform is asked anything. Empty is *go ahead*.
 *
 * In field order -- the new password itself, then whether the repeat matches --
 * so a person reads their mistakes top to bottom the way they filled the form in,
 * which is how every other form here reports them. Checking these before the port
 * is called also means a form that was going to be refused anyway spends nothing
 * at the platform's sign-in endpoint.
 *
 * The current password is deliberately not among them. Whether it is right is a
 * fact only the platform holds, and `Accounts.changePassword` answers it alone
 * once the form is well-formed. Nor is there a rule that the new one differ from
 * the old: re-setting the same password is harmless and still ends every session,
 * which is the outcome that matters.
 */
export const passwordChangeRefusals = (
  newPassword: string,
  newPasswordAgain: string,
): readonly PasswordChangeRefusal[] => {
  const refused = newPasswordRefusal(newPassword)
  return [
    ...(refused ? [refused] : []),
    ...(newPassword !== newPasswordAgain ? (['account.passwords_differ'] as const) : []),
  ]
}

/**
 * Where randomness comes from, injected for the reason `IdSource` is: a generator
 * that reaches for `crypto` from inside the domain is no longer a pure function of
 * its inputs, and a test that cannot say which password it produced can only assert
 * that a random string is a random string.
 *
 * The real one is wired in the container beside `randomIds`;
 * `createFixedChoices` is what the tests pass.
 */
export interface RandomSource {
  /** A whole number in `[0, upperBound)`, every value equally likely. */
  choose(upperBound: number): number
}

/**
 * The deterministic source, in the same spirit as `createSequentialIds`: the picks
 * are given in order and cycle, so a test names the words it expects rather than
 * asserting against whatever came out.
 *
 * A pick outside the bound throws rather than wrapping. Wrapping would let a test
 * assert confidently against a word it had not actually chosen.
 */
export const createFixedChoices = (...picks: readonly number[]): RandomSource => {
  if (picks.length === 0) throw new Error('A fixed source of choices needs at least one')

  let taken = 0
  return {
    choose: (upperBound) => {
      const pick = picks[taken++ % picks.length]!
      if (!Number.isInteger(pick) || pick < 0 || pick >= upperBound) {
        throw new Error(`A fixed choice of ${pick} is outside [0, ${upperBound})`)
      }
      return pick
    },
  }
}

/**
 * How many words a generated password is. Four of them out of 1024 is forty bits,
 * and about twenty-four characters -- long enough to be worth having and short
 * enough to say down a phone line without losing your place.
 */
export const WORDS_IN_A_PASSWORD = 4

/**
 * A password Discipler chose, for somebody to read out loud.
 *
 * Words rather than characters, because of how this one travels: it is spoken
 * across a room or down a phone line and then typed on a phone keyboard, and
 * anything an Admin has to spell out letter by letter is a password the person on
 * the other end gets wrong. See ticket 28 and
 * `docs/adr/0016-a-password-change-ends-every-session.md` for what it is for.
 *
 * The four draws are independent, so the same word can come up twice. That is left
 * alone rather than corrected: excluding what has already been drawn would make
 * each word depend on the ones before it for a gain of nothing -- forty bits either
 * way, to the nearest bit -- and a Ministry seeing `willow` twice has seen a
 * coincidence, not a fault.
 */
export const generatePassword = (random: RandomSource): string =>
  Array.from({ length: WORDS_IN_A_PASSWORD }, () => {
    const word = PASSWORD_WORDS[random.choose(PASSWORD_WORDS.length)]
    // The source promised a number inside the list and handed back something else.
    // Thrown rather than defaulted: a password quietly built out of the same
    // fallback word is one nobody would notice until it was somebody's credential.
    if (word === undefined) throw new Error('A password source chose a word off the list')
    return word
  }).join('-')
