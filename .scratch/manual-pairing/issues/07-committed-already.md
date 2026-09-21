# 07 - Committed already

**Effort:** `manual-pairing`.
The spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.

**What this is:** Everything of this effort that is committed, as of `69bbe9e` on `integration/manual-pairing`, when the tickets were cut into five on 2026-09-20.
Nothing here is to be built; what is left to build is tickets 01 to 06, beside this file.
It was `06` until 2026-09-21, when James had ticket 05's addendum made a ticket of its own and this file moved to stay last.
It is kept because code, migrations, commits and ADR-0025 say "Manual pairing, ticket NN" with the old numbers, and because the Comments hold what was decided while building and what James decided after.
Each old ticket is below, whole, under its old number, with its headings one level down.
**Inside this file a "ticket NN" is always an old number**, except in the table just below, whose last column names the new tickets 01 to 05.
The last two sections carry the numbers 28 and 29, from a cut that lasted an hour on 2026-09-20, because commit `69bbe9e` says "ticket 28, stage 3"; the commits for 29 say "ticket 23, stage 2".

**Status:** committed on `integration/manual-pairing` and not yet merged to `main`, except old tickets 01 and 02, which are `shipped`.
That is not one of the tracker's status strings, because none of them says built and unmerged; it is not `ready-for-agent`, and no session should pick this file up.

## Where every earlier number lives now

| Old number | What it was | Where it is now |
| --- | --- | --- |
| 01 | What the Pair screen reads | Here. Shipped, PR #12. |
| 02 | A Material chosen at pairing | Here. Shipped, PR #13. |
| 03 | A pairing checked without being formed | Here. Merged at `2108c98`. |
| 04 | Separate one-to-ones in one submission | Became stage 1 of 21. Here. |
| 05 | A Material per Disciple in a separate submission | Became stage 2 of 21. Not built: ticket 02. |
| 06 | The Roster's three lists | Here. Merged at `9142fdd`. |
| 07 | Quieter Roster rows | Here. Merged at `8cbf8df`. |
| 08 | The Ministry's groups on the Pair document | Here. Merged at `4280e68`. |
| 09 | A Disciple put into a group | Became stage 1 of 22. Here. |
| 10 | An Admin adds a Discipler to a group as co-leader | Became stage 2 of 22. Here, and its last criterion too, built at `69bbe9e`: see *28, stage 3* at the bottom. |
| 11 | A co-leader accepts on a group already running | Not built: ticket 01. |
| 12 | The Pair popup over the Roster, from a Disciple | Here. Merged at `826f8cd`. |
| 13 | Who is greyed for a Disciple | Became stage 1 of 23. Here. Its own file was a `wontfix` pointer to 23 and is gone. |
| 14 | The Pair popup, from a Discipler: the list and one tick | Became stage 2 of 23. Here, built at `ab1f7e5` and `5149ec8`: see *29* at the bottom. |
| 15 | Two ticked: the shape toggle, the 1:2 pair and N × 1:1 pairs | Became stage 1 of 24. Not built: ticket 02. |
| 16 | Materials on the 1:2 pair and on each of N × 1:1 | Became stage 2 of 24. Not built: ticket 02. |
| 17 | The Group shape | Became stage 1 of 26. Not built: ticket 04. |
| 18 | Groups in the popup, from a Disciple | Became 25. Not built: ticket 03. |
| 19 | Groups in the popup, from a Discipler | Became stage 2 of 26. Not built: ticket 04. |
| 20 | The old Pair page retires | Became 27. Not built: ticket 05. |
| 21 | Separate one-to-ones in one submission, with a Material each | Stage 1 here, merged at `ad8aa0d`. Stage 2 not built: ticket 02. |
| 22 | An Admin puts somebody into a group | Here: stage 1 merged at `9d10195`, stage 2 at `9571887`, `482c5cb` and `cf60b5c`. Its last criterion at `69bbe9e`: see *28, stage 3* at the bottom. |
| 23 | Who is greyed, and the popup from a Discipler | Stage 1 here, at `9e7c5e0`, `b30fe81` and `7df285f`. Stage 2 here too, at `ab1f7e5` and `5149ec8`: see *29* at the bottom. |
| 24 | Two ticked: the shapes and their Materials | Not built: ticket 02. |
| 25 | Groups in the popup, from a Disciple | Not built: ticket 03. |
| 26 | The Group shape, and groups in the popup from a Discipler | Not built: ticket 04. |
| 27 | The old Pair page retires | Not built: ticket 05. |

Two things in the Comments below were left for James, and both were carried into ticket 03, where he answered them on 2026-09-20: what becomes of an open Join Request when an Admin puts its Person into the same group, and the words *Sam just joined your group.* for a group nobody named.
Ticket 23's Comments hold six readings made while building its first stage, written for James to read once; none of them stopped the work.

## 01 - What the Pair screen reads

**What to build:** Three facts the pairing form needs and the Pair page cannot currently see: each candidate's gender, whether the Ministry enforces the absolute one-to-one gender match, and the Ministry's live Materials. No UI changes.

**Status it carried:** shipped

### Why

`pair_page()` is `select public.roster_page()` (`20260926000100_a_page_is_one_read.sql:338`), and the Roster's document carries none of the three.
Ticket 04 cannot grey a non-matching Disciple without gender, cannot decide whether Mixed is offerable without the setting, and cannot fill the Material select without the list.

The page-function migration already anticipates this move: "a page that one day reads differently moves nobody else's document."
This is that day.

### Acceptance

- `public.roster()` widens by one column, `gender public.gender`, read as `app.current_gender(p.id)`.
  Dropped and recreated rather than replaced, since the return type widens, which is the move tickets 27, 28 and the Roster's own migration each made.
  The function's `app.is_admin_of` test is what lets it out, exactly as it does for phone and email under ADR-0021, and no column grant on `intake_submission` is added.
- `app.current_gender(uuid)` gains `grant execute` to whatever role `public.roster()` runs as, and keeps its revoke from `public` and `anon`.
  A browser session must still hold no path to call it directly, which is what its own comment says it exists to prevent.
- The function comment is updated to name gender and to say why it is there.
- `RosterEntry` gains `readonly gender: Gender | null`, documented as: the gender on their most recent Intake submission; null is *never asked*, never a mismatch; read by the pairing surface to grey rows against a declaration and by nothing else.
- `pair_page()` stops being an alias and becomes its own `plpgsql` function returning `roster_page()` merged with:
  - `suggest_gender_match`, off the Ministry row;
  - `materials`, the Ministry's Materials in title order, `removed` ones included so the reader can drop them, matching the shape `materials_page()` already builds.
- `person_page()` stays an alias of `roster_page()`. Only the Pair page's document moves.
- `RosterPage` gains `suggestGenderMatch: boolean` and `materials: readonly MaterialOption[]`, where a `MaterialOption` is id and title.
  Both are documented as read by the Pair surface only.
- The reader keeps removed Materials out of `materials`, as the Materials tab's reader already does for its dropdowns.
- A `roster_page()` document reaching `rosterFrom` without the two new keys yields `suggestGenderMatch: true` and `materials: []`, so the Roster and person pages keep working unchanged.
  True and not false is deliberate: the safe default for a safeguarding constraint is enforced, which is the reason the column itself defaults true.
- Grants: `pair_page()` keeps its revoke from `public`, `anon` and `service_role` and its grant to `authenticated`.
- Over-HTTP: a signed-in Admin loading `/roster/pair` gets gender for every candidate who has completed Intake and null for anyone who has not; a Ministry with `suggest_gender_match` false reads false; a removed Material is absent from the list.
- The existing Roster, person and Pair page tests pass untouched.

### Notes for whoever picks this up

Gender on the Roster's own function rather than only on the Pair page's document is a deliberate choice: one shape stays one shape, and a second projection of the same rows is how two readers eventually disagree.
It is Admin-gated already and is less disclosing than the phone number the same function hands out.

If that trade reads wrong, the alternative is a `candidate_genders` map added to `pair_page()` alone, and the Pair page merging it.
Say so on this ticket rather than deciding it in ticket 04.

### Comments

#### 2026-09-18 - implemented on `what-the-pair-screen-reads`, not yet merged

Gender went on `public.roster()` as the ticket chose, and the `candidate_genders` alternative was not needed.

Calls made while building, for whoever picks up ticket 04:

- `pair_page()` emits `id`, `title` and `removed` per Material, in the order `materials_page()` uses.
  That is a subset of its rows rather than the whole row, since a select needs no body and no storage lookup for a PDF's size.
- `MaterialOption` is `{ materialId, title }`, following `MaterialOnTheList`, rather than a literal `id`.
- The derivation is `rosterPageFrom(doc, clock, surface)`, and it is told which surface it is reading for.
  The Roster and the person page read `suggestGenderMatch: true` and `materials: []` as the ticket asks.
  The Pair page's own document arriving without either key is thrown for, like every other drift in that reader, rather than read as those defaults.
  A null `suggest_gender_match`, which is a Ministry row the session could not see, reads as enforced.
- One definition of a live Material, `liveMaterialRows`, is now shared by the Materials tab's reader and the Pair page's.
- `app.current_gender` is granted to `postgres`, which owns it and `public.roster()` alike, so the grant states the dependency and changes nothing.
  It is revoked from `authenticated` as well as `public` and `anon`.
- "Pass untouched" holds for every assertion.
  `tests/app/roster-lists.test.ts` gained one fixture line, `gender: null`, because it builds a whole `RosterEntry` and the field is required.

The over-HTTP bullet is met as far as a ticket with no UI allows.
The three facts are proven through a signed-in session against `pair_page()` and through the reader's derivation, and the running app is shown to still answer `/roster/pair`, `/roster` and the person page with every new state present.
Nothing in the HTML carries a gender yet, so ticket 04 should assert it over HTTP once a row is greyed.

Found along the way and fixed in its own commit: `membersFrom` handed names back in heap order, so a group's names could swap between loads and `the-materials-tab-answers-in-one-read` failed intermittently.

**2026-09-19.**
Shipped in PR #12.

## 02 - A Material chosen at pairing

**What to build:** The Material an Admin picks while forming a relationship, held until the relationship is accepted and written into its history at that instant.

**Was blocked by:** 01

**Status it carried:** shipped

### Why

The prototype's group panel carries a Program / book select, and an Admin forming a group knows what it is about to run.
`relationship.assign_material` refuses while `acceptedAt` is null (`src/domain/boundary.ts:3121`), and a relationship formed a moment ago is never accepted, so the pick cannot be an assignment.

It does not need to be.
`20260908000100_material_assignment.sql:292` states that assigning a Material at the instant of acceptance is permitted, produces a zero-length period, and that the period carrying no Material sorts ahead of anything sharing its instant, "which is not a tiebreak invented to settle that coin toss but the rule itself".

So the pick is recorded on the relationship as an intention, and acceptance spends it.
Nothing about the gapless invariant changes.

### Acceptance

- Migration: `relationship.intended_material_id uuid references material (id) on delete set null`, nullable.
  Commented as: what an Admin chose while forming this relationship, spent at acceptance and meaningless afterwards.
  `on delete set null` and not cascade: a Ministry deleting a Material must not delete relationships.
