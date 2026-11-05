import {
  longDate,
  methodInWords,
  moneyOf,
  monthAndDay,
  priceOf,
  type BillingPicture,
  type PaymentMethodOnFile,
} from './billing-picture'
import {
  EmailBody,
  emailBody,
  EmailField,
  EmailHtml,
  emailHtml,
  emailSubject,
  type Email,
  type EmailAddress,
} from './email'
import { EXPONENTIAL_OFFER, TRIAL_ENDING_EMAIL_DAYS_BEFORE } from './launch-terms'
import { calendarDayOf, localHourOf } from './week'

/**
 * The email every Admin gets a week before a trial ends (Exponential launch, ticket 33).
 * Its words are James's, and its design is the approved mock-up's,
 * `.lavish/refer-billing/email-trial-ending.html`.
 */

/** The hour on the church's clock it goes at, or the first tick after. */
export const TRIAL_ENDING_EMAIL_HOUR = 9

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The calendar day it is due, in the church's timezone. Counted by calendar days at noon,
 * so a clock change inside the week does not move it.
 */
const dayItIsDue = (trialEndsAt: Date, timeZone: string): string => {
  const [year, month, day] = calendarDayOf(trialEndsAt, timeZone).split('-').map(Number) as [
    number,
    number,
    number,
  ]
  return new Date(Date.UTC(year, month - 1, day - TRIAL_ENDING_EMAIL_DAYS_BEFORE, 12))
    .toISOString()
    .slice(0, 10)
}

/**
 * Whether now is when it goes: from 9am on the day a week before the trial ends, for as
 * long as the trial lasts. Late is better than never here, unlike the payment reminder: a
 * church is told before its card is charged, even if the ticks were down that morning.
 */
export const trialEndingEmailIsDue = ({
  trialEndsAt,
  timeZone,
  now,
}: {
  readonly trialEndsAt: Date
  readonly timeZone: string
  readonly now: Date
}): boolean => {
  if (now >= trialEndsAt) return false
  const today = calendarDayOf(now, timeZone)
  const due = dayItIsDue(trialEndsAt, timeZone)
  return today > due || (today === due && localHourOf(now, timeZone) >= TRIAL_ENDING_EMAIL_HOUR)
}

/** How far ahead a trial can end and be due: the due day ends inside this. */
export const TRIAL_ENDING_LOOKS_AHEAD_MS = (TRIAL_ENDING_EMAIL_DAYS_BEFORE + 2) * DAY_MS

/** What is charged with, as it reads inside a sentence that begins "your". */
const whatIsCharged = (method: PaymentMethodOnFile | null): string => {
  switch (method?.kind) {
    case 'card':
    case 'bank':
      return methodInWords(method)
    case 'link':
      return 'Link account'
    default:
      return 'payment method on file'
  }
}

/**
 * The sentence that says what happens on the day. The monthly Exponential one is James's;
 * the rest follow it as drafts, because the mock-up draws only that one.
 */
export const whatTheDayCharges = (picture: BillingPicture): string => {
  const next = picture.nextPayment
  if (!next) return ''
  const method = whatIsCharged(picture.method)
  const first = picture.cycle === 'month' ? 'first month' : 'first year'
  const each = `${priceOf(picture.priceCents)} a ${picture.cycle}`
  const offer = picture.offers[0]?.kind
  const creditTaken = next.cents !== next.fullCents

  if (next.cents === 0) {
    return offer === 'first_free_month'
      ? 'Your first paid month is free, so nothing is charged that day.'
      : 'Your credit covers your first bill, so nothing is charged that day.'
  }

  const charged = `That day your ${method} is charged ${moneyOf(next.cents)} for your ${first}`
  const credit = creditTaken ? ', less your referral credit' : ''
  if (offer === 'exponential') {
    return `${charged}: ${each}, ${EXPONENTIAL_OFFER.discountPercent}% off your first year with your Exponential special offer${credit}.`
  }
  if (offer === 'first_free_month') {
    return `${charged}: ${each}, less your first month free${credit}.`
  }
  return `${charged}${credit}.`
}

export interface TrialEndingNotice {
  /** The church's and the Admin's IDs, which are all that make this email this email. A church has one trial. */
  readonly church: string
  readonly userId: string
  readonly churchName: string
  readonly firstName: string
  readonly to: EmailAddress
  readonly trialEndsAt: Date
  readonly timeZone: string
  readonly picture: BillingPicture
  readonly billing: URL
  readonly logo: URL
}

export const trialEndingEmail = (notice: TrialEndingNotice): Email<'trialEnding'> => {
  const church = EmailField.line(notice.churchName)
  const firstName = EmailField.line(notice.firstName)
  const endsOn = EmailField.line(longDate(notice.trialEndsAt, notice.timeZone))
  const endsOnShort = EmailField.line(monthAndDay(notice.trialEndsAt, notice.timeZone))
  const charge = EmailField.line(whatTheDayCharges(notice.picture))
  const billing = EmailField.link(notice.billing)
  const logo = EmailField.link(notice.logo)

  return {
    kind: 'trialEnding',
    to: notice.to,
    once: `${notice.church}/${notice.userId}`,
    subject: emailSubject`Your free trial ends ${endsOnShort}`,
    body: EmailBody.joined(
      emailBody`Your free trial ends in a week

${firstName}, thank you for trying Discipler with ${church}. Your free trial ends on ${endsOn}.

${charge}

If you'd like to keep going, there's nothing to do. To change your card or cancel, open Billing in Settings.

Open Billing: ${billing}

If you have any questions, just reply to this email.

Thank you,
James Harden
Founder and CEO, Discipler

You're receiving this because you are an Admin of ${church} on Discipler.
`,
    ),
    html: EmailHtml.joined(
      emailHtml`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 16px;background:#eceae6;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#2d2d2d;line-height:1.6">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e8dfd5;border-radius:8px;overflow:hidden">
<div style="background:#f5f1eb;padding:22px 32px;border-bottom:1px solid #e8dfd5"><img src="${logo}" alt="Discipler" height="34" style="height:34px;width:auto;display:block"></div>
<div style="padding:29px 32px 26px;font-size:15px">
<h1 style="font-family:'Crimson Pro',Georgia,serif;color:#2d5016;font-size:26px;line-height:1.2;font-weight:600;margin:0 0 16px">Your free trial ends in a week</h1>
<p style="margin:0 0 16px">${firstName}, thank you for trying Discipler with ${church}. Your free trial ends on ${endsOn}.</p>
<p style="margin:0 0 16px">${charge}</p>
<p style="margin:0 0 16px">If you'd like to keep going, there's nothing to do. To change your card or cancel, open Billing in Settings.</p>
<a href="${billing}" style="display:inline-block;background:#2d5016;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;margin:5px 0 21px">Open Billing</a>
<p style="margin:0 0 16px">If you have any questions, just reply to this email.</p>
<p style="margin:22px 0 0">Thank you,<br>James Harden<br>Founder and CEO, Discipler</p>
</div>
<div style="padding:16px 32px 22px;font-size:12px;color:#888888;border-top:1px solid #f0ebe4">You're receiving this because you are an Admin of ${church} on Discipler.</div>
</div>
</body></html>
`,
    ),
  }
}
