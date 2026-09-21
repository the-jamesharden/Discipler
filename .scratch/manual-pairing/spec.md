# Manual pairing, as a popup over the Roster

**Status:** needs-triage

## What this is

Every relationship an Admin forms by hand starts from one person's row on the Roster.
Pressing **Pair** on that row opens a popup over the Roster itself, titled **Pair {name}**, listing only the other side.
From a Discipler it lists Disciples, any number of whom can be ticked; from a Disciple it lists Disciplers, only one of whom can be chosen.
Existing groups are listed at the bottom of both, so a Discipler can join a group as a leader and a Disciple can be put straight into one.
A sentence and a button say exactly what is about to be made.

The Roster around it gets quieter at the same time: an All / Disciplers / Disciples toggle under its title, and nothing on a row that describes internal state.

This spec replaces the version of 2026-09-18, which kept `/roster/pair` as a page styled as a modal.
James reviewed the replacement as a plan with mocks on 2026-09-19 (`.lavish/pair-popup/index.html`, gitignored) and decided every question below there.

**Design source:** that plan's mocks, states A to H, plus `discipler-dashboard (10).html`, `showPairModal` and `_updatePairSummary` (lines 2163-2400), for the look of the list and the shape toggle.

## Already shipped

Two tickets from the first version landed and nothing here undoes them.