- `discipler_command` gains the grant it needs to write the column on insert and to clear it at acceptance. No new grant for `authenticated`.
- The column is **not** immutable the way `kind` and `declared_gender` are. It is an intention, not a fact about what happened, and it is cleared once spent.
- `relationship.create` gains `readonly materialId?: MaterialId`, documented beside `name` and `joinRequiresApproval`: absent means none, and it is an intention rather than an assignment for the reason above.
- The boundary refuses a `materialId` naming a Material this Ministry does not hold, or one already removed, with a `PairingRefused` code added to `PairingRefusal` and worded in `app/roster/copy.ts`.
  A new code and not a silent drop: `REFUSALS` is a `Record`, so forgetting the wording fails the build, which is the property that file exists for.
- A `materialId` on a one-to-one is kept, not dropped.
  Unlike a group name, which changes what the weekly question calls two people, a Material binds identically whatever the shape, which is the same reasoning `declaredGender` already carries at `src/domain/boundary.ts:2166`.
- At acceptance (`src/domain/boundary.ts:4733`), when `activatesRelationship` and the relationship carries an intended Material, a second `assignMaterial` effect is pushed at the same instant, carrying that Material and `assignedBy: null`.
  It sits after the existing `materialId: null` effect, which is the opening period and must stay first.
  `assignedBy` is null because no Admin performed *this* act; the Admin who chose it is on the pairing event.
- The intended Material is cleared when spent, so a relationship that is accepted, ended and re-read carries no stale intention.
- A relationship whose intended Material was removed between pairing and acceptance activates with the opening period alone and no refusal.
  Acceptance is a Leader's act and must never fail on an Admin's stale choice.
- Domain tests: the two-period history at one instant satisfies `app.reject_broken_material_history`; the opening period sorts first; a one-to-one carries it; a removed Material at acceptance is skipped; no intention leaves a single opening period exactly as today.
- Over-HTTP: form a group with a Material, accept it as its Leader, and the Materials tab files it under that Material's folder with no "Previously" line.
- `CONTEXT.md` names the intention and points at the boundary for when it is spent, stating no duration and no cap.

### Notes for whoever picks this up

The Admin's choice is recorded in the pairing ministry event as well as on the column.
The column is spent and cleared; the event is history and stays.

Do not reach for `relationship.assign_material` here. It carries an `assignedBy` and an Admin, appends its own history, and refuses unaccepted relationships. This is a different act with a different shape, and routing it through that command would mean loosening the acceptance check that ticket exists to hold.

### Comments

#### 2026-09-18 - implemented on `a-material-chosen-at-pairing`, not yet merged

The branch is stacked on `what-the-pair-screen-reads`, so ticket 01's pull request stays ticket 01.

Calls made while building, for whoever picks up tickets 03 and 04:

- The foreign key is composite, `(intended_material_id, ministry_id)` onto `material (id, ministry_id)`, with `on delete set null (intended_material_id)`.
  The ticket worded a single-column reference.
  Composite is what every other reference to a Material is, and it makes an intention naming another Ministry's Material impossible whatever the boundary was handed.
- A check constraint was added that the ticket did not ask for: `relationship_intention_is_spent_at_acceptance`, `accepted_at is null or intended_material_id is null`.
  It states "cleared when spent" once, where it cannot be forgotten.
  Activation stamps `accepted_at` and clears the column in one statement in the store, which is the only thing that writes `accepted_at`.
  The column is cleared at activation whether the Material was assigned or skipped as removed.
- No grant statement was added.
  `discipler_command` already holds insert and update on the whole of `relationship`, and the migration says so.
- The refusal is `relationship.material_is_not_on_the_list`.
  One code covers a removed Material and one this Ministry never held, since the list a pairing is decided against is the live one.
  Its sentence avoids the word "relationship", which the Roster's vocabulary test forbids, and does not send the Admin to an assign screen, because no screen assigns a Material yet.
- The live list of Materials is read, behind the Ministry's lock, only by a `relationship.create` that names a Material and a `relationship.accept` whose relationship still carries one.
  The lock serialises an acceptance against an Admin removing that Material, so neither decides against a list the other has changed.
- Found in review and fixed: that acceptance took the relationship's row and then the Ministry lock, the reverse of the order `scheduled.tick` takes them in, which is a deadlock Postgres settles by aborting one of them.
  The store now takes the Ministry lock first when the relationship carries an intention, and an integration test pins the order.
- The Pair route reads a `materialId` field and sends it back in the query string on a refusal, which is what let the over-HTTP bullet be met before there is a control.
  The Pair page does not read `materialId` from its query string yet.
  Ticket 04 must preselect the Material from it, or a second refusal loses the choice.
- The `relationship.created` event's payload carries `materialId`, null where none was chosen.
- Found in review and authorised by the owner: the `relationship.activated` event's payload says what acceptance did with the intention, beside `participantCount`.
  It carries `intendedMaterial: { materialId, outcome }`, where `outcome` is `assigned` or `skipped_as_removed`, and carries no such key where nothing was intended.
  The column is cleared at activation and a skip writes no period, so this event is the only record that a chosen Material was dropped, and the only event that says which Material a relationship started on.
  No new event type and no migration.
- "Domain tests: the two-period history satisfies `app.reject_broken_material_history`" is proven in `tests/integration/`, which is the only place a deferred constraint trigger can be.

**2026-09-19, renumbered.**
Shipped in PR #13.
"Ticket 04" in the comments above is the ticket of 2026-09-18, *The pairing form*, which the spec of 2026-09-19 replaced.
Preselecting the Material after a refusal is now carried by Manual pairing tickets 16 and 17, whose refusal criteria restore every Material choice.

## 03 - A pairing checked without being formed

**What to build:** A way to ask the domain whether forming a relationship would be refused, that cannot write.
Nothing an Admin can see changes.
This is the prefactor that lets ticket 04 promise all or nothing across several one-to-ones without keeping a second copy of the pairing rules.

**Was blocked by:** None - can start immediately.

**Status it carried:** ready-for-agent, and then it was built.

**Budget:** ~130k of 250k tokens (reads 45, writes 25, test runs 20, gate 30, overhead 10).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

### Why

The spec's rule: there is no batch command, `CommandService.execute` takes one command, so N × 1:1 pairs is N transactions, and the set is validated through the boundary before any is formed.
A route that re-implemented the gender rule or the Intake rule to pre-check a set would be the fence break ADR-0004 exists to stop.
So the check has to be the same decision formation makes, stopped before its effects are applied.

### Acceptance

- [x] The command service can be asked to check a `relationship.create` command, and answers with the same `PairingRefusal` formation would have thrown, or with nothing when formation would have gone ahead.
- [x] The check runs the same boundary decision formation runs, against the same context, read the same way.
  There is one copy of every pairing rule after this ticket, as there was before it.
- [x] The check cannot write: no relationship, membership, invitation, history event or outbound message exists after it, whatever it answered.
  A test proves this against the database and not only against a fake store.
- [x] Checking and then forming the same command gives the same answer both times, for a command that passes and for each refusal the pairing suites already cover (gender, Intake not completed, opted out, a Material the Ministry does not hold, an unnamed group, an undeclared group).
- [x] Only `relationship.create` can be checked.
  This is not a general dry-run for every command, and nothing else gains one here.
- [x] Formation itself is untouched: the existing pairing suites pass without edits.

### Notes for whoever picks this up

Rules that live only in the database (the partial unique indexes, the two gender triggers) are enforced on write and the check will not see them unless the boundary already mirrors them.
List on this ticket any refusal the database can raise that the check cannot predict.
Ticket 04 has to report those honestly when they happen partway through a set, and needs the list.

### Comments

#### Implementer, 2026-09-19: the check forms the relationship and rolls it back

`CommandService.checkPairing(command)` answers with the `PairingRefusal` that `execute` would have thrown, or `null`.
It is not "the boundary decision, stopped before its effects are applied", which is what *Why* above describes, and the reviewer should know that before reading the diff.

The ticket was written believing the boundary decides gender and Intake.
It does not.
For `relationship.create` the boundary decides seven things: a Discipler is named, a Disciple is named, nobody is on both sides, nobody is listed twice, a group is declared, a group is named, and the Material is on the list.
Gender, Intake, opt-outs and the participation caps are triggers and indexes on `relationship_member`, translated to a `PairingRefusal` by constraint name in `src/platform/supabase/effect-store.ts` (`REFUSALS`).
They answer only when a membership row is written.

So a check that stopped before the write could not meet the fourth criterion (gender, Intake not completed and opted out must agree with formation), and ticket 04's over-HTTP criterion, a Disciple of another gender forming nothing, would have been impossible to meet through it.
Mirroring those rules in the boundary to make a decide-only check work would have been the second copy of each rule that the second criterion and ADR-0004 rule out.

What was built instead: the check runs formation whole (the same reads, the same `handleCommand`, the same `applyEffects`, through one shared function, `carryOut`) inside `store.transact`, and then throws, so the transaction rolls back.
`EffectStore.transact` already promises that a throw lands nothing, and every store implements that, so no port changed.
The database has its say, and nothing is kept.
`tests/integration/a-pairing-checked-without-being-formed.test.ts` counts `relationship`, `relationship_member`, `invitation`, `ministry_event`, `outbound_message` and `follow_up_item` before and after every check, passing or refused.

No product behaviour was decided here: nothing an Admin sees changes, and no rule was added, moved or reworded.

#### Implementer, 2026-09-19: what the check cannot predict (for ticket 04)

At the moment it runs, nothing, with one exception corrected further down: `relationship.person_belongs_to_another_ministry` is answered for a Disciple only, and a Discipler the connection cannot see is a thrown `Error`.
Every other `PairingRefusal` the database can raise on formation, the check raises too, because it performs the same writes.
That includes the ones the ticket expected to be out of reach: `relationship.gender_must_match`, `relationship.gender_does_not_match_the_declaration`, the four Intake and opt-out codes, `relationship.participant_already_in_a_one_to_one`, `relationship.leader_already_leads_a_group`, `relationship.person_belongs_to_another_ministry`, `relationship.person_already_in_this_relationship` and `relationship.already_has_a_leader`.

What it cannot see is anything that has not happened yet.
Ticket 04 has to be ready for two things.

1. **One pairing in a set refusing another.**
   Each check runs against the database as it stands, with none of the set formed.
   For N x 1:1 under one Discipler there is exactly one way for this to happen: the same Disciple named twice.
   Both checks pass, and the second formation is refused with `relationship.participant_already_in_a_one_to_one` (`participant_one_open_one_to_one`).
   A test in the integration suite pins this.
   Ticket 04 can close it before checking anything, by refusing a set that names a Disciple twice.
   Nothing else in such a set collides: `leader_one_open_group` counts groups only, so one Discipler may lead any number of one-to-ones, and `relationship_member_one_open_per_person` and `one_to_one_one_open_leader` are both per relationship.
2. **The world changing between the check and the formation.**
   Any refusal can appear in that gap, and these are the ones with an ordinary cause:
   - `relationship.participant_already_in_a_one_to_one`: another Admin, or the settling of an imported plan, pairs that Disciple first.
   - `relationship.participant_has_opted_out` and `relationship.leader_has_opted_out`: somebody texts STOP.
   - `relationship.material_is_not_on_the_list`: another Admin removes the Material.
   - `relationship.gender_must_match`: somebody submits Intake again with a different answer.
   The gap is as wide as the set is long, since formation is one transaction per pairing.
   This is the "write still fails partway" case ticket 04 already has a criterion for.

