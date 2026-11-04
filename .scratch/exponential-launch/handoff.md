# Handoff: the Exponential launch, mid-design

Written 2026-10-30 when the first session's context filled up; updated 2026-10-31 when mock-up 5, the last, was finished, and again when 26 to 33 and 40 were triaged.
The grilling is finished and James confirmed shared understanding.
All five Lavish mock-ups are done (James, 2026-10-31), and every decision from them is in the spec.
Stripe and Resend are provisioned (see Blocked on James).
On 2026-10-31 eleven tickets were built by parallel agents, and they are now on `main` (see "Built so far").

## Read first

1. `.scratch/exponential-launch/spec.md` holds every settled decision, including each mock-up review so far.
   Where the spec and an older ticket disagree, the spec wins.
2. `.scratch/exponential-launch/issues/01` to `40`.
   Tickets 18 and 19 carry a note that they must be rewritten for the mock-up 1 changes before anyone builds them.
3. `.scratch/exponential-launch/research/` holds the research behind the decisions: security, SMS scaling, SMS providers, Twilio A2P, and the Twilio support ticket text.

## The dates

- Exponential starts Sunday 2026-11-08 and ends 2026-11-13.
- Everything must be live on production by Wednesday 2026-11-04, with James's rehearsal on 2026-11-05.
- James said all features ship; plan for no cuts.

## Mock-ups (Lavish)

Each lives in `.lavish/<slug>/` and is reviewed in Lavish (`npx -y lavish-axi <file>`, then `npx -y lavish-axi poll <file>` as a tracked background job, never with a shell `&`).
James reviews in rounds; feedback arrives as prompts.
Old answers are sometimes re-sent; check them against what is already applied.

1. **Sign-up and payment**: `.lavish/signup-checkout/index.html`.
   Settled after four rounds; done.
2. **Top nav and search** (James said 2026-10-30 that mock-ups 1 and 2 are done): `.lavish/top-nav-search/index.html`, built from `build.mjs` (run `node build.mjs` after editing it; `v-b2*.html` is the chosen layout B).
   Settled through round 5 plus later notes, all recorded in the spec.
   The last thing James said there: the Ask Discipler circle is only on the signed-in Admin dashboard, never on sign-in or sign-up.
   James confirmed on 2026-10-30 that mock-up 2 is good and done.
3. **Onboarding modal and the unpaired pop-up**: `.lavish/onboarding/index.html`, built from `build.mjs` (run `node build.mjs` after editing) on `layout-b.html`, a snapshot of mock-up 2's chosen page.
   Rounds 1 and 2 answered 2026-10-30 and recorded in the spec.
   Round 3 answered: the tour is a full-screen product demo (`demo.mjs` builds `demo.html`) in seven steps, one note per page plus a Help and settings step, under a thin gold DEMO bar with the step count at its top right; each check-in sentence is the church's inside Discipler's frame (`settings-wording.html`, with `-keep` and `-free` drawn for comparison); the unpaired pop-up is bigger.
   James confirmed on 2026-10-31 that mock-up 3 is good and done; the Settings block for the check-in's words is ticket 40 (needs-triage).
   Tickets 26 to 30 no longer wait on mock-up 3; triage them against the spec's mock-up 3 decisions.
   Real-time screenshots of the tour need a CDP script, because headless Chrome's virtual time does not run CSS transitions.
4. **The AI bubble and chat panel**: `.lavish/ai-guide/index.html`, built from `build.mjs` (run `node build.mjs` after editing) on a copy of mock-up 3's `layout-b.html`; every page takes `?icon=a|b|c`.
   James took every recommendation (face B, the Chat friend; the chat led by the next setup step; a card above the bubble; a slim tab when tucked away), asked for a fresh chat on each sign-in with no New chat button, and approved the drafted words.
   James confirmed on 2026-10-31 that mock-up 4 is good and done; all of it is in the spec's "Decided in the mock-up 4 review", and ticket 31 no longer waits on it.
5. **The Refer page and Settings with the Discipler Billing page**: `.lavish/refer-billing/index.html`, built from `build.mjs` (run `node build.mjs` after editing) on a copy of mock-up 3's `layout-b.html`, with face B in place.
   Round 1 opened 2026-10-31, drawn for Riverside Chapel, an EXPO26 church: Refer (with the new-link question and the empty tracker), the Billing card on Settings, the Billing page in four states, the payment-failed and ended banners (above the setup bar), the restart page and the trial-ending email.
   Round 1 answered and recorded in the spec's "Decided in the mock-up 5 review" and tickets 32 and 33: Refer cut to the offer, the steps and one Copy button, no tracker; every other recommendation taken; the restart page strikes through twelve monthly payments under Yearly.
   Round 2 answered the same day: sign-up's "Let {inviting church} know we joined" box is removed (ticket 17), and only the restart page strikes through the monthly total.
   James confirmed on 2026-10-31 that mock-up 5 is done; tickets 32 and 33 no longer wait on it.

