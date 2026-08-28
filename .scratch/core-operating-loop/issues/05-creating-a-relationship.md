# 05 — Creating a relationship

**What to build:** An Admin pairs people three ways from the same workflow: accepting a suggestion, pairing any two eligible people manually from the Roster without using a suggestion, or selecting several people together to form one relationship. An unpaired Person carries a Pair action directly on their Roster row.

Creating a relationship does not activate it. Its lifecycle is derived from two timestamps — `accepted_at` and `ended_at` — and no status column exists anywhere. It reads as `Awaiting Leader Acceptance`, everyone in it leaves the suggestion pool, and Participants receive nothing at all — nothing reaches them before their Leader has agreed to lead them. The Roster shows who each Person is in a relationship with, and a relationship with several participants shows everyone in it.

Membership is where role lives. A `relationship_member` row carries a role of leader or participant, a `started_at`, and a nullable `ended_at`; the same person may hold a leader membership on one relationship and a participant membership on another at the same time. Nothing about a role is stored on the Person.

The relationship also declares a `kind` — one-to-one or group — when it is created, immutable afterwards, copied onto every membership by composite foreign key. It exists so the participation caps can be partial unique indexes and is read by nothing else: copy and state derivation continue to follow the live participant count. `docs/adr/0004-relationship-kind-as-capacity-declaration.md` records why, and the fence is a test, not a convention.

This ticket introduces the core primitive: **one Leader and N Participants**. A relationship with one Participant is one-to-one; with more than one it is a group. There is no separate group entity, no participant-id column on the relationship, and no group-specific code path. Membership is a dated join — each Participant's involvement carries a start date and a nullable end date. Message copy branches on Participant count, never on a group-versus-one-to-one flag. Any design reintroducing that distinction is a regression.

Manual pairing may override the age band constraint. It may never override gender.

**Blocked by:** 04

**Status:** ready-for-agent

- [~] An Admin can create a relationship from a suggestion, from two people on the Roster, or from several people selected together
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
- [x] Each cap is a database constraint, and a violation surfaces as a user-facing error rather than a silent no-op
- [x] Participation Status gains its `Paired` branch here: at least one open participant membership, and leading never sets it
- [x] Manual pairing can cross the age band constraint and cannot cross the gender constraint
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

### Implemented — the workflow, the screen, and the gender constraint

Two of the three pairing routes are now reachable by an Admin, and the third is the
same POST waiting on something to accept.

**The Pair action sits on the row, and the screen behind it is one screen.**
`/roster/pair` takes one Leader and N Participants and posts to `/roster/pair/create`.
Pressing Pair on a Roster row opens it with that Person preselected as a Participant --
the action sits on an *unpaired* row, so the common reason to press it is that this is
somebody waiting to be discipled, and the Admin can move them. Selecting several
people together is the same form with more boxes ticked, which is what *no group
workflow* means in practice: there is one form, one POST, one command.

The candidate list is everyone Intake has cleared who has not opted out, and is
deliberately **not** narrowed to the unpaired. A Person already being discipled may
lead; a Person in a one-to-one may still join a group. Which combinations are legal
depends on the Ministry's other relationships, so the database answers it and the list
does not pre-empt the answer. `eligible_to_lead` is likewise not a filter here: the
database does not require it to lead, only the suggestion pool does, and filtering on a
flag nothing sets yet would have made manual pairing impossible while looking like a
rule.

**Gender is enforced in the database; the age band is enforced nowhere.** That
asymmetry is the point of the pair of them, and a schema that treated them uniformly
would misrepresent one. `app.reject_gender_mismatch` refuses any membership insert
whose gender differs from the relationship's other open members -- written against the
*other members* rather than against the Leader, so it holds however the rows arrive
and states the rule honestly for a group, which is people who meet together rather
than three pairings with the leader. `app.current_gender` reads the latest submission,
because Intake may be re-submitted and a correction has to be the answer that counts.
A Person with no Intake yields NULL and passes, so the readiness triggers can refuse
them with a reason an Admin can act on instead of a misleading one about gender.

The age band appears in no constraint and no migration. `tests/integration/pairing-matches-gender.test.ts`
proves both directions, including a pairing two bands apart in the direction the
suggestion rule excludes.

**Ministry settings do not exist yet**, so `suggest_gender_match` is not consulted and
the rule is simply on. That is the safe default for a safeguarding constraint --
enforced, never absent -- and ticket 22 is where a Ministry gains the deliberate way to
disable it.

**Refusals reach the Admin as sentences.** `pairingRefusalMessage` is a
`Record<PairingRefusal, string>`, so adding a refusal and forgetting to word it fails
the build rather than falling through to a generic message, which is the silent no-op
wearing a disguise. Codes arriving in the query string are looked up, never rendered.
Form-level problems are kept in a separate map so the domain's list stays the domain's.

`tests/integration/pairing-over-http.test.ts` drives all of it the way an Admin does,
over HTTP against the running app. 305 tests pass, none skipped.

### Still blocked, and on what

Two criteria remain, both on ticket 04, and neither is faked here:

- **The suggestion route.** The POST accepts a Leader and Participants and does not
  know or care which screen sent them, so accepting a suggestion is this same request
  with the names filled in. What is missing is a suggestion to accept.
- **"Everyone in a created relationship leaves the suggestion pool."** There is no pool
  to leave. When ticket 04 builds it, the pool is derived from open memberships, which
  this ticket already writes -- so the criterion should fall out of the derivation
  rather than needing a step that removes people from a list.

The first acceptance criterion is marked `[~]` rather than `[x]` for that reason: two
of its three routes ship here.
