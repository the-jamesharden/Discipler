# 02 - Two ticked: the shape toggle, the 1:2 pair and N × 1:1 pairs, and their Materials

**What to build:** With two or more Disciples ticked, a toggle asks what to make of them.
**1:2 pair** forms one relationship of three people, named and declared without asking.
**N × 1:1 pairs** forms N one-to-ones in one submission, all or none.
Then the Material dropdowns the mock draws for those two shapes: one for a 1:2 pair, and one per Disciple for N × 1:1 pairs.
Behind the popup, a separate submission carries a Material for each Disciple, each held on its own one-to-one and spent at acceptance.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

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

- [ ] Hidden while zero or one Disciple is ticked.
- [ ] At two: **1:2 pair** and **2 × 1:1 pairs**, defaulting to 1:2 pair.
- [ ] At three or more: **1:2 pair** is struck out and cannot be picked, and *1:2 pair needs exactly two checked* appears beneath the toggle in grey.
- [ ] The N in *N × 1:1 pairs* counts live.
- [ ] Once the Admin picks a segment, it stays picked until it becomes impossible; untouched, the default follows the count.
- [ ] The toggle's state is one small pure function of the ticks, the Admin's pick and what is possible, tested without a browser.
  Ticket 04 adds a segment to it, not a second mechanism.

### The 1:2 pair

- [ ] Nothing is asked.
  The name is generated as `{First} with {First} & {First}` and never shown, and the Discipler's gender is posted as the declaration.
  A 1:2 is a group for every rule, which is why it carries both.
- [ ] A Discipler with no gender on file posts no declaration, and the domain's refusal comes back in words the Admin can act on.
- [ ] Other-gender rows are greyed while 1:2 is selected.
- [ ] A Disciple already in a one-to-one **can** be ticked for a 1:2.
- [ ] Sentence and button: *Claire Martinez will disciple Sam Lee and Ana Ruiz together as a 1:2 pair.* **Create 1:2 pair**.

### N × 1:1 pairs

- [ ] Posts `mode=separate` from old ticket 21, and forms N one-to-ones or none.
- [ ] Each is same-gender while the Ministry enforces the match, and a Disciple already in a one-to-one is greyed.
- [ ] Sentence and button: *Claire Martinez will disciple Sam Lee and Ana Ruiz separately, in 2 one-on-ones.* **Create 2 1:1 pairs**.

### Re-checking

- [ ] Changing the shape re-checks every row against the declaration the new shape implies.
- [ ] Anybody ticked who becomes greyed is unticked, and a line in the popup says who, rather than dropping them silently.
  A Disciple already in a one-to-one, ticked under 1:2 and then moved to N × 1:1, is the case that proves it.
- [ ] If unticking drops the count below two, the toggle hides and the one-tick sentence returns.

### The one-group limit

- [ ] A Discipler who already leads a group sees the **1:2 pair** segment greyed with *{name} already leads a group*, and the default moves to N × 1:1.
  `leader_one_open_group` stands, and nothing here decides how it is lifted.

### Refusals and checks

- [ ] A refusal restores the ticks and the shape, and names the Disciple it is about where old ticket 21 does.
- [ ] Old ticket 23's placeholder line for two or more ticked is gone.
- [ ] Over HTTP: a 1:2 forms one relationship with a generated name and the Discipler's gender; 3 × 1:1 forms three; a set with one refusal forms none and the popup reopens with everything restored.
- [ ] Looked at in a browser beside mock states B and C, including the struck-out segment and its hint at three ticked.

## A Material per Disciple, behind the route

Read old ticket 03's Comments in `06-committed-already.md` before starting, from *what the check cannot predict (for ticket 04)* to the end; they were written for the session that builds this.

In `separate` mode, each Disciple carries their own Material choice, held as an intention on their one-to-one and spent at acceptance.
The popup's per-Disciple dropdowns are the section after this one.

- [ ] A `separate` submission can name a Material for each Disciple, and each one-to-one formed holds the Material named for its own Disciple.
- [ ] A Disciple with no Material named gets none.
  No material is the default, and one Disciple's choice never spills onto another.
- [ ] A Material named for somebody who is not among the submitted Disciples is ignored rather than refused.
- [ ] A Material the Ministry does not hold, or one that has been removed, refuses the whole set through old ticket 03's check, and the refusal names the Disciple it was chosen for.
- [ ] A refusal returns every Disciple's Material choice with the rest of the selection.
- [ ] `together` mode still takes the single Material old ticket 02 gave it, and ignores any per-Disciple choice.
- [ ] Over HTTP: a Discipler and two Disciples, a different Material each, produce two one-to-ones; accepting each writes that Disciple's Material into its history, as old ticket 02 does for one.

## Materials on the 1:2 pair and on each of N × 1:1

- [ ] Every Material dropdown lists the Ministry's live Materials with **No material** first, and No material is the default.
- [ ] A one-to-one from a single tick still asks nothing, a Material included.
- [ ] **1:2 pair** shows one dropdown, posted as the single Material old ticket 02 holds on the relationship.
- [ ] **N × 1:1 pairs** shows one dropdown per ticked Disciple, each labelled with that Disciple's name, posted as the per-Disciple choice the section above gives the route.
- [ ] Ticking another Disciple adds their dropdown at No material; unticking one removes theirs and leaves the others' choices as they were.
- [ ] A choice made under one shape is not carried into the other: moving from N × 1:1 to 1:2 starts the 1:2's dropdown at No material.
- [ ] A Ministry with no live Materials shows no dropdowns and no empty label where they would have been.
- [ ] The dropdowns sit inside the popup without pushing the buttons off screen; with many ticked, they scroll with the panel they are in.
- [ ] A refusal restores every Material choice with the rest.
- [ ] A Material removed between opening the popup and submitting comes back as a refusal naming it, with the rest of the selection intact.
- [ ] Over HTTP: a 1:2 with a Material holds it as intended and writes it at acceptance; 2 × 1:1 with a different Material each hold one apiece.
- [ ] Looked at in a browser beside mock states B and C, and with five ticked at phone width.

## Comments

### What stage 1 of old ticket 21 left for this

`SeparateSubmission` is where the per-Disciple Material goes, and `oneToOnesFor` is where each command picks up its own.
The route's `separate` branch passes no Material at all today, and says so in a comment.
Old ticket 03's note stands: a check that names a Material holds the Ministry-wide advisory lock for as long as it runs, once per Disciple.
