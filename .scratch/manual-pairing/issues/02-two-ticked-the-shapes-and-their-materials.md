# 02 - Two ticked: the shape toggle, the 1:2 pair and N × 1:1 pairs, and their Materials

**What to build:** With two or more Disciples ticked, a toggle asks what to make of them.
**1:2 pair** forms one relationship of three people, named and declared without asking.
**N × 1:1 pairs** forms N one-to-ones in one submission, all or none.
Then the Material dropdowns the mock draws for those two shapes: one for a 1:2 pair, and one per Disciple for N × 1:1 pairs.
Behind the popup, a separate submission carries a Material for each Disciple, each held on its own one-to-one and spent at acceptance.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Built:** 2026-09-20, on `integration/manual-pairing`, not merged to `main`.
See *Implementer, 2026-09-20* under Comments.

**Old tickets:** this is old ticket 24, whole, and stage 2 of old ticket 21, *A Material per Disciple*; none of either is committed.
Every criterion of both is below, unchanged.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `06-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".
Old ticket 02's Comments, in `06-committed-already.md`, name old ticket 16 for restoring a Material after a refusal: that is the last section here.
Old ticket 21's Comments, in the same file, say how a refusal names its Disciple: the address carries `about=<personId>` and `mode`, and this ticket restores the popup from them.
The Discipler's side this builds on, the list and one tick, is committed as stage 2 of old ticket 23 and is in the same file.

**Design source:** the plan's mock states B and C.

## Out of this ticket

The **Group** segment is ticket 04.
At three or more ticked, only N × 1:1 can be made until ticket 04 lands; this side is still not linked from any row.

## The toggle, the 1:2 pair and N × 1:1 pairs

Here every relationship is formed with no Material, which is the default anyway.

### The toggle

- [x] Hidden while zero or one Disciple is ticked.
- [x] At two: **1:2 pair** and **2 × 1:1 pairs**, defaulting to 1:2 pair.
- [x] At three or more: **1:2 pair** is struck out and cannot be picked, and *1:2 pair needs exactly two checked* appears beneath the toggle in grey.
- [x] The N in *N × 1:1 pairs* counts live.
- [x] Once the Admin picks a segment, it stays picked until it becomes impossible; untouched, the default follows the count.
- [x] The toggle's state is one small pure function of the ticks, the Admin's pick and what is possible, tested without a browser.
  Ticket 04 adds a segment to it, not a second mechanism.

### The 1:2 pair

- [x] Nothing is asked.
  The name is generated as `{First} with {First} & {First}` and never shown, and the Discipler's gender is posted as the declaration.
  A 1:2 is a group for every rule, which is why it carries both.
- [x] A Discipler with no gender on file posts no declaration, and the domain's refusal comes back in words the Admin can act on.
- [x] Other-gender rows are greyed while 1:2 is selected.
- [x] A Disciple already in a one-to-one **can** be ticked for a 1:2.
- [x] Sentence and button: *Claire Martinez will disciple Sam Lee and Ana Ruiz together as a 1:2 pair.* **Create 1:2 pair**.

### N × 1:1 pairs

- [x] Posts `mode=separate` from old ticket 21, and forms N one-to-ones or none.
- [x] Each is same-gender while the Ministry enforces the match, and a Disciple already in a one-to-one is greyed.
- [x] Sentence and button: *Claire Martinez will disciple Sam Lee and Ana Ruiz separately, in 2 one-on-ones.* **Create 2 1:1 pairs**.

### Re-checking

- [x] Changing the shape re-checks every row against the declaration the new shape implies.
- [x] Anybody ticked who becomes greyed is unticked, and a line in the popup says who, rather than dropping them silently.
  A Disciple already in a one-to-one, ticked under 1:2 and then moved to N × 1:1, is the case that proves it.
- [x] If unticking drops the count below two, the toggle hides and the one-tick sentence returns.

### The one-group limit

- [x] A Discipler who already leads a group sees the **1:2 pair** segment greyed with *{name} already leads a group*, and the default moves to N × 1:1.
  `leader_one_open_group` stands, and nothing here decides how it is lifted.

### Refusals and checks

- [x] A refusal restores the ticks and the shape, and names the Disciple it is about where old ticket 21 does.
- [x] Old ticket 23's placeholder line for two or more ticked is gone.
- [x] Over HTTP: a 1:2 forms one relationship with a generated name and the Discipler's gender; 3 × 1:1 forms three; a set with one refusal forms none and the popup reopens with everything restored.
- [x] Looked at in a browser beside mock states B and C, including the struck-out segment and its hint at three ticked.

## A Material per Disciple, behind the route

Read old ticket 03's Comments in `06-committed-already.md` before starting, from *what the check cannot predict (for ticket 04)* to the end; they were written for the session that builds this.

In `separate` mode, each Disciple carries their own Material choice, held as an intention on their one-to-one and spent at acceptance.
The popup's per-Disciple dropdowns are the section after this one.

- [x] A `separate` submission can name a Material for each Disciple, and each one-to-one formed holds the Material named for its own Disciple.
- [x] A Disciple with no Material named gets none.
  No material is the default, and one Disciple's choice never spills onto another.
- [x] A Material named for somebody who is not among the submitted Disciples is ignored rather than refused.
- [x] A Material the Ministry does not hold, or one that has been removed, refuses the whole set through old ticket 03's check, and the refusal names the Disciple it was chosen for.
- [x] A refusal returns every Disciple's Material choice with the rest of the selection.
- [x] `together` mode still takes the single Material old ticket 02 gave it, and ignores any per-Disciple choice.
- [x] Over HTTP: a Discipler and two Disciples, a different Material each, produce two one-to-ones; accepting each writes that Disciple's Material into its history, as old ticket 02 does for one.

## Materials on the 1:2 pair and on each of N × 1:1

- [x] Every Material dropdown lists the Ministry's live Materials with **No material** first, and No material is the default.
- [x] A one-to-one from a single tick still asks nothing, a Material included.
- [x] **1:2 pair** shows one dropdown, posted as the single Material old ticket 02 holds on the relationship.
- [x] **N × 1:1 pairs** shows one dropdown per ticked Disciple, each labelled with that Disciple's name, posted as the per-Disciple choice the section above gives the route.
- [x] Ticking another Disciple adds their dropdown at No material; unticking one removes theirs and leaves the others' choices as they were.
- [x] A choice made under one shape is not carried into the other: moving from N × 1:1 to 1:2 starts the 1:2's dropdown at No material.
- [x] A Ministry with no live Materials shows no dropdowns and no empty label where they would have been.
- [x] The dropdowns sit inside the popup without pushing the buttons off screen; with many ticked, they scroll with the panel they are in.
- [x] A refusal restores every Material choice with the rest.
- [x] A Material removed between opening the popup and submitting comes back as a refusal naming it, with the rest of the selection intact.
- [x] Over HTTP: a 1:2 with a Material holds it as intended and writes it at acceptance; 2 × 1:1 with a different Material each hold one apiece.
- [x] Looked at in a browser beside mock states B and C, and with five ticked at phone width.

## Comments

### What stage 1 of old ticket 21 left for this

`SeparateSubmission` is where the per-Disciple Material goes, and `oneToOnesFor` is where each command picks up its own.
The route's `separate` branch passes no Material at all today, and says so in a comment.
Old ticket 03's note stands: a check that names a Material holds the Ministry-wide advisory lock for as long as it runs, once per Disciple.

### Implementer, 2026-09-20: what was built, what was decided, and four things for James

Built straight through, in three commits: `480211a` (a Material per Disciple, behind the route), `4a8fdfd` (the toggle, the two shapes and their dropdowns) and `e4c57c5` (what the two reviews found).
No migration, no new refusal code, no word sent to a phone, and no rule removed.

**Where it lives.**
`app/roster/pair-shape.ts` is the toggle, the re-check and the Materials each shape holds, as one pure module: `shapeToggle` is the small function the ticket asks for, and ticket 04 adds `group` to `PairShape` and to `SHAPES` there.
The repository has no harness for client script, so everything the popup does on a tick, a pick or a dropdown is a pure change to one `PairSelection`, driven by `tests/app/pair-shape.test.ts`; `pair-popup-from-a-discipler.tsx` only draws it.
`app/roster/pair/material-per-disciple.ts` is the one place the field `materialId.<personId>` is named: the popup posts it, the route reads it and sends it back on a refusal, and the Roster reads it out of the address.
`SeparateSubmission.materialIds` and `oneToOnesFor` carry it to each command, as old ticket 21's Comments said they would.
The toggle's segments are real radios named `mode` (`together` for a 1:2 pair, `separate` for N × 1:1), so the arrow keys move between them and the route needed no new field.

**Checked.**
`npm run typecheck` clean; `tests/domain tests/app`, 71 files, 1334 tests.
Over HTTP through `scripts/locked-tests.sh`: the Discipler's popup suite (19 tests), the Disciple's popup suite, `separate-one-to-ones-over-http` and the new `a-material-per-disciple-over-http`, none skipped.
Then the whole suite once on the result: 167 files, 2336 passed, 1 skipped, and 1 failed that is not this ticket's.
The skip is the one `invitation-over-http` has always carried.
The failure is *a tick that decided before an acceptance and writes after it* in `a-co-leader-accepts-on-a-running-group.test.ts`, which another session was writing in this same checkout while the run was in flight, uncommitted, against its own uncommitted `effect-store.ts` and `follow-up.ts`; nothing of this ticket is in it.
Looked at in Chrome beside mock states B and C at desktop width, with the struck-out segment and its hint at three ticked, the greyed segment for a Discipler who leads a group, the case that proves re-checking driven by hand, and five ticked in a 390 px frame at 844 px and at 664 px high.

**Decided here, each the conservative reading, with the alternative.**

1. **A row is read against the shape the ticks would make with it ticked.**
   A ticked row is read against the shape there is; an unticked one against the shape one more tick would make.
   Read against the current shape only, *A Disciple already in a one-to-one can be ticked for a 1:2* could never happen with a mouse: the toggle shows at two, and with one ticked the shape is a one-to-one, which greys her.
   So with one ticked her row opens, because the second tick would make a 1:2.
   The consequence worth seeing in a browser: somebody already in a one-to-one can be the second tick and never the first.
   With two ticked as a 1:2, an unticked row is read against 3 × 1:1, which is what ticking it would make until ticket 04 adds Group.
2. **Who was unticked is said with the reason: *Brianna Frazier was unticked: Already in a 1:1 with David Chen.***
   The first wording pointed at her row for the reason, and the browser showed why that is wrong: unticking her leaves one tick, her row opens again under reading 1, and the row says nothing.
   The line stays until the Admin's next tick, pick or Clear.
   A tick restored from a refusal that is greyed now is named the same way, where old ticket 23 dropped it silently.
3. **The default passes over a shape that would untick somebody who is ticked.** Found by the spec review.
   In a Ministry that does not enforce the match, a woman Discipler's 1:2 still declares her gender, so a man can be one of her 2 × 1:1 and not in her 1:2.
   Defaulting to 1:2 unticked him whichever order the two were ticked in, and N × 1:1 cannot be picked below two ticks, so the pair could not be made at all.
   The ticket calls the toggle a function of the ticks, the pick *and what is possible*, so untouched those two are 2 × 1:1; the 1:2 segment can still be picked, and unticks him with the line.
   In an enforcing Ministry nothing changes: he is greyed under both.
4. **Other-gender greying for a 1:2 is not read off `suggest_gender_match`.**
   A declaration binds its members whatever the Ministry says of a one-to-one (`20260916000100_a_group_declares_its_gender.sql`), and the 1:2 declares the Discipler's gender.
   The reason is *Women's only: a 1:2 is same-gender*, the one-to-one's sentence at the same length, so it fits one line at phone width.
5. **Each shape keeps its own Material choices, and only the selected shape's are drawn and posted.**
   The first build started every dropdown over on any change of shape, and the spec review found the collision: with three ticked untouched, unticking one moves the default to 1:2 and wiped the other two's choices, against *leaves the others' choices as they were*.
   Now the 1:2's one Material is never any Disciple's and theirs are never its, which is *not carried into the other*, and coming back to a shape finds what was chosen there.
   Below two ticks nothing is kept.
   The alternative is the first build's reset.
6. **Where both hold, the 1:2 segment says *Claire already leads a group* and not the count.**
   Nothing about the ticks would open it, so the count would be the wrong thing to act on; it is greyed and not struck through, since the strike is the mock's mark for the count.
   The name is the first name, as the spec's own sentence has it.
7. **Names in the sentence, the generated name and the dropdowns follow the list's order, which is the Roster's, not the order ticked.**
   So the mock's *Sam Lee and Ana Ruiz* reads *Ana Ruiz and Sam Lee* on a Roster sorted by name, and the 1:2 is *Claire with Ana & Sam*.
8. **The popup from a Discipler is held by its top edge and grows downward.**
   Centred, the box re-centred when the toggle appeared and every row moved from under the pointer that had just ticked it; my own second click in the browser landed on the wrong row.
   The Disciple's side never grows and stays centred.
   The intro line stays where the mock's states B and C drop it, for the same reason: taking it out moves the list.
9. **The list and the per-Disciple panel are plain boxes around their fieldsets.**
   A `fieldset` made to give way inside a column does not clip its rows in Chrome: at phone width the list ran under the toggle and the sentence over the dropdowns.
   This is in the shared `pair-popup.tsx`, so the Disciple's side has the same wrapper, and was looked at again.
   The box's height also gives back what the space above it takes, and uses `100dvh` where a browser has it, so the buttons are not under a phone's bars.
10. **The old Pair page sends each `materialId.<personId>` back as a hidden field**, as it does `mode`, and gains no control.
    Ticket 05 retires both.
11. **Without script, two ticks are refused once and then work.**
    Old ticket 23 sent the button disabled at two ticks.
    Now the server cannot disable it, since two ticks are a real thing to make, so a browser without script posts two ticks with no name and no declaration, the route refuses them as a group that said nothing, and the popup that comes back has the toggle and the 1:2's name and declaration in it.
    The refusal it reads on the way is the group's sentence, which the Admin never asked about.
    The spec says the popup needs script, as the import dialog does.

**For ticket 04.**
`SHAPES` in `pair-shape.ts` is both the order the segments are drawn in and the order the default is looked for in, because for two shapes they are the same.
With Group they differ: drawn 1:2, N × 1:1, Group, and the default at three or more is Group.
The standards review had the second list folded into the first as speculative, so ticket 04 brings it back when it has a use.
A Group's rows are read against its gender toggle, which is a third `ReadAs` and a third key on each row's `greyed`.
A refusal's address says `mode=together` for a 1:2 and will for a Group, so ticket 04 has to tell the two apart when it restores, by the name or the declaration that came back.

**For James.**

1. ***A refusal naming it* names the Disciple and not the Material's title.**
   The Pair document lists live Materials only, so a Material removed a moment ago has no title the page can read.
   For N × 1:1 the sentence is *Kit Steady: That Material is no longer on this Ministry's list.*, which says which dropdown; for a 1:2 there is one dropdown.
   That dropdown comes back at **No material**, since what it held is off the list, and everything else is as it was.
   Naming the title needs the reader to answer for a removed Material, which is a change to the document's function.
2. ***Claire already leads a group* is read from the live count, and the index is on the kind.**
   The same disagreement as *Already in a 1:1* in old ticket 23's Comments, the other way round: a Discipler whose group has fewer than two Disciples left is offered a 1:2, and the database refuses it in words after the click.
   It errs towards offering.
   One migration would make both exact: the Roster's function saying, per relationship, which cap it counts against.
3. **A Discipler with no gender on file cannot open the popup today**, so *posts no declaration* is proved on the pure function and, over HTTP, by posting a 1:2 with no declaration.
   The refusal they would read is the group's: *Say whether this is a men's group, a women's group, or a mixed one.*
   Nothing in this ticket's popup lets an Admin say so; ticket 04's Group shape will.
   **James, 2026-09-20:** gender is part of Intake, so this works as it is, and nothing here is owed.
4. **In a Ministry that does not enforce the match, *Other-gender rows are greyed while 1:2 is selected* holds for the two ticked and not for the rows beside them.**
   With a 1:2 selected, an unticked man's row is open, because ticking him makes 3 × 1:1, which he can be one of.
   That follows from reading 1 and is the literal criterion's only exception.

### James, 2026-09-20: the four things, answered

1. *A refusal naming it* names the Disciple and not the Material's title: **leave as is.**
2. A group that has fallen to one Disciple and one Discipler: **keep it as a group.** Built, below.
3. A Discipler with no gender on file: gender is part of Intake, so this works as it is.
4. Other-gender rows beside a 1:2 in a Ministry that does not enforce the match: **leave as is.**

### Implementer, 2026-09-20: a group of one is still a group, built

This is the migration the second item above, and old ticket 23's Comments in `06-committed-already.md`, both said it would take.
`20261004000100_which_cap_a_relationship_counts_against.sql` restates `public.roster_page()` with one key more on each relationship row, `counts_as_a_group`, and changes nothing else; `person_page()` and `pair_page()` read that document and carry it with no change of their own.
`RosterRelationship.countsAsAGroup` carries it, and its only readers are the two rules in `app/roster/greying.ts`.
A group's last Disciple is no longer greyed as *Already in a 1:1*, from either side of the popup, and its Discipler is no longer offered a 1:2 pair the index would refuse.

The function answers the question and not the column, so nothing under `src/` or `app/` reads a kind that did not before, and the fence test is unchanged.
What a row is called, the size pill and every state still follow the live count.
ADR-0004 has an amendment saying so, since the honest list of what reads `kind` is that document.

Proved on the pure rules in `tests/app/who-is-greyed.test.ts`, and over HTTP in the Discipler's popup suite: a group formed with two Disciples, one membership ended, then looked at from another Discipler, from its last Disciple, and from its own Discipler with two ticked.
A document without the key is thrown as drift by the reader, like the rest of it there, so every suite that reads a Roster also proves the key arrives.
`the-admin-tabs-answer-in-one-read.test.ts` pins the document's rows exactly, and now pins the key too, answered *false* for a one-to-one.
The whole suite, once, on the result: 167 files, 2342 passed, 1 skipped (the one `invitation-over-http` has always carried), none failed.

**To ship it:** the migration has to be pushed to production by hand before the code that reads it is deployed, or every Roster read throws.
`supabase db push` as the plain foreground command, then `smoke:pages`, then merge, as usual.

