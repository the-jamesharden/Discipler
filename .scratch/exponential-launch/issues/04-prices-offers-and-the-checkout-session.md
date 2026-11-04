# 04 - Prices, offers and opening the trial

> **Rewritten 2026-11-03 against the spec's "Self sign-up", "Prices", "Offers", "Billing" and "Decided in the mock-up 1 review", and the mock-up in `.lavish/signup-checkout/`.**
> Payment is Stripe's Payment Element inside Discipler's sign-up card, not Checkout, so there is no Checkout session; the file keeps its old name so the links to it hold.
> The page that shows the Element is ticket 18.
> Where this ticket as first written disagreed with the spec, the spec won.

**What to build:** The Stripe catalog, the route that opens a church's trial Subscription and hands back what the Element needs, the offers and the rules for their codes.

**Blocked by:** 03

**Status:** ready-for-agent

## The catalog

- One product, named "Discipler for Churches", with no description.
- Four prices: $97 and $147 a month, and $931.20 and $1,411.20 a year (20% off twelve monthly payments).
- Every church starts on the first price of the cycle it chose.
- Stripe Tax stays off.
- The catalog is written down in code and created by a script a person runs once per Stripe account; nothing in the build creates it.

## Opening the trial

- A POST route for a signed-in Admin of the church, checked with `session_is_live` and `tier = 'admin'`, and shut while sign-up is shut.
- The browser says only monthly or yearly and any code typed.
  Which church, which customer, which price and which trial are all the server's.
- The Stripe Customer is created first for that church, with the church name and the Admin's email only, and its ID stored on `ministry_billing`.
- The Subscription is created on the server with its trial, and carries the church's ID in metadata.
- The route answers with the setup intent's client secret, the publishable key and the trial's end date, which is all the Element and the page's line ("Your free trial ends on ...") need.
- Payment methods: card, Link, Apple Pay (as a card), and US bank account through Financial Connections instant verification only.
- Nothing is charged at sign-up; the card or bank account is saved, and the first real charge comes when the free days end.

## A Subscription that is not yet paid for

- A Subscription reads `trialing` from the moment it is created, before its setup intent is confirmed.
- Until that setup intent is confirmed, it counts as no access in the billing state, so a church that leaves the payment step sends no texts (spec, Self sign-up and Billing).
- A trial that runs out with no payment method is canceled by Stripe, and a church it happened to is one with no subscription, not one whose subscription ended.
- A church that comes back is handed the same Subscription while it still gives the full free days at the same choice; otherwise the old one is canceled and a new one is opened.
- A church that has ever had a confirmed Subscription cannot open another trial here.
  Restarting is ticket 33, with no trial and no offer.

## The offers

- A 30-day trial for every church.
- The Exponential special offer (`EXPO26`, any case): 60 days free instead of 30, then 20% off the first 12 monthly bills or the first yearly bill, counted from the first paid bill.
  It works until the end of 2026-12-11 Pacific, once per church, with no overall limit.
- After that the code is refused with "That code has expired, but your free trial still applies.", and sign-up carries on at the normal price.
- A church invited by another church gets its first paid month free, as a 100%-off first invoice after the trial.
- That does not stack with the Exponential special offer, which wins.
- The church-plant year is 12 months at 100% off after the trial, turned on only by the operator approval in ticket 19.
  It wins over the referral month, and a plant with `EXPO26` gets the plant year and then the offer's year.
- The sequences are a Subscription Schedule with phases, not stacked coupons, because a coupon's months count from when it is applied, and the free days would use them up.

## Acceptance

- A church with no offer gets a 30-day trial on $97.
- `EXPO26` gives 60 days and then 12 invoices at $77.60.
- `EXPO26` after 2026-12-11 Pacific is refused with "That code has expired, but your free trial still applies.", and sign-up carries on at the normal price.
- A referral and `EXPO26` together apply only the Exponential special offer.
- The same payment fingerprint cannot get a second first free month or a second plant year.
- Nothing about a church ever comes from the browser.
- A church whose Subscription's setup intent is not confirmed has no access, and has access once it is.

## For James

1. **Create the catalog once in each Stripe account, staging's sandbox first.**
   `STRIPE_SECRET_KEY=<a key that can write products, prices and coupons> npm run stripe:catalog`.
   It only adds what is missing, so running it twice changes nothing.
   It may be a key made for the purpose and deleted afterwards.
