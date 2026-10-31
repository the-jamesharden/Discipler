# Security research: self sign-up, Stripe billing, referrals, email, support form, AI help

Date: 2026-10-28.
Scope: research only, no repo changes.
Each recommendation is a decision James can accept or reject, tagged **must**, **should** or **nice**.
"Must" means skipping it leaves a realistic path to a data leak, a cross-Ministry write, free service or money loss.

## 0. Conflicts with settled decisions (surface before anything is specified)

These are not security findings, but every design below depends on how they are answered.

- **C1 (must decide).** `docs/adr/0019-a-ministry-opens-from-a-link.md` and `docs/product-rules.md` ("There is no sign-up surface") reject a sign-up page outright, citing `docs/non-goals.md` line 85.
  `docs/open-questions.md` ("Open: a church signs itself up", 2026-10-12) already records that self sign-up reverses them and waits for its own grilling.
  Self sign-up needs a new ADR that supersedes 0019, because it is consequential and hard to reverse.
- **C2 (must decide).** `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md` makes phone + password the only credential, for Admins too, and `src/platform/supabase/accounts.ts` mints phone identities with no email on purpose ("an address on the account would be a second door").
  An email + password sign-up adds a second identity type, a second sign-in form, and email-based password recovery, which today does not exist (recovery is an Admin reset).
  Options: (a) the Admin verifies an email at sign-up but still signs in by phone, which means verifying the phone too (SMS cost and pumping risk); (b) amend ADR-0008 so an Admin's credential is email, which creates the two-door problem ADR-0008 rejected for a dual-role Admin who also leads (ADR-0009).
  The first self-signed-up Admin also has nobody above them to reset a lost password, so email recovery becomes a new account-takeover surface that needs its own design.
- **C3 (must decide).** The Setup Link carries the Ministry's `sending_number`, which is bought and carrier-registered by hand today (`ministry_setup.sending_number`, `open-questions.md`).
  A self-signed-up Ministry has no number, so it cannot text, and buying one automatically means Twilio number provisioning plus A2P 10DLC brand and campaign registration per church.
  Until that is decided, the safest reading is that a self-signed-up Ministry cannot send anything until an operator assigns a number, which is also the strongest SMS-abuse control in section 3.
- **C4 (must).** `docs/legal/privacy-policy.md` (uncommitted) makes promises this feature set breaks as written:
  - the provider table lists only Supabase, Vercel, Twilio and Google Fonts; Stripe, Resend, Cloudflare (Turnstile) and Vercel AI Gateway plus Anthropic must be added;
  - "Discipler uses only the cookies needed to keep you signed in" is broken by a referral cookie and possibly by Turnstile;
  - "We never give one ministry's information to another ministry" is broken by a referral tracker that names the referred church or shows its payment status;
  - "Leaders and ministry administrators sign in with their phone number" changes with C2;
  - "If you email us, we keep your message" needs a support-form and AI-transcript retention line.
  `docs/legal/terms-of-service.md` section 12 says fees are set by a service agreement and Discipler is free until 30 days' notice; self-serve card billing needs that section rewritten.
- **C5.** `supabase/config.toml` sets `minimum_password_length = 6` while `src/domain/accounts.ts` enforces `SHORTEST_PASSWORD = 8`.
  The domain constant is what actually binds, because accounts are created through the admin API.
  The owner's "min 6" would lower the domain constant, which section 3 recommends against.

## 1. How the repo already secures data (the patterns to reuse)

- **Two barriers on every read.** Browser sessions run as `authenticated` with `SELECT` only, and every table with a `ministry_id` has forced RLS gated by `app.is_member_of` (`20260825000100_ministry_isolation_and_history.sql`).
- **Writes are scoped in the database, not in code.** The trusted connection (`DATABASE_URL`) does `set local role discipler_command` and `set_config('discipler.ministry_id', ...)`, and every policy for that role checks `ministry_id = app.command_ministry_id()`.
  A command for one Ministry cannot write another's row even if the code asks it to.
- **Unscoped lookups are narrow definer functions.** An inbound text has no Ministry, so `app.sender_of_inbound(phone)` returns only `(ministry_id, person_id)` and everything after runs in a scoped unit of work (`createPostgresInboundReader` in `src/platform/supabase/effect-store.ts`).
  This is the exact shape a Stripe webhook needs.
