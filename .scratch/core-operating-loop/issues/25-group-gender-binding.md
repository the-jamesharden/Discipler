# 25 — A group declares its gender, and the declaration binds

**What to build:** The missing third of the gender rule. A relationship already declares
a `kind` when it is created; it gains a second declaration alongside it saying whether
the relationship is a men's relationship, a women's relationship, or a mixed one — and
where a gender is declared, every member must be of it.

The rule in full, and it is the same rule at every surface:

- **One-to-one** — gender must match, absolutely. Unchanged; this is what
  `20260828000400` already enforces.
- **Group declaring a gender** — every member, Leader and Participant alike, must be of
  that gender. This is the case the current schema does not constrain at all.
- **Group declared mixed** — no gender constraint, because the relationship has said
  what it is and a constraint here would forbid the group rather than protect anyone in
  it.

Scoping the existing triggers by `kind` answered the wrong question. A men's small group
with three Leaders is not "a shape with no pair to match"; it is the ordinary case in a
ministry, and the one where the safeguarding rule earns its keep. The question the
constraint must ask is not how many Leaders a relationship holds, but whether it declared
itself single-gender.

The declaration is immutable after creation for the same reason `kind` is: a constraint
that can be switched off after the fact is not a constraint. See
`docs/adr/0004-relationship-kind-as-capacity-declaration.md` for the shape to copy —
this is a second column on `relationship`, not a group entity and not a group-specific
code path, and ticket 05's rule that message copy branches on Participant count and never
on a group-versus-one-to-one flag still holds.

**Answered, 2026-09-01: ask the Admin outright, with nothing preselected.** Deriving was
rejected for the reason it was raised with — it cannot express *this is a women's group
that currently has one member*, and a silent derivation binds people to something nobody
chose. So the Pair form carries three answers, none of them checked, and the domain
refuses a group that declared nothing.

The ticket says a one-to-one "should never be asked", and **the form asks it anyway** --
one fieldset serves both shapes, with the legend carrying the distinction. This is a
departure and it is deliberate: without JavaScript the browser cannot tell a group from
a one-to-one until the boxes are ticked, so hiding the question for a pair would mean
knowing the answer before the Admin gave it. The *rule* is honoured where it can be --
the domain requires a declaration of a group and takes a one-to-one without one. An
Admin who answers anyway is held to what they said rather than having it discarded,
because discarding it silently is the no-op this ticket rules out.

**Also settled:** a declaration binds whether or not the Ministry has turned
`suggest_gender_match` off. That setting is the deliberate disable for the rule Discipler
applies on a Ministry's behalf — the automatic match between two people who declared
nothing. A Ministry that permitted mixed one-to-ones has not asked for its own women's
group to quietly admit a man.

**Blocked by:** 05

**Status:** shipped

- [x] `relationship` carries an immutable gender declaration alongside `kind`
- [x] A declared single-gender group refuses a member of another gender, as a database constraint
- [x] A declared mixed group accepts any member
- [x] A one-to-one still matches absolutely, and the existing trigger is not weakened
- [x] Manual pairing cannot cross the constraint at any surface, including the Pair page
- [x] The refusal reaches an Admin as a user-facing error, never a silent no-op
- [x] No group entity and no group-specific code path is introduced — the ticket 05 fence still passes

**Carried to ticket 04:** *suggestions filter on the same rule they are ranked under*
was drafted as a criterion here and is not one. There is no scorer to filter: ticket 04
is `ready-for-agent` and unbuilt, and this repo contains no suggestion code. It is not
work this ticket left undone, so it is not a box this ticket can check or hold itself
open on. Ticket 04 carries the rule and two acceptance criteria of its own under
*Carried over from ticket 25*.

## Comments

### Why this is its own ticket

Ticket 05 shipped, was reviewed, and was amended once on this exact line. The amendment
was reasoned and wrong in a way that only shows up when you name the case it excludes, so
the correction is worth its own reviewable change rather than a second amendment buried
in a shipped ticket. It also needs a migration, a trigger, a domain fence, a UI decision
and its own tests, which is more than a review fix.

### What was built

`relationship.declared_gender` — a nullable `gender`, where null is *declares none*.
Two triggers on `relationship_member` (insert, and the two updates that can introduce a
mismatch) refuse a member who is not of it, and an immutability trigger on
`relationship` refuses a change to it. Migration
`20260916000100_a_group_declares_its_gender.sql`.

It is a **second** constraint and not a rewrite of the first.
`app.reject_gender_mismatch` — the absolute match between the two people in a
one-to-one — is untouched, still conditioned on `kind`, and still gated on
`ministry.suggest_gender_match`. The two raise different constraint names and reach the
Admin as different sentences, because an Admin who crossed a rule they declared
themselves is being told a different thing from one who crossed a rule the product
applies.

`needsAGenderDeclaration` sits beside `kindFor` in `src/domain/relationships.ts`, which
is the one file ADR-0004's fence permits to know what a kind is. The form carries no
`required`: the browser cannot tell a group from a one-to-one until the boxes are
ticked, and half-enforcing it there would leave the real rule in two places — the same
argument the leader checkboxes already make.

`docs/adr/0004-relationship-kind-as-capacity-declaration.md` carries a second amendment.
The first one's headline — *a group may be mixed* — is corrected rather than quietly
replaced, because it was argued for at length and a reader will find it.

### Found by the review — two triggers were missing an update

`relationship_member_matches_declared_gender_on_reopen` copied its WHEN clause from
`20260828000300`, which names *the two updates that can introduce a mismatch*:
reopening a closed membership, and moving one onto a different Person. There is a third
for this rule, because it is a property of the relationship row rather than of the
member set — `update relationship_member set relationship_id = ...` re-scopes a
membership to a different declaration while the Person and `ended_at` sit still. The
composite foreign key carries `kind` and deliberately not `declared_gender`, so nothing
else caught it. A woman could be moved into a declared men's group.

**The shipped one-to-one trigger had the same hole**, since `20260828000300`, and this
review is what found it. A membership moved from one one-to-one onto another leaves two
people of different genders alone together. Corrected in the same migration rather than
deferred: it is one clause of the same rule, found by the same reasoning, and a known
safeguarding hole is not a thing to schedule. Both have a test.

### Raised, not resolved — a correction to Intake can contradict a relationship

Both halves of the Gender Rule are checked when somebody *joins*. Intake can be
re-submitted afterwards and the latest answer is the one that counts, so a declared
women's group can come to hold a man with no refusal anywhere. Older than this ticket
and true of the one-to-one rule too.

Every way of closing it is a product decision with a cost — refuse the correction, end
the relationship, or raise a Follow-Up Item — so it is parked in
`docs/open-questions.md` rather than answered here.

### Stated, not fixed — existing relationships can never declare

The migration adds a nullable column with no backfill, and the declaration is immutable.
Taken together, every relationship formed before this migration declares nothing and
always will. There is no answer to backfill with: an existing group's members happening
to share a gender is not the same fact as somebody having said the group is for them.
Its way to become a men's group is the way any relationship changes what it is — end it
and form a new one.
