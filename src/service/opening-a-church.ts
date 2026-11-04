import type { AccountCreationRefusal, NewPasswordRefusal } from '~/domain/accounts'
import type { Clock } from '~/domain/clock'
import { EmailField, emailBody, emailSubject, type EmailAddress } from '~/domain/email'
import { offerFor, type BillingCycle } from '~/domain/offers'
import type { PhoneNumber } from '~/domain/roster'
import {
  heardFromLabel,
  readAccountForm,
  type AccountFormFields,
  type AccountFormRefusal,
  type HeardFrom,
} from '~/domain/sign-up-account'
import { readAttemptToken } from '~/domain/sign-up-attempt'
import { whyNotSent } from './email-sender'
import type { EmailSender, PendingSignups } from './ports'
import type { SignUp } from './sign-up'

/**
 * **Start free trial**: a church opening itself (Exponential launch, ticket 17). The
 * page is `app/signup/account`, and the route beside it signs the Admin in once this
 * has answered.
 *
 * **One opening per attempt.** The whole of it runs under `PendingSignups.opening`,
 * taken before anything is asked, because an account is made before the transaction
 * that spends the attempt: without it, the second of a double click would be told the
 * phone is taken while the first was succeeding. It waits instead, then finds the
 * attempt spent, and opens nothing.
 *
 * **Only `readyToOpen` is believed about the email and the phone.** What the form holds
 * is what they typed on this page, and nothing else about the church comes from a
 * browser.
 *
 * Every refusal is a code; the screen owns the sentences. A fault is logged by its name
 * and the attempt's row ID, because a provisioning failure's words can hold a phone.
 */

export type OpeningRefusal =
  | AccountFormRefusal
  /** Their phone or their address already has an account. */
  | 'account.already_exists'
  /** Cloudflare did not pass the second token, so nothing is made. */
  | 'signup.not_human'
  /** No live attempt, or its proof lapsed while the page sat open: page one. */
  | 'signup.not_verified'
  /** Something failed that they cannot fix. Nothing is left behind, so asking again works. */
  | 'signup.not_opened'

export type ChurchOpening =
  /** Open. What the route signs the Admin in with, which goes no further than that. */
  | { readonly opened: { readonly ministryId: string; readonly phone: PhoneNumber; readonly password: string } }
  /** The attempt had already opened a church, so this request opened nothing. */
  | { readonly alreadyOpened: true }
  | { readonly refusal: OpeningRefusal }

export interface OpeningRequest extends AccountFormFields {
  readonly attempt: string | null | undefined
  readonly humanToken: string
  /** What the address carried, as it came, or null. Checked again when it is used. */
  readonly carriedCode: string | null
}

export interface OpeningAChurch {
  open(request: OpeningRequest): Promise<ChurchOpening>
}

/** What provisioning is asked for, in the terms of this file. */
export interface ChurchToOpen {
  readonly pendingSignupId: string
  readonly churchName: string
  readonly timezone: string
  readonly at: Date
  readonly admin: {
    readonly fullName: string
    readonly phone: PhoneNumber
    readonly email: EmailAddress
    readonly password: string
  }
  readonly agreedAt: Date
  readonly cycle: BillingCycle
  readonly carriedCode: string | null
  readonly heardFrom: HeardFrom | null
}

/** The church and everything that goes with it, in one transaction, or why not. */
export type ChurchOpener = (church: ChurchToOpen) => Promise<
  | { readonly ministryId: string }
  | { readonly alreadyOpened: true }
  | { readonly refusal: AccountCreationRefusal }
>

/** Every refusal an account can bring here is one the page can say. */
const openingRefusalOf = (refusal: AccountCreationRefusal): OpeningRefusal =>
  refusal === 'account.no_number_on_file' ? 'signup.not_opened' : (refusal satisfies NewPasswordRefusal | 'account.already_exists')

export const createOpeningAChurch = ({
  signUp,
  signUps,
  openChurch,
  sender,
  clock,
}: {
  readonly signUp: SignUp
  readonly signUps: PendingSignups
  readonly openChurch: ChurchOpener
  readonly sender: EmailSender
  readonly clock: Clock
}): OpeningAChurch => {
  /** After the commit, and a failure here never undoes the church. */
  const tellSupport = async (
    ministryId: string,
    churchName: string,
    heardFrom: HeardFrom | null,
    carriedCode: string | null,
    at: Date,
  ): Promise<void> => {
    const { offer } = offerFor({ code: carriedCode ?? '', invited: false, at })
    const name = EmailField.line(churchName)
    try {
      await sender.send({
        kind: 'newSignUp',
        subject: emailSubject`${name} signed up for Discipler`,
        body: emailBody`${name} just signed up for Discipler.

Where it heard about us: ${EmailField.line(heardFrom ? heardFromLabel(heardFrom) : 'It did not say')}
Offer: ${EmailField.line(offer === 'exponential' ? 'The Exponential special offer' : 'None')}

It has not added a card or bank account yet, and cannot text until it does.`,
        once: ministryId,
      })
    } catch (error) {
      console.error(`The new sign-up email for church ${ministryId} did not go: ${whyNotSent(error)}`)
    }
  }

  return {
    async open({ attempt, humanToken, carriedCode, ...fields }) {
      const token = readAttemptToken(attempt)
      if (!token) return { refusal: 'signup.not_verified' }

      return signUps.opening(token, async (): Promise<ChurchOpening> => {
        // Asked first, so the second of a double click is told what happened rather
        // than judged as a form of its own, and spends no token.
        if ((await signUps.read(token))?.spentAt) return { alreadyOpened: true }

        const read = readAccountForm(fields)
        if ('refusal' in read) return read
        const { form } = read

        const readiness = await signUp.readyToOpen({ attempt: token, humanToken })
        if ('refusal' in readiness) return readiness
        const { ready } = readiness

        const at = clock.now()
        let opened: Awaited<ReturnType<ChurchOpener>>
        try {
          opened = await openChurch({
            pendingSignupId: ready.pendingSignupId,
            churchName: form.churchName,
            timezone: form.timezone,
            at,
            admin: { fullName: form.fullName, phone: ready.phone, email: ready.email, password: form.password },
            agreedAt: ready.agreedAt,
            cycle: form.cycle,
            carriedCode,
            heardFrom: form.heardFrom,
          })
        } catch (error) {
          console.error(
            `Opening a church failed on attempt ${ready.pendingSignupId}: ${error instanceof Error ? error.name : 'unknown'}`,
          )
          return { refusal: 'signup.not_opened' }
        }
        if ('alreadyOpened' in opened) return opened
        if ('refusal' in opened) return { refusal: openingRefusalOf(opened.refusal) }

        await tellSupport(opened.ministryId, form.churchName, form.heardFrom, carriedCode, at)

        return { opened: { ministryId: opened.ministryId, phone: ready.phone, password: form.password } }
      })
    },
  }
}
