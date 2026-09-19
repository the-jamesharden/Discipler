# 15 - Two ticked: the shape toggle, the 1:2 pair and N × 1:1 pairs

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** With two or more Disciples ticked, a toggle asks what to make of them.
**1:2 pair** forms one relationship of three people, named and declared without asking.
**N × 1:1 pairs** forms N one-to-ones in one submission, all or none.

**Blocked by:** 04, 14

**Touches:** popup

**Status:** ready-for-agent

**Budget:** ~175k of 250k tokens (reads 45, writes 45, test runs 25, browser check 25, gate 35).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

**Design source:** the plan's mock states B and C.

## Out of this ticket

The **Group** segment is ticket 17, and Material dropdowns are ticket 16.
Here every relationship is formed with no Material, which is the default anyway.
At three or more ticked, only N × 1:1 can be made until ticket 17 lands; this side is still not linked from any row.

## Acceptance

### The toggle

- [ ] Hidden while zero or one Disciple is ticked.
- [ ] At two: **1:2 pair** and **2 × 1:1 pairs**, defaulting to 1:2 pair.
- [ ] At three or more: **1:2 pair** is struck out and cannot be picked, and *1:2 pair needs exactly two checked* appears beneath the toggle in grey.
- [ ] The N in *N × 1:1 pairs* counts live.
- [ ] Once the Admin picks a segment, it stays picked until it becomes impossible; untouched, the default follows the count.
- [ ] The toggle's state is one small pure function of the ticks, the Admin's pick and what is possible, tested without a browser.
  Ticket 17 adds a segment to it, not a second mechanism.

### The 1:2 pair

- [ ] Nothing is asked.
  The name is generated as `{First} with {First} & {First}` and never shown, and the Discipler's gender is posted as the declaration.
  A 1:2 is a group for every rule, which is why it carries both.
- [ ] A Discipler with no gender on file posts no declaration, and the domain's refusal comes back in words the Admin can act on.
- [ ] Other-gender rows are greyed while 1:2 is selected.
- [ ] A Disciple already in a one-to-one **can** be ticked for a 1:2.
- [ ] Sentence and button: *Claire Martinez will disciple Sam Lee and Ana Ruiz together as a 1:2 pair.* **Create 1:2 pair**.

### N × 1:1 pairs

- [ ] Posts `mode=separate` from ticket 04, and forms N one-to-ones or none.
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

- [ ] A refusal restores the ticks and the shape, and names the Disciple it is about where ticket 04 does.
- [ ] Ticket 14's placeholder line for two or more ticked is gone.
- [ ] Over HTTP: a 1:2 forms one relationship with a generated name and the Discipler's gender; 3 × 1:1 forms three; a set with one refusal forms none and the popup reopens with everything restored.
- [ ] Looked at in a browser beside mock states B and C, including the struck-out segment and its hint at three ticked.
