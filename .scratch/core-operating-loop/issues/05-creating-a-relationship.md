# 05 — Creating a relationship

**What to build:** An Admin pairs people three ways from the same workflow: accepting a suggestion, pairing any two eligible people manually from the Roster without using a suggestion, or selecting several people together to form one relationship. An unpaired Person carries a Pair action directly on their Roster row.

Creating a relationship does not activate it. Its lifecycle is derived from two timestamps — `accepted_at` and `ended_at` — and no status column exists anywhere. It reads as `Awaiting Leader Acceptance`, everyone in it leaves the suggestion pool, and Participants receive nothing at all — nothing reaches them until every Leader has agreed to lead them. The Roster shows who each Person is in a relationship with, and a relationship with several participants shows everyone in it.

Membership is where role lives. A `relationship_member` row carries a role of leader or participant, a `started_at`, and a nullable `ended_at`; the same person may hold a leader membership on one relationship and a participant membership on another at the same time. Nothing about a role is stored on the Person.

The relationship also declares a `kind` — one-to-one or group — when it is created, immutable afterwards, copied onto every membership by composite foreign key. It exists so the participation caps can be partial unique indexes and is read by nothing else: copy and state derivation continue to follow the live participant count. `docs/adr/0004-relationship-kind-as-capacity-declaration.md` records why, and the fence is a test, not a convention.

This ticket introduces the core primitive: **M Leaders and N Participants**. A relationship with one Participant is one-to-one; with more than one it is a group. A one-to-one holds exactly one Leader; a group may hold several. There is no separate group entity, no participant-id column on the relationship, and no group-specific code path. Membership is a dated join — each Participant's involvement carries a start date and a nullable end date. Message copy branches on Participant count, never on a group-versus-one-to-one flag. Any design reintroducing that distinction is a regression.

Manual pairing may override the age band constraint. In a one-to-one it may never override gender; in a group gender is not constrained at all.

**Blocked by:** 04

**Status:** ready-for-agent

- [~] An Admin can create a relationship from a suggestion, from two people on the Roster, or from several people selected together
- [x] A created relationship is `Awaiting Leader Acceptance` and enqueues nothing to Participants
- [ ] Everyone in a created relationship leaves the suggestion pool
- [x] The relationship is M Leaders and N Participants with no separate group entity and no group code path
- [x] Every membership carries a role, a start date, and a nullable end date, for leaders as well as participants
- [x] A person holds at most one open membership per relationship, in one role, and cannot be paired with themselves
- [x] A person who left a relationship can be readmitted later as a second membership row, leaving the first closed and intact
- [x] A one-to-one has at most one open leader membership; a group may hold several
- [x] `kind` is immutable, copied onto memberships by composite foreign key, and read by no copy or derivation path — proven by a test
- [x] A leader holds at most one open group membership; one-to-ones are uncapped
- [x] A participant holds at most one open one-to-one membership; groups are uncapped
- [x] Each cap is a database constraint, and a violation surfaces as a user-facing error rather than a silent no-op
- [x] Participation Status gains its `Paired` branch here: at least one open participant membership, and leading never sets it
- [x] Manual pairing can cross the age band constraint, and cannot cross the gender constraint in a one-to-one
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

### Review pass — the safeguarding rule was failing open

Four findings, all taken.

**The gender trigger was not `SECURITY DEFINER`.** This was the serious one and it was
invisible: `app.current_gender` is a definer, but the sibling `exists` read
`relationship_member` *directly*, so it ran under the inserting role's row-level
security. A role able to insert a membership without selecting the relationship's other
rows saw an empty set and passed. A safeguarding rule failing open, silently, is the
exact inversion of what this ticket asked for -- and no test caught it, because tests
write as a role that sees everything. The readiness triggers get away with being
invoker-side only because everything they read sits behind `participation_status`,
which is itself a definer.

**The first migration cited ADR-0004 backwards.** It claimed the rule went "where the
participation caps went", but the caps went into partial unique indexes *because*
ADR-0004 rejected a sibling-reading trigger -- "concurrent inserts see each other's
uncommitted absence and both pass". That is precisely this trigger's shape. The
citation is withdrawn in `20260828000300`. The rule cannot be an index: a unique index
can express "one open group per leader" because that is a property of single rows,
while "everyone here shares one gender" is a property of a *set*. So the trigger stays
and takes a row lock on the relationship. ADR-0004 declined locking for the caps
because their scope is the whole Ministry; this scope is one relationship row, held
only while somebody joins that relationship, which is a different trade-off and is why
the answer differs.

**The trigger was insert-only.** Nothing reopens a membership today -- readmission is a
second row, which is why the primary key is a surrogate -- but the reason this rule is
in the database at all is that it must not rest on what the write paths currently
happen to do. It now also fires on reopening a closed membership and on moving one onto
a different Person, and is deliberately scoped to those two: a blanket update trigger
would re-check the row somebody is *closing*, leaving a relationship that had somehow
gone mismatched impossible to even end.

**`relationship_one_open_leader` had no translation.** The box claiming every cap
surfaces as a user-facing error was ticked while that index would have escaped as a
Postgres error and a 500. Unreachable from a form offering one Leader, and translated
anyway: every cap the database holds is now named at the store, not every cap a current
screen can reach.

Two smaller things came out of the same pass. The refusal redirect dropped the Admin's
selection while a comment claimed it kept it -- five people chosen for a group had to be
chosen again -- so the selection now round-trips and a test holds it there. And
`/roster/pair` was reachable only from an unpaired row, which left no way in for the
multi-select route or for a Person already being discipled who may still lead; the
Roster now carries a Form a relationship link.