- **Rows that belong to no Ministry are operator-only.** `ministry_setup` has forced RLS, no policies, and `revoke all ... from anon, authenticated, service_role, discipler_command`; its Ministry column is deliberately not named `ministry_id` so the coverage test does not read it as a promise.
- **Possession links are single-use, expiring, spent inside the creating transaction, and re-minting replaces** (ADR-0012, ADR-0019, `provisionMinistry` spends the link with `where consumed_at is null and expires_at >= $3`).
- **Account first, then one transaction, then a compensating discard** (`provisionMinistry`): the only half-done state is an auth user, which is discarded if no Person holds it.
- **An unset secret is a closed door** (`CRON_SECRET` at `/cron/tick`, `TWILIO_AUTH_TOKEN` at `/sms/inbound`), compared in constant time, and an unsigned webhook gets a 403 rather than a 200.
- **History is append-only and current state is derived from it**, enforced by triggers including `TRUNCATE`.
- **A page is one read** (ADR-0023): a `security invoker` `_page` function, granted to `authenticated` only, revoked from `public, anon, service_role`.
- **Sessions are verified locally** with `getClaims` plus the `session_is_live` RPC; new definer functions must revoke execute from `public, anon, service_role` explicitly (memory note `a-session-is-verified-locally`), and hosted `create or replace function` has picked up `anon` execute grants before (memory note `production-supabase-project`).
- **The coverage test has a blind spot that matters here.** `tests/integration/rls-coverage.test.ts` only discovers tables named `ministry` or carrying a `ministry_id` column.
  A `referral` table with `referrer_ministry_id` and `referred_ministry_id`, a `stripe_event` inbox, or a `pending_signup` table would be invisible to it, and a `SELECT` grant to `authenticated` on such a table would not fail any test.
- **Preview is production** (memory note `no-staging-preview-is-production`): every env var is set for Production and Preview together, so a preview deploy reads and writes production data.

## 2. Stripe billing

### PCI scope

- **S1 (must).** Collect every payment detail only on Stripe-hosted Checkout and the hosted Customer Portal, never on a Discipler page, and never log or store anything Stripe returns beyond IDs, brand, last four and expiry.
  Stripe's security guide says low-risk integrations "securely collect and transmit payment information directly to Stripe without it passing through your servers, reducing your PCI obligations", and that card type, last four and expiry "isn't subject to PCI compliance".
  With hosted pages Discipler should qualify for the lightest self-assessment (SAQ A); confirm the exact SAQ Stripe assigns under Dashboard > Settings > Compliance, since Stripe determines it.
- **S2 (should).** Do not show Stripe payment-method details in Discipler at all; link to the Portal instead, so no card or bank data is ever in a page document.

### The webhook route

- **S3 (must).** A Node-runtime route handler (for example `app/stripe/webhook/route.ts`) that reads the raw body with `await request.text()`, verifies it with the official library (`stripe.webhooks.constructEvent(body, request.headers.get('stripe-signature'), secret)`), and never parses JSON first.
  Stripe: "Any manipulation to the raw body of the request causes the verification to fail."
  Keep the library's default 5-minute timestamp tolerance; Stripe: "Don't use a tolerance value of `0`."
