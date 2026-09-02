# A Ministry Opens From a Link

## Status

accepted

## Decision

**A Ministry comes into existence when its first Admin opens a Ministry Setup Link, not when an operator runs a script.**
Whoever runs Discipler mints the link, naming the church, the number it sends from, and the phone its Admin signs in with.
The Admin opens it, types their own name and password, and that one submit creates the account, the Ministry, their Person row, and their `admin` membership in one transaction that also spends the link.

Three things follow and are decided here with it.

- **The link is minted before any Ministry exists, so it belongs to none.**
  `ministry_setup` is the one table in Discipler with no `ministry_id` on a live row.
  No API role may touch it; only the trusted connection provisioning already runs on does.
- **The Ministry's history starts with `ministry.opened`, written by provisioning itself.**
  One event for one act, with the Ministry as its subject and the first Admin's Person id in its payload, because a Ministry with no Admin is not a state the product has.
  This closes the question ticket 24 left open.
- **The phone is fixed on the link and never typed**, as at Acceptance, so a forwarded link cannot open a Ministry on a stranger's phone.
  Minting again for the same phone replaces the live link, which is the only way one is taken back, on the reasoning of `docs/adr/0012-re-issuing-a-link-replaces-it.md`.

## Context

Ticket 24 made provisioning product code and left the operator running it: a script that took the church, both numbers, and the Admin's name, and read their password on the terminal with echo off.
That put somebody other than the Admin in charge of choosing and then conveying a password, which is a bad way to hand over the one credential the product has, and it recorded no history for the four rows it wrote.

The Invitation Link already solved the same problem for a Leader: a token, possession as the authentication, a fixed phone, a fixed window, spent by account creation.
Pointing that shape at a pastor keeps every property of it and removes the terminal.

## Considered options

**A sign-up page.**
Rejected.
A Ministry exists because an operator said so, and `docs/non-goals.md` refuses features added because they are common in SaaS products, of which a sign-up page is the commonest.
The link keeps the operator's say-so and moves only the typing of the password.

**Create the Ministry when the link is minted, and let the link merely set the password.**
Rejected.
A link nobody opens would leave a Ministry with no Admin standing in the database, which is a state nothing else in the product can reach.
The cost of creating on submit is a table scoped to no Ministry, and that is the cost this accepts.

**Text the link from Discipler.**
Rejected for now.
The Ministry does not exist yet, so it has no number to send from, and a Discipler-wide sending number is a new thing for a handful of churches an operator can message by hand.

**Reuse an existing account when the Admin's phone already signs somebody in.**
Deferred.
Acceptance reuses `person.user_id` inside one Ministry; an account spanning two Ministries is a question `docs/adr/0009-one-account-per-human.md` did not have to answer.
Until it is answered, the mint refuses a taken number outright, while the operator can still act on it.

## Consequences

`scripts/provision-ministry.ts` is `scripts/setup-link.ts` and prints a URL.
No password is typed on a terminal any more, by anybody.

`provisionMinistry` remains the one place a Ministry is created and is still what the seed script and the test fixture call, so every suite is built on a state the product reaches.
It now writes `ministry.opened`, so `ministry-isolation` no longer writes one by hand.

A Ministry whose link was never opened is a row in `ministry_setup` and nothing else.
When it runs out, the operator mints again.
