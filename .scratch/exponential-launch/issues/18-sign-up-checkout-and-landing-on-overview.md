# 18 - Sign-up: payment and landing on Overview

> **Triaged and rewritten 2026-11-04.**
> The mock-up 1 review replaced Stripe Checkout with the Payment Element inside Discipler's card.
> The screens are `s5-checkout.html` and `s8-reminder-email.html` in `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`, approved by James on 2026-10-29.
> The file keeps its old name so links to it hold.

**What to build:** The payment step at `/signup/payment`, the Admin landing signed in on Overview, the return to that step at the next sign-in, and the one reminder email.

**Blocked by:** 04, 17

**Status:** ready-for-human

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

## Comments

### 2026-11-04: built on `wave4/18`, not merged

**What was built.**
The payment step at `/signup/payment`, in the mock-up's words, with `app/signup/payment/form.tsx` holding Stripe's two Elements in one Elements group and `app/signup/payment/flow.ts` holding what each answer of the route leads to.
`GET /signup/payment/access` is the small read the waiting state asks, and it answers `{ hasAccess }` and nothing else.
`app/signup/payment/standing.ts` is the one answer `/` and the page both read, so neither can send an Admin to a page that sends them back.
The reminder is `src/domain/payment-reminder.ts`, run by `src/service/payment-reminder-watch.ts` as the tick's last step, and the tick's response gains `paymentReminders`.
`/signup/reminders-off` and its `stop` route are the page behind the link, and `src/platform/reminder-link.ts` signs it.
No migration was needed: `church_signup` already had the columns.
The fake Stripe moved from `opening-a-trial.test.ts` to `tests/support/fake-stripe.ts`, so both suites use one.

**Decisions on gaps, each with its alternative.**

1. The reminder has an HTML part beside its plain text.
   Ticket 10 made every email plain text and a test held it there, but the spec says a Start button and the approved screen is designed.
   `EmailHtml` escapes its fields the way `EmailBody` does, and only this kind uses it.
   The alternative is plain text only, with the two links written out, which is what the plain part already says.
2. The reminder reads when the church opened from the `ministry.opened` event, not `ministry.created_at`, because the event holds the caller's clock and history is the source.
3. No reminder goes while sign-up is shut.
   The alternative is sending regardless, to a person who then could not reach the page.
4. A webhook that is late can let the reminder go to a church that confirmed moments ago, because the watch reads Discipler's record and does not ask Stripe.
   The alternative is asking Stripe per church on each tick, and I chose not to for a window that small.
5. The reminder goes to the church's first Admin by `ministry_member.created_at`.
   A church that has just signed up has one, and the alternative is every Admin, which the spec does not ask for.
6. The link is signed with `SIGN_UP_CODE_SECRET`, under a prefix no code uses, so there is no new variable to set.
   Changing that secret ends links in reminders already sent.
   The alternatives are a variable of its own or a stored token, which needs a migration.
7. `/signup/reminders-off` works while sign-up is shut, because a sent email promised it, and a token that is not signed is a 404.
   It lives under `/signup`, which is already a reserved short name, and it never signs anybody in.
8. The ticket says a signed-in Admin with a spent attempt goes to `/`.
   The code clears the cookie once the attempt is spent (ticket 17), so the back button has no attempt at all, and I also send a signed-in Admin whose church has a `church_signup` row.
   The alternative is the literal spent attempt, which leaves the back button showing page one.
   A signed-out person, a Leader, an Admin of a church with no sign-up behind it, `?again` and anybody part-way through an attempt are all left alone, and each has a test.
9. If the question of whether an Admin has the step to do fails on `/`, they land on `/overview` and the failure is logged by name.
   The page itself lets the same failure raise.
10. The return address is `/signup/payment`, and arriving always posts to `open`, so the address has no power.
    The only thing read from it is `redirect_status=failed`, which shows a sentence, and the address is then cleared so a reload does not repeat it.
11. Trial dates are shown on the church's clock, passed by the page from `ministry.timezone`.
12. A card or bank's own refusal shows Stripe's sentence, because that is written for the person.
    Any other error shows a draft of ours, because it is not.
13. "You won't be charged today." does not show above a refusal that is final, which I found on the look and fixed, because it reads wrong above "Your church's billing is handled by the Discipler team".
14. The waiting state hides the Stripe box and keeps it mounted, so the card shrinks to the heading, the line and the button.
    The alternative is leaving the box in view under a disabled button.

**Coming back after a day is a different Subscription.**
Ticket 04's `stillGivesTheSame` cancels a waiting Subscription once it no longer gives a full trial, and opens another with the same choice.
So the church keeps its cycle and code and gets every free day, and the date on the page moves with it.
Within the day the same one is handed back.
Both are tested in `tests/integration/the-payment-step.test.ts`.

**Stripe's documentation, read 2026-11-04.**

What the documents say:

