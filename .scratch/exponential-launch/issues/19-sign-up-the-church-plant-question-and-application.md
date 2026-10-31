# 19 - Sign-up: the church-plant question and application

**What to build:** After Checkout, "Are you a church plant?", the application behind Yes, and the operator command that approves it (Q49, Q27).

**Blocked by:** 18

**Status:** needs-info

> **Changed by the mock-up 1 review (2026-10-29), rewrite before building:** payment is Stripe's Payment Element inside Discipler's sign-up card, not Checkout; the church-plant questions sit on "Set up your account", before payment; monthly or yearly billing is chosen there, the one place prices appear. See the spec's Self sign-up section.

## The flow

- Yes opens the application; No goes on to Overview.
- The application asks for the launch date, the sending or partner church, average weekly attendance, the lead pastor, and anything else.
- Submitting stores it and emails james@trydiscipler.com and lerone@trydiscipler.com, with no approve link in the email.
- The church carries on with its ordinary trial meanwhile.

## The approval

- An operator command, run like `scripts/setup-link.ts`, approves an application by its ID.
- Approval adds the 12 months at 100% off after the trial to the church's Subscription Schedule, then the Exponential special offer's year if the church used `EXPO26`, and emails the church.
- A payment fingerprint that already had a plant year cannot get a second.
- Declining is the same command with a decline, and emails nothing unless James chooses to.

## Acceptance

- An approved plant on a 30-day trial pays nothing for 13 months and then $97.
- An approved plant that used `EXPO26` gets 60 days, 12 months free, then 12 months at $77.60.
- A plant offer and a referral month do not combine.

## For James

1. Approve the question and the application in mock-up 1.
2. The email to the church on approval and on decline is yours to word; drafts come with the mock-up.
