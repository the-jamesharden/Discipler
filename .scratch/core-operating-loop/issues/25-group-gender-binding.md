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

**Open, and needs an answer before this is built:** what an Admin sees at creation. A
one-to-one's gender is implied by the two people in it and should never be asked for. A
group's is not, and there are two honest answers: derive it (all members share a gender →
the group is bound to it; they do not → mixed), or ask the Admin outright. Deriving is
silent and cannot express *this is a women's group that currently has one member*; asking
puts a safeguarding decision in front of the person making it. Deriving with the
derivation shown and overridable is a third answer. This is a product decision, not an
implementation detail.

**Blocked by:** 05

**Status:** needs-triage

- [ ] `relationship` carries an immutable gender declaration alongside `kind`
- [ ] A declared single-gender group refuses a member of another gender, as a database constraint
- [ ] A declared mixed group accepts any member
- [ ] A one-to-one still matches absolutely, and the existing trigger is not weakened
- [ ] Manual pairing cannot cross the constraint at any surface, including the Pair page
- [ ] The refusal reaches an Admin as a user-facing error, never a silent no-op
- [ ] Suggestions filter on the same rule they are ranked under
- [ ] No group entity and no group-specific code path is introduced — the ticket 05 fence still passes

## Comments

### Why this is its own ticket

Ticket 05 shipped, was reviewed, and was amended once on this exact line. The amendment
was reasoned and wrong in a way that only shows up when you name the case it excludes, so
the correction is worth its own reviewable change rather than a second amendment buried
in a shipped ticket. It also needs a migration, a trigger, a domain fence, a UI decision
and its own tests, which is more than a review fix.
