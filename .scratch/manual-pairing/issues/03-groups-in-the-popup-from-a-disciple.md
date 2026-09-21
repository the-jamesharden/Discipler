# 03 - Groups in the popup, from a Disciple

**What to build:** Under the Disciplers, a **Groups** heading and the Ministry's groups.
Choosing one and pressing **Add to group** puts the Disciple straight into it.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Old tickets:** this is old ticket 25, whole; none of it is committed.
Every criterion is below, unchanged, and one is added: *An open Join Request*, decided by James on 2026-09-20.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `07-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".
Old ticket 08, in `07-committed-already.md`, says what its read leaves to the popup.
Old ticket 22's Comments, in the same file, give the address a refused join returns to, `/roster?list=…&pair=<personId>&groupId=<id>&error=<code>`, which is what this reopens on.

**Design source:** the plan's mock state H.

## Acceptance

### The rows

- [ ] A **Groups** heading below the Disciplers, then one row per group from old ticket 08's read, listed like people.
- [ ] Each row gives the group's name, its leaders, how many Disciples it has, its declared gender, and its state when it is not running (paused, awaiting its leader).
- [ ] A group with no name is labelled by its leaders' names, which is how the Roster's Paired with cell already names a pairing.
- [ ] A group this Disciple is already in is not listed.
- [ ] A Ministry with no groups shows no heading.
- [ ] The line under the title counts both: *4 disciplers · 3 groups*.
- [ ] The group row is a component in a file of its own, not part of the Disciple's side, so ticket 04 lists groups with it and edits neither.

### One choice

- [ ] Exactly one choice across both sections: round marks throughout.
  Choosing a group clears a chosen Discipler, and the other way round.
- [ ] Nothing else is asked.
  The group keeps the Material it has.

### Greying

- [ ] A group whose declaration rules this Disciple out is greyed with it (*A men's group*), through old ticket 23's rule with the group's own declaration.
- [ ] A Coed group greys nobody, and a Disciple with no gender on file is never greyed.
- [ ] If this Disciple is already in a one-to-one, every Discipler is greyed and **the groups stay open**.

### Sentence, button, submit

- [ ] *Sam Lee will join Thursday Table, led by David Chen.* **Add to group**.
  Several leaders are all named.
- [ ] It posts to old ticket 22's route; the Disciple is in the group at once, and the Roster's receipt says so.
- [ ] A refusal reopens the popup with the reason and the chosen group restored.

### An open Join Request

- [ ] Putting somebody into a group they have an open Join Request for resolves that request in the same act, as an admitted request ends, so it leaves Intake forms.
  There is no second membership.
  Nothing is sent and nothing is shown for it: the group's leaders get the one text a join already sends and no other, and the Disciple gets nothing.
  The resolution is recorded in the Ministry's history, naming the Admin.
  A request of theirs for a different group is left as it is.
  Decided by James on 2026-09-20; see Comments.

### Checked

- [ ] Over HTTP: the Groups section's contents for a Disciple already in one of three groups; a men's group greyed for a woman; the join round trip; a refusal restored.
- [ ] Looked at in a browser beside mock state H, scrolled to the bottom of the list, at desktop and phone width.

## Comments

### Answered by James, 2026-09-20

Both questions carried from old ticket 22's first stage are answered, and nothing in this ticket waits on James any more.

**1. An open Join Request for the same group is resolved by the same act, silently.**
When an Admin puts somebody into a group they have an open Join Request for, the request is resolved as accepted.
There is no second membership, and no message is sent to anyone.
This replaces what the command does today, which leaves the request open on Intake forms, so the test that holds that behaviour changes with it.
It is built with this ticket, because **Add to group** is what puts the command in an Admin's hands.
Its criterion is under *An open Join Request*, above.

Three readings were taken in writing this down, and James confirmed all three on 2026-09-20:

- "Accepted" is what the product calls admitting a Join Request, so the request ends the way an admitted one does and leaves Intake forms.
- "No message" is about the request.
  The one text the group's leaders already get when somebody joins is unchanged, because the join is still a join; resolving the request adds no message and removes none.
- "Silently" means nothing is sent and nothing is shown for it.
  The resolution is still recorded in the Ministry's history, naming the Admin, as every resolution is.

**2. *Sam just joined your group.* stays as it is for a group nobody has named.**
An unnamed group is joined and not refused, and the wording is kept.

### The two questions as they were asked, kept for the record

**1. An open Join Request for the same group is left open.**
The spec does not say what becomes of it, and the criterion asks for that to be said here before anything is chosen, so nothing was chosen: the command closes no item.
What happens is what already happens to a request from somebody who got in another way.
The request stays on Intake forms; **Admit** on it afterwards resolves the item, joins nobody a second time, texts nobody again, and the page says they were already in.
`tests/integration/an-admin-puts-somebody-into-a-group.test.ts` holds exactly that.
The two alternatives are yours to pick, and either is a small change to the one command:
resolve the request inside the same act, recorded with the Admin and named in the event; or refuse, and send the Admin to Intake forms to admit them.

**2. A group nobody has named is joined, and its Discipler is told *Sam just joined your group.***
Old ticket 08 lists unnamed groups and old ticket 25 offers them, labelled by their leaders, so refusing one would be the popup offering what the command refuses.
The message a self-join sends says the group's name, and a self-join never meets an unnamed group, so the words for this case did not exist.
*your group* is mine, and it goes to a real phone: reword it or tell me to refuse instead.
Only a group formed before groups carried names can be unnamed.
