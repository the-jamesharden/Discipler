# 32 - Refer and the referral credit

> **Triaged 2026-10-31 against the spec's "Referrals", its mock-up 5 decisions and its triage decisions.**
> The screen is `.lavish/refer-billing/refer.html`, built by `build.mjs`.
> **Changed by the triage of ticket 20 (2026-11-04):** each church's code and the `referral` table are built in ticket 20, because an invited church has to be recorded the moment it opens.
> This ticket keeps the page, "Get a new link", the events and the credit.
> **The link it shows is `app.trydiscipler.com/r/<code>`** (James, 2026-11-04), not the `trydiscipler.com/r/<code>` drawn in mock-up 5.

**What to build:** The Refer page, "Get a new link", and the automatic credit.

**Blocked by:** 04, 20

**Status:** ready-for-human

## The page

As drawn, in order:

- The title, with "Know a church that would love Discipler? Share your link."
- The green offer: "Give a month free. Get a month free." over "Their first paid month is free, and when they pay their first bill, you get a month free too."
- The three steps: "Send your link to another church, by text or email.", "They sign up, get 30 days free, then their first paid month free." and "30 days after they pay their first bill, a month free is taken off your next bill."
- The Your link card: the link, one Copy button and "Copy puts a short note and your link on your clipboard, ready to paste into a text or email."
  Copy copies the note and the link together and reads "Copied" for a moment, without changing size.
  The note: "Hi! At {church} we use Discipler to keep our discipleship relationships meeting week to week, and I think your church would love it. Sign up with our link and your first paid month is free: {link}"
- "Get a new link", a small plain text link under the help line, replaces the link at once with no question.
- "Your month free waits 30 days after their first payment, and is taken back if that payment is refunded. It shows on Billing when it is applied."
- There is no text box, no email draft and no list of invited churches; Discipler sends no invitations.
- The header's "Refer a church" (ticket 23) opens it.

## The rule

- The code and how it is made are ticket 20's.
- "Get a new link" retires the old code: the old link opens sign-up at the normal price, with no free month and no credit (James, triage 2026-10-31).
- "Ministry A invited Ministry B" is ticket 20's `referral` table, which this ticket reads.
- Referral events (Signed up, Paying, Credit applied) are recorded on the inviting church's own history with an opaque referral ID; no page lists them, and an applied credit shows on Billing.
- The credit is earned on the invited church's first invoice with `amount_paid > 0`, held 30 days, and cancelled on a refund or dispute in that window.
- It is one month of the inviting church's own price, $97 or $147 (Q79), applied as a negative customer balance transaction described as "Referral credit", made idempotent in Discipler's own table before Stripe is called.
- A shared payment fingerprint, a shared email domain, or the same Stripe customer sends the credit to James for review instead.
- A church billed outside Stripe (SAU BCM, Anthem) sees the page like any church; its earned credit is sent to James for review, to settle by hand (James, triage 2026-10-31).

## Acceptance

- A trial's $0 invoice earns no credit.
- A refund within 30 days cancels the credit.
- A retry after a day creates no second credit.
- After "Get a new link", the old link signs a church up with no free month and earns no credit.
- An invited church's first payment earns SAU BCM a credit that goes to James, not to Stripe.
- No page shows a church anything about the churches it invited, beyond a credit on Billing.

## Comments

### What was built

- `/refer`, with the words as drawn, the link as `app.trydiscipler.com/r/<code>`, one Copy button and "Get a new link".
- The header's "Refer a church" opens it, and search lists it.
- `supabase/migrations/20261104110032_the_refer_page_and_the_referral_credit.sql` reserves `refer` and keeps `r`, gives `referral` an opaque unique ID, and adds `public.refer_page()`, `app.live_referral_code(uuid)`, `app.get_a_new_referral_code(at)` and the operator-only table `referral_credit`.
- The credit is `src/domain/referral-credit.ts`, `src/service/referral-credits.ts`, `src/platform/stripe/credits.ts` and `src/platform/supabase/referral-credits.ts`.
- Stripe events earn and cancel through `creditOnEvent` on the webhook's work, and the hourly tick's sweep applies what has come due.
- The events Signed up, Paying and Credit applied go on the inviting church's own history with the opaque ID, and no page lists them.

### What was observed

- Type check clean, and the full locked suite on `5b6a93c`: 342 files passed, no skipped files, 5680 tests passed, 1 skipped.
- The 1 skipped test is an `it.skip` at `tests/integration/invitation-over-http.test.ts:421`, which this ticket did not touch.
- The look was taken in headless Chrome on a production build at 390, 1280 and 1440 pixels beside the mock-up: the words and the layout match, and there is no sideways scroll.
- Copy put the exact note and link on the clipboard and read "Copied" with its width unchanged at 118.39 pixels.
- "Get a new link" replaced the link in place, and the new one survived a reload.
- Nothing reached real Stripe: the credit is tested against a stand-in for Stripe, so a credit on a test clock on staging is still to run.

### Decisions on gaps

