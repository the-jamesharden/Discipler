# The Test Check-In Texts an Admin

## Status

accepted

Supersedes *No Interface Action Sends a Message* in `docs/product-rules.md`, which becomes *No Interface Action Sends Free-Form Text*.
Amends ADR-0010's *there is no admin-initiated send anywhere in Discipler*, already amended once by ADR-0027.

## Decision

**An Admin can press a button that texts a real check-in to their own phone, so they see what their Leaders get.**
James decided it in the grilling, and its words in the mock-up 3 review (2026-10-30).

It is fenced on every side:

- It texts only the signed-in Admin's own phone, checked once with a 6-digit code before the first test.
- It walks the same check-in steps as a real check-in, composed by the same composer with the church's own words, and its first and last texts are James's.
- It is limited per Admin per day, and refused while a real question is open on that phone.
- It has its own table and state machine.
  The reply router checks for an open test before anything else, and a test reply never touches a real relationship.
- An unanswered test ends by itself, and ends at once when a real check-in is about to be texted to that phone, so a real check-in's reply is never caught by a test.
- Tests show on Check-Ins with a Test tag and are counted nowhere.
- It is sent under the Admin's own consent, given at sign-up or on the card for an Admin from before sign-up, and through the same recipient check as every other text.

**The rule it replaces is narrowed, not dropped.**
No interface action sends free-form text: no button sends words an Admin typed for that send, to anyone.
A button may cause a text only when Discipler wrote it, inside the frame of ADR-0034, and only to the people the feature names.

## Context

*No Interface Action Sends a Message* held that no Admin action texts anybody, so that a church could not over-message its congregation and get its number flagged, and so that the product needed no per-recipient rate limits.
ADR-0027 already let one text follow an Admin's act, sent later by the tick.

Onboarding needs an Admin to feel the product before they invite anybody.
The check-in is the product as a Leader meets it, and the honest way to show it is to send one.
A screenshot of a phone is a description; a text arriving on the pastor's own phone is the thing itself.

## Considered options

**Show the check-in only as a picture of a phone.**
Rejected.
Onboarding already shows that in the tour, and it does not answer *what will my Leaders actually get*.

**Let a test go to any phone the Admin types.**
Rejected.
That is an Admin-initiated send to a third party, which is what the old rule existed to forbid, and it would text a number that never consented.

**Keep the old rule word for word and treat the test as an exception.**
Rejected.
An exception recorded nowhere is the kind of thing a later reader removes as a violation.
Saying what the rule now forbids, free-form text, keeps the line where it matters: James declined a broadcast to Disciplers on 2026-10-12, and it stays declined.

## Consequences

The phone the test reaches is the one person who pressed the button, so a test cannot reach a congregation, and the daily limit is a guard against a stuck finger rather than a messaging ceiling.

The product now has a per-recipient daily limit on one kind of text.
It belongs to the test alone; real check-ins still need none, because nothing but the rhythm sends them.

The test's first text pluralises the church's leader noun ("the same one your {leader noun}s get"), which ADR-0015 says Discipler never does on a church's behalf.
It is James's wording from the mock-up 3 review and is recorded here as a known conflict for him to settle, not resolved by inference.

A test texts the Admin through a shared number (ADR-0033) under the church's Messages read as, so what the Admin sees is exactly what a Leader sees, frame included.
