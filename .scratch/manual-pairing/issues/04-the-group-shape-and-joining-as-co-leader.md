# 04 - The Group shape, and groups in the popup from a Discipler

**What to build:** The toggle's third segment.
A Discipler and two or more Disciples become a named group, with a **Women's · Men's · Coed** toggle preset from the Discipler.
Choosing Coed is how a mixed group is made by hand.
Then, under the Disciples, a **Groups** heading and the Ministry's groups: choosing one and pressing **Add as co-leader** adds the Discipler to it as another leader, by invitation.

**Blocked by:** 01, 02, 03
Old ticket 26 said its co-leader half did not wait on old ticket 11.
That was written before old ticket 22's second stage found that a co-leader accepting on a running group activates it a second time and sends the Starter Message again to every leader and every Disciple.
Ticket 01 is the fix, so **Add as co-leader** gets no button before it.

**Status:** shipped

**Built:** 2026-09-21, on `integration/manual-pairing`, not merged to `main`.
See *Implementer, 2026-09-21* under Comments.

**Old tickets:** this is old ticket 26, whole; none of it is committed.
Every criterion of it is below, unchanged.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `07-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".
Old ticket 02's Comments, in `07-committed-already.md`, name old ticket 17 for restoring a Material after a refusal: that is the Group shape here.
Old ticket 08, in the same file, says what its read leaves to the popup.
Old ticket 22's Comments, in the same file, give the address a refused join returns to, `/roster?list=…&pair=<personId>&groupId=<id>&error=<code>`, which is what choosing a group reopens on.

**Design source:** the plan's mock state D for the Group shape, and mock state G for the groups.

## The Group shape

### The decision the Group shape carries (D1, 2026-09-18)

The domain argues that a default declaration "would be the product deciding a safeguarding question on the Admin's behalf".
James decided on 2026-09-18 that the screen answers the gender question on the Admin's behalf, preset from the Discipler, on these conditions: the answer is visible, stated in words, changeable before anything is formed, and the domain still refuses a group that declared nothing.
Every one of those conditions is an acceptance criterion below.

### The segment

- [x] At two ticked: **1:2 pair** · **2 × 1:1 pairs** · **Group**, defaulting to 1:2 pair.
- [x] At three or more the default moves to **Group**.
- [x] Group is a third segment in ticket 02's toggle state, not a second mechanism; the sticky-pick rule covers it.
- [x] A Discipler who already leads a group sees **Group** greyed with *{name} already leads a group*, as 1:2 already is.

### What Group asks

- [x] A **Women's · Men's · Coed** toggle directly under the shape toggle, preset from the Discipler's gender.
  Coed is the screen's word for mixed, the model's `declared_gender = null`.
- [x] A Discipler with no gender on file presets nothing, and the button stays disabled until the Admin chooses.
  The screen never posts a declaration nobody made.
- [x] A name, required, with the placeholder `{First}'s Group`.
  The placeholder is a hint and is never submitted as the name.
- [x] The primary button is disabled while the name is empty or only spaces.
- [x] One Material dropdown, No material first and the default, posted as the group's single Material.
  It is the dropdown ticket 02 built, reused.
- [x] **No join-approval control.**
  A group formed here takes the default, off; that switch stays on the Intake forms page (ADR-0017).

### Greying

