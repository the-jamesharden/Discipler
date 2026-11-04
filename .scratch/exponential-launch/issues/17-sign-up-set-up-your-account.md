# 17 - Sign-up: set up your account

> **Triaged 2026-11-04 against the spec's "Self sign-up", its mock-up 1 decisions and the code on `origin/main` at ea4b8c6.**
> The screen is `.lavish/signup-checkout/s4-account.html` in the main checkout, approved by James on 2026-10-29.
> `.lavish/` is not committed, so read it at `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`.

**What to build:** The "Set up your account" page, with its monthly or yearly choice, and opening the church from it through `provisionMinistry`.

**Blocked by:** 12, 16

**Status:** shipped

## The page

It replaces the stopping point at `app/signup/account/page.tsx`, and `STOPPING_POINT` in `app/signup/copy.ts` goes with it.
The subtitle is "Create an account", the progress reads "Step 2 of 3 Your account", and the heading is "Set up your account" with "* indicates required information" under it.
It asks, in this order:

1. Church or organization name*.
2. Full name*.
3. Where did you hear about us? (optional), with "Choose one", Instagram, Online (Google), A friend, Another ministry, Conferences and Other media.
   It has no help line.
   A carried `EXPO26` preselects Conferences, and a carried `ref` preselects Another ministry.
4. Login email, from the attempt on the server, filled in, greyed out and locked.
5. Choose a password (minimum 8 characters)*, with the help line "Use at least 8 characters."
6. Timezone (optional), preselected from the browser and never stored empty, with the help line "We picked this from your device. Check-ins go out in this timezone."
7. How would you like to pay?*, with Monthly preselected and Yearly marked "Save 20%".
8. A checkbox agreeing to the Terms of Service and the Privacy Policy*, linked to `TERMS_OF_SERVICE_URL` and `PRIVACY_POLICY_URL` in `src/domain/consent.ts`.

Ticket 19 adds the church-plant block between Timezone and "How would you like to pay?"; this ticket leaves it out.
There is no "Let {inviting church} know we joined" box.

`app/timezone-select.tsx` is not what the mock-up draws, and Settings and the Setup Link keep it unchanged.
Add a second list to `app/timezones.ts` with the mock-up's two groups and its words: United States (Eastern Time (New York), Central Time (Chicago), Mountain Time (Denver), Mountain Time, no daylight saving (Phoenix), Pacific Time (Los Angeles), Alaska Time (Anchorage), Hawaii Time (Honolulu), Atlantic Time (Puerto Rico)) and Other (Toronto, London).
A small client component preselects the browser's zone, which is added to the list when it is not on it.
Eastern Time is the choice before that runs, so the field is never empty.

This is the one place a price appears in sign-up:

| Arrived with | Monthly | Yearly | Under the button |
| --- | --- | --- | --- |
| `EXPO26`, still valid | "$97 a month, 20% off your first year" | "$931.20 a year, 20% off your first year" | "60 days free with the Exponential special offer. Next, you'll add a card or bank account. You won't be charged today." |
| No code, or a code that does not apply | "$97 a month" | "$931.20 a year" | "30 days free. Next, you'll add a card or bank account. You won't be charged today." |
| A referral | "$97 a month" | "$931.20 a year" | "30 days free. Next, you'll add a card or bank account. You won't be charged today." |

Read the amounts from `src/domain/launch-terms.ts`, never as typed numbers.
**Start free trial** turns on only when every required field holds a real entry, meaning trimmed text and a password of at least 8 characters.

## Opening the church

- Turnstile runs when the button is pressed, in the widget's `execute` mode, with the action `HUMAN_CHECK_ACTIONS.openChurch`, because a token only lasts about 5 minutes and this form can take longer.
  The server calls `getSignUp().readyToOpen({ attempt, humanToken })`, and only what that returns is trusted for the email and the phone.
- `newPasswordRefusal` in `src/domain/accounts.ts` decides the password, including the common-password list, and a refusal is shown on the page with what was typed kept, apart from the password.
- `supabaseAccounts.create` gains an email, set with `email_confirm: true` and lowercased, so the proven address is `auth.users.email`, which ticket 11 and ticket 21 both read.
  Every existing caller still makes a phone-only account, and the comment there saying no account has an email is corrected.
  Its refusal mapping gains Supabase's error for a taken email, which today would throw.
- `provisionMinistry` makes the account first and then one transaction, as it does today.
  The transaction also spends the attempt with `spendPendingSignup`, writes the row below, the terms event and the consent, and leaves `billed_outside_stripe` off.
- The Admin is signed in at once, with the password just chosen, and goes on to `/signup/payment` (ticket 18).
- support@ is sent `newSignUp` once, after the commit, holding the church's name, where it heard about Discipler and whether it came with an offer.
  A failure to send is logged by its name and never undoes the church.
- The browser only ever sees refusal codes, never `MinistryNotProvisioned.reason`.

### What the choice leaves behind

