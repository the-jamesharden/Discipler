# 19 - Sign-up: the church-plant question and application

> **Triaged and rewritten 2026-11-04.**
> James moved the plant questions onto "Set up your account", before payment, in the mock-up 1 review, reversing Q49.
> The screen is `s4-account.html` (open it with `?plant=yes`) in `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`.

**What to build:** On "Set up your account", "Is your church a church plant?" and the application behind Yes; the email to James and Lerone; and the operator command that approves or declines it (Q27).

**Blocked by:** 04, 17

**Status:** ready-for-human

## The questions

They sit on ticket 17's page, between Timezone and "How would you like to pay?".

- "Is your church a church plant? (optional)", with "Church plants that launched in the last 3 years, or are launching in the next 12 months, can apply for a year of Discipler free."
- "Yes, we are" and "No", with No preselected.
- Yes opens, on the same page: "Launch date, or planned launch date *" (free text, "For example, September 2025"), "Sending or partner church *", "Average weekly attendance *", "Lead pastor *" (prefilled with the Full name and changeable) and "Anything else you'd like us to know? (optional)".
- Under them: "James or Lerone will follow up by email. Your trial starts either way, and your free year begins once your application is approved."
- While Yes is chosen, **Start free trial** also needs those four fields.

## The application

- A table, `church_plant_application`, holds one row per church with the answers, the time, the decision and when it was made.
  It is church-scoped in the shape of `trial_opening`, with `ministry_id`, forced row-level security, `discipler_command` policies and no browser grant, and is not named in `OPERATOR_ONLY_TABLES`.
- It is written in the transaction that opens the church, so a church is never opened with its application lost.
- `churchPlantApplication` goes to james@ and lerone@ after the commit, with the answers, the church's name and the application's ID, and no approve link.
- A failure to send is logged by its name and never undoes the church, and the command can list applications with no decision, so none is lost to a failed email.
- The church carries on with its ordinary trial meanwhile.

## The approval

An operator command, run the way `scripts/setup-link.ts` is, with `approve <id>`, `decline <id>` and `list`.

**Approve** reads the Subscription's opening with `unit.openingOf`, reads the fingerprint from `confirmDefaultPaymentMethod`, claims it with `unit.claimFingerprint(print, 'plant_year', at)`, calls `trials.schedulePhases(subscription, paidPhasesOf({ cycle, offer, plantYear: true }))`, then sends `churchPlantDecision`.

- A church with no confirmed payment method yet is refused, with a sentence for the operator, and can be approved once it has one.
- A card or bank account that already had a plant year is refused, with a sentence for the operator, and nothing is emailed.
- A method with no fingerprint, such as Stripe Link, cannot be checked, so it is approved and the operator is told, as ticket 04 treats the first free month.
- A church with no Subscription, or billed outside Stripe, is refused the same way.
- Approving twice changes nothing and sends nothing the second time.
- Approved after the trial has ended, with a bill already paid, the free year starts at the next bill and the paid bill stays paid (James, 2026-11-04).
  A refund is James's by hand, and the operator is told so.
  `schedulePhases` assumes the free days are the current phase, so this needs the current paid phase kept until its period ends.

**Decline** records the decision and emails nothing unless `--email` is passed, sending the decline wording.

## Acceptance

- An approved plant on a 30-day trial pays nothing for 13 months and then $97.
- An approved plant that used `EXPO26` gets 60 days, 12 months free, then 12 months at $77.60, then $97.
- A plant approved after a paid bill keeps that bill paid, and pays nothing for the 12 months from its next bill.
- An approved yearly plant pays nothing at its first yearly bill, and the full yearly price after it, or the offer's year first if it used `EXPO26`.
- A plant offer and a referral month do not combine, and the plant offer wins.
- A second church on the same card cannot get a second plant year.
- The application survives the church's opening as one transaction, and a browser cannot read it.
- No email holds an approve link.
- The command refuses to run an approval a second time without doing anything at Stripe.
- All of this passes against a fake Stripe.
- Once ticket 02 has staging, one approval is run on its sandbox with a test clock; this holds the ticket's `shipped`, not its building.

## For James

1. The email to the church on approval and on decline, and the application's email to you and Lerone, are yours to word.
   Drafts come with the build, in `docs/open-questions.md`.

## Comments

### 2026-11-04: built on `wave4/19`, not merged

**What was built.**
"Is your church a church plant?" and its application sit between Timezone and "How would you like to pay?", in `app/signup/account/plant-questions.tsx`, in the mock-up's words.
`church_plant_application` is written in the transaction that opens the church, in `provisionMinistry`.
`churchPlantApplication` goes to james@ and lerone@ after the commit, from `src/service/opening-a-church.ts`.
`npm run church-plant -- list | approve <id> | decline <id> [--email]` runs `scripts/church-plant.ts`, whose rules are in `src/service/church-plant-decisions.ts`.
`schedulePhases` now reads the Subscription's status: while it is `trialing` it keeps the free days as before, and otherwise it keeps the current paid phase, with its price and discount, until the period's end, and the new phases begin there.
One migration: `20261104110019_the_church_plant_application.sql`.

