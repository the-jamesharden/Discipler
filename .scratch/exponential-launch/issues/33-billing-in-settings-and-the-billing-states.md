# 33 - Billing in Settings and the billing states

> **Triaged 2026-10-31 against the spec's "Billing", its mock-up 5 decisions and its triage decisions.**
> The screens are in `.lavish/refer-billing/`, built by `build.mjs`: `settings.html`, `billing-trial.html`, `billing-paying.html`, `billing-canceling.html`, `billing-past-due.html`, `overview-past-due.html`, `overview-ended.html`, `restart.html` and `email-trial-ending.html`.

**What to build:** Settings' Billing card and Discipler's own Billing page, showing the Stripe details and opening Stripe's billing page at the right step; the past-due and ended banners, the read-only dashboard with its restart page, and the trial-ending email.

**Blocked by:** 04, 05

**Status:** ready-for-agent

## The Billing card and page

- The Billing card is the first card in Settings: one line, for example "Free trial until December 30, 2026, then $77.60 a month · Visa ending 4242", and an "Open billing" button.
- The page is headed "Billing", "{Ministry}'s plan with Discipler. Any Admin can change it.", and shows, worded as each state's screen words it:
  - the plan, monthly or yearly, and its size ("Up to 200 people in active relationships");
  - the trial's end, or the next payment's amount and date;
  - any offer in force and when it ends;
  - any referral credit, "from a church you invited", and what is left of it;
  - the card brand, last four and expiry, or the bank name and last four with "Connected by bank sign-in";
  - Update payment method and Cancel subscription, with "These open Stripe's secure billing page, then bring you back here.";
  - past bills (date, what, amount, status, View), with "View opens the bill on Stripe, where it can be downloaded as a PDF."
- Everything is read from Stripe on the server and nothing is stored beyond IDs.
- The four states are drawn: in the trial, paying (with a referral credit), canceled and ending ("Your subscription ends on {date}." with Keep my subscription), and payment failed ("Your payment of {amount} on {date} didn't go through.").

## The rule

- Update payment method and Cancel subscription open Stripe's billing page at that step through Customer Portal flow links (`flow_data`), because Stripe's page cannot be framed.
- Keep my subscription undoes a cancellation at the end of the period; the webhook stays the only writer of billing state.
- Any Admin can open the Portal, through a POST route using the stored customer ID; the Portal's shareable login page stays off, and plan switching is off in it.
- Cancelling takes effect at the end of the paid month (Q80).
- A bank account is changed only through support@trydiscipler.com (spec, Billing), so a church paying by bank sees that under Update payment method.
- A church billed outside Stripe sees no Billing card, no Billing page and no banners.

## The banners

- They sit on every Admin page, under the tabs and above the setup bar, and cannot be closed.
- Payment failed, until the payment goes through: "Your last payment didn't go through. Discipler keeps running while Stripe tries again." with Update payment method.
  Everything keeps running during Stripe's retries.
- Ended: "Your subscription has ended. Check-ins have stopped and these pages are read-only. Everything is still here." with Restart Discipler.

## Ended

- Check-ins stop, every Admin page is read-only under the ended banner, history is kept, and participants are never texted about billing.
- Links people were already texted (an Intake form, an accept link, a Material page) keep working and their answers are kept, but nothing is texted until the church restarts (James, triage 2026-10-31).
- The restart page sits in sign-up's card: "Restart Discipler", "Your people, relationships and history are all still here. Check-ins start again on your next check-in day, {day} at {time}.", Monthly or Yearly, the Payment Element with the card or bank account on file, Restart my subscription, and "You'll be charged today. You can change or cancel any time in Settings, Billing."
- Restarting gives no second trial and no earlier offer: every offer ends with its subscription, and the church pays the normal price that day.
- Under Yearly, the restart page strikes through twelve monthly payments beside the yearly price ("$1,164" struck, then "$931.20 a year"); nowhere else shows a struck price.

## The trial-ending email

- Sent to the church's Admins 7 days before a trial ends, through ticket 10's sender; Stripe sends its own reminder too.
- As drawn and approved: subject "Your free trial ends {date}", heading "Your free trial ends in a week", the charge with the card and amount, an "Open Billing" button, signed James Harden, Founder and CEO.

## Acceptance

- A canceled church's Admin can read every page and change nothing, and can restart.
- A past-due church keeps texting during Stripe's retries.
- A restart is charged the same day, at the normal price, with no trial.
- An Intake submitted through an old link while a church has ended is kept, and nothing is texted.
- SAU BCM sees no Billing card.

## For James

1. The bank payer's line under Update payment method is new wording, not drawn: "To use a different bank account, email support@trydiscipler.com." Change it here if you want other words.
