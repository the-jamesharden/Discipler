# 04 - The Group shape, and groups in the popup from a Discipler

**What to build:** The toggle's third segment.
A Discipler and two or more Disciples become a named group, with a **Women's · Men's · Coed** toggle preset from the Discipler.
Choosing Coed is how a mixed group is made by hand.
Then, under the Disciples, a **Groups** heading and the Ministry's groups: choosing one and pressing **Add as co-leader** adds the Discipler to it as another leader, by invitation.

**Blocked by:** 01, 02, 03
Old ticket 26 said its co-leader half did not wait on old ticket 11.
That was written before old ticket 22's second stage found that a co-leader accepting on a running group activates it a second time and sends the Starter Message again to every leader and every Disciple.
Ticket 01 is the fix, so **Add as co-leader** gets no button before it.

**Status:** ready-for-agent

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

- [ ] At two ticked: **1:2 pair** · **2 × 1:1 pairs** · **Group**, defaulting to 1:2 pair.
- [ ] At three or more the default moves to **Group**.
- [ ] Group is a third segment in ticket 02's toggle state, not a second mechanism; the sticky-pick rule covers it.
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
  It is the dropdown ticket 02 built, reused.
- [ ] **No join-approval control.**
  A group formed here takes the default, off; that switch stays on the Intake forms page (ADR-0017).

### Greying

- [ ] Other-gender rows are greyed with *Women's group: choose Coed to include* (or *Men's*) until Coed is chosen, and then they open up.
- [ ] Changing the gender toggle re-checks every row.
  Anybody ticked who becomes greyed is unticked and named in the popup's line, through ticket 02's mechanism.
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

## Groups in the popup, from a Discipler

### The rows

- [ ] A **Groups** heading below the Disciples, then one row per group from old ticket 08's read, with a round mark.
- [ ] Rows read as ticket 03's do: name, leaders, how many Disciples, declared gender, state when not running, and an unnamed group labelled by its leaders.
  Ticket 03's row is reused.
- [ ] A group this Discipler is already in, in either role, is not listed.
- [ ] The toolbar counts both: *7 disciples · 3 groups*.

### One thing at a time

- [ ] Ticking a Disciple clears a chosen group, and choosing a group clears every tick.
- [ ] With a group chosen, the shape toggle, the gender toggle, the name and every Material dropdown are hidden.
- [ ] **Clear** clears a chosen group as well as the ticks.

### Greying

- [ ] A group whose declaration rules this Discipler out is not listed at all, and is not counted.
  Reworded by James's decision of 2026-09-21, made while reviewing ticket 03; it read *is greyed with it (A men's group)*.
  In his words: "hidden for things that are against gender rules ... that woman should not have to see any of the male-only groups."
  The rule is built and tested already, for both sides: `groupLeftOut` in `app/roster/greying.ts`, which the Disciple's side applies in `app/roster/page.tsx`.
  The greyed-group rule and its words, *A men's group*, were removed with it, so there is nothing of that to reuse.
  **Not decided by that answer:** the Disciples' own rows on this side.
  They are still greyed for gender as this ticket says, *Women's group: choose Coed to include*, because Coed opens them again and that is how a coed group is made by hand.
  James was asked whether to hide those too and his answer spoke only of groups and of the popup from a Disciple; if he wants them hidden, that is his to say before this ticket's *Gender* criteria are built.
- [ ] A Discipler who already leads a group sees **every group row** greyed with *{name} already leads a group*, beside the 1:2 and Group shapes that ticket 02 and the Group shape above already grey.
  `leader_one_open_group` stands, and nothing here decides how it is lifted.
- [ ] No gender on file is never greyed.

### Sentence, button, submit

- [ ] *Claire Martinez will co-lead Grace's Group with Grace Lee.* **Add as co-leader**.
  Several existing leaders are all named.
- [ ] It posts to old ticket 22's route.
  The Roster's receipt says an invitation was sent and that the group carries on meanwhile; it does not say Claire leads it yet.
- [ ] A refusal reopens the popup with the reason and the chosen group restored.

### Checked

- [ ] Over HTTP: the Groups section for a Discipler who leads nobody and for one who already leads a group; the co-leader round trip; a refusal restored.
- [ ] Looked at in a browser beside mock state G, scrolled to the bottom of the list, at desktop and phone width.

## Comments

**2026-09-18, D1 decided.**
James: yes, the declaration defaults from the chosen Discipler.
Carried over from *17 - The Group shape*, which carried it from the ticket it replaced, *04 - The pairing form*, which the spec of 2026-09-19 superseded.