A church may leave at the payment step and come back another day, by the reminder or by signing in (ticket 18), so what it chose cannot live only in the address.
Add one row per self-signed-up church, `church_signup`, church-scoped in the shape of `trial_opening`: it has `ministry_id`, forced row-level security, `discipler_command` policies, no browser grant, and is not named in `OPERATOR_ONLY_TABLES`, which `tests/integration/rls-coverage.test.ts` refuses for a table with `ministry_id`.
It holds:

- `billing_cycle`.
- The code as carried, if any, which `/signup/payment/open` still checks when it is used.
- Where it heard about Discipler.
- `reminder_sent_at` and `reminders_off_at`, for ticket 18.

### A double click

`createUser` runs before the transaction, so the second of a double click would be told `account.already_exists` while the first is succeeding.
`readyToOpen` also reads a spent attempt as `signup.not_verified`, which has no sentence today, and Turnstile refuses a token used twice.

- The button turns off at the first press, so a browser sends one request.
- On the server, the whole opening runs under a Postgres advisory lock keyed to the attempt, taken before `readyToOpen`, on a connection of its own.
  An advisory lock is used because a row lock would block the transaction's own `spendPendingSignup`.
- A request that gets the lock and finds the attempt already spent opens nothing and goes to `/`.

### A phone that already has an account

Ticket 11 left this to here: an address is checked at page two, and a phone is not, to keep "the same answer".
`account.already_exists` is refused on this page with a draft sentence in `app/signup/copy.ts`: "That phone number or email already has a Discipler account. Sign in, or start again with a different one."
"Start again" links to `signUpHref('human_check', carried, { again: true })`, a new attempt that proves its address again, because an attempt whose address is proven cannot change its phone (`signup.already_verified`).
Add the draft to `docs/open-questions.md` under *sign-up's numbers and wording*.

## The consent and the terms

- Add `agreed_at` to `pending_signup`, set when "Email me a code" is pressed, because `code_sent_at` is replaced by each send.
  A resend keeps it.
  Pressing it again with a different phone moves it, since `issue` replaces the phone on the attempt and the consent is for that number.
- Add the value `ministry_setup` to `consent_source`, in a migration of its own, since a new enum value cannot be used in the transaction that adds it.
- The `consent_record` row has `consent = 'sms'`, `granted = true`, `source = 'ministry_setup'`, `decided_at` set to `agreed_at`, and a new version constant in `src/domain/consent.ts`, never `CONSENT_VERSION`, as `docs/consent-language.md` says.
  It has to be `sms`, because the outbound trigger checks `app.current_consent(person, 'sms')` before the test check-in in ticket 28, and that function ignores the source.
- It is not an Intake, and does not change the Admin's Participation Status.
- `docs/consent-language.md` says it is never consent to the Check-In Rhythm, and `current_consent` cannot see that.
  Pairing needs an Intake, whose own decision is later and wins, so this should already hold.
  Read the places that use `current_consent(..., 'sms')` in `src/platform/supabase/effect-store.ts`, `outbound-queue.ts` and the Suggested Pairs migrations, and prove it with a test; if any path reaches an Admin with no Intake, gate that path on the source and say so in this ticket.
- The terms acceptance is a `ministry_event` carrying a terms version, a new constant set from the date in `docs/legal/terms-of-service.md`, and the time pressed.

The phone is not proven at sign-up.
The older line here calling it "the verified phone" was wrong: the spec has Verify check it on the first test check-in (ticket 28).

## Acceptance

- A double click opens one church, one account and one row, and the person ends up signed in on the payment step.
- A second request for a spent attempt opens nothing, and the answer goes to `/`.
- The button stays off while any required field is empty or the password is short.
- A common password is refused by the server even when the button was on.
- The timezone is never stored empty, and an invalid zone is refused.
- A church made here can sign in with email and with phone once ticket 21 ships, has an email on its account now, and `billed_outside_stripe` is false.
- The new church has no subscription and cannot text until the payment step completes (ticket 05).
- The consent's time is the press of "Email me a code" for that phone, even after a resend, and the Admin's Participation Status is unchanged.
- An Admin holding only this consent gets no Check-In Rhythm text, and is not offered for pairing.
- A phone or email with an account is refused here, and "start again" opens a new attempt.
- A failed transaction leaves no account behind, as `provisionMinistry` does today.
- Nothing is stored about the password on `pending_signup` or `church_signup`.
- The page is checked at 390 pixels wide, because most booth sign-ups are on a phone.

## For James

1. Decided 2026-10-29 (Q82): a church that leaves at the payment step is kept with no subscription, and is returned there at its next sign-in (ticket 18).
2. Decided 2026-11-04: the "already has a Discipler account" sentence goes as a draft James approves at review, because it is a sentence inside an approved screen.

## Comments

### 2026-11-04: built on `wave4/17`, not merged

**What was built.**
"Set up your account" replaces the stopping point, in the mock-up's words, with the church-plant block left out and its place marked in `app/signup/account/form.tsx`.
`POST /signup/open-church` runs the opening in `src/service/opening-a-church.ts`, under an advisory lock keyed to the attempt.
`openSignedUpChurch` in `src/platform/supabase/provisioning.ts` makes the account with its email, then in one transaction spends the attempt and writes the church, `church_signup`, the consent and the terms event.
The Admin is signed in, the attempt's cookie goes, and support@ is told once.
Two migrations: `20261104103100_the_admins_own_consent.sql` and `20261104103101_what_a_sign_up_chose.sql`.

