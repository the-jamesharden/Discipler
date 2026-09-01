import type { PasswordResetRefusal } from '~/domain/accounts'

/**
 * Everything the reset surface says in words. The boundary refuses in codes and
 * this screen owns the sentences, the way `app/login/failures.ts` and
 * `app/roster/copy.ts` already do it.
 *
 * A `Record` rather than a lookup with a default, like the pairing refusals: a code
 * added to `PasswordResetRefusal` and left unworded fails the build rather than
 * falling through to a sentence that names nothing.
 */
const REFUSALS: Record<PasswordResetRefusal, string> = {
  // Worded about the Roster rather than about the Person, and that is the whole care
  // in it. This one code covers two states -- a Person who holds no account, and a
  // Person this Ministry's Roster does not hold at all, who may well hold one
  // elsewhere -- because telling them apart would disclose another Ministry's
  // existence to an Admin with no business knowing it. A sentence claiming *this
  // person has no account* would be false in the second case, so it claims only what
  // is true in both, and says what would put one here.
  'account.no_account':
    'There is nothing on this Roster to reset. Somebody has a password once they have '
    + 'accepted an invitation to lead and made an account; most people on a Roster '
    + 'never have one.',
  'account.cannot_reset_yourself':
    'You cannot reset your own password from here. Ask another Admin of this ministry '
    + 'to do it for you.',
}

export const passwordResetRefusalMessage = (refusal: PasswordResetRefusal): string =>
  REFUSALS[refusal]

/** Whose password is about to change, said before anything has been pressed. */
export const resetHeading = (fullName: string): string => `Reset ${fullName}’s password`

/**
 * What pressing the button does, in the order an Admin needs it.
 *
 * The sign-out comes first because it is the part that is not obvious and the part
 * that interrupts somebody. Sessions here last on the order of a year, so an Admin
 * who resets a Leader mid-week has ended a session that would otherwise have run
 * until next summer -- and that is the point rather than a side effect
 * (`docs/adr/0016-a-password-change-ends-every-session.md`), because half of what a
 * reset is asked for is *somebody else has it*.
 */
export const resetWarning = (fullName: string): string =>
  `${fullName} will be signed out everywhere, on every device, straight away. They will `
  + 'need the new password to get back in.'

/**
 * That Discipler sends nothing, said before the reset and not after it. An Admin
 * who expected a text would otherwise press this and then wait.
 */
export const NOTHING_IS_SENT =
  'Discipler will show you the new password once, on the next screen. It is not '
  + 'texted or emailed to anybody — you read it out or write it down, and you will '
  + 'not be able to see it again.'

export const RESET_ACTION = 'Reset the password'

/** The result screen, once the password is set. */
export const resetDoneHeading = (fullName: string): string =>
  `${fullName}’s new password`

export const resetDoneInstruction = (fullName: string): string =>
  `Read this out to ${fullName} or write it down now. Discipler cannot show it again, `
  + 'and has sent it to nobody.'

/**
 * Said on the result screen, under the password. It is the sentence an Admin needs
 * when the Leader they have just read four words to says *it still works on my
 * phone* -- it does not, and the reason is the one above.
 */
export const SIGNED_OUT_EVERYWHERE =
  'Every session on this account has ended. Any device they were signed in on will '
  + 'ask for the new password.'

/**
 * The password landed and the record of it did not.
 *
 * Reported rather than swallowed, and reported without taking the password off the
 * screen. Both facts are true and the Admin needs both: the credential is set and
 * is the only copy anybody has, and this Ministry's history does not say who
 * changed it. A screen that hid the password to report the failure would turn one
 * problem into a locked-out Leader.
 */
export const RECORD_FAILED =
  'The password above is set and works. Discipler could not add this reset to the '
  + 'ministry’s history, so there is no record of who did it — tell whoever looks '
  + 'after this ministry’s Discipler account.'