- **S4 (must).** Follow the repo's closed-door rule: `STRIPE_WEBHOOK_SECRET` unset means every request is refused, and a bad signature gets 400 with no detail.
- **S5 (must).** Check `event.livemode` against the mode the deployment is configured for and refuse a mismatch, and store `livemode` on every billing row, so a sandbox event can never change a live Ministry's state (see S14 for why this matters on Preview).
- **S6 (should).** Add a Vercel Firewall rule that allows only Stripe's published webhook IPs (docs.stripe.com/ips) on the webhook path; Stripe recommends "both of these protections", IP allowlisting and signature verification.
- **S7 (should).** Subscribe only to the events used: `checkout.session.completed`, `customer.subscription.created|updated|deleted|trial_will_end|paused|resumed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `charge.refunded`, `charge.dispute.created`, and `customer.updated` if anything about the customer is mirrored.
  Stripe: "Listening for extra events (or all events) puts undue strain on your server and we don't recommend it."

### Idempotency, replay and order

- **S8 (must).** Record every verified event in an inbox table keyed by `event.id` with `insert ... on conflict do nothing`, return 2xx, then process.
  Stripe says endpoints "might occasionally receive the same event more than once", retries live events "for up to three days", and you "must return a `200` response before" doing slow work.
  The repo already has `sendAfterTheResponse` for work after the response; a cron sweep of unprocessed inbox rows covers a crash between the two.
- **S9 (must).** Never trust event order or the event's snapshot for current state.
  Stripe: "Stripe doesn't guarantee the delivery of events in the order that they're generated" and "Don't use `created` to determine event order."
  On every subscription or invoice event, retrieve the current Subscription from the API and record what it says, so a late `customer.subscription.updated` cannot roll a canceled Ministry back to active.
  This also suits the repo's model: each processed event appends a billing fact, and the Ministry's billing state is derived from the latest retrieved object, not from overwriting a column.
- **S10 (must).** Grant access on `trialing` or `active` only, revoke on `canceled`, `unpaid`, `incomplete_expired` and `paused`, and decide what `past_due` means (Stripe: "When a subscription changes to `canceled` or `unpaid`, revoke access").
  After `invoice.paid`, Stripe says to "retrieve the associated subscription and confirm that its status is `active`", because "a paid invoice doesn't necessarily transition the subscription to `active`".

### Which IDs to store, and where

- **S11 (must).** Store Stripe IDs (`cus_`, `sub_`, latest `in_`, price ID, `livemode`) in a ministry-scoped table such as `ministry_billing` and an append-only `billing_event` history, both with `ministry_id`, forced RLS, a `discipler_command` policy, and no `authenticated` write grant, so the existing coverage test protects them automatically.
  Admins read billing status through the page function, never the Stripe IDs themselves unless a page needs one.
- **S12 (must).** Keep the inbox table operator-only like `ministry_setup` (no policies, all grants revoked, resolved Ministry column not named `ministry_id`), because an event arrives before its Ministry is known.

### How a webhook write fits ministry isolation

- **S13 (must).** Mirror the inbound-SMS shape exactly.
  1. The trusted connection, as `discipler_command`, calls a narrow definer function such as `app.ministry_of_stripe_customer(customer_id text) returns uuid`, which returns only the Ministry ID (revoked from `public, anon, authenticated, service_role`, per the grant gotcha).
  2. A normal scoped unit of work (`set local role discipler_command`, `set_config('discipler.ministry_id', ...)`) writes the billing rows for that one Ministry.
  The webhook therefore never runs with RLS bypassed and cannot write another Ministry's row even if Stripe metadata were wrong.
  Do not use `service_role` or the superuser connection for these writes; `provisionMinistry` is the only place that may skip `discipler_command`, and only because no Ministry exists yet.

### Mapping a Checkout session to a Ministry

- **S14 (must).** Create the Stripe Customer server-side for the signed-in Admin's Ministry (checked with `session_is_live` and `tier = 'admin'`), store its `cus_` ID on `ministry_billing` first, then create the Checkout Session with `customer=<that id>`, `client_reference_id=<ministry uuid>`, and `subscription_data.metadata.ministry_id=<ministry uuid>`.
  In the webhook, resolve by the stored customer ID (authoritative, our own row), and treat `client_reference_id` and metadata as a cross-check: a mismatch is refused and alerted, never "corrected".
  Both fields are set by the server and arrive inside a signed event, so neither is forgeable; the risk is a browser-supplied ID, so never take a Ministry ID from the success URL, a query parameter or a form.
  `client_reference_id` (max 200 chars) exists only on the session; `subscription_data.metadata` is copied onto the Subscription and snapshotted onto its Invoices (`parent.subscription_details.metadata`), so it is the one that helps on later invoice events.
- **S15 (must).** The success page grants nothing; it says "finishing setup" and reads billing state from the database, because the webhook is the only writer (the owner's rule).
- **S16 (must).** Put only opaque IDs in Stripe metadata (the Ministry UUID, a referral UUID), never a person's name, phone, email, church member data or anything from a Concern.
  Stripe: "Never store sensitive information... to metadata", metadata is returned to anyone with the secret key and sent in every webhook.
  Also keep personal data out of idempotency keys (Stripe: "Avoid using sensitive data (for example, email addresses or personal identifiers) as idempotency keys").
- **S17 (should).** Set the Customer's `name` to the church name and `email` to the billing contact only; the Admin's phone is not needed by Stripe.
  Stripe sends receipts to that email; nothing else about the Ministry goes to Stripe.

### Keys and environments (Preview shares production)

- **S18 (must).** Scope `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the Vercel **Production** environment only, as Secret (write-only) values, and leave them unset on Preview so the billing routes are closed doors there.
  Vercel lets each variable target Production, Preview, a specific preview branch, or a custom environment.
  Today Preview carries the production `DATABASE_URL`, so a preview with live Stripe keys would charge real churches from unreviewed code, and a preview with sandbox keys would write sandbox `cus_` IDs into production rows.
- **S19 (must).** Use a **restricted API key** limited to Checkout Sessions, Customers, Subscriptions, Invoices (read), Customer balance transactions, and Billing Portal sessions, not the unrestricted secret key.
  Stripe: "Use restricted API keys with limited permissions instead of unrestricted secret API keys."
