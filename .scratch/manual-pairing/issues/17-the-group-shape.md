# 17 - The Group shape

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** The toggle's third segment.
A Discipler and two or more Disciples become a named group, with a **Women's · Men's · Coed** toggle preset from the Discipler.
Choosing Coed is how a mixed group is made by hand.

**Blocked by:** 15

**Touches:** popup

**Status:** ready-for-agent

**Budget:** ~170k of 250k tokens (reads 45, writes 40, test runs 25, browser check 25, gate 35).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

**Design source:** the plan's mock state D.

## The decision this ticket carries (D1, 2026-09-18)

The domain argues that a default declaration "would be the product deciding a safeguarding question on the Admin's behalf".
James decided on 2026-09-18 that the screen answers the gender question on the Admin's behalf, preset from the Discipler, on these conditions: the answer is visible, stated in words, changeable before anything is formed, and the domain still refuses a group that declared nothing.
Every one of those conditions is an acceptance criterion below.

## Acceptance

### The segment

- [ ] At two ticked: **1:2 pair** · **2 × 1:1 pairs** · **Group**, defaulting to 1:2 pair.
- [ ] At three or more the default moves to **Group**.
- [ ] Group is a third segment in ticket 15's toggle state, not a second mechanism; the sticky-pick rule covers it.
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
  Where ticket 16 has not landed, this ticket builds the dropdown and ticket 16 reuses it.
- [ ] **No join-approval control.**
  A group formed here takes the default, off; that switch stays on the Intake forms page (ADR-0017).

### Greying

- [ ] Other-gender rows are greyed with *Women's group: choose Coed to include* (or *Men's*) until Coed is chosen, and then they open up.
- [ ] Changing the gender toggle re-checks every row.
  Anybody ticked who becomes greyed is unticked and named in the popup's line, through ticket 15's mechanism.
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

## Comments

**2026-09-18, D1 decided.**
James: yes, the declaration defaults from the chosen Discipler.
Carried over from the ticket this one replaces, *04 - The pairing form*, which the spec of 2026-09-19 superseded.