Tickets 26 to 33 and 40 were triaged on 2026-10-31: each was rewritten against the mock-ups with their on-screen words, James answered eight gaps (the spec's "Decided in triage"), and all nine are ready-for-agent.
Ticket 27 now waits on 30 too, 28 on 40, and 31 on 26; the stale "mock-up 1" and "mock-up 2" blockers are gone from 15, 21 and 23.

Next: triage 15 to 25, which are still needs-info (23 first, since 26, 27, 30 and 31 wait on it), and rewrite 04, 18 and 19 for the mock-up 1 changes, before anyone builds.

How mock-ups are made, per James's standing preferences (see memory `mock-up-before-new-ui`, `lavish-plans-and-chrome-screenshots`):

- Build from the real captured page and `public/discipler.css`, copied beside the artifact with relative paths, flagged "Mock-up, not built".
- Put each question beside its screen with the recommendation preselected, worded so the preselected answer is the recommendation.
- No em dashes anywhere.
- To capture a signed-in page: `npx next dev -p 3100`, `npm run seed` (prints the demo Admins as JSON), then `node .lavish/tools/cookie-proxy.mjs 3100 3199 <adminPhone> <ACCOUNT_PASSWORD from tests/support/local-supabase.ts>`, and fetch or shoot `http://127.0.0.1:3199/<path>`.
  Headless Chrome screenshots work well; for phone width, frame the page in a 390px iframe (`.lavish/signup-checkout/_phone.html#<file>`).
- Check every artifact on a plain `python3 -m http.server` before handing over the Lavish link, and give James the static URL as a fallback.

## Built so far

Tickets 01, 02, 06, 09, 10, 12, 13, 29, 34, 35 and 36 are built and on `main` (PR #35, merge 49d4bb2, 2026-11-02), with their migrations pushed to production.
`main`, not the main checkout's untracked copy, holds the current `.scratch/exponential-launch`.
Each ticket's `## Comments` records what was built and every decision made on a gap, and what they left for a human is in `docs/open-questions.md`.
Ten are `shipped`; 02 is `ready-for-human`, with the reason at the end of its comments.

- `20261101060000` was the first of two steps; `20261102120000_drop_ministry_sending_number.sql` is the second, written and pushed to production by hand, separately from PR #35, and nothing here records that push (ticket 06's comments).
- New environment variables: `TWILIO_VERIFY_SERVICE_SID`, `DISCIPLER_ENVIRONMENT`, `MESSAGE_TRANSPORT`, `STAGING_SMS_SIGNING_SECRET`, `STAGING_EMAIL_RECIPIENT`.
- Operator-only tables added: `phone_check`, `phone_check_code`, `sign_in_attempt`, `shared_number`, `shared_number_capacity_alert`.
- Texts must keep naming their number as Twilio's `From`: sending by the Messaging Service's SID would make one `STOP` silence every church (ADR-0033).

Tickets 03, 07, 08, 11, 23 and 40 and the intake form's consent links were built on 2026-11-03 and merged into one branch, `launch/wave-2026-11-03`.
Five are `shipped`; 07 is `needs-info`, because James kept the send pass hourly for the launch, so check-ins are not spread.
What they left for a human is in `docs/open-questions.md`.

- Every later replacement of `app.page_session()` or `app.short_name_is_reserved` must keep every field and name, including `billing`, `full_name`, `signup` and `stripe`.
- `dailyCap` is required on `dispatchQueue`.

Tickets 04, 05, 14, 15, 16, 24, 25, 26 and 30 were built on 2026-11-03 and merged into one branch, `launch/wave-3-2026-11-03`, and James's decisions on them are in the spec and `docs/open-questions.md`.
Their nine migrations, dated 20261104, are not pushed; James says when, and they must be pushed before the merge.
Their `Status:` lines and the spec's ticket table are not yet moved to `shipped`, because that needs the merge.
Sign-up stays shut until `SIGN_UP_OPEN=true`, which waits for ticket 17, because until then the flow stops after the email is verified.
From the deploy, the texting gate checks every text and the over-200 watch runs on the tick.
What they left for a human is in `docs/open-questions.md`.

- New environment variable: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; the Turnstile keys now guard the signed-out support form too.
- `npm run stripe:catalog` creates the Stripe product, prices and coupons, once per account, staging's sandbox first.
- Operator-only tables added: `over_200_follow_up`, `payment_fingerprint_grant`, `signed_out_support_submission`.

Next: triage 17 to 22, rewrite 18 and 19, then build the next wave in the same way, one worktree per ticket merged into one launch branch cut from `origin/main`.

## Blocked on James

- **Stripe and Resend are provisioned** (2026-10-30), both connected to the `discipler` Vercel project:
  - `discipler-stripe-sandbox`, a Stripe sandbox on Development only (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_MCP_KEY`). Claim it into a real account later with `vercel integration resource claim discipler-stripe-sandbox`; live keys go on Production only after James activates Stripe with Discipler LLC's details.
  - `discipler-resend` on Production only, domain `notify.trydiscipler.com`, region us-east-1 (`RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN`). Its DNS records are published and the domain is verified (James, 2026-11-01).
- **Done by James on 2026-10-30, as Twilio organization owner:** the support ticket (number not yet shared), auto-recharge on, and Billing access for his everyday login.
  Open: auto-recharge is set to refill below $10 back up to $50 with no backup card; recommended below $100 back up to $500 plus a backup card.
- **Originally asked of James in Twilio** (kept for reference):
  - file the support ticket in `research/twilio-support-ticket.md`
  - turn on auto-recharge (add $500 below $100, with a backup card)
  - grant his everyday login Billing and Support access
  His everyday login could not open tickets or see Billing.
- The "Discipler" Verify service exists and `TWILIO_VERIFY_SERVICE_SID` is set (James, 2026-11-02).
- Still to do in Twilio once allowed: buy 5 shared numbers into Messaging Service `discipler-sms`, remove the rejected toll-free +18335050572 from the service, and prepare the Standard brand vetting and the Mixed campaign for James to sign.

## Working-tree cautions

- The main checkout is on `ship/waves-2026-09-22` and holds another session's uncommitted Overview changes; do not commit or revert them.
- Build the launch on a fresh worktree branched from `origin/main`, and commit only named paths.
- Everything under `.lavish/` from this work is uncommitted; `.scratch/exponential-launch/` is on `main`.
