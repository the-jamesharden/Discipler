# An Imported Pair Is a Plan

## Status

accepted

## Decision

**An import that says who disciples whom records an intended pairing, not a relationship.**
The plan waits on one thing, that both people complete Intake, and is settled the moment they have: formed by the same function the Pair page uses, with the same refusals and the same invitation to the Discipler, or refused with the reason the pairing rules gave.
A refusal raises a Follow-Up Item on the Disciple and is never retried; an Admin pairs by hand or resolves it.
An Admin pairing the same two people by hand fulfils the plan.
There is no withdrawal, at the product owner's direction.

Settling runs one transaction per plan, after each Intake submission, after each import, and on the scheduled tick, never inside the submission's own transaction.

## Context

Ticket 36 adopted a Roster prototype whose import has an *Already paired* mode: each row is one discipler and one disciple, and the prototype creates the pair on import.
Two settled rules stand in the way of doing that literally.
Pairing requires completed Intake on both sides, enforced by the readiness triggers on `relationship_member`, and importing a person is never consent.
An import cannot form a relationship between two people who have agreed to nothing.

Three ways out were weighed.
Creating the relationship at import and relaxing the Intake gate for imports puts one congregation's consent rule behind a flag on a spreadsheet.
Dropping the mode loses the one thing a church's own records reliably know, which is who is already meeting with whom.
Recording the intention keeps every settled rule and loses nothing: the plan is the Admin's statement, and the pairing forms itself the day the second Intake lands, by the rules.

Where fulfilment runs was shaped by a fact about the boundary.
`relationship.create` never compares genders; `app.reject_gender_mismatch` does, at the insert, and a refusal rolls back the transaction it is in.
Forming a plan inside `intake.submit` would make a Person's own form fail on an Admin's arrangement.
So each plan is settled in a transaction of its own, the database's refusal is caught by the service exactly as the Pair page's route catches it, and the refusal is recorded by its code in a further transaction.

## Consequences

`intended_pairing` is a small table with two outcomes and a partial unique index keeping a Disciple to one open plan, because a person is in one one-to-one at a time.
The Roster reads it through its own function, shows a plan as *planned, awaiting Intake* on both rows, and as *not made* on a refused one until its Follow-Up Item is resolved.
A plan does not count as paired in the Roster's numbers.

`formRelationship` is one function with two callers, the Pair page and the settle, so the ticket that made imported pairs possible does not own a second way of forming one.
Every refusal a settle can produce is a `PairingRefusal` the Pair page already words.

The three Intake submit routes, the import route and the tick call the settle.
A plan a route missed, because the route failed after committing, is settled on the next tick, and its invitation goes out in the drain that follows.

A refused plan is closed for good.
If the reason later goes away, nothing retries it; the Follow-Up Item is where the Admin decides, and pairing by hand is the act that answers it.
Groups are outside this: both import modes plan one-to-ones only.
