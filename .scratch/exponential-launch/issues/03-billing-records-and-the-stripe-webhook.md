# 03 - Billing records and the Stripe webhook

**What to build:** The tables that hold each church's billing state, and the Stripe webhook that is their only writer.

**Blocked by:** 01

**Status:** shipped

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
2. Push the three migrations before the build that uses them goes live, because every signed-in page now requires the `billing` its page function adds.
3. `STRIPE_SECRET_KEY` holds the restricted key, with read access to Subscriptions and Charges for this ticket; ticket 04 adds what it writes.
4. In Stripe, create the webhook endpoint at `https://app.trydiscipler.com/stripe/webhook` on API version `2026-10-28.endive`, subscribed to exactly the thirteen events above (`STRIPE_EVENTS_ACTED_ON` in `src/domain/billing.ts`), and put its `whsec_` in `STRIPE_WEBHOOK_SECRET`.
5. After the push, check the flag landed on the right three: `select m.name, b.billed_outside_stripe from ministry m left join ministry_billing b on b.ministry_id = m.id;` should show SAU BCM, Anthem Community Church and Example Ministry, all `true`, and no other row.

## Comments

### Built (2026-11-03)

Three migrations, unpushed: `20261103100300_billing_records.sql`, `20261103100400_the_churches_opened_before_stripe_are_billed_outside_it.sql` and `20261103100500_stripe_is_a_reserved_short_name.sql`.
`stripe_event` is on `OPERATOR_ONLY_TABLES`.
`app/stripe/webhook/route.ts` admits a request through `src/platform/stripe/webhook.ts`, keeps it in the inbox and answers; `src/service/stripe-events.ts` processes it after the response, and `/cron/tick` sweeps what that missed.
Stripe's API is behind the `StripeBilling` port, adapted in `src/platform/stripe/billing.ts`, reads only, and the suites run against a fake at that port.

### What the later tickets build on

- **Ticket 04:** `getBillingRecords().rememberCustomer(church, customerId, livemode)` stores the Customer and answers the one on record, so a double click's second Customer loses and the caller goes on with the first.
  Put the church's ID in metadata under `STRIPE_CHURCH_METADATA_KEY` (`ministry_id`) and in `client_reference_id`: they are cross-checked, and a disagreement is refused.
- **Ticket 05:** `app.billing_has_access(uuid)` is the gate's question, callable as `discipler_command` in the outbound query, and the rule is written once in `app.billing_state_of`.
  Fixtures from `createMinistryWithAdmin` have no flag and no subscription, so the gate will stop their texts: the fixture should pass `billedOutsideStripe: true` to `provisionMinistry`, one line, and tests about the gate opt out.
- **Ticket 33:** every page's document carries `billing`, read into `SignedInAdmin.billing` (`standing`, `hasAccess`, `trialEndsAt`, `currentPeriodEndsAt`, `cancelsAt`), so a banner needs no read of its own.
  `getBillingRecords().of(church)` gives the server the customer ID for the Portal.
- **Ticket 14:** `getBillingRecords().of(church).priceId`.
- **Tickets 32 and 37:** `billing_event` keeps which invoice and charge each event was about.
  `charge.dispute.created` and `charge.refunded` are history only here and change nothing by themselves.

### Decisions

- **Identifying the churches for `billed_outside_stripe`.** The data step flags every church that exists when it runs, in a migration of its own, and matches no name.
  Every such church opened before Discipler took a payment, so none holds a subscription or could; on production that is SAU BCM, Anthem Community Church and Example Ministry.
  The alternative was matching by name, which a rename would break and which James asked not to guess at.
- **A church opened by a Setup Link is billed outside Stripe.** The spec keeps Setup Links for comped churches, and without this the first one opened after ticket 05 would never text.
  `provisionMinistry` also takes `billedOutsideStripe` for the seed's demo churches.
  The alternative was an operator step after each link, which would be forgotten.
- **No command can set the flag.** The grants to `discipler_command` name every column but it, so the webhook cannot turn it on or off; an operator sets it with SQL on the trusted connection.
  There is no script for it yet, because the two ways a church gets it are covered above.
- **The inbox keeps Stripe's IDs and not the event.** An event carries the payer's name, email and card details, and the spec's first protection says only Stripe's IDs are stored.
  The alternative was a `payload` column, or fetching the event again by ID when processing; neither is needed, since the Subscription is re-read anyway.
- **The re-read lists the customer's Subscriptions rather than retrieving the one the event names.** A church that ended and restarted holds two, and an event about the old one must not end the new one.
  A live Subscription wins over any that is not, and the newest wins among equals.
- **Stripe is read inside the church's billing lock**, so a connection is held across one Stripe read.
  Otherwise two events could read in one order and commit in the other, landing an older answer last.
  The alternative was ordering by a read time, which different function instances' clocks cannot be trusted with.
- **Every event re-reads**, charge and Checkout events as well as the subscription and invoice events the ticket names, so every row in the history says what was true then.
- **A customer no church holds is refused and alerted too**, as is a dispute on a charge with no customer.
  The ticket only asks for this on a mismatch, but money moving with no church to credit is what support@ should hear about.
  A `stripe trigger` on staging will email the staging recipient.
- **`incomplete` has no access and a standing of its own**, which the ticket's Access section does not name.
  Its first payment has not gone through, and the alternatives, `no_subscription` or `ended`, would each be wrong for one of a new church and a restart.
- **An event of a type not subscribed to is kept and marked `ignored`**, so a widened endpoint shows in the inbox rather than vanishing.
- **Claiming is a lease of five minutes, not a held lock**, so a function that dies does not leave an event stuck; the unique event ID on `billing_event` keeps a second attempt from recording twice.
- **A failed event is retried on every tick with no limit**, least tried first, so it cannot hold back the others.
  The alternative, giving up after some number of tries, would stop a church's billing state from ever catching up.
- **A wrong-mode event gets the same 400 as a forged one.**
  Stripe will retry it for days, which is fine for what is a misconfiguration.
- **`stripe` is a reserved short name**, because `/stripe/webhook` is a top-level route and the test requires it.
- **`scripts/locked-tests.sh` and CI give the test server a test-only `STRIPE_WEBHOOK_SECRET`**, so the over-HTTP suite signs with a known secret in every checkout.

## Found while building

With the Payment Element, a Subscription with a trial reads `trialing` from the moment the server creates it, before its setup intent is confirmed.
The spec says a church that leaves the payment step sends no texts, so ticket 04 or 18 has to create it only once the payment method is confirmed, or this ticket's state has to treat a pending setup intent as no access.