- **When the credit is decided.** It is decided once at due time, reading Stripe again, and events only earn and cancel it. The alternative was to decide at earning, which would miss a refund whose event never arrived and a card added during the hold.
- **A retry after a day.** The row goes to `applying` with its amount before Stripe is called, then Discipler looks for a balance transaction carrying the metadata `referral_credit`, and only then creates one with an idempotency key. The alternative was Stripe's key alone, which lasts a day.
- **A yearly inviter.** It gets $97 or $147 too, as mock-up 5 draws $97 for a church paying $77.60. The alternative was a twelfth of the yearly price.
- **What cancels.** Any refund, a partial one included, and any dispute however it ended. The alternative was a full refund only.
- **A refund after the window.** The credit stays applied, as the ticket's "in that window" says, though the page's "taken back if that payment is refunded" is less exact than that. The alternative was to reverse it at Stripe, or to change the page's words, which are James's.
- **An inviter with nothing running.** An ended, incomplete or subscription-less church goes to review, since it has no next bill. The alternative was a balance that may never be used.
- **What Discipler cannot read.** A price not in the catalog and a payment with no charge go to review. The alternative was to guess or to apply anyway.
- **A shared email domain.** Every shared domain counts, `gmail.com` included, read from the Stripe customers' emails and the Admins' accounts, because the spec says "an email domain". The alternative is to leave out free mail, one line in `whyTheyLookLikeOne`.
- **A shared card.** Fingerprints are read from all saved methods of both customers and from the paid charge, so taking a card off does not hide it.
- **Who is told.** The review email uses the `founders` route, so Lerone sees it too. The alternative was a route for James alone.
- **After review.** It is an email and a row in `in_review`, and James settles it by hand. There is no operator command to mark it settled, so the row stays `in_review`.
- **The tab bar.** `/refer` shows it with no tab marked current, as drawn, using history for the badge. The alternative was `PageShell` with no tabs, which is not what is drawn.
- **Reading the code.** A definer helper gated by the Admin test. The alternative was a browser grant on `referral_code`.
- **Replacing the code.** `app.get_a_new_referral_code` is one function for `discipler_command` that takes the church from `command_ministry_id` under a per-church lock. The alternative was what ticket 20 expected, grants on retiring and issuing.
- **"Get a new link" without script.** It is a real form, and script fetches JSON to replace the link in place. The alternative was a button that needs script.
- **Copy.** It says "Copied" only when the words went, with an `execCommand` fallback. The mock-up says it regardless.
- **The copied link.** It has no `https://`, as shown and as the mock-up's note has it. The alternative is the scheme in the note, which some text apps need before they make a link.
- **The host shown.** It comes from `NEXT_PUBLIC_APP_URL`, so staging shows its own.
- **On a phone.** The link is 0.75rem with tighter padding, so the longer host and a 10-letter code show whole at 390, 375 and 360 pixels. The mock-up's link was shorter.

### Draft words for James

They are also in `docs/open-questions.md` under *sign-up's numbers and wording*.

- The review email's subject: "A referral credit is waiting for you".
- Its body names both churches, both Stripe customers, the opaque referral ID, and one sentence of why. Only james@ and lerone@ read it.

### What turned out different from the ticket

- **"First bill" is later than it reads.** An invited church's first paid month is free, so that invoice is $0 and earns nothing under the ticket's `amount_paid > 0`. The credit is earned on its second bill, 30 days of trial plus the free month later, and applied 30 days after that. The page's "30 days after they pay their first bill" reads true only if a free month is not counted as a bill, so James should read that sentence again.
- **Mock-up 5's link.** It draws `trydiscipler.com/r/`, as this ticket's head already notes.
- **Ticket 20's grants.** It expected grants on retiring and issuing, and one function was used instead.
- **The painting.** It is hidden below 1424 pixels by the app's existing CSS, and shows at 1440. The mock-up is older, so this was left alone.
- **The Ask bubble.** The mock-up's is ticket 31's.

### What later tickets build on

- Ticket 33 shows the applied credit on Billing from Stripe's balance transactions with the description "Referral credit" and the metadata `referral_credit`.
- `StripeEventWork.creditOnEvent` and `SupportAlerts.referralCreditForReview` are required by their ports.
- Any migration replacing `app.short_name_is_reserved` keeps `r` and `refer`.
- The restricted Stripe key needs Invoices and Charges read, and Customers write covering balance transactions.

### Changed after James read this (2026-11-04)

James said yes to all three of these on 2026-11-04, and the notes above are older where they differ.

- **The words.** The page now says "after their first paid bill" and "30 days after their first paid bill", because an invited church's first paid month is a $0 invoice and the credit is earned on the first bill with money in it.
- **A shared email domain.** A public domain such as `gmail.com` no longer sends a credit to review, from the list in `src/domain/referral-credit.ts`. A domain of the church's own still does, and so does a shared customer or card.
- **Settling a review.** `npm run referral-review -- list` shows what is waiting, and `settle <credit id> credited|not-credited` marks one done, keeping why it went to review. It changes Discipler's record only: any credit is still given in Stripe by hand. The review email names the command.
- **The copied link.** Copy now puts `https://` in the note, and the page still shows the shorter link.
