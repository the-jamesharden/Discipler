# 10 - An Admin adds a Discipler to a group as co-leader

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** A Discipler joining an existing group as another leader: the membership, the invitation, and the group carrying on meanwhile.
Invisible: a command behind the same route as ticket 09, which the popup's **Add as co-leader** button (ticket 19) will post to.
What happens when they accept is ticket 11.

**Blocked by:** 09

**Status:** ready-for-agent

**Budget:** ~170k of 250k tokens (reads 55, writes 35, test runs 30, gate 40, overhead 10).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

Until now leader memberships were written at formation and never again.
This is the first path that adds a leader to a relationship that already exists, as joining a group was the first that added a participant.

Decided on 2026-09-19: a group can have more than one leader, and a Discipler can lead or co-lead more than one group.
How that works on screen and for check-ins is **not designed yet**, so this ticket is written against the current limit and lifts nothing.

## Acceptance

- [ ] An Admin command names a group and a Person, and the Person gains an open leader membership on the group with no Acceptance recorded.
- [ ] They are issued an Invitation Link and sent it, the same way a mentor is when first paired.
- [ ] **The group keeps running.**
  A group already accepted stays in the state it was in; adding a leader never moves it back to Awaiting Leader Acceptance.
- [ ] A group still awaiting its leader now waits for this leader too: it activates when every open leader membership carries an Acceptance, as `CONTEXT.md` already defines Acceptance.
- [ ] `leader_one_open_group` stands.
  A Discipler who already leads an open group is refused with a code and wording of their own (*{name} already leads a group*), decided at the boundary, never surfaced as a database error.
- [ ] The group's declared gender binds the new leader as it binds every member.
  No gender on file is refused by the readiness rule, never with "genders do not match".
- [ ] Refused with their own codes: a group that has ended, a relationship that is not a group, and a Person already in the group in either role.
- [ ] Recorded as a ministry event of its own type naming the Admin, the Person and the group.
- [ ] The group's participants are sent nothing.
  Whether its existing leaders are told is not in the spec: send them nothing here, and say so in a comment on this ticket so ticket 11's question covers it.
- [ ] Until they accept, the new leader is treated as any unaccepted leader already is: no check-ins, no care signals, nothing but the invitation.
- [ ] Cancelling or reissuing their invitation behaves as it does for a leader invited at formation.
- [ ] The Roster shows the group on the new leader's Discipler row, marked as awaiting their acceptance.
- [ ] Over HTTP: a Discipler who leads nobody is added to a running group, has a queued invitation, and the group's state is unchanged; a Discipler who already leads a group is refused; a Discipler with two one-to-ones and no group is accepted.
