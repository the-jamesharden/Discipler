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
import { EXPONENTIAL_OFFER } from './launch-terms'
import { offerFor } from './offers'
import { calendarDayOf, localHourOf, startOfNextDayIn } from './week'

/**
 * The one reminder a church that left the payment step is sent (Exponential launch,
 * ticket 18). Its words are James's, and its design is the approved mock-up's,
 * `s8-reminder-email.html`.
 */

/** The hour on the church's clock it goes at, or the first tick after. */
export const PAYMENT_REMINDER_HOUR = 9

/**
 * Whether now is when it goes: at or after 9am on the calendar day after the church
 * opened, in the church's timezone. On no other day, so a day of ticks that were all
 * missed costs the reminder and never sends it a day late.
 */
export const paymentReminderIsDue = ({
  openedAt,
  timeZone,
  now,
}: {
  readonly openedAt: Date
  readonly timeZone: string
  readonly now: Date
}): boolean =>
  calendarDayOf(now, timeZone) === calendarDayOf(startOfNextDayIn(openedAt, timeZone), timeZone) &&
  localHourOf(now, timeZone) >= PAYMENT_REMINDER_HOUR

/** How far back a church can have opened and still be due: the next day ends inside this. */
export const PAYMENT_REMINDER_LOOKS_BACK_MS = 3 * 24 * 60 * 60 * 1000

export const firstNameOf = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? fullName

/** Whether a code the church saved is still good today, as the payment step would read it. */
export const paymentReminderSaysTheOffer = (carriedCode: string | null, at: Date): boolean =>
  offerFor({ code: carriedCode ?? '', invited: false, at }).offer === 'exponential'

/** December 11, from the one place the last day is written. */
const offerLastDay = (): string => {
  const [year, month, day] = EXPONENTIAL_OFFER.lastDay.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

export interface PaymentReminder {
  /** The church's ID, which is all that makes this email this email. */
  readonly church: string
  readonly churchName: string
  readonly firstName: string
  readonly to: EmailAddress
  /** Opens `/`, which asks for sign-in and goes on to the payment step. */
  readonly start: URL
  /** The signed page behind "Don't send me reminders". */
  readonly stop: URL
  readonly logo: URL
  readonly offerSaved: boolean
}

const OFFER_SAVED = 'Your Exponential special offer is saved'

export const paymentReminderEmail = (reminder: PaymentReminder): Email<'paymentReminder'> => {
  const church = EmailField.line(reminder.churchName)
  const firstName = EmailField.line(reminder.firstName)
  const start = EmailField.link(reminder.start)
  const stop = EmailField.link(reminder.stop)
  const logo = EmailField.link(reminder.logo)
  const until = EmailField.line(offerLastDay())
  const offerSaved = EmailField.line(OFFER_SAVED)

  return {
    kind: 'paymentReminder',
    to: reminder.to,
    once: reminder.church,
    subject: emailSubject`Finish setting up ${church} on Discipler`,
    body: EmailBody.joined(
      emailBody`You're one step away

${firstName}, we are so excited that you are considering Discipler for your church. We want to help you help your people by making mentorship something that is easy to manage.

All that's left is clicking start and initiating your free trial!

Start: ${start}

`,
      reminder.offerSaved
        ? emailBody`${offerSaved} until ${until}.

`
        : emailBody``,
      emailBody`If anything got in the way, please let us know and we are happy to help.

Thank you,
James Harden
Founder and CEO, Discipler

You're receiving this because you started an account for ${church} at app.trydiscipler.com. This is the only reminder we'll send.
Don't send me reminders: ${stop}
`,
    ),
    html: EmailHtml.joined(
      emailHtml`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 16px;background:#eceae6;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#2d2d2d;line-height:1.6">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e8dfd5;border-radius:8px;overflow:hidden">
<div style="background:#f5f1eb;padding:22px 32px;border-bottom:1px solid #e8dfd5"><img src="${logo}" alt="Discipler" height="34" style="height:34px;width:auto;display:block"></div>
<div style="padding:29px 32px 26px;font-size:15px">
<h1 style="font-family:'Crimson Pro',Georgia,serif;color:#2d5016;font-size:26px;line-height:1.2;font-weight:600;margin:0 0 16px">You're one step away</h1>
<p style="margin:0 0 16px">${firstName}, we are so excited that you are considering Discipler for your church. We want to help you help your people by making mentorship something that is easy to manage.</p>
<p style="margin:0 0 16px">All that's left is clicking start and initiating your free trial!</p>
<a href="${start}" style="display:inline-block;background:#2d5016;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;margin:5px 0 21px">Start</a>
`,
      reminder.offerSaved
        ? emailHtml`<div style="background:#f9f4ea;border:1px solid #c9a86a;border-radius:8px;padding:13px 16px;font-size:14px;margin:0 0 19px"><strong>${offerSaved}</strong> until ${until}.</div>
`
        : emailHtml``,
      emailHtml`<p style="margin:0 0 16px">If anything got in the way, please let us know and we are happy to help.</p>
<p style="margin:22px 0 0">Thank you,<br>James Harden<br>Founder and CEO, Discipler</p>
</div>
<div style="padding:16px 32px 22px;font-size:12px;color:#888888;border-top:1px solid #f0ebe4">You're receiving this because you started an account for ${church} at app.trydiscipler.com. This is the only reminder we'll send. <a href="${stop}" style="color:#888888">Don't send me reminders</a></div>
</div>
</body></html>
`,
    ),
  }
}
