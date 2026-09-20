# 21 - Separate one-to-ones in one submission, with a Material each

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** One Discipler and several Disciples forming several one-to-ones rather than one group, all of them or none, and each Disciple carrying their own Material choice.
Invisible: the pairing route learns the mode and the per-Disciple Material, and the popup's **N × 1:1 pairs** segment (ticket 24) will post both.

**Replaces:** *04 - Separate one-to-ones in one submission* (stage 1) and *05 - A Material per Disciple in a separate submission* (stage 2), in the cut of 2026-09-20.
Every criterion of both is below, unchanged.
Finished tickets still say the old numbers: where ticket 03 says ticket 04 or ticket 05, it means this ticket.
Read ticket 03's Comments before starting, from *what the check cannot predict (for ticket 04)* to the end; they were written for the session that builds this.

**Blocked by:** 03

**Status:** ready-for-agent

**Budget:** two sessions of 250k tokens each, one per stage: stage 1 ~160k (reads 45, writes 35, test runs 30, gate 35, overhead 15); stage 2 ~90k (reads 30, writes 20, test runs 15, gate 20, overhead 5).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line in either stage: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.

## Stages

This ticket is one branch and one review, built in two sessions.
A session does the first stage below that still has an unticked criterion, commits, reports and stops; the next session starts fresh on the same branch.
The review happens once, after stage 2.

## Why

Without it, an Admin pairing a Discipler with four people works the screen four times.
Partial formation is not a lesser outcome here, it is the bad one: the Admin cannot see what landed without leaving the screen, and nothing on the screen un-forms a relationship.

James asked for the Material to be asked per person when pairing separately (mock state C).
A Discipler meeting two people apart is often reading different things with each.
Ticket 02 already holds one intended Material on a relationship; stage 2 lets a set of relationships each hold a different one.

## Stage 1 - Separate one-to-ones, all or none

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

## Stage 2 - A Material per Disciple

In `separate` mode, each Disciple carries their own Material choice, held as an intention on their one-to-one and spent at acceptance.
The popup's per-Disciple dropdowns are ticket 24.

- [ ] A `separate` submission can name a Material for each Disciple, and each one-to-one formed holds the Material named for its own Disciple.
- [ ] A Disciple with no Material named gets none.
  No material is the default, and one Disciple's choice never spills onto another.
- [ ] A Material named for somebody who is not among the submitted Disciples is ignored rather than refused.
- [ ] A Material the Ministry does not hold, or one that has been removed, refuses the whole set through ticket 03's check, and the refusal names the Disciple it was chosen for.
- [ ] A refusal returns every Disciple's Material choice with the rest of the selection.
- [ ] `together` mode still takes the single Material ticket 02 gave it, and ignores any per-Disciple choice.
- [ ] Over HTTP: a Discipler and two Disciples, a different Material each, produce two one-to-ones; accepting each writes that Disciple's Material into its history, as ticket 02 does for one.

## Comments

### Implementer, 2026-09-20: stage 1 is built, and four things in it were mine to choose

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
