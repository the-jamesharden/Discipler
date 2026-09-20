# 24 - Two ticked: the shape toggle, the 1:2 pair and N × 1:1 pairs, and their Materials

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** With two or more Disciples ticked, a toggle asks what to make of them.
**1:2 pair** forms one relationship of three people, named and declared without asking.
**N × 1:1 pairs** forms N one-to-ones in one submission, all or none.
Then the Material dropdowns the mock draws for those two shapes: one for a 1:2 pair, and one per Disciple for N × 1:1 pairs.

**Replaces:** *15 - Two ticked: the shape toggle, the 1:2 pair and N × 1:1 pairs* (stage 1) and *16 - Materials on the 1:2 pair and on each of N × 1:1* (stage 2), in the cut of 2026-09-20.
Every criterion of both is below, unchanged.
Both are built from mock states B and C.
Where another ticket says ticket 15 or ticket 16, it means this ticket; ticket 02's Comments name 16 for restoring a Material after a refusal.

**Blocked by:** 21, 23

**Touches:** popup-discipler

**Status:** ready-for-agent

**Budget:** two sessions of 250k tokens each, one per stage: stage 1 ~175k (reads 45, writes 45, test runs 25, browser check 25, gate 35); stage 2 ~110k (reads 35, writes 25, test runs 15, browser check 15, gate 20).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line in either stage: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.
Stage 1 is the largest stage in the effort and may well take a second session of its own; that is what the stop line is for.

**Design source:** the plan's mock states B and C.

## Stages

This ticket is one branch and one review, built in two sessions.
A session does the first stage below that still has an unticked criterion, commits, reports and stops; the next session starts fresh on the same branch.
The review happens once, after stage 2.

## Out of this ticket

The **Group** segment is ticket 26.
At three or more ticked, only N × 1:1 can be made until ticket 26 lands; this side is still not linked from any row.

## Stage 1 - The toggle, the 1:2 pair and N × 1:1 pairs

Here every relationship is formed with no Material, which is the default anyway.

### The toggle

- [ ] Hidden while zero or one Disciple is ticked.
- [ ] At two: **1:2 pair** and **2 × 1:1 pairs**, defaulting to 1:2 pair.
- [ ] At three or more: **1:2 pair** is struck out and cannot be picked, and *1:2 pair needs exactly two checked* appears beneath the toggle in grey.
- [ ] The N in *N × 1:1 pairs* counts live.
- [ ] Once the Admin picks a segment, it stays picked until it becomes impossible; untouched, the default follows the count.
- [ ] The toggle's state is one small pure function of the ticks, the Admin's pick and what is possible, tested without a browser.
  Ticket 26 adds a segment to it, not a second mechanism.

### The 1:2 pair

- [ ] Nothing is asked.
  The name is generated as `{First} with {First} & {First}` and never shown, and the Discipler's gender is posted as the declaration.
  A 1:2 is a group for every rule, which is why it carries both.
- [ ] A Discipler with no gender on file posts no declaration, and the domain's refusal comes back in words the Admin can act on.
- [ ] Other-gender rows are greyed while 1:2 is selected.
- [ ] A Disciple already in a one-to-one **can** be ticked for a 1:2.
- [ ] Sentence and button: *Claire Martinez will disciple Sam Lee and Ana Ruiz together as a 1:2 pair.* **Create 1:2 pair**.

### N × 1:1 pairs

- [ ] Posts `mode=separate` from ticket 21, and forms N one-to-ones or none.
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

- [ ] A refusal restores the ticks and the shape, and names the Disciple it is about where ticket 21 does.
- [ ] Ticket 23's placeholder line for two or more ticked is gone.
- [ ] Over HTTP: a 1:2 forms one relationship with a generated name and the Discipler's gender; 3 × 1:1 forms three; a set with one refusal forms none and the popup reopens with everything restored.
- [ ] Looked at in a browser beside mock states B and C, including the struck-out segment and its hint at three ticked.

## Stage 2 - Materials on the 1:2 pair and on each of N × 1:1

- [ ] Every Material dropdown lists the Ministry's live Materials with **No material** first, and No material is the default.
- [ ] A one-to-one from a single tick still asks nothing, a Material included.
- [ ] **1:2 pair** shows one dropdown, posted as the single Material ticket 02 holds on the relationship.
- [ ] **N × 1:1 pairs** shows one dropdown per ticked Disciple, each labelled with that Disciple's name, posted as ticket 21's per-Disciple choice.
- [ ] Ticking another Disciple adds their dropdown at No material; unticking one removes theirs and leaves the others' choices as they were.
- [ ] A choice made under one shape is not carried into the other: moving from N × 1:1 to 1:2 starts the 1:2's dropdown at No material.
- [ ] A Ministry with no live Materials shows no dropdowns and no empty label where they would have been.
- [ ] The dropdowns sit inside the popup without pushing the buttons off screen; with many ticked, they scroll with the panel they are in.
- [ ] A refusal restores every Material choice with the rest.
- [ ] A Material removed between opening the popup and submitting comes back as a refusal naming it, with the rest of the selection intact.
- [ ] Over HTTP: a 1:2 with a Material holds it as intended and writes it at acceptance; 2 × 1:1 with a different Material each hold one apiece.
- [ ] Looked at in a browser beside mock states B and C, and with five ticked at phone width.
