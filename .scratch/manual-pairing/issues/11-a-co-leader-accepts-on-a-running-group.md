# 11 - A co-leader accepts on a group already running

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** What the Invitation Link's page shows, records and sends when the leader accepting was added to a group that has already started.

**Blocked by:** 10

**Status:** ready-for-agent

**Budget:** ~110k of 250k tokens (reads 40, writes 20, test runs 20, gate 25, overhead 5).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Decided by James, 2026-09-20

The spec says a Discipler added to a group "gets an invitation link the same way a mentor does when first paired, and accepts on it; the group keeps running meanwhile".
It does not say what acceptance sends when the group is already running.
Until now every Acceptance either activated the relationship, which sends the Starter Message, or waited for another leader.
These three were asked of James and answered on 2026-09-20.

1. When a co-leader accepts on a running group, is anything sent to the Disciples?
   **Nothing.**
   The Starter Message went out at activation, and a second one would introduce a relationship they are already in.
2. Are the group's existing leaders told, and if so when?
   **Nothing is sent to them by the product, neither when the Admin adds the co-leader nor when the co-leader accepts.**
   If they are to be told, somebody tells them by hand, outside the product.
   This ticket builds no message, button or notice for it.
3. If the co-leader declines, or never answers, is a Follow-Up Item raised as it is for a leader invited at formation?
   **Yes, the same item**, since it is the same unanswered invitation.

## Acceptance

- [ ] Accepting records the Acceptance on that leader's membership, timestamped, and nothing else about the group's history changes.
- [ ] The relationship's activation moment is not restamped, and the Starter Message is not sent again.
- [ ] Accepting on a running group sends nothing to the Disciples and nothing to the group's existing leaders.
  Adding the co-leader sends the existing leaders nothing either; the only message is the co-leader's own invitation.
- [ ] The invitation page shows who they would be leading and who they would be leading with, before they accept.
- [ ] From acceptance on, the co-leader is treated as a group formed with two leaders already treats its second leader.
  This ticket designs nothing new for check-ins or care signals.
- [ ] A group that was still awaiting its first leader activates only when both have accepted, and sends one Starter Message.
- [ ] Declining, and an invitation nobody answers, raise the same Follow-Up Item as they do for a leader invited at formation.
- [ ] Integration tests cover: acceptance on a running group, on a paused group, on a group still awaiting its first leader (in both orders), a declined invitation, and that no message goes to a Disciple or to an existing leader in any of them.
