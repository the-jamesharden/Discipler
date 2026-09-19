# 19 - Groups in the popup, from a Discipler

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** Under the Disciples, a **Groups** heading and the Ministry's groups.
Choosing one and pressing **Add as co-leader** adds the Discipler to it as another leader, by invitation.

**Blocked by:** 10, 17

**Touches:** popup

**Status:** ready-for-agent

**Budget:** ~140k of 250k tokens (reads 45, writes 30, test runs 20, browser check 20, gate 25).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

**Design source:** the plan's mock state G.

This ticket does not wait on ticket 11.
Adding a co-leader works from ticket 10 on; what their acceptance sends is a separate question with its own ticket.

## Acceptance

### The rows

- [ ] A **Groups** heading below the Disciples, then one row per group from ticket 08's read, with a round mark.
- [ ] Rows read as ticket 18's do: name, leaders, how many Disciples, declared gender, state when not running, and an unnamed group labelled by its leaders.
  If ticket 18 has landed, its row is reused; if not, this ticket builds it for both.
- [ ] A group this Discipler is already in, in either role, is not listed.
- [ ] The toolbar counts both: *7 disciples · 3 groups*.

### One thing at a time

- [ ] Ticking a Disciple clears a chosen group, and choosing a group clears every tick.
- [ ] With a group chosen, the shape toggle, the gender toggle, the name and every Material dropdown are hidden.
- [ ] **Clear** clears a chosen group as well as the ticks.

### Greying

- [ ] A group whose declaration rules this Discipler out is greyed with it (*A men's group*).
- [ ] A Discipler who already leads a group sees **every group row** greyed with *{name} already leads a group*, beside the 1:2 and Group shapes that tickets 15 and 17 already grey.
  `leader_one_open_group` stands, and nothing here decides how it is lifted.
- [ ] No gender on file is never greyed.

### Sentence, button, submit

- [ ] *Claire Martinez will co-lead Grace's Group with Grace Lee.* **Add as co-leader**.
  Several existing leaders are all named.
- [ ] It posts to ticket 10's route.
  The Roster's receipt says an invitation was sent and that the group carries on meanwhile; it does not say Claire leads it yet.
- [ ] A refusal reopens the popup with the reason and the chosen group restored.

### Checked

- [ ] Over HTTP: the Groups section for a Discipler who leads nobody and for one who already leads a group; the co-leader round trip; a refusal restored.
- [ ] Looked at in a browser beside mock state G, scrolled to the bottom of the list, at desktop and phone width.
