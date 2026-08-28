# The Phone Number Is the Sign-In Credential

## Status

accepted

## Context

Three parts of the specification named three different sign-in credentials, and one of
them had already shipped.

Ticket 01 built email and password (`app/login/page.tsx`, Supabase Auth). Ticket 15
says a Leader whose session has expired "signs in with their phone number and
password". Ticket 06 describes acceptance as setting a name and a password and never
names an identifier at all. Nothing reconciled them, and each was written as though it
were the only one.

The deciding fact is that **email is optional at Intake**. It is a user story in its
own right — *I want my email address to be optional, so that a missing email does not
block me from participating* — and the CSV importer treats a missing address as normal.
A Person may therefore complete Intake, be marked eligible to lead, be paired, receive
an Invitation Link, and hold a relationship without Discipler ever learning an email
address for them.

Everything else about authentication in this product is already built on the phone. The
Invitation Link is bound to the Person record and delivered by SMS, and possession of
the phone it was sent to *is* the authentication. There is no email in that flow
anywhere.

## Decision

**The sign-in credential is a phone number and a password, for every user, on one
form.** Email is not a credential. It remains an optional contact detail on the Person
record and nothing else.

This applies to Admins as well as Leaders. Admin account provisioning changes with it.

One-time codes remain post-launch, unchanged. Recovery is by password, and a lost
password requires an Admin reset until they ship.

## Considered options

**Email for Admins, phone for Leaders.** Rejected. Two sign-in forms means a person
arriving at Discipler has to know which kind of user they are before they can type
anything, and an Admin who also leads — a supported and expected state — is both. The
product has exactly two access tiers and must not grow a third distinction here.

**Accept either identifier on one form.** Rejected. A Person holding both has two doors,
and password recovery then has to choose which one to send to, or send to both. Both
answers are worse than having one door.

**Keep email and make it required at Intake.** Rejected outright. It reverses a settled
user story to serve a login screen, and it would exclude from participation the people
least likely to have an email address they check — which is the opposite of what a
ministry wants from an intake form.

**Phone with a one-time code instead of a password.** Deferred, not rejected. It is the
better long-term answer and it is already recorded as post-launch. Deciding the
identifier now does not foreclose it; changing the identifier later would.

## Consequences

Ticket 01's login page is superseded. It shipped and works, and it is replaced rather
than extended.

This is cheap now and expensive later. Once pilot Admins hold accounts keyed to email
addresses, changing the identifier is a migration against live credentials, which is
why it is settled before the pilot rather than after it.

Supabase Auth supports a phone identity with a password, so the platform choice in
`docs/adr/0002-supabase-as-the-platform.md` is unaffected.

A phone number is now load-bearing in three separate ways — it identifies a Person, it
carries every message, and it authenticates a session. `docs/adr/0005-a-person-is-a-name-and-a-number.md` already establishes the first. Any future feature that lets a phone
number be edited must account for all three, and "not my number" on the invitation flow
deliberately does not edit one.
