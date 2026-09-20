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

- [x] An Admin command names a group and a Person, and the Person gains an open leader membership on the group with no Acceptance recorded.
- [x] They are issued an Invitation Link and sent it, the same way a mentor is when first paired.
- [x] **The group keeps running.**
  A group already accepted stays in the state it was in; adding a leader never moves it back to Awaiting Leader Acceptance.
- [x] A group still awaiting its leader now waits for this leader too: it activates when every open leader membership carries an Acceptance, as `CONTEXT.md` already defines Acceptance.
- [x] `leader_one_open_group` stands.
  A Discipler who already leads an open group is refused with a code and wording of their own (*{name} already leads a group*), decided at the boundary, never surfaced as a database error.
- [x] The group's declared gender binds the new leader as it binds every member.
  No gender on file is refused by the readiness rule, never with "genders do not match".
- [x] Refused with their own codes: a group that has ended, a relationship that is not a group, and a Person already in the group in either role.
- [x] Recorded as a ministry event of its own type naming the Admin, the Person and the group.
- [x] The group's participants are sent nothing.
  Whether its existing leaders are told is not in the spec: send them nothing here, and say so in a comment on this ticket so ticket 11's question covers it.
- [ ] Until they accept, the new leader is treated as any unaccepted leader already is: no check-ins, no care signals, nothing but the invitation.
  **Not ticked.** Check-ins, the joined and resumed texts, re-inviting and the Roster ask the leader's own Acceptance now; what they see on their dashboard and may do by keyword does not, and is a decision for James. See Comments, stage 2.
- [x] Cancelling or reissuing their invitation behaves as it does for a leader invited at formation.
- [x] The Roster shows the group on the new leader's Discipler row, marked as awaiting their acceptance.
- [x] Over HTTP: a Discipler who leads nobody is added to a running group, has a queued invitation, and the group's state is unchanged; a Discipler who already leads a group is refused; a Discipler with two one-to-ones and no group is accepted.

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

### Implementer, stage 2, 2026-09-20: what is built, and one criterion left unticked on purpose

**Read this before ticket 26 gives the command a button.**

The command, the invitation, the refusals, the receipt and the route are built and tested.
What is not finished is *"until they accept, the new leader is treated as any unaccepted leader already is"*, and it is left unticked.

The ticket reads as if the product already knew what an unaccepted *leader* is.
It did not: it knew what an unaccepted *relationship* is.
Activation is the last leader accepting, so until this command a running relationship never had a leader on it who had not agreed, and almost nothing asks the membership.
This command creates the first one, and a sweep of every read that decides what a leader gets found them all gating on the relationship, or on nothing.

**Gated on the leader's own Acceptance in this stage**, because the criterion names them or another criterion needs them:

- **Check-ins.** `checkInFor` now reads a relationship as accepted *for this leader* only when the relationship and their own membership both are. The existing rule for a relationship awaiting acceptance (not asked about, no silence accrued) then covers them with no new rule.
- **The text that says a group is running again.** An Admin's resume skips a leader who has not accepted, and does not name them to the Disciples as somebody they are meeting with.
- **The text that says somebody joined** (stage 1).
- **Sending their link again.** Re-issuing reads the same snapshot the tick does, and that snapshot only held relationships nobody had activated, so for a co-leader on a running group it silently did nothing. It now also holds a running relationship with a leader still to answer. The tick shares it, so the clock had to be right the moment it widened: a relationship's two thresholds are now measured from `waitingSince`, which is formation for an unactivated relationship (unchanged) and when the leader was added for a running one. Without that, a co-leader added to a year-old group would have been reminded and escalated on the next tick.
- **The Roster.** `roster_page()` carries each membership's own `accepted_at` (this stage's migration), and the new leader's row reads *awaiting acceptance* while every other row of the group reads as running. The person page's **Send a new invitation** button hangs off the same fact, so it now shows for them.

**Not gated, and yours to decide, because each is a design choice the spec calls not designed yet.**
Until they are decided, an unaccepted co-leader on a running group:

1. **Sees the group on their Leader dashboard, with its Disciples' names and the numbers those Disciples agreed to share**, if they already hold an account (they lead a one-to-one, or they are an Admin). `app.leads_relationship`, `app.leads_person`, `relationships_page()` and `contact_to_share` ask only for an open leader membership. This is not new: a leader with an account who is invited to a *new* relationship sees it the same way today, before accepting. It is the one I would settle first.
2. **Can text PAUSE, RESUME or SWAP about the group.** `src/domain/keywords.ts` says in its own words that a keyword acts on the relationship and never on one leader's agreement to lead it, and SWAP on an unaccepted relationship is deliberately a decline. Whether a co-leader who has not agreed may pause a group is the same question from the other side.
3. **Is told when a leader's RESUME keyword restarts the group.** The keyword path's member projection carries no acceptance, by the same decision as 2.
4. **Is named as one of the group's leaders on the Admin's own surfaces**: Care Needed, the Overview, Check-Ins, the group lists on Intake forms and the Pair document, and the group Intake link's *led by*. None of these sends them anything.

**For ticket 11, found on the way:**

- **Accepting on a running group re-activates it.** `relationship.accept` decides `activatesRelationship` as *every other leader has accepted*, which is true for a co-leader on a running group. It would append a second `relationship.activated`, open a second Material period, and send the Starter Message to every leader and every Disciple again. The database only guards the column. Ticket 11's first two criteria are exactly this; it is said here because it is a text to real phones, and because ticket 26 waits on 22, 24 and 25 but not on 11.
- **The five-day item now raises for them**, which James answered yes to on 2026-09-20. Its usual answer, **Cancel**, is refused on a running group (`relationship.already_accepted`), so there is no way to withdraw an unanswered co-leader invitation short of ending the group. *Cancelling behaves as it does for a leader invited at formation* is true and tested for a group still awaiting its leader, where cancelling takes their membership with it; on a running group there was never anything to cancel at formation either.

Smaller, and decided:

- **`as=leader` on `POST /roster/pair/join`.** Absent is a Disciple; anything else the route does not know is refused (`joining.role_not_recognised`), so a misspelt value cannot put a Discipler into a group to be discipled. Success is `/roster?list=…&invited=<personId>`.
- ***{name} already leads a group* is `joining.already_leads_a_group`**, decided where `leader_one_open_group` is caught, since only the index sees their other relationships. `groupJoinRefusalMessage(code, fullName)` names them from the Roster, never from the address.
- **The group's existing leaders are sent nothing**, as James decided for ticket 11 on 2026-09-20.
- **A test fixture now gives a leader on an accepted relationship their own Acceptance** (`addMembership`), as `relationship.accept` does. Without it every seeded leader read as not having agreed the moment check-ins asked the membership.