- **S20 (should).** Develop against a Stripe sandbox with `stripe listen --forward-to localhost:3000/...`; the sandbox and live webhook endpoints have different `whsec_` secrets.
- **S21 (should).** Give billing a real staging: a Vercel custom environment with its own Supabase project (or branch), Stripe sandbox keys and no Twilio sending, because the locked suite cannot exercise Checkout, the Portal or real webhooks.
  Without it, the first end-to-end test of billing is against production.
- **S22 (nice).** Roll the webhook signing secret on a schedule and after any exposure; Stripe allows a 24-hour overlap.

### Customer Portal

- **S23 (must).** Create Portal sessions only in a POST route for a signed-in Admin of that Ministry, using the stored `cus_` ID; never accept a customer ID from the browser.
  Stripe: "Make sure to authenticate customers on your site before creating sessions for them"; the session URL is short-lived.
  Do not enable the Portal's shareable `login_page` link, which authenticates by billing email and bypasses Discipler's own Admin check.
- **S24 (should).** In the Portal configuration, disable plan switching (there is one price) and decide whether cancellation is allowed there; Stripe also notes "Don't use the customer billing email address as a login credential."

### ACH, Link, Apple Pay and "card up front"

- **S25 (must decide).** "Card up front" as an abuse control is weaker when the method is ACH: ACH "can take up to 4 business days" to confirm, "isn't a guaranteed payment method", and a personal-account debit can be disputed "for up to 60 calendar days" (two business days for a business account).
  Decide whether a trial may start on an unverified or microdeposit-pending bank account (microdeposits allow up to 10 days), or whether trials require a card, Link, Apple Pay or an instantly verified bank account.
- **S26 (should, verify).** Stripe's ACH Direct Debit page lists Customer Portal as unsupported in its product support table; confirm whether a church paying by ACH can update its bank account through the Portal before promising that flow.

## 3. Sign-up

### Turnstile

- **U1 (must).** Verify every Turnstile token server-side at `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response` and `remoteip`, and check `success`, `hostname` (your app host) and `action` (for example `signup`).
  Cloudflare: "The client-side widget alone does not protect your forms", tokens are "valid for 300 seconds" and "single-use".
  Unset secret means refuse, per the repo's closed-door rule.
- **U2 (must).** Run the check before the step that costs something, which is sending the verification email, and again (with a fresh token) before account creation.
- **U3 (must).** Keep Supabase `enable_signup = false` and create the account server-side through the admin API, as `accounts.ts` already does.
  Turning on public sign-up would let anyone call `/auth/v1/signup` with the public anon key and skip Turnstile, the code and the terms checkbox, unless Supabase's own captcha were also configured.

### Email verification code

- **U4 (must).** Own the code in an operator-only `pending_signup` table (the `ministry_setup` shape: forced RLS, no policies, all grants revoked).
  - 6 digits from `crypto.randomInt`, stored only as an HMAC-SHA256 under a server secret, compared in constant time;
  - expires in 10 to 15 minutes, single use, invalidated after 5 wrong attempts;
  - bound to one sign-up attempt by a random ID in an httpOnly, SameSite=Lax cookie, so a code verifies only the email it was sent to;
  - resend cooldown of 60 seconds, and caps per email and per IP per hour (for example 5 codes per email, 10 per IP);
  - never logged, never in a URL.
  NIST 800-63B-4 notes that codes used "to validate email addresses" are not authentication, so this is a confirmation, not a second factor.
- **U5 (must).** Never store the password in `pending_signup`; collect it on the final submit and hand it straight to the admin API.
- **U6 (should).** Enforce the per-email and per-IP caps in Postgres (one table of counters) or a Vercel Firewall rate-limit rule on the sign-up paths, not in memory, because serverless instances do not share memory.

### Account enumeration

- **U7 (must).** Answer every "send me a code" the same way ("If that address can be used, we've sent a code"), and when the address already has an account, email that owner a "someone tried to sign up, sign in or reset instead" notice instead of a code.
  OWASP gives "A link to activate your account has been emailed to the address provided" as the compliant response and "This user ID is already in use" as the incorrect one.
  Keep response timing similar for both branches.
- **U8 (should, verify).** The sign-in route (`app/auth/sign-in/route.ts`) and `changePassword` call `signInWithPassword` from the server, so Supabase's per-IP limit ("30 requests per 5 minutes") probably sees Vercel's egress IP rather than the user's.
  If so, all users share one bucket and there is no per-user brute-force limit; confirm, and add Discipler's own per-account and per-IP failure counter if it is true.
  This predates this feature set but becomes urgent once anyone on the internet can create an account.

### Password policy

