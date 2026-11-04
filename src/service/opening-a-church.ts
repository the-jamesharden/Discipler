import type { AccountCreationRefusal, NewPasswordRefusal } from '~/domain/accounts'
import type { PlantAnswers } from '~/domain/church-plant'
import type { Clock } from '~/domain/clock'
import { EmailField, emailBody, emailSubject, type EmailAddress } from '~/domain/email'
import { offerFor, type BillingCycle, type TrialOffer } from '~/domain/offers'
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
  /** The referral code the address carried, as it came, or null. Checked when the church opens. */
  readonly carriedRef: string | null
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
  readonly carriedRef: string | null
  readonly heardFrom: HeardFrom | null
  /** Its church-plant application, written in the same transaction, if it made one. */
  readonly plant?: PlantAnswers | null
}

/** The church and everything that goes with it, in one transaction, or why not. */
export type ChurchOpener = (church: ChurchToOpen) => Promise<
  | { readonly ministryId: string; readonly plantApplicationId?: string | null; readonly invited?: boolean }
  | { readonly alreadyOpened: true }
  | { readonly refusal: AccountCreationRefusal }
>

/** Every refusal an account can bring here is one the page can say. */
const openingRefusalOf = (refusal: AccountCreationRefusal): OpeningRefusal =>
  refusal === 'account.no_number_on_file' ? 'signup.not_opened' : (refusal satisfies NewPasswordRefusal | 'account.already_exists')

/** What the email to support@ calls each offer. */
const OFFER_FOR_SUPPORT: Record<TrialOffer, string> = {
  exponential: 'The Exponential special offer',
  referral: 'The first paid month free, invited by another church',
  none: 'None',
}

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
    invited: boolean,
    at: Date,
  ): Promise<void> => {
    const { offer } = offerFor({ code: carriedCode ?? '', invited, at })
    const name = EmailField.line(churchName)
    try {
      await sender.send({
        kind: 'newSignUp',
        subject: emailSubject`${name} signed up for Discipler`,
        body: emailBody`${name} just signed up for Discipler.

Where it heard about us: ${EmailField.line(heardFrom ? heardFromLabel(heardFrom) : 'It did not say')}
Offer: ${EmailField.line(OFFER_FOR_SUPPORT[offer])}

It has not added a card or bank account yet, and cannot text until it does.`,
        once: ministryId,
      })
    } catch (error) {
      console.error(`The new sign-up email for church ${ministryId} did not go: ${whyNotSent(error)}`)
    }
  }

  /**
   * After the commit, with no approve link: whoever can read that inbox must not be able
   * to approve a plant (ticket 19). A failure here never undoes the church, and the
   * operator's `list` still shows the application, so none is lost to a failed email. The
   * address is on it because James or Lerone follow up by email, and every reply to an
   * email Discipler sends goes to support@.
   */
  const tellTheFounders = async (
    applicationId: string,
    churchName: string,
    email: EmailAddress,
    plant: PlantAnswers,
  ): Promise<void> => {
    const name = EmailField.line(churchName)
    const line = (answer: string) => EmailField.line(answer)
    try {
      await sender.send({
        kind: 'churchPlantApplication',
        subject: emailSubject`Church plant application from ${name}`,
        body: emailBody`${name} applied for the church plant year when it signed up.

Launch date, or planned launch date: ${line(plant.launchDate)}
Sending or partner church: ${line(plant.sendingChurch)}
Average weekly attendance: ${line(plant.averageAttendance)}
Lead pastor: ${line(plant.leadPastor)}
Login email: ${EmailField.address(email)}

Anything else they'd like us to know:
${EmailField.quoted(plant.anythingElse ?? '(Nothing.)')}

Its ordinary trial starts either way. Approve or decline it with the church-plant command, using this ID:
${line(applicationId)}`,
        once: applicationId,
      })
    } catch (error) {
      console.error(`The church plant application email ${applicationId} did not go: ${whyNotSent(error)}`)
    }
  }

  return {
    async open({ attempt, humanToken, carriedCode, carriedRef, ...fields }) {
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
            carriedRef,
            heardFrom: form.heardFrom,
            plant: form.plant,
          })
        } catch (error) {
          console.error(
            `Opening a church failed on attempt ${ready.pendingSignupId}: ${error instanceof Error ? error.name : 'unknown'}`,
          )
          return { refusal: 'signup.not_opened' }
        }
        if ('alreadyOpened' in opened) return opened
        if ('refusal' in opened) return { refusal: openingRefusalOf(opened.refusal) }

        await tellSupport(opened.ministryId, form.churchName, form.heardFrom, carriedCode, opened.invited === true, at)
        if (form.plant && opened.plantApplicationId) {
          await tellTheFounders(opened.plantApplicationId, form.churchName, ready.email, form.plant)
        }

        return { opened: { ministryId: opened.ministryId, phone: ready.phone, password: form.password } }
      })
    },
  }
}
