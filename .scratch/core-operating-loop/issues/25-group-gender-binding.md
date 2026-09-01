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
refuses a group that declared nothing. A one-to-one is asked nothing, as the ticket says
it should not be.

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
- [ ] Suggestions filter on the same rule they are ranked under — **nothing to do yet.**
      There is no scorer: ticket 04 is `ready-for-agent` and unbuilt, and this repo
      contains no suggestion code to filter. Recorded on ticket 04 rather than held
      open here.
- [x] No group entity and no group-specific code path is introduced — the ticket 05 fence still passes

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
