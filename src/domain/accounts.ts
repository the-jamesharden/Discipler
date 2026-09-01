import { PASSWORD_WORDS } from './password-words'

/**
 * What an account is, stated where the domain can see it. The thing that creates
 * one lives at the platform edge -- it needs the key that can mint a user -- but
 * the rule about a password and the codes a refusal travels as are decisions this
 * product made, not decisions Supabase made, and the surfaces that render them
 * should not have to reach through an adapter to find out what they are.
 *
 * The credential is a phone number and a password, for every user, on one form.
 * See `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
 */

/**
 * Why minting an account was refused. Codes, never prose -- the page renders its
 * own wording, like every refusal.
 */
export type AccountCreationRefusal =
  | 'account.password_too_short'
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

/** Everything an account can be refused for, wherever it was asked. */
export type AccountRefusal = AccountCreationRefusal | PasswordResetRefusal

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

/** Short enough to type on a phone, long enough to be worth having. */
export const SHORTEST_PASSWORD = 8

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