310 tests pass, none skipped.

### Amended — gender is a one-to-one rule, and a group may hold several Leaders

The rule this ticket shipped was wrong in both directions, and the migration comments
argue for it at length, which makes the correction worth stating rather than quietly
replacing.

**Gender binds a one-to-one and does not bind a group.** Men with men and women with
women, for the pilot, in a one-to-one. A group is people who meet together, and it may
hold Leaders and Participants of any gender. `app.reject_gender_mismatch` compared the
joiner against every other open member regardless of `kind`, so mixed-gender groups
were refused; its own comment defended that as stating the rule "honestly for a group",
which was the honest statement of the wrong rule.

**A group may hold several Leaders; a one-to-one holds exactly one.**
`relationship_one_open_leader` was unique on `(relationship_id)` for every kind.

Both corrections condition on `kind`, and that is the cost worth naming: the gender
rule becomes `kind`'s second kind of reader. ADR-0004 scoped the column to the
participation caps, and a safeguarding rule is not a participation cap, so the ADR is
amended rather than stretched in silence. The alternative -- branching on the live
Participant count, the way copy and derivation must -- is the wrong shape for a
constraint and would not merely be untidy: the first two rows of a nascent group read
as N=1, so insert order would decide whether a mixed-gender group were legal at all.
`kind` is stable at write time because it is frozen at formation, which is the case the
ADR exists for.

The consequence, stated so it is not discovered later: a group that drops to one
Participant keeps `kind = 'group'` and stays gender-free, while a relationship formed
as a one-to-one is bound. That is what a declaration means, and it is the side of the
trade this ticket already took for the caps.

**"Every Leader has accepted" is the activation rule.** A relationship leaves
`Awaiting Leader Acceptance` only when every open leader membership has accepted --
nobody co-leads something they did not agree to. The rule is settled here; building it
belongs to ticket 06, which owns acceptance, and nothing in this ticket writes
`accepted_at`.

The age band is unchanged: constrained nowhere, crossable everywhere.

Three boxes are unticked above rather than reworded and left ticked, because the
wording is corrected and the code is not yet.

### Implemented — the corrected rules

`20260828000400_gender_binds_a_one_to_one.sql` carries both. The gender triggers gain
`when (new.kind = 'one_to_one')`, which costs no lookup because the composite foreign
key already puts the kind on the membership row. `relationship_one_open_leader` is
dropped and recreated as `one_to_one_one_open_leader`, rescoped and renamed together --
leaving a name that says "one open leader per relationship" over an index that means
"per one-to-one" is the stale comment this pass exists to correct. `leader_one_open_group`
is untouched: a person still leads at most one open group, which is a statement about
how much one Leader carries and is unaffected.

**A one-to-one is one Leader and one Participant, and every other shape is a group.**
This was forced rather than chosen, and it is the one inference in this pass worth
challenging. `kindFor` previously read the Participant count alone, which would have
called two Leaders over one Participant a one-to-one -- and a one-to-one holds exactly
one Leader, so the database would then have refused the very shape the Admin had been
invited to form. Three people meeting is a group whichever side the third stands on.
`tests/domain/relationships.test.ts` and `pairing-matches-gender.test.ts` both pin it.

**The Leader field is a checkbox set, and the empty case moved into the domain.** A
radio carried `required`; a checkbox set cannot express "at least one of these", so
half-enforcing it in the browser would have left the real rule in two places. The route
had been checking for a missing leader itself, which made that one refusal a bare string
while every other one was a `PairingRefusal` -- a typo in either the code or its wording
fell through to the generic message rather than failing the build. It is now
`relationship.needs_a_leader`, the fourth domain-decided refusal, and `FORM_PROBLEMS` is
gone with it.

**The gender refusal names the one-to-one.** The Admin it stops has a real alternative --
the same people in a group are not refused -- and a sentence saying "a relationship"
would have been true of the case in front of them while hiding the way out of it.

`CONTEXT.md` said constraints govern suggestion only and a ministry may always pair
manually across them, which the shipped rule contradicted and this pass makes honest: a
Gender Rule entry now names the exception, and the Discipleship Relationship and
Relationship Kind entries are corrected. ADR-0004 gains an amendment: its letter already
allowed any database constraint to read `kind`, but its Context frames the column
entirely around the participation caps, and the immutability guarantee is now
load-bearing for safeguarding rather than only for capacity.

322 tests pass, none skipped.

### Still open

- **Acceptance is ticket 06's.** Every open leader membership must accept before the
  relationship leaves `Awaiting Leader Acceptance` -- nobody co-leads something they did
  not agree to. The rule is settled; nothing here writes `accepted_at`, and the
  Roster's `Awaiting Leader Acceptance` is still hardcoded rather than derived.
- **The suggester.** ADR-0001 has gender matching as a suggestion rule with a settings
  toggle. Whether ticket 04 should still decline to *suggest* mixed-gender groups now
  that the database permits them is not decided here.
- **Gender binds membership writes, not Intake.** A re-submission that changes a gender
  can still leave a live one-to-one mismatched, because nothing guards
  `intake_submission` and `discipler_command` holds INSERT on it. Narrower than it was --
  groups are unaffected -- but it is the same "must not rest on what the write paths
  currently happen to do" argument left half-applied, and it wants its own ticket.