2. **Give the restricted key in `STRIPE_SECRET_KEY` what this ticket writes:** Customers, Subscriptions, Subscription Schedules and Setup Intents write; Payment Methods and Prices read.
   Ticket 03's read access stays.
3. **Subscribe the webhook endpoint to a thirteenth event, `setup_intent.succeeded`,** in both accounts.
   Without it a church's access waits for the next event about its Subscription.
4. **Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** on Production and staging, each with its own account's `pk_`.
   The Marketplace integration may have set it already.
5. **Turn on Link and US bank account** in the Stripe Dashboard's payment methods, in both accounts, and verify the domain for Apple Pay (ticket 18 draws the button).
6. **Push the two migrations** before the build that uses them goes live.
7. **On staging, before the rehearsal, try what a fake cannot prove,** because nothing here has reached real Stripe:
   - A Stripe test clock on a church that used `EXPO26`: the invoices are $0, then twelve at $77.60, then $97.
   - The Payment Element for a bank account offers no typing of an account number.
   - After the test card is confirmed, the church reads `trialing`, and the Subscription carries a default payment method.

## Comments

### Built (2026-11-03)

Two migrations, unpushed: `20261104100400_a_trial_waits_for_its_payment_method.sql` and `20261104100401_what_a_trial_was_opened_with.sql`.
`payment_fingerprint_grant` is on `OPERATOR_ONLY_TABLES`, and `setup_intent.succeeded` is on `STRIPE_EVENTS_ACTED_ON`.
The route is `POST /signup/payment/open` (`app/signup/payment/open/route.ts`), behind the same switch as the rest of sign-up, answering refusal codes with their sentences from `app/signup/payment/copy.ts`.
The service is `src/service/open-trial.ts`; what happens once a setup intent is confirmed is `settleConfirmedTrial` in `src/service/stripe-events.ts`.
Stripe's writes are behind a new port, `StripeTrials`, adapted in `src/platform/stripe/trials.ts`; the catalog is `src/platform/stripe/catalog.ts`, run by `scripts/stripe-catalog.ts`.
The prices and offers are in `src/domain/offers.ts`, built on `src/domain/launch-terms.ts`.

### What the later tickets build on

- **Ticket 05:** `hasAccess` and `app.billing_has_access` are still the one answer.
  A Subscription whose setup intent is not confirmed reads standing `incomplete`, `hasAccess` false.
- **Ticket 18:** post `cycle` (`month` or `year`) and `code` to `/signup/payment/open`, and give the answer's `clientSecret` to the Element, which confirms with `stripe.confirmSetup`.
  Show `trialEndsAt` and `codeRefusal.message`.
  Afterwards wait for `billing.hasAccess`, as the webhook writes it; nothing the page says unlocks anything.
  `payment.already_paying` means go to Overview.
- **Ticket 19:** the approval reads the Subscription's opening with `unit.openingOf`, claims the card with `unit.claimFingerprint(print, 'plant_year', at)`, and calls `trials.schedulePhases(subscription, paidPhasesOf({ cycle, offer, plantYear: true }))`, which replaces the schedule's future phases.
  `confirmDefaultPaymentMethod` answers the fingerprint.
  `schedulePhases` writes the free days as the current phase, so it works during the trial; an approval after the trial has ended has to say the current paid phase instead.
- **Tickets 20 and 32:** the referral is not taken from the browser.
  Ticket 17's provisioning records who invited a church, and `TrialWork.invitations.wasInvited` is the one question this ticket asks; `getInvitations()` in the container answers no for every church until ticket 32's `referral` table exists, so no referral month can be given before then.
  The first-month rule, its coupons and its fingerprint check are built and tested behind it.
- **Ticket 32:** `trial_opening.offer` and `settled_as` say whether a church got its free month.
- **Ticket 33:** restarting does not use this route, which refuses with `payment.restart`.
  Canceling a Subscription with a schedule goes through the Portal as usual.
- **Ticket 37:** `payment_fingerprint_grant` holds the one first free month and one plant year per fingerprint; its acceptance needs nothing more for that line.

### Decisions

- **A not-yet-confirmed Subscription reads `incomplete`, not a new standing.** That standing already means "a subscription that has not finished starting, no access", and `billingStateOf` raises on a standing it does not know, so a new one would have had to land at once in everything reading it.
  The alternative, a standing such as `awaiting_payment_method`, says nothing more that a page needs.
- **What says a setup intent is confirmed:** the Subscription's `pending_setup_intent` is null or has status `succeeded`, as Stripe documents.
  It is read by expanding that field in the re-read, and kept on `billing_event` as `awaiting_payment_method`, so the state still comes only from the history.
  The alternative was reading it back from `setup_intent.*` events, which the re-read rule forbids.
