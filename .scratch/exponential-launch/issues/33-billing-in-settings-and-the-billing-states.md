# 33 - Billing in Settings and the billing states

> **Triaged 2026-10-31 against the spec's "Billing", its mock-up 5 decisions and its triage decisions.**
> The screens are in `.lavish/refer-billing/`, built by `build.mjs`: `settings.html`, `billing-trial.html`, `billing-paying.html`, `billing-canceling.html`, `billing-past-due.html`, `overview-past-due.html`, `overview-ended.html`, `restart.html` and `email-trial-ending.html`.

**What to build:** Settings' Billing card and Discipler's own Billing page, showing the Stripe details and opening Stripe's billing page at the right step; the past-due and ended banners, the read-only dashboard with its restart page, and the trial-ending email.

**Blocked by:** 04, 05

**Status:** ready-for-human

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
- An approved church plant is not about to be charged, so this email must not tell it that it is: read `church_plant_application.decision` before sending it (ticket 19's comments).
  Whether such a church gets no email or a differently worded one was not drawn, and is James's to choose.

## Acceptance

- A canceled church's Admin can read every page and change nothing, and can restart.
- A past-due church keeps texting during Stripe's retries.
- A restart is charged the same day, at the normal price, with no trial.
- An Intake submitted through an old link while a church has ended is kept, and nothing is texted.
- SAU BCM sees no Billing card.

## For James

1. The bank payer's line under Update payment method is new wording, not drawn: "To use a different bank account, email support@trydiscipler.com." Change it here if you want other words.

## Comments

### 2026-11-04: built on `wave4/33`, not merged

**What was built.**
Settings' first card and `/settings/billing` show what `createStripeAccount` in `src/platform/stripe/account.ts` reads from Stripe on the server, with nothing stored beyond IDs.
Update payment method and Cancel subscription post to `/settings/billing/open`, which opens Stripe's billing page at that step, and Keep my subscription posts to `/settings/billing/keep`.
`BillingBanner` in `app/billing-banner.tsx` sits in both shells, reading `admin.billing` as the webhook wrote it, so Stripe being away cannot hold a page up.
`middleware.ts` refuses every POST from an ended church except those in `changesTheChurchsWork`'s allow-list in `src/domain/read-only.ts`, so a route added later is refused unless someone says otherwise.
`/settings/billing/restart` is `restartSubscription` in `src/service/restart-subscription.ts` behind the Payment Element, at the normal price, with no trial and no schedule.
`watchTrialEndings` in `src/service/trial-ending-watch.ts` runs on the tick and sends `trialEndingEmail` in `src/domain/trial-ending.ts`, keeping who was sent it in the operator-only `trial_ending_email`.
The migration is `20261104110033_the_trial_ending_email.sql`, which adds that table and `public.billing_page()`, and leaves `app.page_session()` alone.
`app/help/content/billing.md` now says what is kept and how cancelling works.
`ACCEPTED_PAYMENT_METHODS` is unchanged.

**How it was checked.**
The domain and app tests hold the rule that every POST route is either refused or named, the mock-up's words, and what is read from Stripe.
`tests/integration/the-trial-ending-email.test.ts`, `restarting-a-subscription.test.ts` and `the-billing-states-over-http.test.ts` drive the real tables, the routes and a built server, with a fake at Stripe, and cover the acceptance list.
The full locked suite passed: 346 files with none skipped, and 5826 tests with 1 skipped, the older `it.skip` in `tests/integration/invitation-over-http.test.ts`.
The type check is clean.
The run before that failed one test, in `tests/integration/forgot-password-over-http.test.ts`, which still expected the link commit 4c3e412 took away, so this branch makes the same change `launch/wave-4` made in aa02c4f.

A production build in headless Chrome, at 390 pixels and at desktop width, beside `.lavish/refer-billing/`, with a local stand-in for Stripe's API and for `js.stripe.com`:

- Billing in the trial, paying with a bank and a credit, cancelling, past due and ended, the question for a church on a schedule, and a Link payer.
- Settings' card for a church in a trial and an ended one.
- The past-due banner on the Overview, the ended banner on the Overview, the Roster and Settings, and Import Dataset dimmed and not pressable.
- The restart page, and the trial-ending email.
- At desktop width only, a church billed outside Stripe, with no Billing card and no banner.

With real mouse events against the same stand-ins:

- Cancel subscription on a schedule opened the question, and "Yes, cancel my subscription" sent the schedule `end_behavior=cancel`.
- Keep my subscription sent it `end_behavior=release`.
- Cancel subscription with no schedule, and Update payment method from Billing and from the banner, reached a stand-in billing page with the right `flow_data[type]`.
- Restart Discipler, Yearly and "Restart my subscription" made the Subscription and reached "Restarting Discipler...".

A POST to `/settings/save` from an ended church, from the browser and from curl, was refused with a 303, and the name did not change.

The look found four things the tests had not, all fixed:

- The plan rows used the class `.kv`, which `public/discipler.css` already styles for the Roster and the pair card, so they squeezed into two columns and hid dates. They are now `.plan-rows`.
- A relative address in the refusal in `middleware.ts`, tried while fixing a failing test, made Next answer a 500. It is absolute, as in every other route.
- At 390 the last column of Past bills was cut off, in the mock-up too, so the table's padding is smaller on a phone.
- The restart page's legend was the wrong size, because `legend.plain` outranked it.

Two things differ from the mock-ups on purpose, because they belong to the existing pages:

- The real Settings page keeps its own narrow "Ministry Settings" layout, where `settings.html` draws it wide under the tabs.
- The botanical art behind Billing is the art already behind the Overview, and is smaller than the mock-up's.

One thing looks off and was left: at 390 the Overview's empty donuts break "No check-ins last week" at the hyphen. It is older than this ticket and has nothing to do with billing.

**What was never tried.**
Nothing touched real Stripe, so every Stripe answer behind the tests and the look is a stand-in written from Stripe's documents.
Nothing inside Stripe's frames, its billing page or its Payment Element was seen.
A sandbox has to answer these before launch:

- whether Stripe's page offers a bank in the update step, since its documents say "Customers can't manually enter a new bank account in the portal";
- whether a schedule cancels and previews as `cancelOnItsSchedule` and `previewOf` expect;
- whether the deferred Payment Element shows the method on file through the Customer Session;
- a restart by bank;
- a past-due retry after a new method;
- how a bank's name is capitalized, which may be all capitals;
- whether the amount the page confirms always matches the charge.

**Something in ticket 04 was wrong.**
Ticket 04 says "Canceling a Subscription with a schedule goes through the Portal as usual".
Stripe's customer management documents, read 2026-11-04, say "Customers can't update or cancel subscriptions that currently have an update scheduled with a subscription schedule."
Every church with an offer is on a schedule, so Cancel subscription would have failed for exactly the churches the launch is for.
See the first decision below.

**Decisions on gaps, each with its alternative.**

1. A church on a schedule cancels on Billing, not on Stripe's page.
   `/settings/billing/open` sends it to `?cancel=ask`, a drafted question, and `/settings/billing/cancel` shortens the schedule to its next bill with `end_behavior: 'cancel'`, keeping the phases in its metadata for Keep my subscription to put back.
   The line "These open Stripe's secure billing page" would be false for that church, so it reads a drafted line instead.
   The alternative is to release the schedule and send the church to Stripe's page, which loses the offers, so changing its mind would raise its price.
2. An unfinished restart must not take a church out of `ended`.
   `currentSubscription` in `src/domain/billing.ts` now ranks a live Subscription above an ended one and an `incomplete` one below it, so a restart abandoned on the payment page does not count.
   The alternative is to write nothing to Stripe until the payment is confirmed, which the Payment Element's confirmation secret does not allow.
3. The webhook has two new events, `customer.updated` and `subscription_schedule.updated`, making fifteen.
   Stripe's page sets only the Customer's default, and a Subscription holding its own default would go on charging the old card, so `customer.updated` follows it with `followCustomersDefault`.
   `subscription_schedule.updated` is how a cancellation on a schedule reaches the record, read by `factsOf.cancelsAt` from the schedule's end.
   The alternative for the first is never setting a Subscription's own default, which changes tickets 03 and 04's sign-up.
4. Read-only is enforced in the middleware by an allow-list, with the CSS only drawing it.
   Buttons and primary link-buttons in `main` dim as the mock-up's `.readonly main button, .readonly main .btn` does, except the Billing card, secondary links and links leaving Discipler, because those only go somewhere to read.
   The setup bar is hidden when ended, as the mock-up dims it to nothing a church can use.
   The alternative is checking in each route, which a new route could forget.
5. The trial-ending email keeps a row per Admin and may go late, up until the trial ends, so a failed send or an Admin added that week still gets it.
   The alternative is one row per Subscription, which is simpler and loses a failed send's retry.
6. An approved church plant gets no trial-ending email, as asked, and it is on the list for James with its alternative.
7. A restart uses the Customer's credit, so the Element's amount is the price less the credit, and where the credit covers it the page has a drafted form with no Element.
   It writes no `trial_opening` row, because no trial opens.
   The alternative is ignoring the credit on a restart, which would strand money the church earned.
8. Billing uses `AdminShell` with its tabs as drawn, which needs `public.billing_page()`, so its layout reads the one document every Admin page reads.
   The alternative is the plain `PageShell`, which the mock-up does not draw.
9. Search's Billing entry goes to the page, and a church billed outside Stripe that picks it lands on Settings.
   The alternative is hiding the entry per church, which the directory does not know how to do.
10. An ended church's page has a drafted "Ended" row and Restart Discipler in the Payment method card, because the mock-up draws four states and not this one.
    The alternative is sending it straight to the restart page, which would hide its past bills.
11. A bill still on its way, a bank debit, reads "Processing", because "Not paid" would be false.
12. The ticket puts the banners on every Admin page, and `billing-past-due.html` draws Billing with the failed payment once, in its own box and with no banner.
    The mock-up wins, so Billing drops the banner only while that box is showing, and keeps it if Stripe cannot be read.
    The alternative is both, which says the same thing twice with two identical buttons.

**Ticket 19's cycle concern.**
Ticket 19 reads the cycle from `trial_opening`, so a church that moved between monthly and yearly would be scheduled on the old one.
This work adds no way to move: plan switching is off in the billing page's configuration, so `trial_opening` stays true for a live Subscription.
A restart is a new Subscription with its own cycle and no `trial_opening` row, so approval refuses it as `no_subscription` and does not schedule the old cycle.
A cancellation on a schedule now shows in `cancelsAt`, so approval refuses it as `subscription_ending`.
Whatever later adds a way to change cycle has to change approval too.

**For James.**
The drafts and choices are in `docs/open-questions.md` under "sign-up's numbers and wording", marked ticket 33.
Three steps are his in Stripe: add both new events to the webhook endpoint, rerun the catalog to create the billing page's configuration, and give the restricted key Customer Sessions, Customer Portal sessions and configurations, and read on Invoices and Payment Methods.

**What later tickets must build on.**

- A new POST route is refused for an ended church unless it joins `STAY_OPEN` in `src/domain/read-only.ts`, and `tests/app/every-route-an-ended-church-can-post-to.test.ts` lists every route.
- A payment method can have no details, so nothing may assume a last four.
- Whoever merges this beside ticket 32 will find its `.page-head` rules in `public/discipler.css` twice, which is harmless and can lose one copy.
