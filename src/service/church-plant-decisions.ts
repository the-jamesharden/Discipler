import { currentSubscription, isConfirmedAndLive } from '~/domain/billing'
import type { PlantApplication, PlantDecision } from '~/domain/church-plant'
import type { Clock } from '~/domain/clock'
import { asEmailAddress, EmailField, emailBody, emailSubject, type EmailAddress } from '~/domain/email'
import { ministryId } from '~/domain/ids'
import { paidPhasesOf } from '~/domain/offers'
import { whyNotSent } from './email-sender'
import type {
  BillingRecords,
  ChurchPlantApplications,
  EmailSender,
  StripeBilling,
  StripeTrials,
} from './ports'

/**
 * Approving or declining a church-plant application (Exponential launch, ticket 19; Q27),
 * for the operator's command, `scripts/church-plant.ts`. Nothing else reaches this: no
 * email holds an approve link, because whoever can read that inbox could then approve
 * plants.
 *
 * **An approval is one unit.** It runs in the church's billing lock, the claim on the card
 * and the decision commit together, and Stripe's write is between them. A failure takes the
 * claim back and records nothing, and a second try finishes it, since scheduling twice is
 * scheduling once. The email goes after the commit, and a failure there undoes nothing.
 *
 * **A decision stands.** A second approval does nothing at Stripe and sends nothing, which
 * is asked before the lock and again inside it, in case two ran at once.
 */

export interface PlantDecisionWork {
  readonly applications: ChurchPlantApplications
  readonly records: BillingRecords
  readonly stripe: StripeBilling
  readonly trials: StripeTrials
  readonly sender: EmailSender
  readonly clock: Clock
}

export type PlantRefusal =
  | 'not_found'
  /** Already decided the other way. */
  | 'decided_otherwise'
  | 'outside_stripe'
  | 'no_subscription'
  | 'subscription_ending'
  | 'no_payment_method'
  /** Its card is saved, and the webhook has not yet done what follows that. */
  | 'not_settled_yet'
  | 'method_already_had_a_year'

/** What became of the email to the church. */
export type DecisionEmail = 'sent' | 'not_asked' | 'no_address' | { readonly failed: string }

export type PlantOutcome =
  | { readonly refused: PlantRefusal; readonly church: string | null }
  | {
      readonly already: PlantDecision
      readonly church: string
    }
  | {
      readonly approved: true
      readonly church: string
      /** A method with no fingerprint, such as Link, which could not be checked. */
      readonly methodUnchecked: boolean
      /** Past its trial, so the free year starts here, and any paid bill stays paid. */
      readonly nextBill: Date | null
      readonly email: DecisionEmail
    }
  | { readonly declined: true; readonly church: string; readonly email: DecisionEmail }

const dayIn = (timezone: string, at: Date): string =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: timezone }).format(at)

/** Drafted, for James: the wording of both emails is his (ticket 19). */
const approvalBody = (application: PlantApplication, nextBill: Date | null) => {
  const name = EmailField.line(application.churchName)
  return nextBill
    ? emailBody`Good news: ${name}'s church plant application is approved.

Your free year of Discipler begins at your next bill, on ${EmailField.line(dayIn(application.timezone, nextBill))}. You won't be charged during it, and anything you've already paid stays as it is.

When the free year ends, billing carries on as you chose when you signed up. If you have any questions, just reply to this email.`
    : emailBody`Good news: ${name}'s church plant application is approved.

Your free year of Discipler begins when your free trial ends. You won't be charged during it.

When the free year ends, billing carries on as you chose when you signed up. If you have any questions, just reply to this email.`
}

const declineBody = (application: PlantApplication) =>
  emailBody`Thank you for telling us about ${EmailField.line(application.churchName)}.

We aren't able to offer your church the free year for church plants. Your subscription carries on just as it is.

If you have any questions, or something has changed, just reply to this email.`

const tellTheChurch = async (
  { sender }: PlantDecisionWork,
  application: PlantApplication,
  decision: PlantDecision,
  body: ReturnType<typeof emailBody>,
): Promise<DecisionEmail> => {
  const to: EmailAddress | null = application.adminEmail ? asEmailAddress(application.adminEmail) : null
  if (!to) return 'no_address'
  try {
    await sender.send({
      kind: 'churchPlantDecision',
      to,
      subject: emailSubject`Your church plant application`,
      body,
      once: `${application.id}/${decision}`,
    })
    return 'sent'
  } catch (error) {
    const why = whyNotSent(error)
    console.error(`The church plant decision email for ${application.id} did not go: ${why}`)
    return { failed: why }
  }
}

interface ApprovedInTheLock {
  readonly nextBill: Date | null
  readonly methodUnchecked: boolean
}

