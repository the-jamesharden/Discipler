# 03 - A pairing checked without being formed

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** A way to ask the domain whether forming a relationship would be refused, that cannot write.
Nothing an Admin can see changes.
This is the prefactor that lets ticket 04 promise all or nothing across several one-to-ones without keeping a second copy of the pairing rules.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Budget:** ~130k of 250k tokens (reads 45, writes 25, test runs 20, gate 30, overhead 10).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

The spec's rule: there is no batch command, `CommandService.execute` takes one command, so N × 1:1 pairs is N transactions, and the set is validated through the boundary before any is formed.
A route that re-implemented the gender rule or the Intake rule to pre-check a set would be the fence break ADR-0004 exists to stop.
So the check has to be the same decision formation makes, stopped before its effects are applied.

## Acceptance

- [x] The command service can be asked to check a `relationship.create` command, and answers with the same `PairingRefusal` formation would have thrown, or with nothing when formation would have gone ahead.
- [x] The check runs the same boundary decision formation runs, against the same context, read the same way.
  There is one copy of every pairing rule after this ticket, as there was before it.
- [x] The check cannot write: no relationship, membership, invitation, history event or outbound message exists after it, whatever it answered.
  A test proves this against the database and not only against a fake store.
- [x] Checking and then forming the same command gives the same answer both times, for a command that passes and for each refusal the pairing suites already cover (gender, Intake not completed, opted out, a Material the Ministry does not hold, an unnamed group, an undeclared group).
- [x] Only `relationship.create` can be checked.
  This is not a general dry-run for every command, and nothing else gains one here.
- [x] Formation itself is untouched: the existing pairing suites pass without edits.

## Notes for whoever picks this up

Rules that live only in the database (the partial unique indexes, the two gender triggers) are enforced on write and the check will not see them unless the boundary already mirrors them.
List on this ticket any refusal the database can raise that the check cannot predict.
Ticket 04 has to report those honestly when they happen partway through a set, and needs the list.

## Comments

### Implementer, 2026-09-19: the check forms the relationship and rolls it back

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

### Implementer, 2026-09-19: what the check cannot predict (for ticket 04)

At the moment it runs, nothing.
Every `PairingRefusal` the database can raise on formation, the check raises too, because it performs the same writes.
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

### Implementer, 2026-09-19: the rollback design was approved, and has an ADR

A two-axis review of `integration/manual-pairing...HEAD` found nothing implemented wrong, and said two things plainly.
Building form-and-rollback against the ticket's *Why* was not the implementer's call to make without asking first, and a decision this surprising had no ADR.
Both were right.
James approved the design on 2026-09-19, and it is recorded as `docs/adr/0025-a-pairing-is-checked-by-forming-it-and-rolling-back.md`.
The number skips 0024 because a parked branch, `the-admin-dashboard-may-use-script`, already holds it.

The same review found that the database test counted rows and so could not see an UPDATE, which left the closing of an imported plan proved only against the fake store.
The integration suite now checks a pairing that would close an open `intended_pairing`, finds the plan still open afterwards, and finds it closed once the same pairing is formed.

### Implementer, 2026-09-19: two corrections to the comments above, from a second review

**`relationship.person_belongs_to_another_ministry` is answered for a Disciple only.**
The list above says the check raises it, and for a Discipler that is wrong.
A Discipler the connection cannot see (another Ministry's, or an id that names nobody) is not returned by `contactsFor`, so `whoIs` in `src/domain/boundary.ts` throws a plain `Error` while the invitation is being composed, before any membership row is written and before `relationship_member_person_fk` can fire.
`checkPairing` rethrows it, exactly as `execute` does.
Ticket 04 should expect a thrown `Error`, not a refusal, for a Discipler id that is not this Ministry's.

**A check can deadlock with a real formation, in one narrow shape.**
Membership rows are inserted one at a time in the order the command names people, and a check takes the same unique-index locks a formation takes.
Two transactions that contend on two keys in opposite orders deadlock, and Postgres kills one of them with `40P01`, which nothing translates.
That needs two co-led groups naming the same two Disciplers in opposite orders at the same moment, contending on `leader_one_open_group`.
It cannot happen for several one-to-ones under one Discipler, which is ticket 04's case: each of those contends on one key only, the Disciple's.
Two real formations could always deadlock this way; what is new is that one of the two can now be a check, which was going to roll back anyway.
Not fixed here.
The fix is to insert a relationship's members in one fixed order in `createRelationship`, which changes formation's own store and so is not this ticket's to make without being asked.

