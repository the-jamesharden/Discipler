# 04 - Separate 1:1 pairs in one submission

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** One Discipler and several Disciples forming several one-to-ones rather than one group, all of them or none.
Invisible: the pairing route learns the mode, and the popup's **N × 1:1 pairs** segment (ticket 15) will post it.

**Blocked by:** 03

**Status:** ready-for-agent

**Budget:** ~160k of 250k tokens (reads 45, writes 35, test runs 30, gate 35, overhead 15).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

Without it, an Admin pairing a Discipler with four people works the screen four times.
Partial formation is not a lesser outcome here, it is the bad one: the Admin cannot see what landed without leaving the screen, and nothing on the screen un-forms a relationship.

A Material per Disciple is ticket 05.
In this ticket a separate submission forms every one-to-one with no Material.

## Acceptance

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
