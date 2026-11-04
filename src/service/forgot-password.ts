import { newPasswordRefusal, type NewPasswordRefusal } from '~/domain/accounts'
import type { Clock } from '~/domain/clock'
import { asEmailAddress, type EmailAddress } from '~/domain/email'
import { passwordResetEmail, readPasswordResetToken, type PasswordResetToken } from '~/domain/password-reset'
import { HUMAN_CHECK_ACTIONS } from '~/domain/sign-up-attempt'
import { whyNotSent } from './email-sender'
import type { Accounts, EmailSender, HumanCheck, PasswordResetLinks, SignInLimit } from './ports'

/**
 * "Forgot your password?" (Exponential launch, ticket 22; ADR-0030): an Admin with a
 * verified email asks for a link, is emailed one, and chooses a new password with it.
 *
 * **Asking answers the same whoever is asking about.** An address on an Admin's account
 * gets an email and any other gets nothing, and the caller gets one value back for
 * both, in about the same time. So the send is not part of the answer: `ask` hands back
 * `deliver`, which the route runs after the response, because a round trip to Resend is
 * exactly the difference a patient outsider could time.
 *
 * **Nothing logs a token.** It exists in this file between `ask` and the sender, and
 * what is logged around it is the link's row ID and the vendor's status: never the
 * error's message, which is the vendor's own words about a request that held the link.
 *
 * **It does not sign anybody in.** The password is set, every session on the account
 * ends as ADR-0016 says, and the page goes to `/login`. Every refusal is a code; the
 * screen owns the sentences.
 */

export type ForgotPasswordRefusal =
  /** Cloudflare did not pass the token, or a secret is unset. */
  | 'forgot.not_human'
  /** What was typed is not an address, so there is nothing to answer about. */
  | 'forgot.bad_email'

export type ChoosingRefusal =
  | NewPasswordRefusal
  /** It ran out, was used, was replaced, or never was. One answer for all four. */
  | 'forgot.link_dead'
  /** The password could not be set. Nothing is spent, so pressing again is right. */
  | 'forgot.not_saved'

export type LinkAsking =
  | {
      readonly sent: EmailAddress
      /** The email, for after the response. It does nothing when no email is owed, and never throws. */
      readonly deliver: () => Promise<void>
    }
  | { readonly refusal: ForgotPasswordRefusal }

export interface ForgotPassword {
  ask(request: {
    readonly email: string
    readonly humanToken: string
    readonly network: string | null
  }): Promise<LinkAsking>
  /** Whether the link's page shows the form. Opening a link spends nothing. */
  linkIsLive(token: string): Promise<boolean>
  /** The button on the link's page, which is what spends it. */
  choose(request: {
    readonly token: string
    readonly password: string
  }): Promise<{ readonly changed: true } | { readonly refusal: ChoosingRefusal }>
}

export const createForgotPassword = ({
  links,
  humanCheck,
  sender,
  accounts,
  signIns,
  addresses,
  clock,
}: {
  readonly links: PasswordResetLinks
  readonly humanCheck: HumanCheck
  readonly sender: EmailSender
  readonly accounts: Pick<Accounts, 'setPassword'>
  readonly signIns: Pick<SignInLimit, 'forgive'>
  /** Where a link opens and where the email's logo is, read when an email goes. */
  readonly addresses: {
    readonly link: (token: PasswordResetToken) => URL
    readonly logo: () => URL
  }
  readonly clock: Clock
}): ForgotPassword => {
  const liveToken = async (typed: string): Promise<PasswordResetToken | null> => {
    const token = readPasswordResetToken(typed)
    return token && (await links.isLive(token, clock.now())) ? token : null
  }

  return {
    async ask({ email: typed, humanToken, network }) {
      // The form before the token, so a refused form spends no token.
      const email = asEmailAddress(typed)
      if (!email) return { refusal: 'forgot.bad_email' }

      if (!(await humanCheck.verify(humanToken, HUMAN_CHECK_ACTIONS.forgotPassword))) {
        return { refusal: 'forgot.not_human' }
      }

      const link = await links.ask({ email, network, at: clock.now() })

      return {
        sent: email,
        deliver: async () => {
          if (!link) return
          try {
            await sender.send(
              passwordResetEmail({
                once: link.id,
                to: link.to,
                link: addresses.link(link.token),
                logo: addresses.logo(),
              }),
            )
          } catch (error) {
            // Nobody is waiting on this, and they have been told it went, so all there
            // is to do is say so where somebody can see it. They can ask again.
            console.error(`A reset email for link ${link.id} did not go: ${whyNotSent(error)}`)
          }
        },
      }
    },

    async linkIsLive(typed) {
      return (await liveToken(typed)) !== null
    },

    async choose({ token: typed, password }) {
      // The link before the password, so a dead link is told it is dead rather than
      // sent to fix a password it cannot use. A refused password spends nothing.
      const token = await liveToken(typed)
      if (!token) return { refusal: 'forgot.link_dead' }

      const refused = newPasswordRefusal(password)
      if (refused) return { refusal: refused }

      try {
        const spent = await links.spending(token, clock.now(), async (userId) => {
          await accounts.setPassword(userId, password)
          // Somebody who locked themselves out by guessing gets straight back in. The
          // password is what mattered, and the count runs out by itself in a few
          // minutes, so a failure here is logged and costs them nothing.
          await signIns.forgive(userId).catch((error: unknown) => {
            console.error(`Sign-in failures were not cleared after a reset: ${whyNotSent(error)}`)
          })
        })
        if (!spent) return { refusal: 'forgot.link_dead' }
      } catch (error) {
        console.error(`A password from a reset link was not set: ${whyNotSent(error)}`)
        return { refusal: 'forgot.not_saved' }
      }

      return { changed: true }
    },
  }
}
