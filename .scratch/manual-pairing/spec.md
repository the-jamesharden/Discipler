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
- **Removed:** the *Pair people* button, from the Roster and from Suggested Pairs.
  Every pairing starts from a row.
- **Removed, and pinned:** *Eligible to lead* left the app on 2026-09-07 (`b8894d5`) and survives only in the design prototype `.scratch/core-operating-loop/design/discipler-dashboard-v10.html`.
  A test asserts the words never appear on the Roster.
- With the chip gone, a row that cannot be paired says why in its Paired with cell: **Awaiting Intake** or **Opted out**, in place of *Unpaired* and a Pair button.
- **Pair** appears on every Discipler row, including a Discipler who already leads somebody, and on every Disciple row whose person has completed Intake and not opted out.

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
| A group chosen | Claire Martinez will co-lead Grace's Group with Grace Lee. | **Add as co-leader** |

The button is also disabled while a Group has no name.
**Cancel** sits beside it.

## The popup, from a Disciple

Title: **Pair Sam Lee**.

- The list is every Discipler, each row saying how many they already lead (*leads nobody yet*, *leads 1*), then the Groups heading and the groups.
- Exactly one choice across both sections: round marks, not boxes.
  A disciple is never given two disciplers here.
- No shape toggle ever appears, and nothing else is asked.
  Choosing a Discipler makes a 1:1; choosing a group puts them in it, and the group keeps the Material it has.
- If this Disciple is already in a 1:1, every Discipler is greyed with the reason and the groups stay open.
- Sentence and button: *Claire Martinez will disciple Sam Lee in a one-on-one.* **Create 1:1 pair**, or *Sam Lee will join Thursday Table, led by David Chen.* **Add to group**.

## Gender

- **A 1:1**, alone or as one of N × 1:1, is same-gender while the Ministry enforces the match (`suggest_gender_match`), which the database already requires.
  Nothing is asked; other-gender rows are greyed with the reason.
- **A 1:2 pair** takes the Discipler's gender as its declaration and asks nothing.
  Other-gender rows are greyed while 1:2 is selected.
- **A Group** shows a **Women's · Men's · Coed** toggle directly under the shape toggle, preset from the Discipler.
  Other-gender rows are greyed with *Women's group: choose Coed to include* until Coed is chosen, and then they open up.
  That is how a coed group is made by hand.
  Coed is the screen's word for the model's `declared_gender = null`, mixed.
- **A group being joined** already has its declaration; rows it rules out are greyed with it (*A men's group*).
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
- **A Disciple joins a group** as a participant straight away.
  The same database rules as forming one apply: Intake completed, not opted out, the group's declared gender.
  The group's leaders are texted that somebody has joined, as a self-join already does.
  Disciples never accept anything.
- **A Discipler joins a group** as another leader.
  They get an invitation link the same way a mentor does when first paired, and accept on it; the group keeps running meanwhile.
  A group needs every leader's acceptance, which is Leader Acceptance as `CONTEXT.md` already defines it.
- Both are recorded as ministry events naming the Admin.

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

Numbered on from the shipped two.
Cut on 2026-09-19 into eighteen tickets, 03 to 20, so that each fitted one implementing session of 250k tokens.
Cut again on 2026-09-20, once 03, 06, 07, 08 and 12 were built: the thirteen that had not started became eight, so that fewer reviews, worktrees and whole-suite runs stand between the effort and `main`.
No session grew: a condensed ticket is built in **stages**, one fresh session each on the one branch, and reviewed once (`docs/agents/workflow.md`, *Tokens*).
The files in `.scratch/manual-pairing/issues/` are the tickets; these tables only say which part of this spec each carries, and what may be open together.

| Tickets | Part of this spec | Ships |
| --- | --- | --- |
| 03, 21 | Separate 1:1 pairs in one submission, with a Material per Disciple | Invisible: the route learns the mode |
| 06, 07 | The Roster's three lists and quieter rows | The Roster |
| 08, 22, 11 | Joining an existing group | Invisible: two Admin commands and the groups on the Pair document |
| 12, 23 to 27 | The Pair popup, rewritten, and the old page retired | The popup |

| Ticket | Replaces | Stages | Waits for |
| --- | --- | --- | --- |
| 21 - Separate one-to-ones, with a Material each | 04, 05 | 2 | 03 |
| 22 - An Admin puts somebody into a group | 09, 10 | 2 | 08 |
| 23 - Who is greyed, and the popup from a Discipler | 13, 14 | 2 | 12 |
| 24 - Two ticked: the shapes and their Materials | 15, 16 | 2 | 21, 23 |
| 25 - Groups in the popup, from a Disciple | 18 | 1 | 22, 23 |
| 26 - The Group shape, and groups from a Discipler | 17, 19 | 2 | 22, 24, 25 |
| 27 - The old Pair page retires | 20 | 1 | 24, 26 |
| 11 - A co-leader accepts on a running group | itself | 1 | 22 |

What may be open together:

1. **21, 22 and 23.**
   21 and 22 can start now; 23 starts when 12 is integrated.
2. **24, 25 and 11.**
   James answered ticket 11's three questions on 2026-09-20, so it waits only on 22.
   Ticket 23 leaves each side of the popup in a file of its own, which is what lets 24 (`Touches: popup-discipler`) and 25 (`Touches: popup-disciple`) be open at once.
3. **26.**
4. **27.**

The popup lands last, on commands that already work, and its Discipler side is built unlinked until ticket 27, so nothing ships a dead control.
Ticket 22's second stage, the co-leader half, is written against the current one-group limit and is not blocked on the several-leaders design.

## Glossary changes

- **Roster** stops saying it shows "their current participation status".
- **Declared Side** stops saying "it shows on their roster row".
- **Pair** gains the popup as where pairing happens, in place of "the pairing page".

## Out of scope

- **Moving somebody** out of one pairing and into another: a later **Swap** button on the Admin side.
- **Several leaders and several groups per Discipler**, beyond what is written above: to be designed.
- The suggestion flow: accepting a suggestion is another effort's ticket, and will open this popup.
- Editing a relationship after it is formed, other than joining a group.