- **01, what the Pair screen reads** (PR #12): each candidate's gender on `public.roster()`, the Ministry's `suggest_gender_match`, and its live Materials on `pair_page()`.
- **02, a Material chosen at pairing** (PR #13): `relationship.intended_material_id`, held until the relationship is accepted and written into its Material history at that instant.

## The Roster

- A three-way toggle directly under the word **Roster**: **All**, **Disciplers**, **Disciples**.
  All is the default.
  It stays a set of plain links (`?list=all|disciplers|disciples`), so it survives a refresh and needs no script.
- Who is on which list does not change: `app/roster/lists.ts` is still the one rule, and a person may be on both.
- On All, each person appears once, and the Paired with cell says the direction of each pairing: *disciples* Emily Davis, *discipled by* Grace Lee.
- The stats line keeps total, paired and unpaired on every list and drops *in groups*, which means something only within one side.
- **Removed:** the participation status chip under every name, the footnote under the table that explains it, and the *Offered to mentor* tag.
  Participation Status stays in the model and still decides who can be paired.
  Answering Mentor on Intake still makes somebody a Discipler; the Disciplers toggle already says so without a tag.
- **Back, as one tag beside the name (James, 2026-09-21):** somebody who has not completed Intake is tagged **Awaiting Intake** beside their name, on every list.
  An import files people who have answered nothing, and they looked like everybody else until an Admin went to pair them.
  It is read off Participation Status and not off how the person arrived, so it is on anybody who has not completed Intake, whichever layout imported them.
  No other status is tagged.
- **Removed:** the *Pair people* button, from the Roster and from Suggested Pairs.
  Every pairing starts from a row.
- **Removed, and pinned:** *Eligible to lead* left the app on 2026-09-07 (`b8894d5`) and survives only in the design prototype `.scratch/core-operating-loop/design/discipler-dashboard-v10.html`.
  A test asserts the words never appear on the Roster.
- A row that cannot be paired offers no Pair button and says why once.
  **Awaiting Intake** is the tag beside the name, and the Paired with cell does not say it again: it reads *Unpaired*, or the plans the row holds.
  **Opted out** is said in the Paired with cell, in place of *Unpaired*.
- **Pair** appears on every Discipler row, including a Discipler who already leads somebody, and on every Disciple row whose person has completed Intake and not opted out.

## Unpair, on a person's page

Decided by James on 2026-09-21, from a mock-up on the real person pages (`.lavish/unpair/index.html`, gitignored).
Before this, a pairing could be ended only from a Follow-Up item, so a healthy pairing could not be ended at all.

- **Unpair** sits on the Pairings card of a person's page, one beside each pairing, because a person can hold several.
  It is not on a Roster row.
- One word for three acts the model already had, and `app/roster/unpair.ts` is the one rule that picks between them.
  The page draws the button from it and the route reads the Roster again and acts from it.
- A pairing nobody has accepted is cancelled in one press, and nothing is asked: it never started, so it has no outcome.
  A group nobody has accepted is cancelled from its Discipler's page after one confirmation, because it is everybody's.
- A pairing that has started ends, from either person's page, and is asked one thing: **It finished well** or **It did not run its course**, which are the model's `completed` and `discontinued`.
  The reason is optional here; a blank one is recorded as *Unpaired from the Roster.*, and who did it is recorded beside it as it always was.
  Follow-Up's **End relationship** still asks for both.
- A Disciple in a group is taken out of it in one press and the group goes on.
  Where she is the last Disciple in it, that is an ending and asks the same one thing.
- From the page of the one Discipler who leads a group, Unpair ends the whole group, and the question names everybody it ends for before it does.
- Nobody is sent anything and nothing is deleted, whichever act it is.
- **Not built, and no button is offered on these three lines:**
  a Discipler who leads a group beside another who has accepted, where the group should go on without them, because a leader cannot leave a relationship yet (`departure.person_is_a_leader`);
  a Discipler invited to a group that is already running, whose invitation is declined or runs out;
  and a Disciple in a group nobody has accepted, where cancelling is the whole group's and nobody can leave what has not started.
- **Seen and left:** the person page names a group by its people and never by its name.
  The person page's document does not carry the name, so naming it is a change to that read.

## Where the popup lives

The popup is drawn over the Roster, like the import dialog, at `/roster?pair=<personId>`.

- A refresh keeps it open, because the state is in the Roster's address.
- A refused submission redirects to `/roster?pair=<personId>&error=<code>` with every choice in the query string (ticked people, shape, gender, group name, Materials, chosen group), and the popup reopens with the reason and everything restored.
- `/roster/pair` redirects into `/roster?pair=…`, carrying its query, so the links from the person page and the Follow-Up tab keep working.
  The old page is deleted.
- **The toggle decides which side the popup opens on** for somebody who is on both lists.
  On Disciples it opens as a Disciple; on Disciplers it opens as a Discipler; on All, a Discipler opens as a Discipler.
- The X, Cancel and the backdrop all close it without saving and return to the Roster as it was.
- The popup needs JavaScript, as the import dialog does.
  The form it submits still posts without script.

## The popup, from a Discipler

Title: **Pair Claire Martinez**.
Beneath it, one line saying who the list is for.

### The list

- One row per Disciple who has completed Intake and not opted out, with a checkbox, avatar initials, name, and email and phone beneath, each missing detail simply absent.
- The first-time note the Pair page shows today is kept on the row.
- A Disciple already in a group is listed, and the row names the group.
- A Disciple already in a 1:1 is listed, and greyed with *Already in a 1:1 with {name}* while the shape would make a 1:1.
  They can be ticked for a 1:2 or a Group.
  This is exactly the database's own rule, `participant_one_open_one_to_one`: one open 1:1 as a participant, any number of groups.
- A toolbar above the list counts it (*7 disciples · 3 groups*) and offers **Clear**.
  There is no Select all.
- The list says it scrolls, on both sides (James, 2026-09-21): a light scrollbar that does not hide itself, where the browser lets a page say so, and a fade at its bottom edge while there is more below.
- Below the Disciples, under a **Groups** heading, the Ministry's groups (see *Joining an existing group*).
- Ticking a Disciple clears a chosen group, and choosing a group clears every tick.
  The popup does one thing at a time.

### The shape toggle

- Hidden while zero or one Disciple is ticked.
- At two: **1:2 pair** · **2 × 1:1 pairs** · **Group**, defaulting to 1:2 pair.
- At three or more: **1:2 pair** is struck out, *1:2 pair needs exactly two checked* appears beneath the toggle in grey, and the default moves to Group.
- The N in *N × 1:1 pairs* counts live.
- Once the Admin picks a segment, it stays picked until it becomes impossible.

### What each shape asks

| Shape | Gender | Name | Material |
| --- | --- | --- | --- |
| 1:1 (one ticked) | nothing | nothing | nothing |
| 1:2 pair | nothing: the Discipler's gender | nothing: generated as `{First} with {First} & {First}` and never shown | one dropdown |
| N × 1:1 pairs | nothing: each is same-gender | nothing | one dropdown per Disciple |
| Group | Women's · Men's · Coed toggle | required, placeholder `{First}'s Group` | one dropdown |

- Every Material dropdown lists the Ministry's live Materials with **No material** first, and No material is the default.
- There is no join-approval control.
  That switch decides whether somebody who picks a group on the Intake form joins at once or waits for an Admin (ADR-0017); it never governed pairing.
  A group formed here takes the default, off, and the switch stays where groups are configured, on the Intake forms page.

### The summary and the button

A sentence above the buttons says what is about to be made, and the primary button's label is the same act:

| State | Sentence | Button |
| --- | --- | --- |
| Nothing chosen | none | **Pair**, disabled |
| One ticked | Claire Martinez will disciple Sam Lee in a one-on-one. | **Create 1:1 pair** |
| 1:2 pair | Claire Martinez will disciple Sam Lee and Ana Ruiz together as a 1:2 pair. | **Create 1:2 pair** |
| N × 1:1 pairs | Claire Martinez will disciple Sam Lee and Ana Ruiz separately, in 2 one-on-ones. | **Create 2 1:1 pairs** |
| Group | Claire Martinez will lead a women's group of 3: Sam Lee, Ana Ruiz and Rosa Delgado. | **Create group of 3** |
| A group chosen | Claire Martinez will co-lead Grace's Group with Grace Lee. | **Add as co-discipler** |

The button is also disabled while a Group has no name.
**Cancel** sits beside it.

## The popup, from a Disciple

Title: **Pair Sam Lee**.

- The list is every Discipler gender does not rule out (see below), each row saying how many they already lead (*leads nobody yet*, *leads 1*), then the Groups heading and the groups.
- Exactly one choice across both sections: round marks, not boxes.
  A disciple is never given two disciplers here.
- No shape toggle ever appears, and nothing else is asked.
  Choosing a Discipler makes a 1:1; choosing a group puts them in it, and the group keeps the Material it has.
- If this Disciple is already in a 1:1, every Discipler is greyed with the reason and the groups stay open.
- **What gender rules out is not shown at all from this side** (James, 2026-09-21, reviewing ticket 03).
  A Discipler of another gender, while the Ministry enforces the match, and a group whose declaration rules this Disciple out, are left off the list and out of its count, in place of a greyed row that says why.
  Where the Ministry lets a one-to-one cross genders, everybody shows.
  Nothing an Admin can change from this side would open such a row, so it is only in the way.
  Somebody with no gender on file is never left out.
  Where that leaves the list empty, the popup says only *There is nobody to choose yet.*
  **And from a Discipler too** (James, 2026-09-21, reviewing ticket 04: "use the filter and have it actually fade").
  There the answer follows the ticks and the toggles, as **Gender** below says: a row gender rules out is not shown, and fades in where it belongs in the list when a Coed Group opens it.
- A Discipler who has not completed Intake, or who has opted out, is greyed with the words their Roster row already says, **Awaiting Intake** or **Opted out**.
  The database refuses a pairing led by either, and they get no Pair on their own row for the same reason.
  They are shown, not hidden (James, 2026-09-20): only gender leaves anybody off this list.
- *leads 1* counts people across everything a Discipler leads, so leading a group of three reads *leads 3* (James, 2026-09-20).
- Sentence and button: *Claire Martinez will disciple Sam Lee in a one-on-one.* **Create 1:1 pair**, or *Sam Lee will join Thursday Table, led by David Chen.* **Add to group**.

## Gender

- **A 1:1**, alone or as one of N × 1:1, is same-gender while the Ministry enforces the match (`suggest_gender_match`), which the database already requires.
  Nothing is asked; other-gender rows are not shown, from either side (*The popup, from a Disciple*, above).
- **A 1:2 pair** takes the Discipler's gender as its declaration and asks nothing.
  Other-gender rows are not shown while 1:2 is selected.
- **A Group** shows a **Women's · Men's · Coed** toggle directly under the shape toggle, preset from the Discipler.
  Other-gender rows are not shown until Coed is chosen, and then they fade in, and the toolbar's count follows them.
  That is how a coed group is made by hand.
  This replaces *greyed with Women's group: choose Coed to include*; those words are still what the popup's line says of somebody ticked whom a change of the toggle unticks.
  **Open, in mock-up with James** (`.lavish/coed-and-the-gender-toggle/index.html`): the toggle only exists at two ticks, so Coed cannot be reached by a Discipler whose Disciples are all of another gender, and the segment a Discipler's own gender rules out can still be pressed.
  Coed is the screen's word for the model's `declared_gender = null`, mixed.
- **A group being joined** already has its declaration, and a group that rules somebody out is not listed for them at all, from either side of the popup (James, 2026-09-21: "hidden for things that are against gender rules").
  This replaces *rows it rules out are greyed with it (A men's group)*.
- Somebody with no gender on file is never greyed in any shape.
  Both database triggers return early on a null gender, so that the readiness rules refuse the row with something the Admin can act on instead of "genders do not match".
- Greying is computed against the declaration the shape implies, never against one person.
- Changing the shape or the gender toggle re-checks every row.
  Anybody ticked who becomes greyed is unticked, and a line in the popup says who, rather than dropping them silently.

The preset keeps the 2026-09-18 decision (D1): the screen answers the gender question on the Admin's behalf, visibly and changeably, and the domain still refuses a group that declared nothing.

## Joining an existing group

Today a group can be joined only through the Intake form or an admitted join request.
This effort adds the Admin's own way in.

- **Which groups are listed:** every open relationship with two or more Disciples, 1:2 pairs included, whether it is running, paused or still awaiting its leader.
  Each row gives its name, its leaders, how many Disciples it has, its declared gender, and its state when it is not running.
  A group the person is already in is not listed.
- **How a group's row reads** (James, 2026-09-21): a mixed group says **Coed**; one nobody has accepted yet says *awaiting acceptance*, as its Roster rows do; and one nobody has named is its leaders' group, *Ruth Bader's group*, on its row and in the sentence, never their bare names.
- **A Disciple joins a group** as a participant straight away.
  The same database rules as forming one apply: Intake completed, not opted out, the group's declared gender.
  The group's leaders are texted that somebody has joined, as a self-join already does.
  Disciples never accept anything.
- **A Discipler joins a group** as another leader.
  They get an invitation link the same way a mentor does when first paired, and accept on it; the group keeps running meanwhile.
  A group needs every leader's acceptance, which is Leader Acceptance as `CONTEXT.md` already defines it.
- Both are recorded as ministry events naming the Admin.
- **An open Join Request for the same group** is resolved by the act that puts the Disciple into it, as an admitted request ends, so it leaves Intake forms (James, 2026-09-20).
  There is no second membership, nothing is sent for it and nothing is shown for it.
  It is recorded in the join's own event, which names the Admin and the request, as an admission's is, and in no second event (James, 2026-09-21).
  A request of theirs for a different group is left as it is.

## Several leaders, several groups

Decided on 2026-09-19: a group can have more than one leader, and a Discipler can lead or co-lead more than one group.

How this works on screen, and what it means for check-ins and care signals, is **not designed yet**.
James will take it through design next, now that the gender question is settled.
Until it is, the database's one-open-group-per-leader limit (`leader_one_open_group`) stands, and the popup greys what it would refuse with *Claire already leads a group*: the 1:2 and Group shapes, and every group row.
Nothing in this spec should be read as deciding how the limit is lifted.

## Rules the port is built around

These were read out of the schema, not assumed, and still hold.

- **A Material cannot be assigned at pairing.**
  `relationship.assign_material` refuses unaccepted relationships, so the pick is an intention held on the relationship and spent at acceptance (ticket 02).
- **There is no batch command.**
  `CommandService.execute` takes one command, so N × 1:1 pairs is N transactions.
  The set is validated through the boundary before any is formed, and nothing is formed unless all of it can be.
  A refusal names the Disciple it is about.
- **A 1:2 pair is a group** for every rule: `kindFor(1, 2)` is `'group'`, so it carries a name and a declaration, which is why the popup generates both.

## The tickets

There are seven files in `.scratch/manual-pairing/issues/`: six tickets to build, 01 to 06, and `07-committed-already.md`, which holds everything already committed.
Five of them are the cut of 2026-09-20, made at James's request so that fewer tickets stand between the effort and `main`.
The sixth was added on 2026-09-21: it began as an addendum on ticket 05, and James had it made a ticket of its own, which moved the archive from `06` to `07` so that it stays last.
Before it the effort was cut three times, into tickets numbered 01 to 27 and briefly 28 to 33.
Existing code, migrations and commits say "Manual pairing, ticket NN" with those old numbers; ticket 07 keeps each old ticket under its old number and says where every one of them went.
In the six tickets an earlier ticket is always written "old ticket NN", and new code says "Manual pairing, recut ticket NN".
Each ticket follows the to-tickets template (what to build, what blocks it, its status, its criteria) and says nothing about how to build it; `/implement` does that.
The files are the tickets; this table only says which part of this spec each carries, and in what order.

| Ticket | Part of this spec | Replaces old ticket | Blocked by |
| --- | --- | --- | --- |
| 01 - A co-leader accepts on a group already running | A Discipler joins a group as another leader: what their acceptance shows, records and sends | 11 | Nothing |
| 02 - Two ticked: the shapes and their Materials | The shape toggle, the 1:2 pair, N × 1:1 pairs, and a Material for each, from the route to the dropdowns | 24, and 21 stage 2 | Nothing |
| 03 - Groups in the popup, from a Disciple | Joining an existing group, from a Disciple | 25 | Nothing |
| 04 - The Group shape, and groups in the popup from a Discipler | The Group shape and its gender toggle; joining an existing group as co-leader | 26 | 01, 02, 03 |
| 05 - The old Pair page retires | `/roster/pair` redirects into the popup and the old page is deleted | 27 | 02, 04 |
| 06 - Declining an invitation, and one nobody answers is withdrawn after two weeks | Not in this spec as first written: what ends an invitation that is not accepted, decided by James on 2026-09-21 while reviewing ticket 01 | None | Nothing; worth having no later than 04 |
| 07 - Committed already | Everything built so far | 01, 02, 03, 06, 07, 08, 12, 21 stage 1, 22, 23 | Nothing to build |

01, 02 and 03 can start now; 04 and then 05 follow.

The popup lands last, on commands that already work, and its Discipler side is built unlinked until ticket 05, so nothing ships a dead control.
Old ticket 22's co-leader half was written against the current one-group limit and is not blocked on the several-leaders design.
**Add as co-discipler** (the mock's *Add as co-leader*, reworded by James on 2026-09-21 so that the Roster never says the model's Leader) gets its button in ticket 04 only after ticket 01, because until then a co-leader accepting on a running group would activate it a second time and send the Starter Message again.

## Glossary changes

- **Roster** stops saying it shows "their current participation status".
- **Declared Side** stops saying "it shows on their roster row".
- **Pair** gains the popup as where pairing happens, in place of "the pairing page".

## Out of scope

- **Moving somebody** out of one pairing and into another: a later **Swap** button on the Admin side.
- **Several leaders and several groups per Discipler**, beyond what is written above: to be designed.
- The suggestion flow: accepting a suggestion is another effort's ticket, and will open this popup.
- Editing a relationship after it is formed, other than joining a group.
