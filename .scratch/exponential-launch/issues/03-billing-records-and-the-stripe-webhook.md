# 03 - Billing records and the Stripe webhook

**What to build:** The tables that hold each church's billing state, and the Stripe webhook that is their only writer.

**Blocked by:** 01

**Status:** ready-for-agent

## The records

- `ministry_billing`: the church's Stripe customer ID, subscription ID, latest invoice ID, price ID, `livemode`, and the operator flag `billed_outside_stripe`.
  Church-scoped, RLS forced, a `discipler_command` policy, and no write grant to `authenticated`.
- `billing_event`: an append-only history of what each processed Stripe event established; the church's current billing state is derived from it, never overwritten.
- `stripe_event`: the inbox, keyed by Stripe's event ID, operator-only per ticket 01, with the resolved church in a column not named `ministry_id`.
- SAU BCM and Anthem Community Church get `billed_outside_stripe` set; so does Example Ministry.

## The webhook

- A Node route handler (for example `app/stripe/webhook/route.ts`) reads the raw body with `request.text()` and verifies it with `stripe.webhooks.constructEvent` at the default tolerance.
- `STRIPE_WEBHOOK_SECRET` unset means every request is refused; a bad signature gets 400 with no detail.
- `event.livemode` must match the deployment's mode.
- Each verified event is inserted into `stripe_event` with `on conflict do nothing`, a 2xx is returned, and processing runs after the response; the cron tick sweeps unprocessed rows.
- On every subscription or invoice event, the current Subscription is re-read from the Stripe API and that is what gets recorded.
- The church is found by the stored customer ID through a narrow definer function, for example `app.ministry_of_stripe_customer(text)`, revoked from `public`, `anon`, `authenticated` and `service_role`; `client_reference_id` and metadata are a cross-check, and a mismatch is refused and alerted.
- Writes run in a normal scoped unit of work as `discipler_command`, never as `service_role`.
- Only these events are subscribed: `checkout.session.completed`, `customer.subscription.created`, `updated`, `deleted`, `trial_will_end`, `paused`, `resumed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `charge.refunded`, `charge.dispute.created`.
- Logs carry event IDs and types only.

## Access

- Trialing and active grant access, and so does `billed_outside_stripe`.
- Past due keeps everything running, with a banner (ticket 33).
- Canceled, unpaid, incomplete_expired and paused end access: check-ins stop and the dashboard turns read-only, with history kept.

## Acceptance

- A replayed event is processed once.
- A late `customer.subscription.updated` cannot roll a canceled church back to active, because the subscription is re-read.
- A test-mode event sent to production is refused.
- A forged request with no or a wrong signature is refused, and an unset secret refuses all.
- An event whose metadata names a different church from its stored customer is refused and alerted.
- The church's billing state on its pages comes from the page function, never from the Stripe IDs.

## For James

1. Stripe is provisioned through the Vercel Marketplace (slug `stripe`); the keys are Production-only, as Secret values, and a restricted key is used.