- [x] Other-gender rows are not shown until Coed is chosen, and then they are on the list.
  Reworded by James's decision of 2026-09-21; it read *are greyed with Women's group: choose Coed to include (or Men's) until Coed is chosen, and then they open up*.
- [x] Changing the gender toggle re-checks every row.
  Anybody ticked who becomes greyed is unticked and named in the popup's line, through ticket 02's mechanism.
- [x] No gender on file is never greyed, under any of the three.
- [x] A Disciple already in a one-to-one, or already in another group, can be ticked for a Group.

### Sentence and button

- [x] *Claire Martinez will lead a women's group of 3: Sam Lee, Ana Ruiz and Rosa Delgado.* **Create group of 3**, with the count and the gender word live.
- [x] Coed reads as a coed group, and the sentence never says a gender the toggle does not show.

### Refusals and checks

- [x] A refusal restores the ticks, the shape, the gender, the name and the Material.
- [x] Posting without a declaration is still refused by the domain; a test posts the form without one and sees the refusal.
- [x] Over HTTP: a women's group of three forms with its name and declaration; a Coed group holds both genders; a women's group with a man posted anyway is refused and forms nothing.
- [x] Looked at in a browser beside mock state D at desktop and phone width, with the list still usable while the panel is open.

## Groups in the popup, from a Discipler

### The rows

- [x] A **Groups** heading below the Disciples, then one row per group from old ticket 08's read, with a round mark.
- [x] Rows read as ticket 03's do: name, leaders, how many Disciples, declared gender, state when not running, and an unnamed group named as its leaders' group, *Ruth Bader's group* (James, 2026-09-21).
  Ticket 03's row is reused: see *Where things are now* in its Comments.
- [x] A group this Discipler is already in, in either role, is not listed.
- [x] The toolbar counts both: *7 disciples · 3 groups*.

### One thing at a time

- [x] Ticking a Disciple clears a chosen group, and choosing a group clears every tick.
- [x] With a group chosen, the shape toggle, the gender toggle, the name and every Material dropdown are hidden.
- [x] **Clear** clears a chosen group as well as the ticks.

### Greying

- [x] A group whose declaration rules this Discipler out is not listed at all, and is not counted.
  Reworded by James's decision of 2026-09-21, made while reviewing ticket 03; it read *is greyed with it (A men's group)*.
  In his words: "hidden for things that are against gender rules ... that woman should not have to see any of the male-only groups."
  The rule is built and tested already, for both sides: `groupLeftOut` in `app/roster/greying.ts`, which the Disciple's side applies in `app/roster/page.tsx`.
  The greyed-group rule and its words, *A men's group*, were removed with it, so there is nothing of that to reuse.
  **Not decided by that answer:** the Disciples' own rows on this side.
  They are still greyed for gender as this ticket says, *Women's group: choose Coed to include*, because Coed opens them again and that is how a coed group is made by hand.
  James was asked whether to hide those too and his answer spoke only of groups and of the popup from a Disciple; if he wants them hidden, that is his to say before this ticket's *Gender* criteria are built.
- [x] A Discipler who already leads a group sees **every group row** greyed with *{name} already leads a group*, beside the 1:2 and Group shapes that ticket 02 and the Group shape above already grey.
  `leader_one_open_group` stands, and nothing here decides how it is lifted.
- [x] No gender on file is never greyed.

### Sentence, button, submit

- [x] *Claire Martinez will co-lead Grace's Group with Grace Lee.* **Add as co-leader**.
  As first written. It was built as **Add as co-discipler** for an afternoon on 2026-09-21, and James, shown both, chose this.
  Several existing leaders are all named.
- [x] It posts to old ticket 22's route.
  The Roster's receipt says an invitation was sent and that the group carries on meanwhile; it does not say Claire leads it yet.
- [x] A refusal reopens the popup with the reason and the chosen group restored.

### Checked

- [x] Over HTTP: the Groups section for a Discipler who leads nobody and for one who already leads a group; the co-leader round trip; a refusal restored.
- [x] Looked at in a browser beside mock state G, scrolled to the bottom of the list, at desktop and phone width.

## Comments

### James, 2026-09-21, in Lavish: the last four answers, all built

Answered on `.lavish/coed-and-the-gender-toggle/index.html`, from mock-ups made of the real popup, and built in `9c835d7`.
This section is where things stand; the one below it is kept as written and is replaced by this where they differ.

**1. No fade.** "remove the fade it meant something else but it is not worth keeping".
Whoever gender rules out is simply not drawn, as from a Disciple, and is drawn once a Coed Group opens the row.
`leftOut` and `.pair-opt.gone` are gone from `PairRow` and the stylesheet, and the list is the grid it was.
The model is unchanged: `greyedOnRow` still says whether a row is left out, and the popup filters on it.
In the over-HTTP suites `expectLeftOut` now means no row and no mark in the markup.

**2. The shape toggle is there when the popup opens.**
Below two ticks it is **1:1 pair** · **Group**, on 1:1 pair (`PAIR_SHAPE` and `SHAPES_BELOW_TWO` in `pair-shape.ts`), and from two it is the three segments as before.
So `shapeOf` is never null now; the popup hides the toggle only while a group that exists is chosen.
A Group picked first shows its gender toggle, name and Material at once, says *A group needs two or more checked*, and its button reads **Create group** and waits (`canBePosted`).
Below two ticks the default is always a 1:1 pair, whoever is ticked, because that is what a row is read against until the Admin says Group: somebody already in a one-to-one is still greyed on opening, and is open as soon as Group is picked.
Found by the tests while building it: **Clear** has to forget a picked Group and its declaration, or they outlive the ticks now that the toggle is drawn at none.
The spec's *hidden while zero or one Disciple is ticked* is replaced, and ticket 02's criterion of the same words is history.

