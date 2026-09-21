# 03 - Groups in the popup, from a Disciple

**What to build:** Under the Disciplers, a **Groups** heading and the Ministry's groups.
Choosing one and pressing **Add to group** puts the Disciple straight into it.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Built:** 2026-09-21, on `integration/manual-pairing`, not merged to `main`.
See *Implementer, 2026-09-21* under Comments.

**Old tickets:** this is old ticket 25, whole; none of it is committed.
Every criterion is below, unchanged, and one is added: *An open Join Request*, decided by James on 2026-09-20.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `07-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".
Old ticket 08, in `07-committed-already.md`, says what its read leaves to the popup.
Old ticket 22's Comments, in the same file, give the address a refused join returns to, `/roster?list=…&pair=<personId>&groupId=<id>&error=<code>`, which is what this reopens on.

**Design source:** the plan's mock state H.

## Acceptance

### The rows

- [x] A **Groups** heading below the Disciplers, then one row per group from old ticket 08's read, listed like people.
- [x] Each row gives the group's name, its leaders, how many Disciples it has, its declared gender, and its state when it is not running (paused, awaiting its leader).
- [x] A group with no name is labelled as its leaders' group, *Ruth Bader's group*, which is how a Disciple's row on the Discipler's side already names it.
  Reworded by James's decision of 2026-09-21; it read *labelled by its leaders' names, which is how the Roster's Paired with cell already names a pairing*, and in a list of people that read as a second Ruth Bader.
- [x] A group this Disciple is already in is not listed.
- [x] A Ministry with no groups shows no heading.
- [x] The line under the title counts both: *4 disciplers · 3 groups*.
- [x] The group row is a component in a file of its own, not part of the Disciple's side, so ticket 04 lists groups with it and edits neither.

### One choice

- [x] Exactly one choice across both sections: round marks throughout.
  Choosing a group clears a chosen Discipler, and the other way round.
- [x] Nothing else is asked.
  The group keeps the Material it has.

### Greying

- [x] A group whose declaration rules this Disciple out is not listed at all, and neither is a Discipler of another gender while the Ministry enforces the match.
  Reworded by James's decision of 2026-09-21; it read *is greyed with it (A men's group), through old ticket 23's rule with the group's own declaration*.
  The rule that decides it is still old ticket 23's, read against the group's own declaration.
- [x] A Coed group is shown to everybody, and a Disciple with no gender on file is shown every group.
- [x] If this Disciple is already in a one-to-one, every Discipler is greyed and **the groups stay open**.

### Sentence, button, submit

- [x] *Sam Lee will join Thursday Table, led by David Chen.* **Add to group**.
  Several leaders are all named.
- [x] It posts to old ticket 22's route; the Disciple is in the group at once, and the Roster's receipt says so.
- [x] A refusal reopens the popup with the reason and the chosen group restored.

### An open Join Request

- [x] Putting somebody into a group they have an open Join Request for resolves that request in the same act, as an admitted request ends, so it leaves Intake forms.
  There is no second membership.
  Nothing is sent and nothing is shown for it: the group's leaders get the one text a join already sends and no other, and the Disciple gets nothing.
  The resolution is recorded in the Ministry's history, naming the Admin.
  A request of theirs for a different group is left as it is.
  Decided by James on 2026-09-20; see Comments.

### Checked

- [x] Over HTTP: the Groups section's contents for a Disciple already in one of three groups; a men's group left out for a woman; the join round trip; a refusal restored.
- [x] Looked at in a browser beside mock state H, scrolled to the bottom of the list, at desktop and phone width.

## Comments

### Decided by James, 2026-09-21, in Lavish (`.lavish/groups-in-the-popup/index.html`)

Five things were put to James beside the real popup, and all five are answered and built (`422ffad`).

1. **Coed** stays, on a group's row. Reading 1 below stands.
2. ***awaiting acceptance*** stays. Reading 2 below stands.
3. **A group nobody has named is *Ruth Bader's group***, on its row and in the sentence (*Sam Lee will join Ruth Bader's group.*), which replaces reading 3 below. Its criterion is reworded above.
   With it James decided something wider, in his own words: "If they're not compatible or able to be paired together because of gender, just don't show them period. If they have the mixed gender setting selected, where one-on-one can be paired across gender, then that should show up here."
   So from a Disciple, a Discipler of another gender and a group whose declaration rules the Disciple out are **left off the list**, and out of its count, in place of a greyed row.
   Every other reason is still a greyed row: Awaiting Intake and Opted out, as James decided on 2026-09-20, and a Disciple already in a one-to-one.
   The rules are `leftOutForADisciple` and `groupLeftOutForADisciple` in `app/roster/greying.ts`, and the spec says it under *The popup, from a Disciple*.
   Two criteria above are reworded for it, and old ticket 23's *a greyed row is shown, not hidden* no longer holds for gender on this side; its record in `07-committed-already.md` is left as it was written.
   **Read as this side only.** From a Discipler the greying for gender depends on the shape, and Coed opens those rows again, which is how a coed group is made by hand; hiding them there would take that away. Asked of James in Lavish; ticket 04 should not start its group rows before he answers, since its criterion *A group whose declaration rules this Discipler out is greyed with it* is the same question.
   One edge, left alone: where every Discipler is left out and there are no groups, the popup says *There is nobody to choose yet*, which does not say why.
4. **One event.** The resolved Join Request is recorded in the join's own event, as an admission's is. Reading 4 below stands.
5. **The list says it scrolls**: the fade James was shown, and, in his words, "a light scroll bar on the right to make it clear they can scroll down". Both are in the shared list (`PairList`, `.pair-list` in `public/discipler.css`), so both sides have them. The fade shows only while there is more below.

Checked: typecheck clean; `tests/domain tests/app`, 71 files, 1381 tests; the three popup suites and `an-admin-puts-somebody-into-a-group-over-http` through `scripts/locked-tests.sh`; and looked at in a browser at desktop width and at 390px, where the fade goes at the end of the list and the scrollbar costs no sideways scroll.

### Implementer, 2026-09-21: built, and what was decided while building

Built straight through, in two commits on `integration/manual-pairing`, `aa334a7` (the open Join Request, in the command) and `0503950` (the groups in the popup, and **Add to group**), and a third for what the review found.
No migration, and no words to a real phone: the one text a join already sends is unchanged.
Code and tests written for it say "Manual pairing, recut ticket 03".

Where things are:

- The group rows are `app/roster/pair-popup-groups.tsx`: `PairGroups` (the heading and the rows), `PairGroupRow` and the `PairPopupGroup` type.
  It is part of neither side, so ticket 04 renders `PairGroups` inside the Discipler's list and edits neither this file nor the Disciple's side.
- Which groups are offered is `groupsToJoin` in `app/roster/lists.ts`; which are greyed is `greyedForAGroupJoined` in `app/roster/greying.ts`, which is old ticket 23's rule read against the group's own declaration; the words are `PAIR_POPUP` in `app/roster/copy.ts`.
- The shared shell, `app/roster/pair-popup.tsx`, gained three things both sides can use: `postsTo` (`create` or `join`), so the form's action follows what is chosen; a square avatar for a row that is a group; and `waitsForScript`, reading 5 below.
- The command reads the open request through a new unit-of-work read, `joinRequestOf(personId, relationshipId)`, locked, and resolves it with the same effect an admission uses.

Checked: `npm run typecheck` clean; `tests/domain tests/app`, 71 files, 1372 tests; through `scripts/locked-tests.sh`, the new `the-groups-in-the-pair-popup-over-http` (10 tests), the two older popup suites, both `an-admin-puts-somebody-into-a-group` suites, both `joining-a-group` suites and `pairing-over-http`, none skipped.
Looked at in a browser beside mock state H, live and hydrated, at desktop width and at 390px, scrolled to the bottom of the list: the heading, the square avatars, a men's group greyed for a woman, one choice across both sections in both directions, **Clear**, a refusal with the group restored and scrolled into view, every Discipler greyed and the groups open for a Disciple already in a one-to-one, and a real press of **Add to group**, after which the Roster's receipt said so and the row named the group's Discipler.

Small, reversible readings, each with its alternative beside it:

**1. A group's declaration reads *Women's*, *Men's* or *Coed*.**
The mock's row says *Mixed*; the spec, written from the mock, says "Coed is the screen's word for the model's `declared_gender = null`", and this ticket says *A Coed group greys nobody*.
So the row says Coed, which is also what ticket 04's gender toggle will say beside it.
The alternative is one word in `PAIR_POPUP.groupDetails`.

**2. A group still awaiting its leader reads *awaiting acceptance*.**
The criterion's parenthesis says *(paused, awaiting its leader)*, which I read as naming the two states and not as copy.
*awaiting acceptance* is what the Roster row behind the popup already says of the same relationship (`AWAITING_ACCEPTANCE`), so the popup and the row under it agree.
The alternative is the ticket's own words, in the same place as reading 1.

**3. A group nobody has named is labelled by its leaders' names, and does not say them twice.**
Its label is *Grace Lee*, or *Grace Lee, David Chen*, joined as the Paired with cell joins them.
Its details line then leaves out *led by Grace Lee*, and its sentence reads *Sam Lee will join the group led by Grace Lee.*, because *will join Grace Lee, led by Grace Lee* is not a sentence.
One thing to look at: such a group's leader is also a Discipler higher in the same list, so *Ruth Bader* appears twice, once round under the Disciplers and once square under Groups.
The square, the heading and the details line tell them apart; the alternative is *Ruth Bader's group*, which is what `PAIR_POPUP.inGroup` already says on the Discipler's side.
Only a group formed before groups carried names can be unnamed.

**4. The resolution is recorded as an admission's is.**
The item is closed by the Admin (`resolved_by`), and the one `relationship.participant_added` event names the Admin, the Person, the group and the item.
No separate `follow_up.resolved` event is appended, because `relationship.admit` appends none either and the criterion says *as an admitted request ends*.
The alternative is one more `appendHistory` in the same case of `src/domain/boundary.ts`.

**5. A group cannot be marked until script runs.**
Choosing a group has to point the form at the route that joins, and only script can do that; the spec says the popup needs JavaScript.
As first built, a group marked before script ran would have been posted to the pairing route, and a Discipler and a group both marked would have made the one-to-one and ignored the group.
The standards review called that a bug, and it is closed: the server sends every group's round mark held, and it opens once script runs (`waitsForScript` on `PairRow`).
A Discipler's mark is never held, because pairing is the form's own act, so that side still posts without script.
A group the server sends already chosen, which is a refused join restored, is open as it stands, because the server pointed the form at the join route too.
The alternative is a route that reads which of the two was marked, which `app/roster/pair/join/route.ts` rules out in its own words: which act an Admin meant is the form's action, never a field that happened to be present.

**6. A row's details wrap whole, on both sides of the popup.**
At 390px a group's line, *led by Noor Haddad · 2 disciples · Coed · paused*, wrapped with the dot opening the second line.
Each detail is now its own piece with its dot behind it (`PairRow` in `app/roster/pair-popup.tsx`, `.pair-detail`), so a line never opens on a dot; a long email still breaks inside itself.
The three over-HTTP popup suites read the line as an Admin reads it, through `detailsOf` in `tests/support/pair-popup.ts`, which made two older assertions stricter, not looser.

**7. The count leaves out groups where there are none to offer.**
*4 disciplers · 3 groups*, and *4 disciplers* in a Ministry with no groups or for a Disciple already in all of them, as no heading stands over none.
The number is the groups offered, greyed ones included, as the Disciplers' number includes greyed Disciplers.

### After the review, 2026-09-21

A standards review and a spec review read the two commits.
The spec review found every criterion met, and agreed with readings 1, 2 and 4 while saying 3 and 4 want your eye, which is why they are set out above.
The standards review found no breach of a documented standard.
Fixed from the two of them, in a third commit:
a group marked before script ran was posted to the pairing route (reading 5, now closed);
the sentence for a group with no name and nobody leading it read *led by .*, and now reads *Sam Lee will join the group.*;
a group's declaration and state are typed from the Pair document's own `GroupToJoin` (`GroupListed` in `app/roster/copy.ts`) and not spelled out twice;
the leaders' names are read in one place, `leadersOf`;
a constant exported from the group rows' client file, which nothing imported, is gone;
and a row's details are keyed by position, so two equal details cannot collide.
Left as they are, on purpose: `CommandContext.joinRequest` serves both the admission and this act, and says so where it is declared; and the page words a refusal for the join when the address carries a `groupId`, which only the join route ever puts there.

The whole suite ran once on the second commit through `scripts/locked-tests.sh`: 168 files, none skipped.
The three popup suites and `an-admin-puts-somebody-into-a-group-over-http` ran again on the third.
Still looked at in a browser only, because the repository has no harness for client script: choosing a group clearing a chosen Discipler and the other way round, **Clear**, and a group's mark opening once script runs.

One thing seen and not built, because it is new UI and yours to decide: at some window heights the list cuts cleanly after the last Discipler, and nothing but *· 5 groups* in the line above says there is more below.
macOS hides the scrollbar until the list is touched.
If you want it, the smallest fix is a fade at the bottom edge of the list while there is more to scroll to; say so and I will mock it up.


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