export const approvePlantApplication = async (
  work: PlantDecisionWork,
  applicationId: string,
): Promise<PlantOutcome> => {
  const { applications, records, stripe, trials, clock } = work

  const application = await applications.find(applicationId)
  if (!application) return { refused: 'not_found', church: null }
  const church = application.churchName
  if (application.decision === 'approved') return { already: 'approved', church }
  if (application.decision === 'declined') return { refused: 'decided_otherwise', church }

  const churchId = ministryId(application.churchId)
  const billing = await records.of(churchId)
  if (billing.state.standing === 'outside_stripe') return { refused: 'outside_stripe', church }
  const { customerId } = billing
  if (!customerId) return { refused: 'no_subscription', church }

  const settled = await records.establish(
    churchId,
    async (unit): Promise<{ readonly stopped: PlantOutcome } | ApprovedInTheLock> => {
      const stop = (refused: PlantRefusal) => ({ stopped: { refused, church } })

      const decided = await unit.plantDecisionOf(application.id)
      if (decided === 'approved') return { stopped: { already: 'approved', church } }
      if (decided === 'declined') return stop('decided_otherwise')

      const subscription = currentSubscription(await stripe.subscriptionsOf(customerId))
      if (!subscription) return stop('no_subscription')
      if (subscription.status === 'trialing' && subscription.awaitingPaymentMethod) {
        return stop('no_payment_method')
      }
      if (!isConfirmedAndLive(subscription)) return stop('no_subscription')
      // A schedule on it would take its ending away, and it is not for this to decide.
      if (subscription.cancelsAt) return stop('subscription_ending')

      const opening = await unit.openingOf(subscription.id)
      if (!opening) return stop('no_subscription')
      // Refused, because the webhook is about to schedule this Subscription's bills as
      // though it were no plant, which would write over the free year.
      if (!opening.settled) return stop('not_settled_yet')

      const method = await trials.confirmDefaultPaymentMethod(subscription.id, customerId)
      if (!method) return stop('no_payment_method')

      // A method with no fingerprint has not used anything up, and cannot be held to it.
      if (method.fingerprint && !(await unit.claimFingerprint(method.fingerprint, 'plant_year', clock.now()))) {
        return stop('method_already_had_a_year')
      }

      await trials.schedulePhases(
        subscription.id,
        paidPhasesOf({ cycle: opening.cycle, offer: opening.offer, plantYear: true }),
      )
      await unit.recordPlantDecision(application.id, 'approved', clock.now())

      return {
        nextBill: subscription.status === 'trialing' ? null : subscription.currentPeriodEndsAt,
        methodUnchecked: method.fingerprint === null,
      }
    },
  )
  if ('stopped' in settled) return settled.stopped

  const email = await tellTheChurch(work, application, 'approved', approvalBody(application, settled.nextBill))
  return { approved: true, church, methodUnchecked: settled.methodUnchecked, nextBill: settled.nextBill, email }
}

export const declinePlantApplication = async (
  work: PlantDecisionWork,
  applicationId: string,
  { email: sendEmail }: { readonly email: boolean },
): Promise<PlantOutcome> => {
  const { applications, records, clock } = work

  const application = await applications.find(applicationId)
  if (!application) return { refused: 'not_found', church: null }
  const church = application.churchName
  if (application.decision === 'declined') return { already: 'declined', church }
  if (application.decision === 'approved') return { refused: 'decided_otherwise', church }

  // In the lock, so it cannot land in the middle of an approval of the same application.
  const already = await records.establish(ministryId(application.churchId), async (unit) => {
    const decided = await unit.plantDecisionOf(application.id)
    if (!decided) await unit.recordPlantDecision(application.id, 'declined', clock.now())
    return decided
  })
  if (already === 'declined') return { already: 'declined', church }
  if (already === 'approved') return { refused: 'decided_otherwise', church }

  const email = sendEmail ? await tellTheChurch(work, application, 'declined', declineBody(application)) : 'not_asked'
  return { declined: true, church, email }
}

const REFUSED: Record<PlantRefusal, string> = {
  not_found: 'There is no application with that ID. `list` shows the ones with no decision.',
  decided_otherwise:
    'This application has already been decided the other way, and a decision stands. Nothing was changed, at Stripe or here.',
  outside_stripe: 'This church is billed outside Stripe, so there are no bills to make free. Nothing was changed.',
  no_subscription:
    'This church has no live Subscription opened through sign-up, so there is nothing to put a free year on. Nothing was changed.',
  subscription_ending:
    'This church\'s Subscription is set to end, so a free year cannot go on it. Nothing was changed. It can be approved if the church stays.',
  no_payment_method:
    'This church has not confirmed a card or bank account yet, so it cannot be checked. Nothing was changed. Approve it once it has one.',
  not_settled_yet:
    'Stripe has confirmed this church\'s card or bank account, and Discipler has not finished with that yet. Nothing was changed. Try again in a few minutes.',
  method_already_had_a_year:
    'This card or bank account has already had a church plant year at another church. Nothing was changed, and nothing was emailed.',
}

const sayEmail = (email: DecisionEmail): string => {
  if (email === 'sent') return 'The church has been emailed.'
  if (email === 'not_asked') return 'Nothing was emailed, because --email was not passed.'
  if (email === 'no_address') return 'The church has no address on its account, so nothing was emailed. Write to it by hand.'
  return `The email to the church did not go (${email.failed}), and the decision stands. Write to it by hand.`
}

/** What the operator is told, a sentence to a line. */
export const plantOutcomeSentences = (outcome: PlantOutcome): readonly string[] => {
  if ('refused' in outcome) {
    return [outcome.church ? `${outcome.church}: ${REFUSED[outcome.refused]}` : REFUSED[outcome.refused]]
  }
  if ('already' in outcome) {
    return [`${outcome.church} was already ${outcome.already}. Nothing was done at Stripe, and nothing was emailed.`]
  }
  if ('declined' in outcome) return [`${outcome.church} is declined.`, sayEmail(outcome.email)]

  return [
    `${outcome.church} is approved.`,
    outcome.nextBill
      ? `Its trial has ended, so its free year starts at its next bill, ${outcome.nextBill.toISOString().slice(0, 10)}. Any bill already paid stays paid, and a refund is James's by hand.`
      : 'Its free year starts when its trial ends.',
    ...(outcome.methodUnchecked
      ? ['Its payment method has no fingerprint, such as Stripe Link, so it could not be checked against other churches.']
      : []),
    sayEmail(outcome.email),
  ]
}

export const refusedAPlant = (outcome: PlantOutcome): boolean => 'refused' in outcome
