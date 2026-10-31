# 04 - Prices, offers and the Checkout session

**What to build:** The Stripe catalog and the server route that opens hosted Checkout for a church, with the right trial and offer applied.

**Blocked by:** 03

**Status:** ready-for-agent

> **Changed by the mock-up 1 review (2026-10-29), rewrite before building:** payment is Stripe's Payment Element inside Discipler's sign-up card, not Checkout; the church-plant questions sit on "Set up your account", before payment; monthly or yearly billing is chosen there, the one place prices appear. See the spec's Self sign-up section.

## The catalog

- One product with two monthly prices: $97 and $147.
- Every church starts on $97.
- A 30-day trial for every church, with `payment_method_collection` left at `always`.
- The Exponential special offer (`EXPO26`): a 60-day trial instead of 30, then 20% off for 12 months, valid until the end of 2026-12-11 Pacific, once per church, no overall limit.
- The referral month: a 100%-off first paid invoice.
- The church-plant year: 12 months at 100% off after the trial, turned on only by the operator approval in ticket 19.
- The sequences that follow one another (plant year, then the founding rate year) are a Subscription Schedule with phases, not stacked coupons.

## The Checkout session

- Created by a POST route for a signed-in Admin of the church, checked with `session_is_live` and `tier = 'admin'`.
- The Stripe Customer is created first for that church, with the church name and the Admin's email only, and its ID stored on `ministry_billing`.
- The session carries `customer`, `client_reference_id` and `subscription_data.metadata.ministry_id`, all set on the server.
- Payment methods: card, Link, Apple Pay, and US bank account through Financial Connections instant verification only.
- Stripe Tax is off.
- The success page says it is finishing setup and reads billing state from the database; it unlocks nothing itself.

## Acceptance

- A church with no offer gets a 30-day trial on $97.
- `EXPO26` gives 60 days and then 12 invoices at $77.60.
- `EXPO26` after 2026-12-11 Pacific is refused with "That code has expired, but your free trial still applies.", and Checkout carries on at the normal price.
- A referral code and `EXPO26` together apply only the Exponential special offer.
- The same payment fingerprint cannot get a second first free month or a second plant year.
- Nothing about a church ever comes from the browser into the session.