Two smaller facts.
The deferred constraint triggers are checked at commit, so a check never reaches them; the only one on `relationship_member` (`relationship_has_no_open_membership_after_it_ends`) cannot be raised by forming a new relationship and is not a `PairingRefusal`.
And a check draws ids from the `IdSource` and takes the locks formation takes (the Material list's advisory lock, when a Material is chosen) for as long as it runs, then releases them on rollback.

#### Implementer, 2026-09-19: the rollback design was approved, and has an ADR

A two-axis review of `integration/manual-pairing...HEAD` found nothing implemented wrong, and said two things plainly.
Building form-and-rollback against the ticket's *Why* was not the implementer's call to make without asking first, and a decision this surprising had no ADR.
Both were right.
James approved the design on 2026-09-19, and it is recorded as `docs/adr/0025-a-pairing-is-checked-by-forming-it-and-rolling-back.md`.
The number skips 0024 because a parked branch, `the-admin-dashboard-may-use-script`, already holds it.

The same review found that the database test counted rows and so could not see an UPDATE, which left the closing of an imported plan proved only against the fake store.
The integration suite now checks a pairing that would close an open `intended_pairing`, finds the plan still open afterwards, and finds it closed once the same pairing is formed.

#### Implementer, 2026-09-19: two corrections to the comments above, from a second review

**`relationship.person_belongs_to_another_ministry` is answered for a Disciple only.**
The list above says the check raises it, and for a Discipler that is wrong.
A Discipler the connection cannot see (another Ministry's, or an id that names nobody) is not returned by `contactsFor`, so `whoIs` in `src/domain/boundary.ts` throws a plain `Error` while the invitation is being composed, before any membership row is written and before `relationship_member_person_fk` can fire.
`checkPairing` rethrows it, exactly as `execute` does.
Ticket 04 should expect a thrown `Error`, not a refusal, for a Discipler id that is not this Ministry's.

**A check can deadlock with a real formation, in one narrow shape.**
Membership rows are inserted one at a time in the order the command names people, and a check takes the same unique-index locks a formation takes.
Two transactions that contend on two keys in opposite orders deadlock, and Postgres kills one of them with `40P01`, which nothing translates.
That needs two co-led groups naming the same two Disciplers in opposite orders at the same moment, contending on `leader_one_open_group`.
That sentence first went on to say it could not happen for several one-to-ones under one Discipler, and a later review showed that was wrong: see the second shape below.
Two real formations could always deadlock this way; what is new is that one of the two can now be a check, which was going to roll back anyway.
Fixed on 2026-09-19, when James asked for it.
A test in the integration suite reproduced it first: a co-led group formed while a check names the same two Disciplers the other way round failed on the first round with `deadlock detected`.
`createRelationship` in `src/platform/supabase/effect-store.ts` now writes a relationship's members in one fixed order, by Person id, so no two transactions can hold one entry each and wait for the other.
This is the one change this ticket makes to formation's own store, and it changes no rule and no refusal: which rows are written is the same, and only the order of the inserts inside the transaction differs.

**A second shape, and this one is ticket 04's own case.**
Settling an imported plan (`intended_pairing.fulfil`) locks the plan row and then writes the Disciple's membership.
Forming or checking the same pair wrote the membership and then closed the plan.
Opposite orders, so a check of a pair an import had planned could deadlock with the settle of that plan, after an Intake submission or on the tick.
Reproduced by a test, which failed on its first run with `deadlock detected`, and fixed the same day: a formation that will close plans locks them first (`lockIntendedPairings` on the unit of work, called from `applyEffects` before any membership is written).
The order everybody takes is the plan, then the memberships by Person id, and ADR-0025 records it.

A check that names a Material holds more than the Material list.
The advisory lock that read sits behind is keyed by the Ministry, so editing the Discipleship Goals, the tick's read of who is still to accept, and an acceptance that spends a Material all wait for a check to finish.
Ticket 05 should know that before it checks a Material per Disciple across a set.

Still open, and James's to decide: `.scratch/manual-pairing/spec.md` says the set is "validated through the boundary", and this ticket's *What to build* says "that cannot write".
ADR-0025 now says how to read both, and neither file was edited.

#### Orchestrator, 2026-09-20: what the implementing session cost

Read from the session's transcript, as the context the session was carrying, which is what the 250k limit is a limit on.

- Estimate on the **Budget** line: ~130k.
- At the first commit, with the ticket built and not yet reviewed: 167k.
- At its peak: 269k, because the same session went on to answer the review and the conversations with James, which `docs/agents/workflow.md` gives to a fresh fixer session.
- The session stood at 51k before it had read the ticket: the system prompt, the tool and skill lists, `CLAUDE.md` and memory.

Across tickets 03, 06 and 08 the build alone came to between 1.3 and 1.8 times the estimate.
The tickets cut on 2026-09-20 (21 to 27) keep the old estimates per stage and say so beside them.

## 06 - The Roster's three lists

**What to build:** An **All / Disciplers / Disciples** toggle directly under the word Roster, with All the default, and an All list on which each person appears once and every pairing says its direction.

**Was blocked by:** None - can start immediately.

**Status it carried:** ready-for-agent, and then it was built.

**Budget:** ~130k of 250k tokens (reads 35, writes 30, test runs 20, browser check 15, gate 30).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

### Why

Today the Roster is two lists and opens on Disciplers, so a pastor looking for one person has to know which side they are on first.
The toggle also becomes what decides which side the Pair popup opens on (ticket 12), so it has to exist before the popup does.

The quieter rows (the chip, the footnote, the tags, the Pair people button) are ticket 07, and nothing in this ticket removes them.

### Acceptance

- [x] Three plain links under the title: **All**, **Disciplers**, **Disciples**, at `?list=all|disciplers|disciples`.
  No script is needed and a refresh keeps the list.
- [x] All is the default: `/roster` with no `list`, or with a value that is none of the three, shows All.
  This changes today's default, which is Disciplers, and the tests that assumed it are updated rather than worked around.
- [x] Who is on which list does not change.
  The one rule that decides it stays the one rule, and a person may be on both.
- [x] On All, each person appears exactly once, including somebody who is on both lists.
- [x] On All, the Paired with cell says the direction of each pairing: *disciples* Emily Davis, *discipled by* Grace Lee.
  Somebody on both sides shows both directions in the one cell.
- [x] On All, the column heading and the count line read for people, not for one side.
- [x] The stats line shows total, paired and unpaired on every list.
  *In groups* is gone from all three.
  On All, paired means in at least one open relationship in either role.
- [x] A plan an import made still shows on the row of each person it is about, on All as on the side lists.
- [x] Receipts (imported, paired, reset) still land and read correctly now that the default list is All.
- [x] Over HTTP: the three lists, the default, the unknown value, and a person on both sides appearing once on All with both directions.
- [x] Looked at in a browser beside the plan's Roster mock; the toggle sits directly under the title and nothing else on the page has shifted.

### Comments

#### 2026-09-19 - implemented on `agent/manual-pairing-06-the-rosters-three-lists`

Calls made while building, for the reviewer and for whoever picks up tickets 07 and 12:

- **A plan said its direction on All too**, as first built; see the review below, which took the direction out altogether.
- **All three links name their list**, All included: `/roster?list=all`.
  `/roster` with no `list`, an empty one, or an unknown one shows All.
- **All is not a third rule.**
  `isDisciple` already takes whoever `isDiscipler` does not, so everybody on the Roster is on at least one side and `onList('all', ...)` is simply true.
  `lists.ts` is otherwise untouched in who it puts where, and a unit test pins that the two sides are the same people as before.
- **Order inside the cell on All** is leading first: who they disciple, then who disciples them, then plans in the same order.
  The spec does not say; it is my choice, kept by James in review, and three assertions pin it.
- **On All the heading is "Name" and the count is "N people total"**, from the plan's Roster mock and the acceptance line.
- **Receipts.**
  The paired receipt lands on `/roster?paired=N`, which is now All, so both people it is about are on the page under it; a test asserts both rows.
  The import and the held-row answer still redirect to `?list=disciples` by name, so nothing about them moved.
  A test asserts each: `importing-over-http` for the import, and `resolving-a-shared-number-over-http` for the answer.
  As first written this note claimed both and only the import's was asserted; the second was added in review.
  The password reset receipt is its own page under `/roster/reset/...` and never lands on a list, so there was nothing to change or assert there.
- **The Pair link on All** needed no change: the existing expression already sends a Discipler as `leaderId` and anybody else as `with`, which is what the spec wants from All.
  What the toggle decides for somebody on both lists is ticket 12's.
- **One thing beyond the letter of the ticket:** the size pill (`1:1`, `3 members`) now sits in a `nowrap` span with the last name before it, on every list.
  In a narrow window the pill wrapped onto a line by itself.
  The text of the cell is unchanged; one assertion in `pairing-over-http` that read the raw markup now reads the text.
- `isAGroup` and `RosterStats.inGroups` are deleted, not left unused.
  Nothing else read them.
- `docs/pastor-dashboard.md` said two lists, opening on Disciplers, with four numbers.
  Those two sentences are corrected; the chip and the footnote in the same paragraph are ticket 07's to take out.

#### 2026-09-19 - reviewed with James, and the direction words came out

Two reviewers read `integration/manual-pairing...d9a1966`, one against the repo's standards and one against this ticket and the spec, and James went through the result item by item.

**A decision that supersedes this ticket and the spec.**
The criterion "On All, the Paired with cell says the direction of each pairing" and the matching line under `## The Roster` in `spec.md` are reversed.
James, in review: "there is no need for disciples/disciples by in this context, remove", and "there is a toggle for all, disciplers, disciples, at the top so that covers that confusion, anything more would be cluttered".
So on All a row names the other person in each pairing and each plan, exactly as the side lists do, with no word before the name.
Somebody on both sides is still one row with both pairings in the one cell, who they disciple first.
The criterion above stays ticked as it was built and reviewed; this note is what is true now.
`spec.md` still carries the old line and the mock in `.lavish/pair-popup/index.html` still draws it; both are James's to amend, and I have not touched either.
Ticket 12 is not affected: what the toggle decides for somebody on both lists never depended on the words.

The rest, by the review's own IDs:

- D-1 kept: the last name and the size pill share a `nowrap` span.
- D-2 kept: the leading-first order, with the wrong claim about the spec's example corrected above.
- D-3 kept: `fe7f74e`, the wait for Auth in `locked-tests.sh`, integrates with this ticket.
- D-4 kept: the `docs/pastor-dashboard.md` correction, now without the sentence about direction.
- D-5 kept: all three links name their list, `/roster?list=all` included.
- J-1 fixed: `docs/agents/test-environment.md` describes the Auth gap and the wait.
- J-2 fixed: the stale "two lists" comment in `app/roster/copy.ts`.
- S-1 fixed: `plansOn` and `relationshipsOn` share one `heldOn`.
- S-2 moot: `Direction` is deleted, so `PlanLine` and `PairingLine` no longer take a `list`.
- S-3 moot: the `.dir` class is deleted with it.
- S-4 left: per-suite test helpers stay as they are.
- S-5 fixed: the two unit assertions on the absence of `inGroups` are gone; the over-HTTP one that the page never says *in groups* stays.
- E-1 fixed: the held-row answer's landing is asserted, and the note that claimed it is corrected.
- E-2 accepted: the browser check was made in a window 850 px wide, and that stands.
- E-3 fixed: the "directly under the title" assertion now matches the card's head exactly and checks the very next element is the toggle.

#### Orchestrator, 2026-09-20: what the implementing session cost

Read from the session's transcript, as the context the session was carrying, which is what the 250k limit is a limit on.

- Estimate on the **Budget** line: ~110k.
- At the first commit, with the ticket built and not yet reviewed: 203k.
- At its peak: 338k, because the same session went on to answer the review and the conversations with James, which `docs/agents/workflow.md` gives to a fresh fixer session.
- The session stood at 51k before it had read the ticket: the system prompt, the tool and skill lists, `CLAUDE.md` and memory.

Across tickets 03, 06 and 08 the build alone came to between 1.3 and 1.8 times the estimate.
The tickets cut on 2026-09-20 (21 to 27) keep the old estimates per stage and say so beside them.

## 07 - Quieter Roster rows

**What to build:** Nothing on a Roster row that describes internal state, and every pairing starting from a row.

**Was blocked by:** 06

**Status it carried:** ready-for-agent, and then it was built.

**Budget:** ~130k of 250k tokens (reads 35, writes 30, test runs 20, browser check 15, gate 30).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

### Why

The participation status chip, its footnote and the *Offered to mentor* tag explain the model to a pastor who came to see people.
Participation Status stays in the model and still decides who can be paired; it stops being printed under every name.

### Acceptance

#### Removed

- [x] The participation status chip under every name, and the footnote under the table that explains it.
- [x] The *Offered to mentor* tag.
  Answering Mentor on Intake still makes somebody a Discipler, and the Disciplers list already says so.
- [x] The *Pair people* button, from the Roster and from Suggested Pairs.
- [x] Copy and styles that only the removed pieces used go with them, and the copy tests are updated.

#### What a row says instead

- [x] A row that cannot be paired says why in its Paired with cell: **Awaiting Intake** or **Opted out**, in place of *Unpaired* and a Pair button.
- [x] **Pair** appears on every Discipler row, including a Discipler who already leads somebody.
- [x] **Pair** appears on every Disciple row whose person has completed Intake and not opted out, and on no other Disciple row.
- [x] On All, a person who is a Discipler gets the Discipler's rule.
- [x] Pair still opens the existing Pair page with that person preselected, as it does today.
  Ticket 12 moves Disciple rows to the popup and ticket 20 moves Discipler rows.

#### Pinned

- [x] A test asserts the words *Eligible to lead* never appear on the Roster, on any of the three lists.
  They left the app on 2026-09-07 and survive only in a design prototype.

#### Glossary

- [x] **Roster** in `CONTEXT.md` stops saying it shows "their current participation status".
- [x] **Declared Side** in `CONTEXT.md` stops saying "it shows on their roster row".

#### Checked

- [x] Over HTTP: a person awaiting Intake, a person opted out, a ready Disciple, a Discipler who leads nobody and one who leads somebody each show what this ticket says, on their side list and on All.
- [x] Looked at in a browser beside the plan's Roster mock.
  Row height, alignment of the Pair button and the reason text are right on all three lists.

### Comments

#### Implementer, 2026-09-19: a Discipler who cannot be paired (decided by James)

Two lines of this ticket disagree for one kind of row.
*Pair appears on every Discipler row* and *a row that cannot be paired says why, in place of Unpaired and a Pair button* cannot both hold for a Discipler who has opted out, or who was imported as one and has not completed Intake.
The database refuses a pairing led by either.

James decided it on 2026-09-19: the reason wins, and there is no Pair.
*Every Discipler row* is read as the plan's mock words it: a Discipler keeps Pair even when they already lead somebody.

So there is one rule for both sides, `whyNotPairable` in `app/roster/lists.ts`: no Intake completed reads **Awaiting Intake**, opted out reads **Opted out**, and anybody else gets Pair, paired already or not.
The side decides only who is preselected on the Pair page, as it did before (`pairHref`).

#### Implementer, 2026-09-19: the reason on a row that already names somebody

The ticket says where the reason goes when the cell would have said *Unpaired*.
It does not say where it goes when the cell already lists a pairing or a plan, and that row exists: opting out ends no relationship.
The chip used to say *Opted Out* on that row, and `tests/integration/the-roster-row-over-http.test.ts` pinned that an Admin can read it there.

I read the ticket's main clause, *a row that cannot be paired says why in its Paired with cell*, as covering it.
The reason sits after the lines, where Pair would have been.

The first review (d131148, CHANGES REQUIRED) accepted that for a pairing, *Uche Nwosu 1:1* and then **Opted out**.
It refused it for a plan, where the row read *Taylor Brooks planned - awaiting Intake* and then **Awaiting Intake**: the same words twice, on every pair an import brings in, and a reading the ticket does not reach.

James decided it on 2026-09-19: drop the repeat only.
A row whose plan line already ends in *awaiting Intake* does not say **Awaiting Intake** after it, and still offers no Pair.
Every other reason stays, because it says something the lines do not: **Opted out** beside a pairing or a plan, and **Awaiting Intake** beside a plan that was refused (*not made - see Follow-Up*).
`reasonOnRow` in `app/roster/lists.ts` is that rule, and `whyNotPairable` still decides the button.

#### Implementer, 2026-09-19: what stayed, on purpose

- The person page still shows the status chip and *Offered to mentor*.
  The ticket is about the Roster row, and `participationStatusLabel` and `OFFERED_TO_MENTOR` stay in `app/roster/copy.ts` for it.
- *Pair people* is still the Pair page's title.
  Only the buttons went; ticket 20 retires the page.
- The Suggested Pairs button said *Pair manually*, not *Pair people*.
  It was the same way in, `/roster/pair` with nobody chosen, so it went.
- The import dialog still says *People land as No Intake Submitted*.
  No row prints that status any more, and the row says *Awaiting Intake*.
  Rewording the dialog is a copy decision this ticket does not make.

#### Implementer, 2026-09-19: where the button sits

Beside what the cell says, never under it (`.paired-with` in `public/discipler.css`).
A one-line cell reads as the plan's mock draws it, *Emily Davis 1:1* and then Pair.
A cell whose lines wrap keeps the button at the cell's right edge, centred on the lines, so a long group does not push it onto a row of its own.

## 08 - The Ministry's groups on the Pair document

**What to build:** The groups an Admin could put somebody into, on the document the Pair screen already reads.
No UI changes, as ticket 01 was.

**Was blocked by:** None - can start immediately.

**Status it carried:** ready-for-agent, and then it was built.

**Budget:** ~110k of 250k tokens (reads 40, writes 25, test runs 15, gate 25, overhead 5).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

### Why

Tickets 18 and 19 list groups at the bottom of the popup and grey the ones a person cannot join.
The Pair document carries candidates, genders, the gender-match setting and Materials, and nothing about groups.
The read that feeds the Intake form's group dropdown is not this one: that lists accepted, named groups only, for somebody with no session.

### Acceptance

- [x] The Pair document lists every open relationship with two or more Disciples, 1:2 pairs included.
- [x] Running, paused and still awaiting its leader are all listed.
  Ended and cancelled are not.
- [x] Each group carries: its id, its name, its leaders (id and name), how many Disciples it has, its declared gender with mixed distinct from a value, and its state when it is not running.
- [x] Each group carries who is in it, in either role, by person id, so the screen can leave out a group the person is already in without a second read.
- [x] A group with no name carries none.
  Nothing is backfilled or guessed in the read; how the row is labelled is the popup's (tickets 18 and 19).
- [x] The count of Disciples is the live count of open participant memberships, never the relationship's kind (ADR-0004).
  A relationship formed as a group that is down to one Disciple is not listed.
- [x] It is still one page read: the groups travel in the Pair document, and no new request is added beside it.
- [x] Another Ministry's groups never appear, and the read is reachable only as an Admin of the Ministry, as the rest of the document is.
- [x] The Roster's own document is unchanged.
- [x] Integration tests cover: a running group, a paused one, one awaiting acceptance, a 1:2, an ended one, one down to a single Disciple, an unnamed one, a mixed one, and two Ministries.

### Comments

#### Orchestrator, 2026-09-20: what the implementing session cost

Read from the session's transcript, as the context the session was carrying, which is what the 250k limit is a limit on.

- Estimate on the **Budget** line: ~130k.
- At the first commit, with the ticket built and not yet reviewed: 196k.
- At its peak: 343k, because the same session went on to answer the review and the conversations with James, which `docs/agents/workflow.md` gives to a fresh fixer session.
- The session stood at 51k before it had read the ticket: the system prompt, the tool and skill lists, `CLAUDE.md` and memory.

Across tickets 03, 06 and 08 the build alone came to between 1.3 and 1.8 times the estimate.
The tickets cut on 2026-09-20 (21 to 27) keep the old estimates per stage and say so beside them.

## 12 - The Pair popup over the Roster, from a Disciple

**What to build:** Pressing **Pair** on a Disciple's row opens a popup over the Roster, titled **Pair {name}**, listing Disciplers.
Choosing one and pressing **Create 1:1 pair** forms the one-to-one.
This is the popup's shell and its simplest complete path; every later popup ticket builds on it.

**Was blocked by:** 07

**Touches:** popup

**Status it carried:** ready-for-agent, and then it was built.

**Budget:** ~180k of 250k tokens (reads 50, writes 45, test runs 25, browser check 25, gate 35).
This is the tightest ticket in the effort.
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

**Design source:** the plan's mock state E (`.lavish/pair-popup/index.html`), and the import dialog for how a popup is drawn over the Roster.

### Out of this ticket

Greyed rows are ticket 13, so here every Discipler can be chosen and the database's refusal is what stops a wrong one.
Groups at the bottom of the list are ticket 18.
The Discipler's side is ticket 14, and Discipler rows keep opening the old Pair page until ticket 20.

### Acceptance

#### Where it lives

- [x] The popup is drawn over the Roster at `/roster?pair=<personId>`, and the Roster behind it is the list the Admin was on.
- [x] A refresh keeps it open.
- [x] The X, **Cancel** and the backdrop all close it without saving and return to the Roster as it was, on the same list.
- [x] A `pair` that names nobody on this Ministry's Roster, or somebody who cannot be paired, opens no popup and shows the Roster.
- [x] **The toggle decides which side it opens on** for somebody on both lists: as a Disciple on Disciples, as a Discipler on Disciplers and on All.
  Until ticket 14, a person who would open as a Discipler is sent to the old Pair page instead, so no row opens an empty popup.
- [x] Opening the popup costs one page read, not the Roster's read and the Pair document's beside it.
- [x] The popup needs JavaScript, as the import dialog does.
  The form inside it is an ordinary form and still posts without script.

#### What it shows

- [x] Title **Pair {name}**, and beneath it one line saying who the list is for.
- [x] One row per Discipler: a round mark, avatar initials, name, email and phone beneath with each missing detail simply absent, and how many they already lead (*leads nobody yet*, *leads 1*).
- [x] Exactly one can be chosen: round marks, not boxes.
  A Disciple is never given two Disciplers here.
- [x] No shape toggle ever appears on this side, and nothing else is asked.
- [x] Nothing chosen: no sentence, and the button reads **Pair** and is disabled.
- [x] One chosen: *Claire Martinez will disciple Sam Lee in a one-on-one.* and **Create 1:1 pair**.

#### Submitting

- [x] It posts to the existing pairing route and forms a one-to-one awaiting acceptance; the Roster shows its receipt, on the list the Admin was on.
- [x] A refusal redirects to `/roster?pair=<personId>&error=<code>`, and the popup reopens with the reason and the chosen Discipler restored (mock state F).
- [x] The old Pair page's own refusals still return to the old Pair page until ticket 20 retires it.

#### Rows

- [x] **Pair** on a Disciple's row, on Disciples and on All, opens the popup.

#### Copy, styling, tests

- [x] Every new string lives with the Roster's copy and is covered by the pairing copy test.
- [x] The existing modal and segmented-control styles are reused, not duplicated; new classes are only what the mock needs beyond them.
- [x] Over HTTP: the popup's markup is present at `?pair=`, absent without it, keeps the list, and the refusal round trip restores the choice.
- [x] Looked at in a browser beside mock state E at desktop and phone width: backdrop, centring, title face, row rhythm, the disabled button.

### Comments

#### Implementer, 2026-09-20: what was built, and three readings

All twenty-one criteria are met.
The popup is `app/roster/pair-popup.tsx`, drawn by the Roster page from the document it already read; the rules are in `app/roster/lists.ts` (`opensAs`, `pairHref`, `whoThePopupIsFor`, `disciplersFor`, `leadsCount`) and the words are `PAIR_POPUP` in `app/roster/copy.ts`.

**One page read** is held by construction and not by a counting test: the page still makes its one `readRosterPage('roster')` call, and the popup is handed rows out of that document.
Nothing in the repository counts requests per page, so I did not invent a harness for it.

Three places where the ticket and the spec left room, and what I did:

- ***leads 1* counts people, not relationships.**
  The spec says *how many they already lead* and *leads nobody yet*, and *nobody* is a word about people, so a Discipler leading a group of three reads *leads 3*.
  The mock only ever shows 0 and 1, where the two readings agree.
  If James meant relationships, it is one line in `leadsCount`.
- **The toolbar of mock E (*4 disciplers* and **Clear**) is built**, though the acceptance list does not name it.
  The mock is this ticket's design source, and with round marks Clear is the only way back to *nothing chosen*.
  Clear needs script and is absent without it.
- **Every Discipler is listed, one who has not completed Intake or has opted out included**, because the ticket says every Discipler can be chosen and the database's refusal stops a wrong one.
  Ticket 13 greys for gender and for a Disciple already in a one-to-one; it does not mention these two, so they will still be refused after the click.
  Worth deciding before ticket 13 starts whether its rule should grey them too.

Also decided here, from the orchestrator's note on `pairHref`: it now takes the list, because the toggle decides the side.
Somebody on both lists opens the popup from Disciples and goes to the old Pair page, preselected as the Discipler, from Disciplers and from All.
The same holds for an address typed by hand, which redirects.

Beyond the letter of the ticket, both small: the row's Pair link and the popup's three ways out do not scroll the Roster to the top, so it comes back as it was; and a choice restored from a refusal is scrolled into view when the list is long.

Looked at in a browser beside mock E and F at 923px and at 390px: centred both ways to the pixel, serif title over the ruled head, row rhythm and selected row as the mock, **Pair** disabled until a round mark is pressed, the refusal above the list with the choice restored, the import dialog shut behind it.
One flaw found and fixed: the keyboard focus ring was doubled and clipped by the scrolling list.

#### Decided by James, 2026-09-20: the three readings stand

James read the three readings above and said to go with them.

- *leads 1* counts people.
  Written into the spec under *The popup, from a Disciple*.
- Mock E's toolbar, the count and **Clear**, stays.
- Ticket 13 greys a Discipler who has not completed Intake or has opted out, with **Awaiting Intake** or **Opted out**.
  Written into `.scratch/manual-pairing/issues/13-who-is-greyed-for-a-disciple.md` as a criterion and into the spec.
  Nothing changes in this ticket: here they are listed and the database refuses them, as the ticket says.

## 21 - Separate one-to-ones in one submission, with a Material each

**What to build:** One Discipler and several Disciples forming several one-to-ones rather than one group, all of them or none, and each Disciple carrying their own Material choice.
Invisible: the pairing route learns the mode and the per-Disciple Material, and the popup's **N × 1:1 pairs** segment (ticket 24) will post both.

**Replaces:** *04 - Separate one-to-ones in one submission* (stage 1) and *05 - A Material per Disciple in a separate submission* (stage 2), in the cut of 2026-09-20.
Every criterion of both is below, unchanged.
Finished tickets still say the old numbers: where ticket 03 says ticket 04 or ticket 05, it means this ticket.
Read ticket 03's Comments before starting, from *what the check cannot predict (for ticket 04)* to the end; they were written for the session that builds this.

**Was blocked by:** 03

**Status it carried:** ready-for-agent, and then it was built.

**Budget:** two sessions of 250k tokens each, one per stage: stage 1 ~160k (reads 45, writes 35, test runs 30, gate 35, overhead 15); stage 2 ~90k (reads 30, writes 20, test runs 15, gate 20, overhead 5).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line in either stage: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.

### Stages

This ticket is one branch and one review, built in two sessions.
A session does the first stage below that still has an unticked criterion, commits, reports and stops; the next session starts fresh on the same branch.
The review happens once, after stage 2.

### Why

Without it, an Admin pairing a Discipler with four people works the screen four times.
Partial formation is not a lesser outcome here, it is the bad one: the Admin cannot see what landed without leaving the screen, and nothing on the screen un-forms a relationship.

James asked for the Material to be asked per person when pairing separately (mock state C).
A Discipler meeting two people apart is often reading different things with each.
Ticket 02 already holds one intended Material on a relationship; stage 2 lets a set of relationships each hold a different one.

### Stage 1 - Separate one-to-ones, all or none

In this stage a separate submission forms every one-to-one with no Material.

- [x] The pairing route accepts `mode`, one of `together` and `separate`.
  Absent, or anything else, reads as `together`, which is today's behaviour unchanged.
- [x] `separate` is refused unless there is exactly one Discipler and two or more Disciples, with its own `PairingRefusal` code and wording.
  One Disciple is a one-to-one and needs no mode.
  Several Disciplers cannot be split into pairs without deciding who goes with whom, which the screen does not ask.
- [x] **All or nothing.**
  Every pairing in the set is checked through ticket 03's check before any is formed.
  A set where any one would be refused forms none.
- [x] A refusal names the Disciple it is about, and returns the Admin to where they submitted from with the whole selection and `mode` intact.
- [x] The group's properties (declared gender, name) are dropped in `separate` mode rather than applied to each pairing.
  A one-to-one has nothing a name is for, and its gender is implied by its two people.
- [x] Where the set passes the check and a write still fails partway, the response says plainly how many were formed and which were not.
  It never reports four when two landed.
- [x] The receipt counts relationships formed, so the Roster's receipt reads correctly for a set.
- [x] Over HTTP: one Discipler and three Disciples in `separate` mode produce three one-to-ones, each awaiting acceptance, each visible on both Roster rows.
- [x] Over HTTP: the same submission where one Disciple is of another gender, in a Ministry that enforces the match, produces zero relationships and a refusal naming that person.
- [x] Over HTTP: `separate` with one Disciple is refused, and `separate` with two Disciplers is refused.
- [x] `together` mode's existing integration tests pass untouched.

### Stage 2 - A Material per Disciple

Not committed, and not here: its seven criteria are in ticket 02, unchanged.

### Comments

#### Implementer, 2026-09-20: stage 1 is built, and four things in it were mine to choose

**Where it lives.**
`oneToOnesFor` in `src/domain/separate-pairings.ts` decides what is true of the set and of no pairing in it (one Discipler, two or more Disciples, nobody named twice) and splits it into `relationship.create` commands that carry no name, declaration or door.
`formSeparately` in `src/service/separate-pairings.ts` checks every one through `checkPairing` and only then forms them through `execute`.
No pairing rule is decided a second time, and `command-service.ts` is untouched, so ticket 22 has nothing of this to merge around.
A Disciple named twice is refused before anything is checked, with the existing `relationship.person_listed_twice`, as ticket 03's Comments suggested.
The new code is `relationship.separate_needs_one_leader_and_several_participants`.
No migration: no table enumerates the refusal codes.

**1. A set stopped partway stops there.**
The criterion says the response says how many were formed and which were not, and does not say whether the rest are still attempted.
It stops at the first formation that fails.
A write refused after a check that passed means the Roster moved under the Admin (another Admin, a STOP), and carrying on would form more of a set they chose against a Roster they have not seen.
The cost is that an Admin pairs the remainder again by hand.
If James would rather it carried on and formed everything it could, that is the `return` inside the `catch` in `formSeparately` becoming a `continue`, and one test.

**2. A set stopped partway lands on the Roster, not back on the form.**
A refusal returns to where it was submitted from, as the criterion says.
A partial formation goes to the Roster instead, as an alert: *Only 2 of 4 one-to-ones were made. Ana Ruiz and Ruth Okafor were not paired. Ana Ruiz: (the reason).*
The ticket's *Why* says the harm of a partial formation is that the Admin cannot see what landed without leaving the screen, and the Roster is where what landed is on the rows.
It is carried as `pairs`, `notPaired` (ids) and `pairError`, because `error` on the Roster is the import's and opens its dialog.
A fault that is not a refusal, after one or more landed, is reported the same way and logged by the route; with nothing landed it is thrown, as forming one pairing throws it.

**3. How a refusal names the Disciple.**
The route adds `about=<personId>` to the refusal's address, and the page reads the name off the Roster, so no name travels in an address and nothing in an address is rendered.
The wording is the name in front of the existing sentence, and a closing sentence: *Andrew Cole: A one-to-one must be between two people of the same gender. (...) None of these one-to-ones was made.*
The existing sentences say *somebody selected*, which is why the name goes in front rather than into them.
Ticket 24 restores the popup from the same `about` and `mode`.

**4. The old Pair page sends `mode` back as a hidden field.**
It has no control for the mode, and gains none: the popup's segment is ticket 24.
But *with the whole selection and `mode` intact* has to survive the Admin correcting the form and submitting it again, or the same people would form one group.
Ticket 27 retires the page and the field with it.

**What was not arranged over HTTP.**
A set that passes its check and is then stopped partway needs a second Admin racing the first.
The stop and the count are proved in `tests/domain/separate-one-to-ones.test.ts` against a scripted service, the address the route writes in `tests/app/separate-pairing-receipt.test.ts`, and the sentence the Roster renders from that address over HTTP.

**For stage 2.**
`SeparateSubmission` is where the per-Disciple Material goes, and `oneToOnesFor` is where each command picks up its own.
The route's `separate` branch passes no Material at all today, and says so in a comment.
Ticket 03's note stands: a check that names a Material holds the Ministry-wide advisory lock for as long as it runs, once per Disciple.

## 22 - An Admin puts somebody into a group: a Disciple, and a Discipler as co-leader

**What to build:** The Admin's own way into an existing group, for both kinds of person.
A Disciple is chosen and is in it at once; a Discipler joins as another leader, by invitation, and the group carries on meanwhile.
Invisible: two commands behind one route, which the popup's **Add to group** button (ticket 25) and **Add as co-leader** button (ticket 26) will post to.
What happens when a co-leader accepts is ticket 11.

**Replaces:** *09 - A Disciple put into a group* (stage 1) and *10 - An Admin adds a Discipler to a group as co-leader* (stage 2), in the cut of 2026-09-20.
Every criterion of both is below, unchanged.
Where another ticket says ticket 09 or ticket 10, it means this ticket.
Both add a migration, and keeping them on one branch keeps the effort's migrations in one chain.

**Was blocked by:** 08

**Status it carried:** ready-for-agent, and then it was built.

**Budget:** two sessions of 250k tokens each, one per stage: stage 1 ~150k (reads 50, writes 30, test runs 25, gate 35, overhead 10); stage 2 ~170k (reads 55, writes 35, test runs 30, gate 40, overhead 10).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line in either stage: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.

### Stages

This ticket is one branch and one review, built in two sessions.
A session does the first stage below that still has an unticked criterion, commits, reports and stops; the next session starts fresh on the same branch.
The review happens once, after stage 2.

### Why

Today a group is joined only through the Intake form or an admitted Join Request.
A pastor who knows where somebody belongs has to send them a form to say so.

Admitting a Join Request already adds a Participant to a running group and texts its leaders.
Stage 1 is the same act without a request behind it, so it should reuse that path rather than grow beside it.

Until now leader memberships were written at formation and never again.
Stage 2 is the first path that adds a leader to a relationship that already exists, as joining a group was the first that added a participant.

Decided on 2026-09-19: a group can have more than one leader, and a Discipler can lead or co-lead more than one group.
How that works on screen and for check-ins is **not designed yet**, so stage 2 is written against the current limit and lifts nothing.

### Stage 1 - A Disciple put into a group

- [x] An Admin command names a group and a Person, and the Person becomes a participant of the group straight away.
  Disciples never accept anything, and nothing is sent to them.
- [x] Every group ticket 08 lists can be joined: running, paused, or still awaiting its leader.
- [x] The same rules as forming a group apply, and each refusal is a code with wording an Admin can act on: Intake not completed, opted out, the group's declared gender.
  Somebody with no gender on file is refused by the readiness rule, never with "genders do not match".
- [x] Refused with their own codes: a group that has ended, a relationship that is not a group, a Person already in the group in either role, and a group or Person of another Ministry.
- [x] The group's leaders are texted that somebody has joined, with the message a self-join already sends.
  A leader who has not yet accepted is sent nothing, as Awaiting Leader Acceptance requires.
- [x] Recorded as a ministry event of its own type naming the Admin, the Person and the group.
  It is not the self-join's event and not the admission's: who acted is the event's type, not a flag on it.
- [x] A Person already in a one-to-one can still be put into a group; a Person can be in any number of groups.
- [x] The group keeps its Material, its name, its declaration and its state.
- [x] Putting somebody into a group does not close an open Join Request of theirs for that group silently.
  If one is open, say on this ticket what happens to it before choosing; the spec does not say.
  Said under Comments, point 1: it is left open and nothing was chosen, so the choice is still James's.
- [x] The route is an ordinary form post that works without script, redirects to the Roster with a receipt on success, and on refusal returns to where the Admin submitted from with the chosen group and the reason.
- [x] Over HTTP: a ready Disciple joins a running group and appears on both Roster rows; the leader has a queued text; a Disciple of another gender is refused by a men's group and joins a mixed one; an ended group is refused.

### Stage 2 - A Discipler added as co-leader

A command behind the same route as stage 1.

- [x] An Admin command names a group and a Person, and the Person gains an open leader membership on the group with no Acceptance recorded.
- [x] They are issued an Invitation Link and sent it, the same way a mentor is when first paired.
- [x] **The group keeps running.**
  A group already accepted stays in the state it was in; adding a leader never moves it back to Awaiting Leader Acceptance.
- [x] A group still awaiting its leader now waits for this leader too: it activates when every open leader membership carries an Acceptance, as `CONTEXT.md` already defines Acceptance.
- [x] `leader_one_open_group` stands.
  A Discipler who already leads an open group is refused with a code and wording of their own (*{name} already leads a group*), decided at the boundary, never surfaced as a database error.
- [x] The group's declared gender binds the new leader as it binds every member.
  No gender on file is refused by the readiness rule, never with "genders do not match".
- [x] Refused with their own codes: a group that has ended, a relationship that is not a group, and a Person already in the group in either role.
- [x] Recorded as a ministry event of its own type naming the Admin, the Person and the group.
- [x] The group's participants are sent nothing.
  Whether its existing leaders are told is not in the spec: send them nothing here, and say so in a comment on this ticket so ticket 11's question covers it.
- Built later, at `69bbe9e`, once James had decided it: *Until they accept, the new leader is treated as any unaccepted leader already is*. See *28, stage 3* at the bottom of this file, and Comments, stage 2.
- [x] Cancelling or reissuing their invitation behaves as it does for a leader invited at formation.
- [x] The Roster shows the group on the new leader's Discipler row, marked as awaiting their acceptance.
- [x] Over HTTP: a Discipler who leads nobody is added to a running group, has a queued invitation, and the group's state is unchanged; a Discipler who already leads a group is refused; a Discipler with two one-to-ones and no group is accepted.

### Comments

#### Implementer, stage 1, 2026-09-20: three things for James

**1. An open Join Request for the same group is left open.**
The spec does not say what becomes of it, and the criterion asks for that to be said here before anything is chosen, so nothing was chosen: the command closes no item.
What happens is what already happens to a request from somebody who got in another way.
The request stays on Intake forms; **Admit** on it afterwards resolves the item, joins nobody a second time, texts nobody again, and the page says they were already in.
`tests/integration/an-admin-puts-somebody-into-a-group.test.ts` holds exactly that.
The two alternatives are yours to pick, and either is a small change to the one command:
resolve the request inside the same act, recorded with the Admin and named in the event; or refuse, and send the Admin to Intake forms to admit them.

**2. A group nobody has named is joined, and its Discipler is told *Sam just joined your group.***
Ticket 08 lists unnamed groups and ticket 25 offers them, labelled by their leaders, so refusing one would be the popup offering what the command refuses.
The message a self-join sends says the group's name, and a self-join never meets an unnamed group, so the words for this case did not exist.
*your group* is mine, and it goes to a real phone: reword it or tell me to refuse instead.
Only a group formed before groups carried names can be unnamed.

**3. "A leader who has not yet accepted is sent nothing" is now a rule of the message, not of this command.**
The text to a group's leaders is composed in one place for a self-join, an admission and this.
It now skips a leader whose own membership carries no Acceptance, which needed each member's `accepted_at` on the relationship snapshot.
Nothing changes for the two older paths today, because they only reach groups every leader has accepted.
It will matter after stage 2: a co-leader invited onto a running group is not texted about joiners until they accept, which is the stage 2 criterion *nothing but the invitation*.

Smaller, and decided:

- **The route is `POST /roster/pair/join`**, beside `pair/create` and not a branch inside it, with `personId`, `groupId` and `list`.
  Success is `/roster?list=…&joined=<personId>&told=yes|no`; a refusal is `/roster?list=…&pair=<personId>&groupId=<id>&error=<code>`, which is ticket 12's popup address plus the chosen group, for ticket 25 to reopen on.
  Stage 2's command goes behind the same route.
- **Refusals are a family of their own, `joining.*`** (`GroupJoinRefusal`): `group_not_found`, `group_has_ended`, `not_a_group`, `person_not_found`, `already_in_the_group`.
  Another Ministry's group or Person is *not found*, because on the command connection it is invisible and not merely unmatched.
  Intake, opting out and the declared gender stay the database's and arrive as the pairing codes they already are; `groupJoinRefusalMessage` in `app/roster/copy.ts` words them for this act, since *say it is mixed* is no fix when the group already said what it is.
- **No migration in stage 1.**
  The membership insert, the event and the text all existed; *both add a migration* turned out to be true of stage 2 only.
- **A test fixture was wrong and is fixed.**
  `formGroup` stamped a group accepted without its leader's own Acceptance, a state acceptance cannot produce.
  It now writes both, as `relationship.accept` does.

#### Implementer, stage 2, 2026-09-20: what is built, and one criterion left unticked on purpose

**Read this before ticket 26 gives the command a button.**

The command, the invitation, the refusals, the receipt and the route are built and tested.
What is not finished is *"until they accept, the new leader is treated as any unaccepted leader already is"*, and it is left unticked.

The ticket reads as if the product already knew what an unaccepted *leader* is.
It did not: it knew what an unaccepted *relationship* is.
Activation is the last leader accepting, so until this command a running relationship never had a leader on it who had not agreed, and almost nothing asks the membership.
This command creates the first one, and a sweep of every read that decides what a leader gets found them all gating on the relationship, or on nothing.

**Gated on the leader's own Acceptance in this stage**, because the criterion names them or another criterion needs them:

- **Check-ins.** `checkInFor` now reads a relationship as accepted *for this leader* only when the relationship and their own membership both are. The existing rule for a relationship awaiting acceptance (not asked about, no silence accrued) then covers them with no new rule.
- **The text that says a group is running again.** An Admin's resume skips a leader who has not accepted, and does not name them to the Disciples as somebody they are meeting with.
- **The text that says somebody joined** (stage 1).
- **Sending their link again.** Re-issuing reads the same snapshot the tick does, and that snapshot only held relationships nobody had activated, so for a co-leader on a running group it silently did nothing. It now also holds a running relationship with a leader still to answer. The tick shares it, so the clock had to be right the moment it widened: a relationship's two thresholds are now measured from `waitingSince`, which is formation for an unactivated relationship (unchanged) and when the leader was added for a running one. Without that, a co-leader added to a year-old group would have been reminded and escalated on the next tick.
- **The Roster.** `roster_page()` carries each membership's own `accepted_at` (this stage's migration), and the new leader's row reads *awaiting acceptance* while every other row of the group reads as running. The person page's **Send a new invitation** button hangs off the same fact, so it now shows for them.

**Not gated, and yours to decide, because each is a design choice the spec calls not designed yet.**
Until they are decided, an unaccepted co-leader on a running group:

1. **Sees the group on their Leader dashboard, with its Disciples' names and the numbers those Disciples agreed to share**, if they already hold an account (they lead a one-to-one, or they are an Admin). `app.leads_relationship`, `app.leads_person`, `relationships_page()` and `contact_to_share` ask only for an open leader membership. This is not new: a leader with an account who is invited to a *new* relationship sees it the same way today, before accepting. It is the one I would settle first.
2. **Can text PAUSE, RESUME or SWAP about the group.** `src/domain/keywords.ts` says in its own words that a keyword acts on the relationship and never on one leader's agreement to lead it, and SWAP on an unaccepted relationship is deliberately a decline. Whether a co-leader who has not agreed may pause a group is the same question from the other side.
3. **Is told when a leader's RESUME keyword restarts the group.** The keyword path's member projection carries no acceptance, by the same decision as 2.
4. **Is named as one of the group's leaders on the Admin's own surfaces**: Care Needed, the Overview, Check-Ins, the group lists on Intake forms and the Pair document, and the group Intake link's *led by*. None of these sends them anything.

**For ticket 11, found on the way:**

- **Accepting on a running group re-activates it.** `relationship.accept` decides `activatesRelationship` as *every other leader has accepted*, which is true for a co-leader on a running group. It would append a second `relationship.activated`, open a second Material period, and send the Starter Message to every leader and every Disciple again. The database only guards the column. Ticket 11's first two criteria are exactly this; it is said here because it is a text to real phones, and because ticket 26 waits on 22, 24 and 25 but not on 11.
- **The five-day item now raises for them**, which James answered yes to on 2026-09-20. Its usual answer, **Cancel**, is refused on a running group (`relationship.already_accepted`), so there is no way to withdraw an unanswered co-leader invitation short of ending the group. *Cancelling behaves as it does for a leader invited at formation* is true and tested for a group still awaiting its leader, where cancelling takes their membership with it; on a running group there was never anything to cancel at formation either.

Smaller, and decided:

- **`as=leader` on `POST /roster/pair/join`.** Absent is a Disciple; anything else the route does not know is refused (`joining.role_not_recognised`), so a misspelt value cannot put a Discipler into a group to be discipled. Success is `/roster?list=…&invited=<personId>`.
- ***{name} already leads a group* is `joining.already_leads_a_group`**, decided where `leader_one_open_group` is caught, since only the index sees their other relationships. `groupJoinRefusalMessage(code, fullName)` names them from the Roster, never from the address.
- **The group's existing leaders are sent nothing**, as James decided for ticket 11 on 2026-09-20.
- **A test fixture now gives a leader on an accepted relationship their own Acceptance** (`addMembership`), as `relationship.accept` does. Without it every seeded leader read as not having agreed the moment check-ins asked the membership.

## 23 - Who is greyed, and the popup from a Discipler: the list and one tick

**What to build:** The greying rule, set down once as a tested piece both sides of the popup use, and shown first on the Disciple's side: a Discipler who could not be chosen is greyed with the reason on the row, instead of being offered and then refused.
Then the popup opened as a Discipler: it lists Disciples with checkboxes, and ticking one and pressing **Create 1:1 pair** forms the one-to-one.

**Replaces:** *13 - Who is greyed for a Disciple* (stage 1) and *14 - The Pair popup, from a Discipler: the list and one tick* (stage 2), in the cut of 2026-09-20.
Every criterion of both is below, unchanged, with the one James added to 13 on 2026-09-20 out of ticket 12's Comments.
One section is new, *Two sides, two files*, and it is about where code lives and not about what an Admin sees.
Where another ticket says ticket 13 or ticket 14, it means this ticket; ticket 12's Comments say what it left for ticket 13.

**Was blocked by:** 12

**Touches:** popup-disciple, popup-discipler

**Status it carried:** ready-for-agent, and then it was built.

**Budget:** two sessions of 250k tokens each, one per stage: stage 1 ~100k (reads 30, writes 25, test runs 15, browser check 10, gate 20); stage 2 ~150k (reads 45, writes 35, test runs 20, browser check 20, gate 30).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line in either stage: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.

**Design source:** the plan's mock state A, for stage 2.

### Stages

This ticket is one branch and one review, built in two sessions.
A session does the first stage below that still has an unticked criterion, commits, reports and stops; the next session starts fresh on the same branch.
The review happens once, after stage 2.

### Why

A refusal that arrives after the click costs a round trip and teaches the Admin nothing they could not have been shown.
The rules are the database's own, so the screen shows them; it does not invent any.

### Stage 1 - Who is greyed for a Disciple

- [x] **Greying is computed against the declaration the shape implies, never against one person.**
  The rule takes a declaration (a gender, mixed, or none asked) and a candidate, and answers greyed-with-a-reason or open.
  It is pure, lives in one place, and is tested without a database.
- [x] A one-to-one is same-gender while the Ministry enforces the match.
  Disciplers of another gender are greyed with the reason in words.
- [x] Where the Ministry does not enforce the match, nobody is greyed for gender.
- [x] **Somebody with no gender on file is never greyed**, as the person opened from or as a candidate.
  Both database triggers return early on a null gender so that the readiness rules refuse the row with something the Admin can act on, and the screen shows the same restraint.
- [x] If this Disciple is already in a one-to-one, every Discipler is greyed with *Already in a 1:1 with {name}*.
  This is `participant_one_open_one_to_one`: one open one-to-one as a participant.
- [x] **A Discipler who has not completed Intake, or who has opted out, is greyed** with the words their Roster row already says, **Awaiting Intake** or **Opted out**.
  Decided by James on 2026-09-20, out of ticket 12's Comments: ticket 12 lists every Discipler and lets the database refuse these two after the click, which is the round trip this stage exists to remove.
  This reason is about the candidate and not about a declaration, so it is `whyNotPairable` and `CANNOT_BE_PAIRED` (`app/roster/lists.ts`, `app/roster/copy.ts`), reused and not written a second time, and it is said in place of a gender reason where both hold.
- [x] A greyed row cannot be chosen by mouse or keyboard, is announced as unavailable with its reason to a screen reader, and is never submitted.
- [x] A greyed row is shown, not hidden.
- [x] A choice restored from a refusal that is now greyed is not restored as chosen.
- [x] The database still refuses what it refused before; the greying removes no rule underneath.
- [x] Over HTTP: another-gender Discipler greyed in an enforcing Ministry and open in one that does not enforce; a null-gender Discipler open; every Discipler greyed for a Disciple already in a one-to-one; a Discipler who has not completed Intake, and one who has opted out, greyed with those words.
- [x] Looked at in a browser: the greyed treatment reads as unavailable and not as broken, and the reason fits on one line at phone width.

### Stage 2 - The popup, from a Discipler: the list and one tick

Built later, at `ab1f7e5` and `5149ec8`, under the number 29: see *29* at the bottom of this file.


### Comments

#### Implementer, stage 1, 2026-09-20: what was decided while building, for James to read once

Built straight through, as James asked on 2026-09-20; nothing here stopped the work.
Each is a small, reversible reading, with the alternative beside it.

**1. The gender reason is *Men's only: a 1:1 is same-gender*, the mock's sentence cut to fit.**
The ticket says *greyed with the reason in words* and gives no words for a one-to-one.
The popup mock (`.lavish/pair-popup/index.html`, the greyed Tom Wilson row) reads *Men's only: a one-on-one needs the same gender*.
Measured in the built popup at 390px, that wraps to two lines, and this stage's last criterion wants one.
The row has 214px for it: the mock's sentence needs more, *... a 1:1 needs the same gender* still wraps, and *Women's only: a 1:1 is same-gender*, the longer of the two, takes 184px.
So it keeps the mock's opening and says *1:1* as *Already in a 1:1 with* and **Create 1:1 pair** already do.
It names what the one-to-one declares and never what anybody's own gender is.
A reason naming somebody with a very long name (*Already in a 1:1 with Maximilian Featherstonehaugh*) still wraps; a name is not cut short to avoid that.

**2. "Already in a one-to-one" is read as one open relationship with one Disciple in it.**
The database's rule, `participant_one_open_one_to_one`, is on the relationship's kind.
The Roster's document carries no kind: the Roster says *group* from the live count of Disciples (ADR-0004), and the popup reads the same document.
The two disagree only for a group that has shrunk to one Disciple: the popup greys every Discipler for that Disciple, and the database would have allowed the one-to-one.
The alternative is a migration that puts the kind on the Roster's document; it is small, and it is a migration, so it was not taken unasked.

**3. With the popup open, the Roster reads the Pair document in place of its own.**
The popup has to know whether the Ministry enforces the gender match, and only `pair_page()` carries that.
`pair_page()` is `roster_page()` with three keys beside it, so reading it when `?pair=` is present is still one read, and no migration.
Without `?pair=` the Roster reads what it always read.

**4. A greyed row shows its reason where its email, phone and *leads N* would be.**
That is how the mock draws it: name, then the reason.
The name, the avatar and the round mark fade; the reason does not, because at the mock's half opacity the amber line falls under readable contrast, and it is the one thing on the row an Admin still needs.

**5. Ticket 12's refusal test changed, on purpose.**
It posted another-gender people and expected the choice back as chosen.
That choice is a greyed row now, and the criterion here says it is not restored, so the round trip asserts exactly that, and the restored-choice case is driven with a choice that is still open.

**6. Over HTTP, a Discipler with no gender on file reads *Awaiting Intake*, never open.**
`intake_submission.gender` is not null, and `app.current_gender` is null only where there has never been a submission.
So today the only Person with no gender on file has not completed Intake, and the criterion James added on 2026-09-20 greys them for that.
The two criteria meet like this: they are never greyed *for gender*, which the pure rule proves against every declaration (`tests/app/who-is-greyed.test.ts`), and over HTTP their row says **Awaiting Intake** and not a gender reason.
*A null-gender Discipler open* becomes reachable the day a form can be completed without a gender, and the rule is already right for it.

## 29 - The popup from a Discipler: the list and one tick (old ticket 23, stage 2)

**What to build:** The popup opened as a Discipler: it lists Disciples with checkboxes, and ticking one and pressing **Create 1:1 pair** forms the one-to-one.

**Replaces:** stage 2 of *23 - Who is greyed, and the popup from a Discipler: the list and one tick*, which was *14 - The Pair popup, from a Discipler: the list and one tick*.
Every criterion of it is below, unchanged.
Stage 1 of ticket 23, who is greyed for a Disciple, is committed (`9e7c5e0`, `b30fe81`, `7df285f`) and is in this file.
Read its Comments there before starting: six readings were made while building it, and the third, that the Roster reads the Pair document while the popup is open, is what this side stands on.
The rule this side greys with is `app/roster/greying.ts`, and code written for it says "Manual pairing, ticket 23".

**Was blocked by:** None - can start immediately.

**Status it carried:** ready-for-agent, and then it was built.

**Size:** ~150k tokens, one stage.
Build straight through (James, 2026-09-20): a gap in the ticket takes the conservative reading, written under Comments as a decision made, with its alternative beside it.
Stop only for a migration or a data change, for words sent to a real phone, or for removing a rule the database holds.

**Design source:** the plan's mock state A.

### Why

A refusal that arrives after the click costs a round trip and teaches the Admin nothing they could not have been shown.
The rules are the database's own, so the screen shows them; it does not invent any.

### Acceptance

#### Not linked yet

The Discipler's side is reachable by address (`/roster?pair=<personId>` on Disciplers or All) and no row opens it until ticket 32.
Discipler rows keep opening the old Pair page, which can already do everything.
That is what lets this side be built over three tickets without an Admin ever meeting a half-built control.

In this ticket, two or more ticked has no shape to become: the button stays disabled and a line says the choice of shape is coming.
Ticket 30 replaces that line with the toggle.

#### Two sides, two files

Added in the cut of 2026-09-20, when two tickets were to be open at the same time.
Nothing is built side by side now, and both criteria stand.

- [x] The Discipler's side is a component in a file of its own, beside the Disciple's side that ticket 12 built.
  What the two share (the backdrop, the head, the refusal, the ways out, a person's row) is one piece both use, not a copy in each.
- [x] After this ticket, work on one side of the popup edits that side's file and never the other's.

#### The list

- [x] Title **Pair {name}**, and beneath it one line saying who the list is for.
- [x] One row per Disciple who has completed Intake and not opted out: a checkbox, avatar initials, name, email and phone beneath with each missing detail simply absent.
- [x] Candidates are not filtered beyond that; everyone who could be paired is listed.
- [x] The first-time note the Pair page shows today is kept on the row.
- [x] A Disciple already in a group is listed, and the row names the group.
- [x] A Disciple already in a one-to-one is listed, and greyed with *Already in a 1:1 with {name}* while the shape would make a one-to-one, which in this ticket is always.
- [x] Other-gender Disciples are greyed through ticket 23's rule; no gender on file is never greyed.
- [x] A toolbar above the list counts it (*7 disciples*) and offers **Clear**, which unticks everything.
  There is no Select all.
- [x] Ticked rows take the selected treatment.
- [x] The list scrolls inside the popup; the title, the toolbar, the sentence and the buttons stay put.

#### One tick

- [x] Nothing ticked: no sentence, **Pair** disabled.
- [x] One ticked: *Claire Martinez will disciple Sam Lee in a one-on-one.* and **Create 1:1 pair**.
  Nothing else is asked: no gender, no name, no Material.
- [x] It posts to the pairing route and forms a one-to-one awaiting acceptance.
- [x] A refusal reopens the popup on the Discipler's side with the reason and the tick restored.

#### Opening side

- [x] Ticket 12's fallback is removed: a person who opens as a Discipler now gets this side.
- [x] The old Pair page and every link to it are untouched.

#### Checked

- [x] Over HTTP: the list's contents for a Ministry with a Disciple in a group, one in a one-to-one, one of another gender, one with no gender, one awaiting Intake and one opted out.
- [x] Looked at in a browser beside mock state A at desktop and phone width.

### Comments

#### Implementer, 2026-09-20: built already, as stage 2 of ticket 23

This ticket was cut out of ticket 23 while a session was already building ticket 23 straight through, both stages, as James had asked.
So it is built and committed, under ticket 23's name: `ab1f7e5` (who the list holds, how its rows are greyed, its words) and `5149ec8` (the two sides in two files, the popup from a Discipler, the route's refusal).
Code and tests written for it say "Manual pairing, ticket 23", which is what this ticket asks of them.
Nothing here is left to build; it needs its review and nothing else.

Checked: `npm run typecheck` clean; `tests/domain tests/app`, 69 files, 1263 tests; through `scripts/locked-tests.sh`, the two popup suites, `pairing-over-http`, `separate-one-to-ones-over-http`, `a-material-chosen-at-pairing-over-http`, the two Roster suites and `what-the-pair-screen-reads`, 8 files, 82 tests, none skipped.
Looked at in a browser beside mock state A at desktop width and at 390px: one tick, two ticks, a greyed box that will not tick, **Clear**, a restored tick scrolled into view, the list scrolling inside the popup, and every reason and the line for two ticks on one line.

#### What was decided while building

The numbering carries on from the six readings of stage 1, which are with ticket 23 in this file.

Same terms as stage 1: small, reversible readings, each with its alternative, and none stopped the work.

**7. *One row per Disciple* means the Roster's Disciples list.**
Somebody who is only a Discipler (leads, or offered to on the Intake form, and is discipled by nobody) is not on the list, exactly as the other side lists only Disciplers (`disciplersFor`, from ticket 12).
Somebody on both lists is on it.
The alternative is everybody who can be paired, which is what the old Pair page offers; that is one condition in `disciplesFor` (`app/roster/lists.ts`).

**8. The first-time note says what the Pair page says: *New to this*, *Has done this before*, and nothing where nobody asked.**
The mock's row reads *first time*; the criterion says the note the Pair page shows today is kept, and `firstTimeLabel` is that note, so it is reused and not reworded.

**9. A group nobody has named is said by who leads it: *in Grace Lee's group*.**
A named one is *in Grace's Group*, as the mock has it.
The groups come off the `groups` key the Pair document already carries, matched by membership, so no read is added.
Ticket 31 lists groups as rows of their own and owns how an unnamed one is labelled there; `PAIR_POPUP.inGroup` is there for it to reuse or replace.

**10. The line for two or more ticked reads *Pairing two or more at once is coming. Tick one for now.***
The ticket asks for a line saying the choice of shape is coming and gives no words.
The button is disabled as the server sends it, so it holds without script too.
Without script, two boxes can still be ticked and posted: the route refuses it as it refuses any group with no name and no declaration, nothing is formed, and the popup comes back with both ticks, this line and the disabled button.
Ticket 30 replaces the line with the toggle.

**11. A refusal from this side carries who was ticked as `with`.**
That is the name the old Pair page's refusals already use for ticked Disciples.
The person the popup is for is in the address once, as `pair`, and is not repeated as `leaderId`.
From a Disciple the address is what ticket 12 made it, unchanged.

**12. The list of boxes is a `fieldset`.**
`tests/domain/relationship-kind-fence.test.ts` forbids the literal `'group'` in app code, to keep relationship kind out of copy (ADR-0004), and an ARIA `role="group"` trips it.
A `fieldset` is that role natively, so the fence was left as it is.

**13. Two sides, two files.**
`app/roster/pair-popup.tsx` is what both share: the backdrop, the head, the refusal, the ways out and a person's row.
`app/roster/pair-popup-from-a-disciple.tsx` and `app/roster/pair-popup-from-a-discipler.tsx` are the sides.
`app/roster/page.tsx` renders whichever `opensAs` names, and is the one file both later tickets may still meet in, for the props each side is fed.

**14. A greyed row shows its reason and nothing else, so a greyed Disciple's group and first-time note are not on their row.**
Reading 4 of stage 1 said this of a Discipler's email, phone and *leads N*; on this side it also covers *New to this* and *in Grace's Group*.
It is how the mock draws a greyed row, name and then the reason, and it is `PairRow` in `app/roster/pair-popup.tsx`, shared by both sides.
A Disciple in a group who can be ticked names the group, which is the criterion; the alternative is a third line on a greyed row, under the reason.

**15. Over HTTP, the Disciple with no gender on file is not on the list.**
Reading 6 of stage 1 holds on this side too: no gender on file is somebody who has never completed Intake, and this side lists only Disciples who have.
So *one with no gender* and *one awaiting Intake* are one person in the over-HTTP check, and they are absent; *no gender on file is never greyed* is the pure rule's to prove, and it does.

#### For James: one thing that needs a migration, and so was not done

**"Already in a one-to-one" is read from the live count of Disciples, and for one rare relationship that is stricter than the database.**
This is reading 2 of stage 1, sharpened by the review.
The database's cap, `participant_one_open_one_to_one`, is on the relationship's kind, and ADR-0004 says in so many words that a group's last remaining Disciple may still join a one-to-one.
The Roster's document carries no kind, so the popup greys by one open relationship with one Disciple in it.
For a group that has shrunk to one Disciple, that Disciple's row is greyed with *Already in a 1:1 with {its Discipler}*, from both sides, and the database would have allowed the pairing.
The old Pair page still allows it, so nothing is unreachable, and it errs towards not offering, never towards a refusal after the click.
Making the popup exact needs the Roster's function to say, per relationship, whether it counts against that cap, which is a migration, and the reader in `src/platform` to carry it as a fact so that `app/` still never reads a kind (the fence in `tests/domain/relationship-kind-fence.test.ts`).
It is about twenty lines and one dropped-and-recreated function; say the word and it is a small ticket of its own.

**2026-09-20, done.**
James said a group that has fallen to one Disciple stays a group, and it was built with recut ticket 02: see its Comments, *a group of one is still a group, built*.

#### After the review, 2026-09-20

A standards review and a spec review read the six commits.
The spec review found every criterion met and no recorded reading against the ticket or the spec.
Fixed from the two of them:
a one-to-one that names nobody leading it left its rows open, and is now greyed as *Already in a 1:1*;
the two sides' greying rules were one body written twice, and are one rule (`greyedInAOneToOne`) behind the two names;
`enforced` became `genderMatchEnforced`, and three other vague names were replaced;
the group a row names is one type, `GroupOnARow`;
the helpers the two over-HTTP popup suites had each copied are in `tests/support/pair-popup.ts`;
the selected treatment and *no Select all* are asserted;
and two ticks posted without script are driven end to end, which is reading 10 pinned and the one refusal whose ticks honestly come back ticked.
Still looked at in a browser only, because the repository has no harness for client script: **Pair** disabled with nothing ticked, and **Clear**.

## 28, stage 3 - A co-leader who has not accepted yet (the last criterion of old ticket 22)

**Answered by James on 2026-09-20, and built: commit `69bbe9e`.**
All four points below were decided the same way: a leader membership gives its holder nothing until they have accepted it themselves.

- [x] Until they accept, the new leader is treated as any unaccepted leader already is: no check-ins, no care signals, nothing but the invitation.

#### What was decided and built

Two rules, which are not the same rule.

1. **What a leader is given always takes their own Acceptance.**
   `app.leads_relationship` and `app.leads_person`, which every leader policy stands on, ask for it, and so does `relationships_page()`.
   An unaccepted co-leader sees nothing of the group, its Disciples or their numbers.
   This also closes the older gap the first point named: a leader with an account, invited to a *new* relationship, no longer sees it before accepting.
   A leader who has accepted is not shown a co-leader who has not.
2. **Who a running relationship is said to be led by is only the leaders who have accepted; one nobody has activated names everyone it waits on.**
   Written once in SQL (`app.counts_as_leading`) and once in TypeScript (`countsAsLeading` in `src/domain/relationships.ts`).
   `history_inputs` carries each membership's own `accepted_at`, so Care Needed, the Overview and Check-Ins follow it, and so do the group lists on Intake forms, the Pair document's `leaders`, and the group Intake link's *led by*.
   `pair_groups.member_ids` still holds everybody, accepted or not, so the popup does not offer somebody a group they are already invited to lead.

By text: for whoever holds it, a relationship they lead and have not accepted reads as awaiting acceptance, so PAUSE and RESUME are refused by the rules that already refuse them there.
SWAP still reaches it, because from that state it is how a leader declines.
A keyword's messages neither reach an unaccepted leader of a running group nor name them.

The migration is `20261003000100_leading_begins_at_acceptance.sql`, and `CONTEXT.md`'s *Acceptance* and *Awaiting Leader Acceptance* say the rule.
Tests: `tests/domain/leading-begins-at-acceptance.test.ts`, and `tests/integration/leading-begins-at-acceptance.test.ts` against real sessions and the real policies.
The whole suite ran once on the result: 163 files, 2231 passed, 1 skipped.

Ticket 01 is still owed, and still matters before the co-leader button ships: accepting on a running group re-activates it.

#### The four points as they were asked, kept for the record

From ticket 22's Comments, stage 2.
What is gated on the leader's own Acceptance is committed: check-ins, the text that says a group is running again, the text that says somebody joined, sending their link again, and the Roster.

**Not gated, and yours to decide, because each is a design choice the spec calls not designed yet.**
Until they are decided, an unaccepted co-leader on a running group:

1. **Sees the group on their Leader dashboard, with its Disciples' names and the numbers those Disciples agreed to share**, if they already hold an account (they lead a one-to-one, or they are an Admin). `app.leads_relationship`, `app.leads_person`, `relationships_page()` and `contact_to_share` ask only for an open leader membership. This is not new: a leader with an account who is invited to a *new* relationship sees it the same way today, before accepting. It is the one I would settle first.
2. **Can text PAUSE, RESUME or SWAP about the group.** `src/domain/keywords.ts` says in its own words that a keyword acts on the relationship and never on one leader's agreement to lead it, and SWAP on an unaccepted relationship is deliberately a decline. Whether a co-leader who has not agreed may pause a group is the same question from the other side.
3. **Is told when a leader's RESUME keyword restarts the group.** The keyword path's member projection carries no acceptance, by the same decision as 2.
4. **Is named as one of the group's leaders on the Admin's own surfaces**: Care Needed, the Overview, Check-Ins, the group lists on Intake forms and the Pair document, and the group Intake link's *led by*. None of these sends them anything.