- **`setup_intent.succeeded` is the event that opens access.** It is one more event at the endpoint, a thirteenth.
  Waiting for `customer.subscription.updated` alone would rest on Stripe sending one when the field clears, which I could not confirm from its docs.
- **A canceled Subscription whose setup intent never went through reads `no_subscription`, not `ended`.** Stripe says such a setup intent is left in place when the Subscription ends.
  Without this, a church that left the payment step and came back after the trial's length would see "Your subscription has ended" and be told to restart at full price with no trial, for something it never had.
- **Where the free days run out unconfirmed, Stripe cancels** (`missing_payment_method: 'cancel'`), so an abandoned Subscription does not sit invoicing nobody.
- **A church that comes back keeps its Subscription only if it would still get its full free days, within a day, at the same cycle and offer.** Otherwise the spec's "30 days" would quietly shrink each day it waited.
  The alternative, moving `trial_end` on the old one, cannot change the price or the offer.
  The old one's setup intent is canceled too, so a stale tab cannot save a card against nothing.
- **Opening runs inside the church's billing lock,** held across the Stripe calls, so a double click gets one Subscription.
  The cost is a connection held for up to a few seconds; the lock is per church and opening is rare.
- **The offer's phases and the fingerprint check happen once the setup intent is confirmed, in the event's processing, not at opening.** The fingerprint does not exist before then, and most opened Subscriptions with an offer would otherwise need a schedule built for a card that never comes.
  This is the first time processing writes to Stripe, so ticket 03's "reads only" now describes `StripeBilling` alone.
- **Recording and settling are two transactions.** Access is recorded and committed first, so a Stripe error writing a schedule cannot keep a pastor out while the tick retries it, an hour later.
- **The default payment method is set explicitly if Stripe has not.** Stripe's docs describe `save_default_payment_method` as acting "when payment succeeds", and a trial's setup intent is not a payment, and a trial with no default payment method cancels at its end under the rule above.
  The alternative was trusting it and finding out on the first church's trial-end date.
- **Phases rather than a coupon of 14 months,** which gives 13 discounted invoices when 60 days falls short of two months.
  Phase coupons are `forever`, since the phase ends them, and a last full-price phase takes the discount off before the schedule releases the Subscription; otherwise the discount would stay forever.
- **No `redeem_by` on the Exponential coupon.** The server enforces the date at opening.
  With `redeem_by`, a church that opened on December 11 and confirmed after midnight would have an event that fails forever.
- **The referral month for a yearly church is $77.60 off its first bill,** one twelfth of it.
  James confirmed this on 2026-11-03, and the spec now says so.
  A 100%-off first invoice, as written, would be a free year.
  The spec only prices this for monthly.
  James may prefer $97.
- **The payment methods are a list in the code,** `payment_settings.payment_method_types`, against Stripe's advice to use dynamic payment methods, because the spec names exactly which are accepted.
  A Dashboard setting would be one nobody reviews, and a method not turned on in the Dashboard fails loudly here.
- **A confirmed method with no fingerprint gets the free month.** A `link` payment method has none, and the rule is about a fingerprint already used.
  The alternative refuses a real pastor something promised, to stop an abuse worth one month.
- **The fingerprint is stored as Stripe gives it**, in an operator-only table.
  The spec's first protection keeps Stripe's IDs, and this is one, and it is what the ticket asks to compare.
  Hashing it adds nothing, since Stripe's fingerprints are already unique to this account.
- **A code that is not `EXPO26` is refused and sign-up carries on** with the same shape of answer.
  The spec only words the expired one, so "We don't recognize that code, but your free trial still applies." is a draft.
- **A church with a card that had its free month goes on with no free month, and is not told at this step,** since it has already pressed the button.
  It is recorded as `free_month_refused`.
  Whether it should hear about it is ticket 33's page to say.

### Drafted words, for James

All in `app/signup/payment/copy.ts`, and none shown until ticket 18:

- "We don't recognize that code, but your free trial still applies."
- "Please choose monthly or yearly."
- "Please sign in again to finish setting up."
- "Only an Admin of the church can add a payment method."
- "Your church is already set up with Discipler."
- "Your church's billing is handled by the Discipler team, so there's nothing to add here."
- "Your church has been with us before. Restart your subscription from Settings, Billing."
- "We couldn't get the payment form ready just now. Please try again in a minute."
