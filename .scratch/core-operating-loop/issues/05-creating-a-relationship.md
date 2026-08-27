# 05 — Creating a relationship

**What to build:** An Admin pairs people three ways from the same workflow: accepting a suggestion, pairing any two eligible people manually from the Roster without using a suggestion, or selecting several people together to form one relationship. An unpaired Person carries a Pair action directly on their Roster row.

Creating a relationship does not activate it. Its lifecycle is derived from two timestamps — `accepted_at` and `ended_at` — and no status column exists anywhere. It reads as `Awaiting Leader Acceptance`, everyone in it leaves the suggestion pool, and Participants receive nothing at all — nothing reaches them before their Leader has agreed to lead them. The Roster shows who each Person is in a relationship with, and a relationship with several participants shows everyone in it.

Membership is where role lives. A `relationship_member` row carries a role of leader or participant, a `started_at`, and a nullable `ended_at`; the same person may hold a leader membership on one relationship and a participant membership on another at the same time. Nothing about a role is stored on the Person.

The relationship also declares a `kind` — one-to-one or group — when it is created, immutable afterwards, copied onto every membership by composite foreign key. It exists so the participation caps can be partial unique indexes and is read by nothing else: copy and state derivation continue to follow the live participant count. `docs/adr/0004-relationship-kind-as-capacity-declaration.md` records why, and the fence is a test, not a convention.

This ticket introduces the core primitive: **one Leader and N Participants**. A relationship with one Participant is one-to-one; with more than one it is a group. There is no separate group entity, no participant-id column on the relationship, and no group-specific code path. Membership is a dated join — each Participant's involvement carries a start date and a nullable end date. Message copy branches on Participant count, never on a group-versus-one-to-one flag. Any design reintroducing that distinction is a regression.

Manual pairing may override the age band constraint. It may never override gender.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] An Admin can create a relationship from a suggestion, from two people on the Roster, or from several people selected together
- [x] A created relationship is `Awaiting Leader Acceptance` and enqueues nothing to Participants
- [ ] Everyone in a created relationship leaves the suggestion pool
- [x] The relationship is one Leader and N Participants with no separate group entity and no group code path
- [x] Every membership carries a role, a start date, and a nullable end date, for leaders as well as participants
- [x] A person holds at most one open membership per relationship, in one role, and cannot be paired with themselves
- [x] A person who left a relationship can be readmitted later as a second membership row, leaving the first closed and intact
- [x] A relationship has at most one open leader membership
- [x] `kind` is immutable, copied onto memberships by composite foreign key, and read by no copy or derivation path — proven by a test
- [x] A leader holds at most one open group membership; one-to-ones are uncapped
- [x] A participant holds at most one open one-to-one membership; groups are uncapped
- [ ] Each cap is a database constraint, and a violation surfaces as a user-facing error rather than a silent no-op
- [x] Participation Status gains its `Paired` branch here: at least one open participant membership, and leading never sets it
- [ ] Manual pairing can cross the age band constraint and cannot cross the gender constraint
- [x] The Roster shows every member of a relationship, not just one

## Comments

### Amended — dual-role persons

The dated join survived the handoff; the `active` boolean it proposed did not,
because a boolean cannot say *when* someone left and the Week-by-Week History has
to attribute each week to the membership that was open at the time.

The primary key is a surrogate, with `(relationship_id, person_id)` a partial
unique over open rows. A composite primary key would have made leaving and
rejoining impossible: the readmission collides with the closed row, and the only
escapes are reopening the old membership, which rewrites history, or a second
relationship, which fragments it.

### Partially implemented — schema landed with ticket 19

The tables and every constraint on them landed early, in ticket 19's migration,
because leader-scoped row-level security has nothing to police without them. What
remains here is the whole of the workflow: the three pairing routes, the Roster
surface, the Starter Message suppression, and the `Paired` branch of the derivation.

`kind` is stored and immutable, and the half of that acceptance criterion this ticket
still owns is the fence -- the test proving `kind` reaches no copy or derivation path.
It lands with the first domain code that could violate it, which is this ticket's.
See `docs/adr/0004-relationship-kind-as-capacity-declaration.md`.

Constraint behaviour is proven in `tests/integration/relationship-membership.test.ts`
(12 tests), including the leave-and-rejoin case the surrogate primary key exists for.

### Implemented — the pairing command

`relationship.create` is one command for all three routes. They differ in how the
Admin arrived at the names, which is a property of the screen rather than of the
relationship being formed, so there is one code path and no branch anywhere on
whether a suggestion was involved.

**Kind is derived once, at formation, from the Participant count, and then frozen.**
That is what reconciles the capacity declaration with *there is no separate group
concept*: the count is the fact, and the column is a record of what that count was
when everyone agreed to it. `tests/domain/relationship-kind-fence.test.ts` walks every
file under `src/` and `app/` and fails if any of them outside a two-file allowlist
reads a kind. It is worth noting that the fence had to be written the way ADR-0003
insists reply matching is written: the refusal code
`relationship.participant_already_in_a_one_to_one` contains `one_to_one`, so a
substring search flags it as a kind branch when it is nothing of the sort.

**The caps refuse in words an Admin can act on.** They can only be judged against the
Ministry's other relationships, so the database judges them and the constraint name is
translated at the store into a `PairingRefused` code -- codes, not prose, the same
rule the sign-in page follows. Because rows are written before the history event, a
refused pairing leaves no history claiming it happened; there is a test for that
specifically.

**Identifiers are injected, like the clock.** A command that mints an id inside the
domain is no longer a pure function of its inputs and a test cannot say what it wrote.
`IdSource` sits alongside `Clock` in `CommandContext`; the container supplies
`crypto.randomUUID`.

### Still blocked, and on what

- **The three pairing screens** need the Roster's Pair action (ticket 02) and the
  Suggested Pairs view (ticket 04). The command underneath them is done and driven by
  tests.
- **"Everyone leaves the suggestion pool"** needs a suggestion pool, which is ticket 04.
- **Gender and age-band constraints on manual pairing** need gender and age band,
  which Intake captures in ticket 03. Nothing here fakes them.
- **The `Paired` branch of Participation Status** needs the derivation ticket 02 ships,
  which in turn needs Intake for its other three values. The membership half it will
  read is in place.
- **A screen that renders a refusal** lands with the pairing UI. The refusal itself
  reaches the caller as a typed code today and is covered by
  `tests/integration/creating-a-relationship.test.ts`.

128 tests pass, none skipped.

### The `Paired` branch shipped with ticket 02

The derivation is one SQL function over four branches, and ticket 02 wrote it once
membership existed rather than writing three branches and rewriting them. Proven in
`tests/integration/participation-status.test.ts`, including the case that reads as a
bug: a Person leading two relationships and discipled by nobody is `Ready to Pair`.