**How it was checked.**
`tests/integration/setting-up-your-account.test.ts` runs the real routes, tables and Supabase Auth, with fakes for Cloudflare and Resend at their ports, and covers the acceptance lines but the last.
The last was a real look: a production build in headless Chrome at 390 pixels, beside the mock-up, with a local stand-in for Cloudflare's siteverify and no Resend key.
There the button turned off at the first of two clicks, a common password came back refused with everything but the password kept, the second press landed on `/signup/payment` signed in, with one church, its row and the attempt spent, and a taken phone got the draft sentence with both links.
No horizontal scroll in any state, and a long address stops short of "Locked".
`/signup/payment` is a 404 until ticket 18.

The full locked suite passed: 323 files with none skipped, and 5173 tests with 1 skipped, the older `it.skip` at `tests/integration/invitation-over-http.test.ts:421`.
The new suite passed 54 of 54 three times running, and the type check is clean.
There is no `npm run lint` in this repository, nor any lint config, so nothing was linted.

**A bug only the browser found.**
`maxAge: 0` on the attempt's cookie passed in process and failed in a real server, because Next reads a route's cookies back and writes them again when `next/headers` also set one, and that drops a zero.
It left a live empty cookie, so it now clears by a date in the past, and the test replays that step.

**The consent finding.**
Every `current_consent(..., 'sms')` path in `effect-store.ts` goes through `relationship_member`, `suggestion_inputs` needs an Intake row, and `reject_unready_leader` and `fulfilmentDecision` guard pairing.
So no path reaches an Admin with no Intake, no gate on the source was added, and tests prove the rhythm, both pairing roles and Suggested Pairs.

**Where the ticket was wrong.**
It puts Atlantic Time (Puerto Rico) under United States; the approved mock-up has it under Other, and I followed the mock-up.
James may want it moved: it is one line in `app/timezones.ts`.

**Decisions on gaps, each with its alternative.**

- Pressing "Email me a code" again with the same phone keeps the first press; the alternative was to move it on each press.
- The migration deletes attempts already naming a phone, rather than guess a consent time; the alternative was to backfill from `code_sent_at`, which each send replaces.
- The lock is a transaction lock on its own `pg.Client`, so it works through the pooler and cannot starve the pool; the alternative was a session lock on a pooled client.
- The form is read before the token, so a refused form spends no token; the alternative was the token first, which would make a typo cost a Turnstile pass.
- An empty timezone from a hand-made request is refused, though the field says optional; the alternative was to default to Eastern.
- An unknown `heardFrom` reads as no answer; the alternative was to refuse it.
- `EXPO26` preselects Conferences even after the offer ends, and wins over `ref`; the alternative was to preselect only while it runs.
- A failed sign-in after the church opened answers `/login`; the alternative was a refusal, which would say something failed when the church exists.
- `signup.not_verified` goes to page one with `again`, and shows no sentence; the alternative was to write one.
- The terms event is `ministry.terms_accepted`, with `TERMS_VERSION` as the effective date, which a test reads from `docs/legal/terms-of-service.md`; the alternative was a version separate from that date.
- The Terms and Privacy links open a new tab, so the typed form survives; the alternative was the same tab, which loses it.
- The locked email has right padding and an ellipsis, a small addition to the mock-up, because a long address ran under "Locked".
- A refusal clears the password only when the password was the reason; the ticket's sentence reads that way, and the alternative was to clear it on every refusal.
- `.env.example` now says sign-up stays shut until ticket 18, since a church opened here has nowhere to pay.

**Draft words for James**, also in `docs/open-questions.md` under *sign-up's numbers and wording*:

- "That phone number or email already has a Discipler account. Sign in, or start again with a different one."
- "Please enter your church or organization's name.", "Please enter your full name.", "Please choose your timezone.", "Please choose monthly or yearly.", "Please agree to the Terms of Service and Privacy Policy."
- "We couldn't set up your account just now. Please try again in a minute."
- The `newSignUp` email to support@, in `tellSupport`.

**What the next tickets build on.**

- **18:** read `church_signup` as `discipler_command`.
  `billing_cycle` has no update grant, so add one if the payment page lets it change.
  Its policies are church-scoped, so the reminder needs its own way to find rows across churches.
  `carried_code` is what `/signup/payment/open` checks.
- **19:** the slot is marked in `form.tsx`.
  Join its required fields to `canStartFreeTrial` in `app/signup/flow.ts` and `readAccountForm` in `src/domain/sign-up-account.ts`, and add the block's CSS (`hr.sep`, `.plant-q`, `.yesno`, `.plant-app` in the mock-up's `screen.css`).
- **20:** `ref` is carried in the address and preselects Another ministry, but is not posted or stored, so post it and record it inside the opening's transaction.
  `tellSupport` says only Exponential or None until then, and `accountPrices('referral')` already draws the plain prices.
- **21:** `auth.users.email` is lower case and confirmed, and a test proves signing in with it works underneath.
  `changePassword` still reads the phone.
