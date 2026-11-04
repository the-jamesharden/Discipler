# 18 - Sign-up: payment and landing on Overview

> **Triaged and rewritten 2026-11-04.**
> The mock-up 1 review replaced Stripe Checkout with the Payment Element inside Discipler's card.
> The screens are `s5-checkout.html` and `s8-reminder-email.html` in `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`, approved by James on 2026-10-29.
> The file keeps its old name so links to it hold.

**What to build:** The payment step at `/signup/payment`, the Admin landing signed in on Overview, the return to that step at the next sign-in, and the one reminder email.

**Blocked by:** 04, 17

**Status:** ready-for-agent

The lines under "Once staging exists" wait on ticket 02 and hold the ticket's `shipped`, not its building.

## The page

The subtitle is "Create an account", the progress reads "Step 3 of 3 Payment", and the heading is "Add a card or bank account".

- Under the heading: "You won't be charged today. Your free trial ends on {date}, and we'll email you a week before."
  The date is `trialEndsAt` from the route.
- Stripe's Express Checkout Element for Apple Pay and Link, "or", then the Payment Element for card and US bank account.
- "Secured by Stripe", the button **Start my free trial**, and "You can change or cancel any time in Settings, Billing."
- No price appears here.
- A `codeRefusal.message` from the route is shown above the form, and the page carries on at the normal price.

## How it works

- The page requires a signed-in Admin of a church with no live subscription, and reads `billing_cycle` and the code from `church_signup` (ticket 17).
- It posts `cycle` and `code` to `/signup/payment/open`, and gives the answer's `clientSecret` to the Elements, which confirm with `stripe.confirmSetup`, using `redirect: 'if_required'` and a return address for a method that must leave the page.
- Add `@stripe/stripe-js` and `@stripe/react-stripe-js`.
  `package.json` has only the server's `stripe` today.
- `payment.already_paying` shows the waiting state below, because the route asks Stripe, and the webhook's record may not have landed yet.
  `payment.outside_stripe` and `payment.restart` show their sentences from `app/signup/payment/copy.ts`.
- The route's answers have only run against a fake Stripe, so check the Express Checkout Element against Stripe's current documentation for a setup intent made by a Subscription, before relying on it.

## After the method is confirmed

Nothing the browser says unlocks anything (spec, protection 4).
The button shows a waiting state in the same card, with the draft line "Finishing setup...", while a small read asks whether `billing.hasAccess` is true, as the webhook writes it.
When it is, the Admin goes to `/overview`.
Past 30 seconds the page offers "This is taking longer than usual." and a link to `/overview`, and the webhook still finishes the work.
Both go to `/overview` and not `/`, which would read the church as not yet confirmed and send the Admin straight back here.
The onboarding modal is ticket 27's, so this ticket only lands on Overview.
The old "reopen" page is gone: a church that leaves just comes back to this same page.

## Coming back (Q82)

- `/` sends a signed-in Admin to `/signup/payment` when the church has a `church_signup` row, is not billed outside Stripe, has no confirmed Subscription, has never had one that began, and sign-up is open.
- Every other Admin lands where they do today, so SAU BCM, Anthem and Example Ministry never see this page.
- It sends nobody anywhere on a typed `/overview`: the church still has no access and sends no texts (ticket 05).
- A signed-in Admin returning to a `/signup` page with a spent attempt goes to `/`.

## The reminder

One email, sent by the tick, to the address on the Admin's account.
The kind `checkoutReminder` is renamed `paymentReminder`, since there is no Checkout.

- It goes on the first tick at or after 9am in the church's timezone on the day after it opened, and on no later day if that day's ticks were all missed.
- None goes once the setup intent is confirmed, if the church is billed outside Stripe, or if `reminder_sent_at` or `reminders_off_at` is set.
- Subject "Finish setting up {church} on Discipler", from Discipler at notify.trydiscipler.com, reply-to support@.
- It has the mock-up's heading, "You're one step away", then James's words, word for word:
  "{First name}, we are so excited that you are considering Discipler for your church. We want to help you help your people by making mentorship something that is easy to manage."
  "All that's left is clicking start and initiating your free trial!"
- The **Start** button opens `/`, which asks for sign-in and then goes to the payment step, and never signs anyone in by itself.
- With a saved `EXPO26` that is still valid on the day it is sent: "Your Exponential special offer is saved until December 11."
- "If anything got in the way, please let us know and we are happy to help.", "Thank you,", "James Harden", "Founder and CEO, Discipler".
- The foot: "You're receiving this because you started an account for {church} at app.trydiscipler.com. This is the only reminder we'll send." and "Don't send me reminders", a signed link that sets `reminders_off_at` and works signed out.
  Its address opens a small page with a button, so an email scanner following the link does not press it, and the page then reads "You won't get another reminder."

## Acceptance

- Returning to the page's return address without a confirmed setup intent unlocks nothing.
- Leaving at the payment step and signing in the next day returns to this page with the same monthly or yearly choice and the same code.
- A church with an unspent `EXPO26` past its last day comes back at the normal price, with the expired sentence.
- The reminder goes once, at the right local hour, and not at all once the setup intent is confirmed.
- Pressing "Don't send me reminders" stops it without signing anybody in.
- An existing church's Admin signing in never reaches the payment step.
- The Admin never loops between `/` and the payment step while the webhook is on its way.

## Once staging exists

The tests above run against a fake Stripe, which is all that wave 3's billing has run against.
Every billing and sign-up change is tried on staging first (Q56).

- With a Stripe test card, the Admin lands on Overview, signed in, with the church trialing.
- A test Apple Pay or Link method and a bank account through instant sign-in each do the same, where the device or the sandbox allows it.
- Canceling an `EXPO26` church on its Subscription Schedule is shown to work at period end through the Portal, which `docs/open-questions.md` says has not been tried.

## Small choices made here

These are recorded so James can overrule them.

- The reminder goes on the first tick at or after 9am that day, and never on a later day if every tick that day was missed.
- The waiting state goes on for 30 seconds before offering the link.

## For James

1. Decided 2026-11-04: "Finishing setup...", "This is taking longer than usual." and the page behind "Don't send me reminders" go as drafts James approves at review.
2. The staging lines need ticket 02 finished: the sandbox holding the catalog, its key and its webhook.