**How it was checked.**
`tests/integration/approving-a-church-plant.test.ts` runs the approval against the real schema, roles and billing lock, with Stripe and Resend as fakes at their ports, and runs the real command as a process with no Stripe or Resend key.
`tests/app/opening-a-trial-at-stripe.test.ts` reads what is asked of Stripe's API through the real SDK, and works out each acceptance line's bills from the phases asked for.
`tests/integration/setting-up-your-account.test.ts` covers the application through the real route.
A production build was driven in headless Chrome at 390 pixels and at 1280, beside `s4-account.html?plant=yes`, with stand-ins for Turnstile and for Cloudflare's and Resend's answers, so nothing left the machine.
There No was preselected, Yes opened the application, the lead pastor followed the full name until typed in, the button tracked the four answers, No kept the answers for a change of mind, a refusal sat under its answer, there was no horizontal scroll, and pressing the button opened one church with one application, and both emails were written with the words above.
The one difference from the mock-up is 2 pixels above and below each question, because `public/discipler.css` gives every `legend` a line height of 1.3 that the mock-up's older copy lacks; I left that global rule alone.
The full locked suite passed: 325 files with none skipped, and 5247 tests with 1 skipped, the older `it.skip` at `tests/integration/invitation-over-http.test.ts:421`.
The type check is clean, and there is no lint config in this repository, so nothing was linted.
**Not run, and still to do: the one approval on staging's sandbox with a test clock,** because staging does not exist yet.
So `from_subscription` with an existing paid period, an update with past phases left out, and the current phase's new end date are built from Stripe's documentation and proven only against a fake.
This holds the ticket's `shipped`.

**Decisions on gaps, each with its alternative.**

- A decision stands: the command will not approve what it declined, or decline what it approved, and the row is its history. The alternative was letting a later decision overwrite it, which loses when it was made. James may want a change of mind after a decline; today that is a line of SQL.
- A church whose card is confirmed, and whose opening the webhook has not settled, is refused with "try again in a few minutes". The alternative was to approve it, and the settling would then write over the free year with the ordinary bills.
- A Subscription set to end is refused, because a schedule on it could take the ending away. The alternative was to let Stripe answer, which might have quietly kept a church that chose to leave.
- A church past due counts as past its trial, so its free year starts at the next bill. The alternative was to refuse until it pays.
- A plant with `EXPO26` approved after a paid bill keeps its discounted current bill, then 12 months free, then a full 12 months at the offer. That is one offer bill more than 12; the alternative was to shorten the offer's year by what was already billed, which nobody asked for.
- The application's email also carries the login address, which the ticket did not list, because the page promises "James or Lerone will follow up by email" and nothing else in it says where. The alternative was to look it up with `list`.
- The decision's address is read from `auth.users` at the time, not kept on the application, so there is one address. The alternative was a copy on the row.
- A failed decision email is not retried: the decision stands and the operator is told to write by hand. The alternative was a column recording the send, so a second run could send only the email.
- A second `decline --email` after a plain `decline` sends nothing, as a second run of anything does. The alternative was to treat it as asking for the email.
- A first-free-month claim made at settling is not given back when the plant offer later wins. The alternative was to release it, and Terms allow one per card either way.
- The answers are capped at what one email carries, 200 characters and 5000 for "Anything else", by `maxLength` in the browser and a refusal on the server, so nothing is cut on its way to you. The alternative was to let the email cut them.
- Attendance stays free text, as the mock-up draws it, so "about 120" is accepted.

**Draft words for James**, also in `docs/open-questions.md` under *sign-up's numbers and wording*:

- `churchPlantApplication`, in `tellTheFounders`.
- `churchPlantDecision`: the approval during a trial, the approval after a trial and the decline, in `src/service/church-plant-decisions.ts`, each with the subject "Your church plant application".
- The five refusal sentences in `OPENING_REFUSALS` in `app/signup/copy.ts`.

**What the next tickets build on.**

- **18:** nothing here reads the payment page, and an applicant goes on to it like any other church.
- **20:** `paidPhasesOf` already lets a plant win over a referral, so a referred plant needs nothing more here.
- **33:** the seven-day `trialEnding` email has to know an approved plant is not about to be charged: read `church_plant_application.decision` before wording it.
- **33 and the Customer Portal:** approval reads the cycle from `trial_opening`, so a church that has moved between monthly and yearly would be scheduled on the old one, and nothing in this repository can move one yet.
- **A Billing page, when there is one:** nothing says a free year is on but the email.