**3. A Discipler is not offered the gender segment their own gender rules out.**
`declarationsOffered` in `pair-shape.ts`: Women's and Coed for a woman, Men's and Coed for a man, all three with no gender on file.
A press that is not offered changes nothing, and one that comes back in an address is not restored.

**4. The button says *Add as co-leader*, and the Roster's vocabulary test lets that one word through**, as it did before this morning.

Checked: `tests/app` and `tests/domain`, 72 files, 1480 tests, and the whole typecheck.
Over HTTP through `scripts/locked-tests.sh`, from a clean worktree of the commit: six suites, 88 tests, none failed and none skipped.
The first run of them caught a bug the unit tests could not: with the toggle always drawn, a 1:1 pair was showing the Material dropdown, and it now asks nothing, as it always did.
In Chrome, live, from a seeded Ministry: the toggle on opening on **1:1 pair** with somebody already in a one-to-one greyed; **Group** picked with nobody ticked, showing Women's and Coed only, the hint, and **Create group** disabled; Coed taking the count from 11 to 15 with the men on the list; two ticked and a name enabling the button; and **Clear** taking it all back to how it opened.

### James, 2026-09-21: the four things, answered, and what was built for them

His words: "use the filter and have it actually fade, 2 go with your suggestions, 3 i do not understand, and fix the roster stuff in 4".

**1. Hidden, and it fades.** Built in `8bd2d00` and `89d0edf`.
From a Discipler, a row gender rules out is not shown, and the toolbar's count leaves it out.
It stays in the markup so that it can fade back where it stands: `leftOut` on `PairRow` marks it `gone`, hidden from a screen reader, out of the tab order, its mark disabled so no form posts it.
Which readings leave a row out is `leavesOffTheList` in `app/roster/greying.ts` (gender, and nothing else), sent with each row as `leftOut`, and `greyedOnRow` in `pair-shape.ts` answers both why and whether it is shown.
The list became a flex column, because a grid keeps both gaps round an empty track and the rows left stood unevenly.
*Already in a 1:1* is still a greyed row that says why.
*Women's group: choose Coed to include* is no longer on any row; it is what the popup's line says of somebody the toggle unticks.
Read as the rows themselves fading in and out; if he meant something else by *fade*, the Lavish page below asks.

**2 and 3. Mock-ups, not built**, in `.lavish/coed-and-the-gender-toggle/index.html`, made from the real popup.
His answer to 2 was to go with the suggestion, and the suggestion was a mock-up first, since it is a new control.
Thought through against answer 1, *from the first tick* is not early enough: with men off the list, a Discipler whose Disciples are all men never gets a first tick, so the mock-up has the toggle there on opening, as **1:1 pair** and **Group**.
3 is said again there beside the real refusal a men's group under Claire gets, with a recommendation to not show the segment her own gender rules out, which is his rule for everything else gender rules out.

**4. The button says *Add as co-discipler*.** Built in `8bd2d00`.
Read as: put the Roster's vocabulary rule back and change the word.
`tests/app/roster-vocabulary.test.ts` is as it was before this ticket, and the constant is `PAIR_POPUP.addAsCoDiscipler`.
The sentence is unchanged.
A Discipler's own page still says *(co-leader)*; it is outside the Roster's copy and was left alone.
The Lavish page asks whether he wants another word.

Checked: `tests/app` and `tests/domain`, 72 files, 1473 tests, and the whole typecheck, on the branch.
Over HTTP through `scripts/locked-tests.sh` from a clean worktree of the commit: six suites, 87 tests, none failed and none skipped.
In Chrome, live: the men off the list at three ticked, the count going from 11 to 15 under Coed and back, even spacing both ways, the unticked line, and the browser's own transitions on the row in both directions (opacity and height over 220ms, and its visibility held until the fade-out ends).
A fence test this ticket had left red, `tests/domain/relationship-kind-fence.test.ts`, was found and fixed by ticket 06's session in `4e17c8f`; this ticket's first run covered `tests/app` and not `tests/domain`, which is why it was missed.

### Implementer, 2026-09-21: built, what was decided while building, and four things for James

