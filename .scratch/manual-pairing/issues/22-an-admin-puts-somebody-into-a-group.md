# 22 - An Admin puts somebody into a group: a Disciple, and a Discipler as co-leader

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The Admin's own way into an existing group, for both kinds of person.
A Disciple is chosen and is in it at once; a Discipler joins as another leader, by invitation, and the group carries on meanwhile.
Invisible: two commands behind one route, which the popup's **Add to group** button (ticket 25) and **Add as co-leader** button (ticket 26) will post to.
What happens when a co-leader accepts is ticket 11.

**Replaces:** *09 - A Disciple put into a group* (stage 1) and *10 - An Admin adds a Discipler to a group as co-leader* (stage 2), in the cut of 2026-09-20.
Every criterion of both is below, unchanged.
Where another ticket says ticket 09 or ticket 10, it means this ticket.
Both add a migration, and keeping them on one branch keeps the effort's migrations in one chain.

**Blocked by:** 08

**Status:** ready-for-agent

**Budget:** two sessions of 250k tokens each, one per stage: stage 1 ~150k (reads 50, writes 30, test runs 25, gate 35, overhead 10); stage 2 ~170k (reads 55, writes 35, test runs 30, gate 40, overhead 10).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line in either stage: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.

## Stages

This ticket is one branch and one review, built in two sessions.
A session does the first stage below that still has an unticked criterion, commits, reports and stops; the next session starts fresh on the same branch.
The review happens once, after stage 2.

## Why

Today a group is joined only through the Intake form or an admitted Join Request.
A pastor who knows where somebody belongs has to send them a form to say so.

Admitting a Join Request already adds a Participant to a running group and texts its leaders.
Stage 1 is the same act without a request behind it, so it should reuse that path rather than grow beside it.

Until now leader memberships were written at formation and never again.
Stage 2 is the first path that adds a leader to a relationship that already exists, as joining a group was the first that added a participant.

Decided on 2026-09-19: a group can have more than one leader, and a Discipler can lead or co-lead more than one group.
How that works on screen and for check-ins is **not designed yet**, so stage 2 is written against the current limit and lifts nothing.

## Stage 1 - A Disciple put into a group

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

## Stage 2 - A Discipler added as co-leader

A command behind the same route as stage 1.

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

## Comments

### Implementer, stage 1, 2026-09-20: three things for James

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
