# 02 - Staging

**What to build:** A staging copy of Discipler with its own database, Stripe in test mode and no real texting, where every billing and sign-up change is tried first (Q56).

**Blocked by:** nothing

**Status:** ready-for-agent

## Why

Vercel Preview shares the production database, Supabase and Twilio today.
Without staging, the first full test of Checkout, the Portal and Stripe's webhooks would run against real churches' data.

## What it is

- A Vercel custom environment for the `discipler` project, deployed from a named branch.
- Its own Supabase project, migrated with `supabase db push`, with seeded demo data.
- Stripe test-mode keys and its own test-mode webhook secret.
- No Twilio sending: the message transport records texts instead of sending them, and the inbound route accepts only signed test requests.
- Turnstile test keys and a Resend key limited to a test address.

## Acceptance

- A sign-up on staging runs through Checkout with a Stripe test card, the webhook marks the church trialing, and nothing reaches production.
- Production's `DATABASE_URL`, Stripe live keys and Twilio credentials are not set on staging.
- `docs/agents/test-environment.md` says how to deploy to staging and how to replay Stripe test events against it.

## For James

1. A second Supabase project adds a monthly cost; approve it before it is created.
