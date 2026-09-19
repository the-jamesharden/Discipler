# 09 - An Admin puts a Disciple into an existing group

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The Admin's own way into a group for a Disciple: chosen, and in it at once.
Invisible: a command and a route the popup's **Add to group** button (ticket 18) will post to.

**Blocked by:** 08

**Status:** ready-for-agent

**Budget:** ~150k of 250k tokens (reads 50, writes 30, test runs 25, gate 35, overhead 10).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

Today a group is joined only through the Intake form or an admitted Join Request.
A pastor who knows where somebody belongs has to send them a form to say so.

Admitting a Join Request already adds a Participant to a running group and texts its leaders.
This is the same act without a request behind it, so it should reuse that path rather than grow beside it.

## Acceptance

- [ ] An Admin command names a group and a Person, and the Person becomes a participant of the group straight away.
  Disciples never accept anything, and nothing is sent to them.
- [ ] Every group ticket 08 lists can be joined: running, paused, or still awaiting its leader.
- [ ] The same rules as forming a group apply, and each refusal is a code with wording an Admin can act on: Intake not completed, opted out, the group's declared gender.
  Somebody with no gender on file is refused by the readiness rule, never with "genders do not match".
- [ ] Refused with their own codes: a group that has ended, a relationship that is not a group, a Person already in the group in either role, and a group or Person of another Ministry.
- [ ] The group's leaders are texted that somebody has joined, with the message a self-join already sends.
  A leader who has not yet accepted is sent nothing, as Awaiting Leader Acceptance requires.
- [ ] Recorded as a ministry event of its own type naming the Admin, the Person and the group.
  It is not the self-join's event and not the admission's: who acted is the event's type, not a flag on it.
- [ ] A Person already in a one-to-one can still be put into a group; a Person can be in any number of groups.
- [ ] The group keeps its Material, its name, its declaration and its state.
- [ ] Putting somebody into a group does not close an open Join Request of theirs for that group silently.
  If one is open, say on this ticket what happens to it before choosing; the spec does not say.
- [ ] The route is an ordinary form post that works without script, redirects to the Roster with a receipt on success, and on refusal returns to where the Admin submitted from with the chosen group and the reason.
- [ ] Over HTTP: a ready Disciple joins a running group and appears on both Roster rows; the leader has a queued text; a Disciple of another gender is refused by a men's group and joins a mixed one; an ended group is refused.