Built straight through, in four commits on `integration/manual-pairing`: `f0b1ac4` (the Group shape), `7ffe950` (the groups under the Disciples, and **Add as co-leader**), `fd9a16b` (a short phone) and `723fd33` (what the two reviews found).
No migration, no new refusal code, no word sent to a phone, and no rule removed.
Code and tests written for it say "Manual pairing, recut ticket 04".
The Discipler's side is still reached only by its address; ticket 05 links it.

**Where things are.**

- `app/roster/pair-shape.ts` holds all of it, pure, as ticket 02 left it: `group` is a third `PairShape`, drawn last (`SHAPES`) and looked for second as a default (`DEFAULTS`), so two are a 1:2 pair, three or more are a Group, and a Discipler who already leads a group gets N × 1:1.
  The selection gained what a Group is asked, `declared` and `name`, and the one other thing the popup does from here, `groupId`.
  `canBePosted` is the button's rule.
  `tests/app/pair-shape.test.ts` drives every criterion that needs script.
- A Group's rows are read against what its toggle says, three more keys on each row's `greyed` (`READ_AS_A_GROUP`), decided by `greyedInAGroup` in `app/roster/greying.ts` and worded by `PAIR_POPUP.greyed`.
- How a declaration is spelled, `GroupDeclaration` and `GROUP_DECLARATIONS`, lives with the field it is posted as, in `app/roster/declared-gender.ts`.
- The gender toggle is three real radios named `declaredGender`, and the name is a text field named `name`, which are the fields the pairing route has always read, so the route forms a Group with no change.
  It gained only the way back: a Group posts `shape=group`, and a refusal returns that with its declaration and its name, which is how the popup tells a Group from the 1:2 pair two ticks default to.
  A 1:2 pair's generated name and declaration still never come back.
- The group rows are ticket 03's `PairGroups`, unedited.
  `listedGroup` in `app/roster/page.tsx` maps a group for either side, and `app/roster/pair/join-as.ts` names the `as` field and its two words once, for the popup and the join route.
- New over-HTTP suite: `tests/integration/the-groups-in-the-pair-popup-from-a-discipler-over-http.test.ts`.
  The Group shape's are in `the-pair-popup-from-a-discipler-over-http.test.ts`.

**Checked.**
`tests/app`: the five files this touches, 172 tests.
Typecheck clean for every file of this ticket; the whole tree does not typecheck today because of another session's uncommitted work on ticket 06 in the same checkout, none of it this ticket's.
Over HTTP through `scripts/locked-tests.sh`, from a clean worktree of `723fd33` so that the other session's work was not in the build: ten suites, 135 tests, none failed and none skipped.
They are the two Discipler popup suites, the two Disciple popup suites, both `an-admin-puts-somebody-into-a-group` suites, `pairing-over-http`, `a-material-chosen-at-pairing-over-http`, `a-group-declares-its-gender` and `joining-a-group-over-http`.
The run before it failed four tests on timeouts and no assertion, with the machine's load average near 190 from other sessions; it passed once the machine was quiet.
The whole suite has not run on this ticket; `scripts/locked-tests.sh --times 3` is owed before this branch goes to `main`.
Looked at live and hydrated in Chrome beside mock states D and G, at desktop width and in a 390px frame at 844px and 664px high: the struck 1:2 and its hint, Women's preset, the placeholder, the button waiting for a name that is more than spaces, Coed opening a man's row and Women's unticking him with the line, the list still usable with the panel open, the Groups heading and square avatars scrolled to the bottom, a chosen group clearing ticks and the other way round, **Clear**, and every group row and both group shapes greyed for a Discipler who already leads one.
At 664px high the Group's panel made the box scroll itself by 25px and cut its button; `fd9a16b` stands the labels closer under 700px, for every shape on this side, and it fits.

**Decided here, each the conservative reading, with the alternative.**

1. **The gender toggle is the Group's for as long as the shape is a Group, and the preset again whenever it is not.**
   The ticket's conditions are that the answer is visible and stated in words.
   A Coed chosen earlier and still held while a 1:2 pair is on screen would open men's rows with nothing on screen saying why.
   So every time the shape becomes a Group the toggle starts from the Discipler.
   The alternative is to remember it for the life of the popup.
2. **Changing the gender toggle keeps the shape a Group**, as picking the segment would.
   Found in the model: with a woman and a man ticked as a Coed Group of two, choosing Women's let the default go looking for another shape, and he was unticked with a 1:2 pair's reason while the toggle vanished.
