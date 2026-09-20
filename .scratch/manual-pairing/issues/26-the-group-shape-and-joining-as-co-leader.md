# 26 - The Group shape, and groups in the popup from a Discipler

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The toggle's third segment.
A Discipler and two or more Disciples become a named group, with a **Women's · Men's · Coed** toggle preset from the Discipler.
Choosing Coed is how a mixed group is made by hand.
Then, under the Disciples, a **Groups** heading and the Ministry's groups: choosing one and pressing **Add as co-leader** adds the Discipler to it as another leader, by invitation.

**Replaces:** *17 - The Group shape* (stage 1) and *19 - Groups in the popup, from a Discipler* (stage 2), in the cut of 2026-09-20.
Every criterion of both is below.
Two lost their either-order clause, because tickets 24 and 25 now always land first: the Material dropdown is ticket 24's, and the group row is ticket 25's.
Where another ticket says ticket 17 or ticket 19, it means this ticket; ticket 02's Comments name 17 for restoring a Material after a refusal, and ticket 08 says what its read leaves to the popup.

**Blocked by:** 22, 24, 25

**Touches:** popup-discipler

**Status:** ready-for-agent

**Budget:** two sessions of 250k tokens each, one per stage: stage 1 ~170k (reads 45, writes 40, test runs 25, browser check 25, gate 35); stage 2 ~140k (reads 45, writes 30, test runs 20, browser check 20, gate 25).
This effort's first tickets ran about one and a half times over their estimates (see the Comments on 03, 06 and 08), so 200k is the stop line in either stage: commit what is coherent, write what is left in `.agent/handoff.md`, and stop.

**Design source:** the plan's mock state D for stage 1, and mock state G for stage 2.

## Stages

This ticket is one branch and one review, built in two sessions.
A session does the first stage below that still has an unticked criterion, commits, reports and stops; the next session starts fresh on the same branch.
The review happens once, after stage 2.

Stage 2 does not wait on ticket 11.
Adding a co-leader works from ticket 22 on; what their acceptance sends is a separate question with its own ticket.

## The decision stage 1 carries (D1, 2026-09-18)

The domain argues that a default declaration "would be the product deciding a safeguarding question on the Admin's behalf".
James decided on 2026-09-18 that the screen answers the gender question on the Admin's behalf, preset from the Discipler, on these conditions: the answer is visible, stated in words, changeable before anything is formed, and the domain still refuses a group that declared nothing.
Every one of those conditions is an acceptance criterion below.

## Stage 1 - The Group shape

### The segment

- [ ] At two ticked: **1:2 pair** · **2 × 1:1 pairs** · **Group**, defaulting to 1:2 pair.
- [ ] At three or more the default moves to **Group**.
- [ ] Group is a third segment in ticket 24's toggle state, not a second mechanism; the sticky-pick rule covers it.
- [ ] A Discipler who already leads a group sees **Group** greyed with *{name} already leads a group*, as 1:2 already is.

### What Group asks

- [ ] A **Women's · Men's · Coed** toggle directly under the shape toggle, preset from the Discipler's gender.
  Coed is the screen's word for mixed, the model's `declared_gender = null`.
- [ ] A Discipler with no gender on file presets nothing, and the button stays disabled until the Admin chooses.
  The screen never posts a declaration nobody made.
- [ ] A name, required, with the placeholder `{First}'s Group`.
  The placeholder is a hint and is never submitted as the name.
- [ ] The primary button is disabled while the name is empty or only spaces.
- [ ] One Material dropdown, No material first and the default, posted as the group's single Material.
  It is the dropdown ticket 24 built, reused.
- [ ] **No join-approval control.**
  A group formed here takes the default, off; that switch stays on the Intake forms page (ADR-0017).

### Greying

- [ ] Other-gender rows are greyed with *Women's group: choose Coed to include* (or *Men's*) until Coed is chosen, and then they open up.
- [ ] Changing the gender toggle re-checks every row.
  Anybody ticked who becomes greyed is unticked and named in the popup's line, through ticket 24's mechanism.
- [ ] No gender on file is never greyed, under any of the three.
- [ ] A Disciple already in a one-to-one, or already in another group, can be ticked for a Group.

### Sentence and button

- [ ] *Claire Martinez will lead a women's group of 3: Sam Lee, Ana Ruiz and Rosa Delgado.* **Create group of 3**, with the count and the gender word live.
- [ ] Coed reads as a coed group, and the sentence never says a gender the toggle does not show.

### Refusals and checks

- [ ] A refusal restores the ticks, the shape, the gender, the name and the Material.
- [ ] Posting without a declaration is still refused by the domain; a test posts the form without one and sees the refusal.
- [ ] Over HTTP: a women's group of three forms with its name and declaration; a Coed group holds both genders; a women's group with a man posted anyway is refused and forms nothing.
- [ ] Looked at in a browser beside mock state D at desktop and phone width, with the list still usable while the panel is open.

## Stage 2 - Groups in the popup, from a Discipler

### The rows

- [ ] A **Groups** heading below the Disciples, then one row per group from ticket 08's read, with a round mark.
- [ ] Rows read as ticket 25's do: name, leaders, how many Disciples, declared gender, state when not running, and an unnamed group labelled by its leaders.
  Ticket 25's row is reused.
- [ ] A group this Discipler is already in, in either role, is not listed.
- [ ] The toolbar counts both: *7 disciples · 3 groups*.

### One thing at a time

- [ ] Ticking a Disciple clears a chosen group, and choosing a group clears every tick.
- [ ] With a group chosen, the shape toggle, the gender toggle, the name and every Material dropdown are hidden.
- [ ] **Clear** clears a chosen group as well as the ticks.

### Greying

- [ ] A group whose declaration rules this Discipler out is greyed with it (*A men's group*).
- [ ] A Discipler who already leads a group sees **every group row** greyed with *{name} already leads a group*, beside the 1:2 and Group shapes that ticket 24 and stage 1 already grey.
  `leader_one_open_group` stands, and nothing here decides how it is lifted.
- [ ] No gender on file is never greyed.

### Sentence, button, submit

- [ ] *Claire Martinez will co-lead Grace's Group with Grace Lee.* **Add as co-leader**.
  Several existing leaders are all named.
- [ ] It posts to ticket 22's route.
  The Roster's receipt says an invitation was sent and that the group carries on meanwhile; it does not say Claire leads it yet.
- [ ] A refusal reopens the popup with the reason and the chosen group restored.

### Checked

- [ ] Over HTTP: the Groups section for a Discipler who leads nobody and for one who already leads a group; the co-leader round trip; a refusal restored.
- [ ] Looked at in a browser beside mock state G, scrolled to the bottom of the list, at desktop and phone width.

## Comments

**2026-09-18, D1 decided.**
James: yes, the declaration defaults from the chosen Discipler.
Carried over from *17 - The Group shape*, which carried it from the ticket it replaced, *04 - The pairing form*, which the spec of 2026-09-19 superseded.