- **U9 (must, reject 6).** Do not lower the minimum to 6.
  NIST SP 800-63B-4 (final, August 2025), section 3.1.1.2: passwords used as a single factor "SHALL" be "a minimum of 15 characters", passwords used only within MFA may be shorter but at least "eight characters", maximum "at least 64", no composition rules ("SHALL NOT"), and a blocklist check ("SHALL").
  OWASP: "If MFA is not enabled passwords shorter than 15 characters are considered to be weak."
  Supabase: "Anything less than 8 characters is not recommended."
  An Admin account reads Concerns, religious participation and phone numbers for a whole congregation, so it is the account most worth protecting.
- **U10 (must decide, one of two).** (a) Keep `SHORTEST_PASSWORD = 8`, add a blocklist check, allow 64+ characters, and offer TOTP MFA to Admins (the honest NIST reading is that 8 is acceptable only with MFA); or (b) 15 characters minimum without MFA, which is fully NIST-compliant and needs no new auth flow.
  Either way, no character-class rules, and align `minimum_password_length` in `supabase/config.toml` with the domain constant so the two cannot drift.
- **U11 (should, verify).** Supabase's leaked-password protection (HaveIBeenPwned, Pro plan) may not apply to admin-API account creation; if it does not, check the k-anonymity Pwned Passwords range API in `accounts.ts` before `createUser`.

### Creating the account and Ministry atomically

- **U12 (must).** Reuse `provisionMinistry`, not a second creation path: account first, then one transaction for `ministry`, `person`, `ministry_member` (admin), `ministry.opened`, the terms acceptance event, and spending the `pending_signup` row with `where consumed_at is null`, then a compensating `discard` on failure.
  A double submit then opens one Ministry, exactly as a raced Setup Link does today.
- **U13 (must).** Return refusal codes to the browser, never `MinistryNotProvisioned.reason`, which is operator prose and can contain a phone number and constraint messages.
- **U14 (should).** Create the Stripe Customer at first Checkout, not inside sign-up, so an abandoned sign-up leaves no Stripe object holding a church's name and email.
- **U15 (should).** Validate the timezone against `Intl.supportedValuesOf('timeZone')` and refuse anything else (memory note `new-ministries-are-born-utc`).
- **U16 (should).** Record terms acceptance as an append-only event with the terms version and time, not a boolean.

### SMS abuse by a new Ministry

- **U17 (must).** A Ministry sends nothing until billing is `trialing` or `active` with a payment method on file and it has a sending number; enforce it in the outbound queue's dispatch query (the one place every message leaves), not in a page.
- **U18 (should).** Cap a new Ministry's outbound volume and Roster import size for its first weeks, and alert the operator on spikes; card up front makes abuse attributable but does not stop a stolen card.
- **U19 (should).** In Twilio, restrict SMS Geo Permissions to the countries served (Console-only, by design), and enable SMS Pumping Protection.
- **U20 (must decide, C3).** If numbers are bought automatically, every church becomes a secondary A2P 10DLC brand under Discipler as the ISV, and a church that spams harms Discipler's sending reputation for all churches; operator assignment of the number is the simplest gate.

## 4. Referral program

### The code

- **R1 (must).** One random code per Ministry, not a slug.
  For example 10 characters of Crockford base32 (about 50 bits), case-insensitive, no ambiguous characters, generated with a CSPRNG, unique, stored in a ministry-scoped `referral_code` table.
  A slug like `/r/riverside` is guessable, lets anyone enumerate which churches are customers, and lets one church squat another's name; a random code reveals nothing by existing.
- **R2 (should).** "Generate a new link" replaces the code, on ADR-0012's reasoning (re-issuing replaces), so a code posted somewhere unwanted can be taken back.
- **R3 (should).** The landing page at `/r/<code>` says only "You were invited, and your first month is free", and does not name the referrer unless the referrer opted in.
  Unknown and valid codes render the same page; a bad code simply attaches nothing at sign-up, so the page cannot be used as an oracle.
- **R4 (should).** Carry the code to sign-up in the URL or a hidden field rather than a cookie, which keeps the privacy policy's "only the cookies needed to keep you signed in" true; if a cookie is used, make it first-party, short-lived, and add it to the policy.

### Modelling a link between two Ministries when neither may read the other

- **R5 (must).** Keep the fact "Ministry A referred Ministry B" in an operator-only `referral` table (the `ministry_setup` shape), with columns named `referrer_ministry_id` and `referred_ministry_id`, a unique constraint on `referred_ministry_id` (one referrer per church), forced RLS, no policies, and no grants to any API role.
  Only the trusted connection reads it, and only to decide.