3. **The one Material follows ticket 02's rule**: kept while the shape stays what it was, and **No material** each time the shape becomes a 1:2 pair or a Group, from the other included.
4. **The name is kept as typed while ticks and shapes change, and Clear forgets it.**
   It greys nobody, and losing it to a stray untick costs the Admin retyping.
   It is restored from a refusal only for a Group.
5. **With nothing declared, which only a Discipler with no gender on file can reach, no row is greyed for gender and the sentence says *a group of 3*.**
   Such a Discipler cannot open the popup today, since Intake asks gender, so this is proved on the pure model, as ticket 02's third item was.
6. **Choosing a group is Clear and then the group**: the ticks, the shape, the name and every Material go.
   A press on a greyed group, or a tick that is refused, changes nothing.
7. **With a refused join restored, every Disciple's box is held until script runs**, as ticket 03 holds the Disciplers, because the form points at the join route and a tick beside the group would be posted there and ignored.
8. **The Roster's vocabulary test lets *co-leader* through, and only that.**
   `tests/app/roster-vocabulary.test.ts` forbids the model's word Leader anywhere in the Roster's copy, and the button the spec and mock state G give is **Add as co-leader**.
   The Discipler's own page already says *(co-leader)*.
   The test now pins both directions: *Add as leader* still fails.
   The alternative is another word on the button, which is yours.
9. **A real refused join never comes back with its group still chosen.**
   Everything that refuses a Discipler either takes the group off their list (ended, already in it, its declaration) or greys every group (they already lead one).
   So *the chosen group restored* is proved from the address the route redirects to, as ticket 03 did it, and the two real round trips prove the reason in words and that a group not on the list is not restored.

**For James.**

1. **Still open from ticket 03: a Disciple's row of another gender, from a Discipler, is greyed and not hidden.**
   Built as this ticket's criteria say, *Women's group: choose Coed to include*, because Coed opens the row again.
   If you want them hidden as they are from a Disciple, it is one filter where the rows are drawn, and the rows would appear when Coed is chosen.
2. **Coed can only be reached after two same-gender ticks.** Found by the spec review.
   The toggle shows at two ticks, and while the Ministry enforces the match a man can never be a woman Discipler's first or second tick: he is greyed for a 1:1, for her 1:2 and for her Group as preset.
   So a coed group is made by ticking two women, picking Group, choosing Coed, and then ticking the men; and a woman Discipler whose Disciples are all men cannot make one at all.
   This follows from the spec as written (*Hidden while zero or one Disciple is ticked*), and is the same question as 1 from the other side.
   One way out, if you want it: show the shape toggle from the first tick when Group could apply.
   That is new UI, so it would be a mock-up first.
3. **All three gender segments can be picked, whoever the Discipler is.** Found by both reviews.
   A declaration binds the leader too, so *Men's* under Claire can only end in the database's refusal, *Somebody selected is not of the gender this pairing was declared to be*, where the somebody is Claire.
   Under a woman it also unticks every woman, which hides the toggle again.
   The ticket says only *preset from the Discipler, changeable*, and the mock draws three plain segments, so nothing was greyed.
   The smallest fix is to grey the one segment the Discipler's own gender rules out, which needs a line of words under it, and those are yours.
4. **Coed is not in `CONTEXT.md`.**
   The screen says it in two places now, a group's row and the toggle.
   A glossary line is a domain-modeling change and was left alone.

Left as they are, on purpose, from the standards review: the five small `PairShape` cascades (`segment`, `readAs`, `modeOf`, `holdsOneMaterial`, the sentence), which a per-shape record would gather and which read plainly as they are; `postedByAGroup` as a one-entry record, beside `postedByAOneToTwo`; and the one inline `leadsAGroup(...) ? words : null` in the page, since the rule is `leadsAGroup` in `greying.ts` and the page only words it.
Fixed from it, in `723fd33`: a doc comment in the pairing route that the new lines had orphaned; the name restored unguarded where the declaration was guarded; the mixed declaration spelled three ways; `coLead` copying `joinGroup`'s two conditions, now `inASentence`; and the refusal's wording chosen twice in the page.

**2026-09-18, D1 decided.**
James: yes, the declaration defaults from the chosen Discipler.
Carried over from *17 - The Group shape*, which carried it from the ticket it replaced, *04 - The pairing form*, which the spec of 2026-09-19 superseded.
