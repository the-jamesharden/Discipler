# 18 - Sign-up: Checkout and landing on Overview

**What to build:** Start free trial opens Stripe's hosted Checkout, and the Admin comes back signed in to Overview with onboarding open.

**Blocked by:** 04, 17

**Status:** needs-info

> **Changed by the mock-up 1 review (2026-10-29), rewrite before building:** payment is Stripe's Payment Element inside Discipler's sign-up card, not Checkout; the church-plant questions sit on "Set up your account", before payment; monthly or yearly billing is chosen there, the one place prices appear. See the spec's Self sign-up section.

## The flow

- Start free trial opens the Checkout session from ticket 04.
- On return, a page says Discipler is finishing setup and waits for the webhook to record the subscription.
- Then the church-plant question (ticket 19), then Overview with the onboarding modal open (ticket 27).
- A church that closes Checkout lands on a page that can reopen it.

## Acceptance

- With a Stripe test card on staging, the Admin lands on Overview, signed in, with the church trialing.
- Returning to the success page without a completed subscription unlocks nothing.

## For James

1. Approve the waiting page and the reopen page in mock-up 1.