- **R6 (must).** Give the referrer its own ministry-scoped projection, for example `referral_progress (ministry_id = referrer, referral_id opaque uuid, stage, signed_up_on date, credit_applied_on date)`, written by a scoped unit of work acting for the referrer, and read by the Refer page's `_page` function under ordinary RLS.
  It contains no referred Ministry ID and no name, so even a bug in the Refer page cannot reveal which church it is.
  Better still in this repo's model: append `referral.signed_up`, `referral.paying`, `referral.credit_applied` events to the referrer's `ministry_event` history with the opaque referral ID in the payload, and derive the tracker from history.
- **R7 (must).** Extend `rls-coverage.test.ts` so every table in `public` is either ministry-scoped (as today) or on an explicit operator-only list that is asserted to have RLS forced and zero grants to `anon`, `authenticated`, `service_role` and `discipler_command`.
  Without this, `referral`, `pending_signup`, `stripe_event` and support tables escape the suite that exists to catch exactly this.

### What the referrer may see

- **R8 (must decide).** Three options, in order of leak risk:
  1. counts only ("3 signed up, 2 paying, 1 credit applied");
  2. one row per referral with stage and month, no name (recommended);
  3. the referred church's name, only if that church ticks an unticked-by-default box at sign-up ("Let the church that invited us see that we joined").
  Option 2 still tells the referrer that "a church I invited is paying", which is the referred church's billing status; say so at sign-up when a code is present and in the privacy policy, because the policy currently promises "We never give one ministry's information to another ministry".
  Never show the referred church's Admin name, email, Roster size or any figure from its data.
- **R9 (must).** Keep the referred church's name out of the referrer's Stripe objects: the balance-transaction `description` is customer-facing ("Often useful for displaying to users"), so use "Referral credit" and put only the opaque referral ID in metadata.

### Self-referral, loops and farmed sign-ups

- **R10 (must).** Credit only on the referred church's first invoice with `amount_paid > 0`.
  A trial's $0 invoice is also "paid" and fires `invoice.paid`, so a naive handler pays credit for a sign-up that never paid anything.
- **R11 (should).** Hold the credit for a window after that first payment (for example 30 days) and cancel it if the charge is refunded or disputed in the window (`charge.refunded`, `charge.dispute.created`); for ACH, `invoice.paid` follows settlement, but personal-account returns can still arrive for 60 days.
- **R12 (must).** Hold for operator review, rather than auto-credit, when the referred church shares a payment-method fingerprint (`card.fingerprint`, `us_bank_account.fingerprint`) with the referrer, an Admin email or email domain, or the sign-up IP (stored hashed); and refuse a referral where both sides are the same Stripe customer.
  Review rather than refuse, because a mother church paying for its own plant is legitimate.
- **R13 (should).** Cap credits per referrer (for example 12 per year), which bounds farming at a known cost.
- **R14 (should).** Refuse a referral code on a sign-up whose payment fingerprint has already had a first free month on another Ministry, so one card cannot collect repeated free months.
- **R15 (nice).** Loops (A refers B, B refers A) are harmless once both pay real money; R12 catches the case where A and B are the same organisation.

### Applying the credit

- **R16 (must, recommend customer balance).** Use a negative customer balance transaction (`POST /v1/customers/{id}/balance_transactions`, `amount = -<monthly price>`), not a coupon.
  It is an immutable ledger ("you can only update its `description` or `metadata`"), it applies automatically to "the next invoice finalized", it stacks if several referrals pay, it waits harmlessly through a church plant's free year, and an undo is an explicit reversing transaction.
  A coupon on the referrer's subscription can collide with an existing discount (Checkout accepts "only up to one") and leaves no per-referral record.
- **R17 (must).** Make credit application idempotent in Discipler's own database, not only through Stripe's `Idempotency-Key`, which Stripe may prune "after they're at least 24 hours old".
  1. In one scoped transaction, insert `referral_credit (referral_id unique, state 'pending')`.
  2. Call Stripe with `Idempotency-Key = credit-<referral_id>` and `metadata.referral_id`.
  3. Record the returned `cbtxn_` ID and mark it applied.
  A retry after 24 hours first lists the customer's balance transactions for that `referral_id` before creating one.

### First month free and church plants

- **R18 (must).** Apply the referred church's free month with `subscription_data.trial_period_days = 30` and the default `payment_method_collection = always`, so the card is collected up front and the trial converts on its own.
  Do not use `payment_method_collection = if_required`, which drops the payment method requirement.
- **R19 (must decide, recommend operator gate).** A self-declared church plant should not get a year free on a checkbox.
  Recommended: the checkbox records a request (with founding date and sending church or network); the church starts on the standard terms (or the referral month); the operator approves; the approval extends `trial_end` through the API (the maximum trial is 730 days).
  This keeps "a Ministry exists because an operator said so" alive in a narrower form and fits "keep pastoral judgment in the loop".