- The Express Checkout Element guide recommends collecting payment details before creating an Intent, and this ticket's client secret form is not the recommended one.
  Its appearance sample does show `stripe.elements({ clientSecret, appearance })` with `expressCheckout`, and `mode` lists both setup and subscription.
- No page states that a setup intent created by a Subscription works with the Express Checkout Element, so only a sandbox can show that.
  If it does not work, the fallback is deferred `mode: 'setup'` with `currency: 'usd'` and options matching the intent.
- The support tables list Apple Pay and Link for the Element, SetupIntents for Link, Apple Pay and ACH, and Subscriptions as supported.
- Apple Pay and Link need the domain registered "in both your testing environment and live mode", and Link must be enabled under Wallets in the Dashboard.
  Ticket 02 owns that.
- Link does not show in Firefox or webviews, and Apple Pay shows on a desktop browser other than Safari only with `always`, where this page uses `auto`.

What James should decide from them:

- **Link and the referral free month.**
  Passing `link` in `ACCEPTED_PAYMENT_METHODS` makes Stripe treat Link as its own payment method type, with no brand, last four or fingerprint.
  So `fingerprintOf` in `src/platform/stripe/trials.ts` gives null, `settleConfirmedTrial` lets a referral free month through unclaimed (the Q57 loophole), and ticket 33's card brand and last four cannot show.
  Dropping `link` from that list makes Link arrive as `card` with wallet `link`, which closes both.
  Ticket 04's tests pin the list, so I left it alone.
- **Apple Pay and the price.**
  `applePay.recurringPaymentRequest` needs a `regularBilling.amount`, which Apple's sheet then shows.
  Without it the documents say a device-bound card number "can cause failures" on later charges.
  I left it off to keep James's rule that no price appears here.

What only a real sandbox can show:

- Whether the Express Checkout Element accepts this client secret at all.
- Whether `elements.submit()` passes when an empty Payment Element shares the group during an Apple Pay or Link confirm.
- Whether Link still appears in the Payment Element with `wallets.link: 'never'`.
- What Apple's sheet shows for a $0 setup intent, which needs a device.
- Whether a Subscription's `payment_settings.payment_method_types` is still accepted on this SDK's pinned `2026-10-28.endive`.
  The documents say that from `2026-09-30.endive` `payment_method_types` cannot be passed on Checkout Sessions, PaymentIntents or SetupIntents, and they do not name Subscriptions.
- `EmailField.link` allows only trydiscipler.com and local hosts, so staging's `NEXT_PUBLIC_APP_URL` must be on trydiscipler.com or the reminder throws there.

**What the browser look covered and did not.**
Headless Chrome at 390 and 1440 pixels, against a real build, real session, real database and sign-up open, beside `s5-checkout.html` and `s8-reminder-email.html`.
`js.stripe.com` was answered by a stand-in I wrote, which draws what the mock-up draws, so **nothing inside Stripe's frames has been seen**: not the Elements' real look, their real heights, the appearance settings or the DM Sans font inside them.
`/signup/payment/open` was answered by the driver, except one real refusal from a server with no publishable key.
Looked at: the form with and without wallets, opening, an expired code, a method that came back failed, a decline, an error whose words are not shown, two presses at once making one `confirmSetup`, waiting, taking longer, the landing on `/overview` when access turned true, already paying, every refusal, Try again, `/` redirecting on a real session, the real access read, and the reminders page both ways.
The email was looked at as a page in Chrome, and not in any mail client.
There its heading falls back to Georgia and its body to the system font, because mail clients do not load the mock-up's web fonts.

**Words for James, all drafts, also in `docs/open-questions.md`.**

- "Finishing setup...", "This is taking longer than usual." and the link "Go to Overview".
- "That didn't go through, and nothing was saved. Please try again."
- "We couldn't save that just now. Please try again, or use another card or bank account."
- The button "Try again".
- "Press the button and we won't remind you about finishing your account.", the button "Don't send me reminders", and "You won't get another reminder."

**Still to do, once staging exists (ticket 02).**
None of these has been tried:

- With a Stripe test card, the Admin lands on Overview, signed in, with the church trialing.
- A test Apple Pay or Link method and a bank account through instant sign-in each do the same, where the device or the sandbox allows it.
- Canceling an `EXPO26` church on its Subscription Schedule works at period end through the Portal.
- Everything listed above under what only a real sandbox can show.

**What later tickets build on.**

- Ticket 02: register the domain for Apple Pay and Link in the sandbox and live, enable Link under Wallets, and keep staging's app address on trydiscipler.com.
- Ticket 27: the onboarding modal opens from `/overview`, and this page only lands there.
- Ticket 33: the billing page's brand and last four depend on the Link decision above.
- Ticket 37: the security headers must allow `js.stripe.com` frames and scripts, Stripe's API, and Google Fonts for the Elements' `fonts` option, because no CSP exists yet.
- `SIGN_UP_OPEN` stays off production until the staging lines above have passed, and `.env.example` says so.
