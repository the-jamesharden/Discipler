# 19 - Sign-up: the church-plant question and application

> **Triaged and rewritten 2026-11-04.**
> James moved the plant questions onto "Set up your account", before payment, in the mock-up 1 review, reversing Q49.
> The screen is `s4-account.html` (open it with `?plant=yes`) in `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`.

**What to build:** On "Set up your account", "Is your church a church plant?" and the application behind Yes; the email to James and Lerone; and the operator command that approves or declines it (Q27).

**Blocked by:** 04, 17

**Status:** ready-for-agent

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