- **R20 (should).** Decide whether a referral month and a church-plant year stack (recommended: no, the longer one wins), and refuse a second plant year on a payment fingerprint that already had one.
- **R21 (should).** Send a reminder before a long trial ends (Stripe's trial-compliance guidance and `customer.subscription.trial_will_end`); a card collected a year earlier may have expired, so expect failed first charges.

## 5. Email through Resend, and the support form

### DNS on a subdomain under a strict apex

- **E1 (must).** Send from a dedicated subdomain (for example `notify.trydiscipler.com`), never the apex; Resend recommends subdomains "to isolate your sending reputation".
  Resend's records go under that subdomain: SPF TXT and MX on `send.notify.trydiscipler.com` (the Return-Path) and DKIM at `resend._domainkey.notify.trydiscipler.com`.
- **E2 (must).** Leave the apex SPF `-all` untouched.
  SPF is checked against the envelope sender's own domain (`send.notify...`), and a subdomain does not inherit the apex's SPF record, so the apex `-all` neither blocks Resend nor needs an include.
- **E3 (must).** DMARC will pass under the apex `p=quarantine`, which also governs subdomains unless the apex sets `sp=` or the subdomain publishes its own `_dmarc` record.
  With default relaxed alignment, DKIM `d=notify.trydiscipler.com` and the `send.notify...` Return-Path both align with a `From:` at `notify.trydiscipler.com`, and Resend says either one passing is enough.
  Optionally publish `_dmarc.notify.trydiscipler.com` with `p=quarantine` (later `reject`) and an `rua` address to watch reports, per Resend's rollout advice.
- **E4 (should).** Point Supabase Auth's SMTP at Resend if Supabase ever sends auth email; the built-in provider is limited to "2 emails per hour" per project.
- **E5 (should).** Use a Resend API key with sending-only access restricted to that domain, stored as a Production-only Secret in Vercel; verify Resend webhook signatures if bounce or complaint webhooks are used.

### No PII in email

- **E6 (must).** Emails carry no congregant data: no names from the Roster, no Concern text, no phone numbers, no referred church names.
  Say "something needs your attention" and link into the signed-in app.
  Resend keeps message content and logs, so whatever is in an email is now also stored by a provider.
- **E7 (must).** The verification code email contains the code and nothing that identifies the church; it is not sent until Turnstile passes (U2).

### Support and bug-report form

- **E8 (must).** Store submissions with `ministry_id` when an Admin is signed in (ministry-scoped, forced RLS, read only by that Ministry's Admins or by nobody), and in an operator-only table when signed out.
- **E9 (must).** Send the notification to the operator as plain text, or escape every field, and never put submitted text in `From`, `To` or a raw `Subject` header; if `Reply-To` is set from a signed-out form, the address is unverified.
- **E10 (must).** Turnstile and a per-IP rate limit on the signed-out form; a per-user rate limit when signed in.
- **E11 (should).** Attach no screenshots or page content automatically; a bug report from the Roster or Care Needed screen would otherwise ship congregant data to the operator's mailbox and to Resend.
  If uploads are allowed, keep them in a private bucket with short-lived signed URLs and link rather than attach.
- **E12 (should).** Set and publish a retention period for submissions (for example 12 months).

## 6. AI help assistant

- **A1 (must).** No tools and no ministry data: the model's context is the system prompt, the help docs and the Admin's own messages, and the route never adds the church name, the Admin's name, Roster data or anything from a page document.
  With nothing to call and nothing private in context, prompt injection (OWASP LLM01) can at worst make the assistant say something wrong or off-brand, which is the remaining risk.
  OWASP's first two mitigations are exactly this: "Constrain model behavior" and "Restrict the model's access privileges to the minimum necessary".
- **A2 (must).** Render replies as text or sanitised Markdown with raw HTML and images off, and allow links only to the help-docs domain, so a crafted reply cannot inject markup or beacon out through an image URL.
- **A3 (must).** Tell the Admin beside the input not to paste people's names, numbers or Concerns, because pasted data is the one way ministry data reaches the model and the transcript.
- **A4 (must).** Store transcripts with `ministry_id` and `user_id`, forced RLS, readable only by the Admin who wrote them (decide whether other Admins of the same Ministry may see them; recommended: no), and set a retention period (for example 90 days) with a scheduled delete.
  This is the one table where deleting old rows is right, because transcripts are not ministry history.
- **A5 (must).** Set `providerOptions.gateway.zeroDataRetention = true` on every request (or the team-wide ZDR setting), so AI Gateway routes only to providers with zero-retention agreements and fails rather than falls back to one without.
  Vercel's docs warn that by default the gateway "does not route based on the data retention policy of providers".
- **A6 (must).** Per-Admin limits stored in Postgres (messages per hour and tokens per day) plus an AI Gateway budget as a ceiling; refuse with a plain message when exceeded.
- **A7 (should).** Keep the AI Gateway key server-side only (or use Vercel OIDC), cap input length, and log message counts and token usage, never message bodies.
- **A8 (should).** Note that docs/non-goals.md refuses "speculative AI recommendations"; a help assistant that answers only from help docs stays outside that, and the system prompt should refuse questions about specific people or pairings for the same reason.

## 7. Other ways this set could leak data

- **L1 (must).** Logging: log Stripe event IDs and types only, never full payloads (billing email and address), never Turnstile tokens, codes, passwords, `Authorization` or `Stripe-Signature` headers, or AI message bodies.
  Vercel runtime logs are kept by Vercel and visible to every project member.
- **L2 (must).** Error responses from the new routes are refusal codes or generic text; no stack traces, constraint names or `reason` prose to a browser (Next.js production already hides server errors behind a digest, so the risk is hand-written route responses).
- **L3 (must).** Vercel Deployment Protection on Preview, because a preview of the sign-up or support route writes to the production database and could open real Ministries.
- **L4 (should).** Add security headers in `next.config.ts` (today it is empty): `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin` set explicitly (setup, invitation and intake tokens are in URLs, and the new pages load third-party scripts), `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, and a CSP that allows `https://challenges.cloudflare.com` for Turnstile.
  Hosted Checkout and Portal are redirects and need no CSP entries.
- **L5 (should).** Billing state, referral stage and transcript counts are read through `_page` functions that stay `security invoker` (ADR-0023); a new page function that becomes `security definer` or is granted to `anon` widens reads with no policy changing.
- **L6 (should).** Every new definer function revokes execute from `public, anon, service_role` (and `authenticated` where it is trusted-connection only), and `npm run smoke:pages` plus the advisors check runs after the push, given the hosted `anon` grant drift seen before.
- **L7 (should).** Cancellation keeps the Ministry and follows the privacy policy (copy on request within 30 days, deletion within 90); a `customer.subscription.deleted` handler must not delete anything.
- **L8 (nice).** Secret scanning (GitHub push protection) for `sk_live_`, `rk_live_`, `whsec_` and Resend keys, since Stripe notes keys in source are scanned for continuously.

## Sources

- Stripe: [Webhooks](https://docs.stripe.com/webhooks), [Using webhooks with subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks), [Integration security guide](https://docs.stripe.com/security/guide), [Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create), [Metadata](https://docs.stripe.com/metadata), [API key best practices](https://docs.stripe.com/keys-best-practices), [Customer invoice balance](https://docs.stripe.com/billing/customer/balance), [Create a customer balance transaction](https://docs.stripe.com/api/customer_balance_transactions/create), [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Free trials in Checkout](https://docs.stripe.com/payments/checkout/free-trials), [Customer portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal), [ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit), [Stripe IPs](https://docs.stripe.com/ips)
- Cloudflare: [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- Supabase: [Password security](https://supabase.com/docs/guides/auth/password-security), [Auth captcha](https://supabase.com/docs/guides/auth/auth-captcha), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- NIST: [SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html) sections 3.1.1.2, 3.1.3.2, 3.2.2
- OWASP: [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [LLM01 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- Resend: [Domains](https://resend.com/docs/dashboard/domains/introduction), [Add and verify a domain](https://resend.com/docs/add-a-domain), [DMARC](https://resend.com/docs/dashboard/domains/dmarc)
- Vercel: [Environment variables](https://vercel.com/docs/environment-variables), [AI Gateway ZDR](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr)
- Twilio: [SMS Geo Permissions](https://www.twilio.com/docs/messaging/guides/sms-geo-permissions), [Preventing messaging fraud](https://www.twilio.com/docs/messaging/guides/preventing-messaging-fraud)
- Unverified community report on Supabase Auth per-IP limits: [supabase/auth#2333](https://github.com/supabase/auth/issues/2333)
- Repo: `README.md`, `tests/integration/rls-coverage.test.ts`, ADRs 0002, 0008, 0009, 0013, 0019, 0023, 0026, migrations `20260825000100` and `20260922000100`, `src/platform/supabase/provisioning.ts`, `src/platform/supabase/accounts.ts`, `src/platform/supabase/effect-store.ts` (inbound reader), `app/setup/[token]/open/route.ts`, `app/sms/inbound/route.ts`, `app/cron/tick/route.ts`, `app/auth/sign-in/route.ts`, `middleware.ts`, `supabase/config.toml`, `docs/legal/privacy-policy.md`, `docs/open-questions.md`, `docs/product-rules.md`
