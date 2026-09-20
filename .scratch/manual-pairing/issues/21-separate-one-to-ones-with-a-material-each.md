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

- [ ] The pairing route accepts `mode`, one of `together` and `separate`.
  Absent, or anything else, reads as `together`, which is today's behaviour unchanged.
- [ ] `separate` is refused unless there is exactly one Discipler and two or more Disciples, with its own `PairingRefusal` code and wording.
  One Disciple is a one-to-one and needs no mode.
  Several Disciplers cannot be split into pairs without deciding who goes with whom, which the screen does not ask.
- [ ] **All or nothing.**
  Every pairing in the set is checked through ticket 03's check before any is formed.
  A set where any one would be refused forms none.
- [ ] A refusal names the Disciple it is about, and returns the Admin to where they submitted from with the whole selection and `mode` intact.
- [ ] The group's properties (declared gender, name) are dropped in `separate` mode rather than applied to each pairing.
  A one-to-one has nothing a name is for, and its gender is implied by its two people.
- [ ] Where the set passes the check and a write still fails partway, the response says plainly how many were formed and which were not.
  It never reports four when two landed.
- [ ] The receipt counts relationships formed, so the Roster's receipt reads correctly for a set.
- [ ] Over HTTP: one Discipler and three Disciples in `separate` mode produce three one-to-ones, each awaiting acceptance, each visible on both Roster rows.
- [ ] Over HTTP: the same submission where one Disciple is of another gender, in a Ministry that enforces the match, produces zero relationships and a refusal naming that person.
- [ ] Over HTTP: `separate` with one Disciple is refused, and `separate` with two Disciplers is refused.
- [ ] `together` mode's existing integration tests pass untouched.

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
