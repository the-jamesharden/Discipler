# Relationship Kind as a Capacity Declaration

## Status

accepted

## Decision

`relationship` carries a `kind` column, `one_to_one` or `group`, copied onto every
`relationship_member` row through a composite foreign key.

Its only readers are database constraints and the pairing scorer. **`kind` may never
be read by message copy or by any state derivation.** Copy and state continue to
branch on the live participant count, exactly as before. A test enforces the fence.

`kind` is immutable once a relationship is created.

This narrows, and does not overturn, *The Relationship Is the Core Primitive* in
`docs/product-rules.md`: there is still one state machine, one check-in cadence, and
one dispatch path.

## Context

Two participation caps were settled as product rules:

- a leader leads at most one open group, and any number of one-to-ones
- a participant is in at most one open one-to-one, and any number of groups

Everything else in this schema holds its invariants in the database rather than by
convention, because the alternative fails silently. Ministry isolation is row-level
security; append-only history is triggers. These caps deserve the same treatment: a
person quietly holding two one-to-ones is not an error anybody would notice, and by
the time it surfaces they have two leaders who each believe they are the only one.

A partial unique index is the natural expression of a cap of one. It cannot be
written here, because both caps are conditioned on whether a relationship is a
one-to-one or a group, and that fact is a *count of sibling rows* — not a value any
index on `relationship_member` can see.

So the discriminator has to be stored, and the product rule says a stored
discriminator is a regression. That tension is what this ADR resolves.

## Considered options

**Enforce the caps in the command boundary.** Rejected. It is the failure mode
ADR-0002 rejects when it declines application-layer scoping, in a different costume:
correctness resting on every future write path remembering to run a check. The caps
would hold until the first import, backfill, or admin tool wrote a membership row
directly.

**Enforce the caps with a trigger that counts participants.** Rejected, though it is
the closest call. A `before insert` trigger on `relationship_member` can count the
relationship's open participants and derive the kind without storing it. But the
count it reads is the count *at that instant*: a one-to-one becomes a group the
moment a second participant is added, so a participant legitimately admitted to a
one-to-one is retroactively holding a group membership, and whether a given insert
is legal depends on the order the rows arrive in. Concurrent inserts see each other's
uncommitted absence and both pass. Making that correct means table-level locking on
a path taken every time anybody is paired.

**Store `kind` and read it everywhere.** Rejected — this is the regression the
product rule names. Copy branching on `kind` produces the specific bug the rule was
written against: a group that drops to one participant keeps addressing its last
remaining member by the relationship's name rather than by their own, because the
column still says `group` while the reality says N=1.

**Store `kind`, fence it to constraints and the scorer.** Accepted. It buys
index-enforced caps and pays with one column that has a narrow, written-down,
test-enforced set of readers.

## Consequences

**A group with one remaining participant is a distinguishable state.** `kind =
'group'` with N=1 is not the same row as `kind = 'one_to_one'` with N=1, and the
participation caps treat them differently — the group's last participant may still
join a one-to-one, and the one-to-one's may not. This is the price of the decision
and it is the right way round: capacity was declared when the relationship was
formed, and one person leaving does not retroactively change what everyone signed up
for. Ticket 13's guarantee is preserved where it matters — the departure changes no
structure, rewrites no history, and switches the copy to the person's name on its
own, because copy reads the count.

**The fence is load-bearing and is not self-enforcing.** A future contributor
reaching for `kind` in a copy branch will find it right there on the row, correct,
and convenient. Ticket 05 carries the test that fails if `kind` reaches the copy or
derivation modules, in the same spirit as `tests/domain/domain-independence.test.ts`,
and it lands with the first domain code that could violate the fence. Deleting that
test deletes the decision.

**`kind` is immutable, enforced by trigger.** The composite foreign key propagates
`relationship.kind` to memberships by reference, so an update would either be
rejected by the FK or cascade into rows describing periods that ended under the old
value. Neither is a change anyone should be able to make by hand. Converting a
one-to-one into a group means ending it and forming a new one, which is also what
the history should say happened.

**`relationship` needs `unique (id, ministry_id, kind)`.** It is redundant against
the primary key and exists solely as the target the composite foreign key requires.
Widening it from `(id, kind)` to include `ministry_id` lets one foreign key carry
both invariants at once: a membership's kind is its relationship's, and a
membership's Ministry is its relationship's. Ministry isolation on the write side is
then declared in the keys rather than enforced by a trigger, which matters because
writes arrive on a trusted connection that row-level security cannot police on its
own. Left undocumented, the constraint reads as a mistake.

**The scorer filters the leader pool by the kind being suggested.** A leader already
holding an open group is out of the pool for group suggestions and still in it for
one-to-ones. This is the one place outside the constraints where `kind` is read, and
it is read about the relationship being *proposed*, not about a relationship that
exists.

## Amendment — the Gender Rule reads `kind`

*2026-08-28, with ticket 05.*

The decision is unchanged and the fence holds: copy and state derivation still may not
read `kind`. What has changed is the set of constraints that do.

A safeguarding rule was settled after this ADR was written: **a one-to-one is between
two people of the same gender, and a group may be mixed.** `app.reject_gender_mismatch`
is therefore conditioned on `kind`, and so is the one-open-leader index, which now
applies to one-to-ones only because a group may be led by several people.

The letter of this ADR already permitted that — "its only readers are database
constraints and the pairing scorer" — but the Context above frames the column entirely
around the two participation caps, and a reader reasoning from that framing would
conclude the gender rule had no business here. It does, for the same reason the caps
do, and the reason is worth stating in the place it will be looked for.

**Why the count would not have served.** The rejected option above, *a trigger that
counts participants*, fails harder for gender than it does for the caps. A group is
assembled row by row, so its first two members read as N=1 — a one-to-one — and the
gender rule would refuse a mixed group depending on the order the rows arrived in.
`kind` is frozen at formation and is therefore the same answer before the first member
is written as after the last. That is precisely the property this ADR bought.

**What it costs.** The immutability guarantee is now load-bearing for safeguarding, not
only for capacity. A `kind` that could be edited would turn a bound relationship into an
unbound one silently, which is a different order of consequence from a participation cap
being wrong. The trigger enforcing immutability was already here; this records that it
now has a second reason to exist.

**The consequence, restated for gender.** A group that drops to one participant keeps
`kind = 'group'` and stays unbound by the rule, while a relationship formed as a
one-to-one is bound. That is the same trade the caps already took — capacity was
declared when the relationship was formed — and it is the right way round: a group
losing a member is not a decision to place two people alone together.

**The fence does not cover SQL.** `tests/domain/relationship-kind-fence.test.ts` walks
`src/` and `app/` only, so a migration reading `kind` trips nothing. That is correct —
constraints are exactly who may read it — but it means the honest record of which
constraints do is this document, not a test.
