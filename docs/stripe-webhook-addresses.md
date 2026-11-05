# Stripe's webhook addresses

Only Stripe's published addresses may reach `/stripe/webhook` (Exponential launch, ticket 37; spec, Q57).
The signature check is what proves an event is Stripe's, and this turns everybody else away first.
The list has two homes, and a change has to reach both.

## Where the list lives

1. `STRIPE_WEBHOOK_ADDRESSES` in `src/platform/stripe/webhook.ts`, which the route checks on production and staging.
   This is live as soon as the code is deployed.
2. A Vercel Firewall rule on the `discipler` project, which stops the request before a function runs.
   James adds this by hand, once, and it is the only step that needs him.

## The Firewall rule

In the Vercel dashboard, open the `discipler` project, then Firewall, then Configure, then New Rule.

- **Name:** Stripe webhook addresses only
- **If:** `Request Path` `Equals` `/stripe/webhook`
- **And:** `IP Address` `Is not any of` the fifteen addresses below
- **Then:** `Deny`

Add it with the action `Log` first, and watch one real event arrive from Stripe, then change it to `Deny`.
A rule that is wrong in a way the code is not would stop every billing event, and the Stripe Dashboard's webhook page is where that would show.

The addresses, read from `https://stripe.com/files/ips/ips_webhooks.json` on 2026-11-04:

```text
3.18.12.63
3.69.109.8
3.120.168.93
3.130.192.231
13.235.14.237
13.235.122.149
18.211.135.69
35.154.171.200
35.157.207.129
52.15.183.38
54.88.130.119
54.88.130.237
54.187.174.169
54.187.205.235
54.187.216.72
```

## When Stripe changes the list

Stripe gives seven days' notice on its API announce list, `https://groups.google.com/a/lists.stripe.com/g/api-announce`.
Somebody who reads their email has to be subscribed, or the first sign of a change is the symptom below.

1. Add the new addresses to `STRIPE_WEBHOOK_ADDRESSES` and to the rule, before the change takes effect.
2. Remove the old ones only after it has.

## What a wrong list looks like

Billing stops changing, with no error on any page.
A church's payment step sits on "Finishing setup..." and offers the link to Overview, because the webhook is what writes access.
In Vercel's runtime logs each refusal reads `A request reached the Stripe webhook from an address not on Stripe's list`.
In Stripe's Dashboard the endpoint's deliveries show as failed, and Stripe retries each for up to three days, so nothing is lost if the list is mended by then.

## Off production and staging

A developer's machine and a Preview are not held to the list.
`stripe listen --forward-to` reaches a local server from this machine, and a Preview holds no Stripe secret, so the signature check refuses everything there anyway.
Staging's sandbox sends from these same addresses, so staging is where a wrong list shows first.
