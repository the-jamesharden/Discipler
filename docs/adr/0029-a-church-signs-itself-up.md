# A Church Signs Itself Up

## Status

accepted

Supersedes ADR-0019, *A Ministry Opens From a Link*, as the way a church comes to Discipler.
The Ministry Setup Link stays, for churches James chooses to comp, and keeps every property ADR-0019 gave it.

## Decision

**A church can open its own Ministry at `app.trydiscipler.com/signup`, with nobody at Discipler involved.**
James decided it in the grilling of 2026-10-25 to 2026-10-29, for the Exponential conference, where churches are to sign up at the booth.

Sign-up is one flow, modelled on Planning Center's:

1. An are-you-human check, verified on the server before anything costs money.
2. Email and mobile phone on one page, with the text-message consent under the phone field.
   Continuing is a consent for that phone, recorded when the church is opened with the source `ministry_setup`, which lets Discipler text the Admin without putting them on the path to being paired (see `docs/consent-language.md`).
3. A code emailed to that address, which proves the address.
4. One page that sets up the account and the church: the church's name, the Admin's name, a password, the timezone, the church-plant question, monthly or yearly, and agreement to the Terms of Service and Privacy Policy, recorded with the terms version and the time.
5. A card or bank account, taken by Stripe inside Discipler's own sign-up card.
   Nothing is charged at sign-up; the free trial starts.
6. The Admin lands signed in on Overview, with onboarding open.

The church is still created by `provisionMinistry`, in one transaction, and its history still starts with `ministry.opened`.
Sign-up is a second caller of the one creation path, not a second path, so a double click cannot open two churches.

## Context

ADR-0019 rejected a sign-up page because a Ministry existed on an operator's say-so, and because `docs/non-goals.md` refuses features added for being common in SaaS products.
Two things changed.
James asked on 2026-10-12 for churches to sign themselves up, and the conference made it urgent: a church met at a booth has to be able to start that day, and an operator minting links by hand does not scale past a handful of churches.
And the hardest part of opening a church, buying and registering the number it sends from, went away when Discipler moved to a shared set of numbers (ADR-0033), so a new church can text the moment it exists.

## Considered options

**Keep the Setup Link as the only door, and mint links faster.**
Rejected.
It keeps an operator between every church and its first sign-in, which is the thing the conference cannot wait on.

**A sign-up page that opens the church but leaves texting off until an operator approves it.**
Rejected.
It is the old operator step under another name.
Abuse is answered instead by what a stranger must get through to open a church: a human check, a proven email, a card or bank account up front, a texting gate that sends nothing for a church without a live subscription, and the caps on a new church's first weeks.

**Stripe Checkout for the payment step.**
Rejected in the mock-up 1 review (2026-10-29).
Checkout always repeats its own price summary, and James wanted a price shown once.
Stripe's Payment Element inside Discipler's own card takes the card or bank account, and card data stays in Stripe's frames either way.

## Consequences

**The cost is real and worth naming.**
Anyone on the internet can now open a Ministry, and a Ministry can text.
The operator's say-so, which was a check on who uses Discipler, is gone for paying churches, and every control that replaces it has to hold at once.
Each person a church texts still gives their own consent on an Intake form, so a self-opened church can no more text a congregation without consent than an operator-opened one could.

A church that opens its account and leaves before adding a card or bank account is kept with no subscription, sends no texts, and is returned to the payment step at its next sign-in.

The Setup Link is now the door for a church James comps.
Such a church has no subscription, so under the texting gate it texts only while it carries the operator flag *billed outside Stripe*, as SAU BCM and Anthem Community Church do.
What ADR-0019 decided about the link itself stands: possession is the authentication, the phone is shown and never typed, it runs out, it is spent by account creation, and minting again replaces it.
It no longer names a number the church sends from, because no church has one.

Supabase's own public sign-up stays off.
Every account is still created by Discipler's server, after the human check and the email code.

`docs/product-rules.md` no longer says *There is no sign-up surface*, and the *Sign-up* the glossary told readers to avoid is now a real thing with its own entry.
