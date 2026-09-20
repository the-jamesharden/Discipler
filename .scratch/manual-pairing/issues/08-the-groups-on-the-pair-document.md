# 08 - The Ministry's groups on the Pair document

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The groups an Admin could put somebody into, on the document the Pair screen already reads.
No UI changes, as ticket 01 was.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Budget:** ~110k of 250k tokens (reads 40, writes 25, test runs 15, gate 25, overhead 5).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

Tickets 18 and 19 list groups at the bottom of the popup and grey the ones a person cannot join.
The Pair document carries candidates, genders, the gender-match setting and Materials, and nothing about groups.
The read that feeds the Intake form's group dropdown is not this one: that lists accepted, named groups only, for somebody with no session.

## Acceptance

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

## Comments

### Orchestrator, 2026-09-20: what the implementing session cost

Read from the session's transcript, as the context the session was carrying, which is what the 250k limit is a limit on.

- Estimate on the **Budget** line: ~130k.
- At the first commit, with the ticket built and not yet reviewed: 196k.
- At its peak: 343k, because the same session went on to answer the review and the conversations with James, which `docs/agents/workflow.md` gives to a fresh fixer session.
- The session stood at 51k before it had read the ticket: the system prompt, the tool and skill lists, `CLAUDE.md` and memory.

Across tickets 03, 06 and 08 the build alone came to between 1.3 and 1.8 times the estimate.
The tickets cut on 2026-09-20 (21 to 27) keep the old estimates per stage and say so beside them.
