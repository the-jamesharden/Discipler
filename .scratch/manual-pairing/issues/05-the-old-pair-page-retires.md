# 05 - The old Pair page retires

**What to build:** Every Pair button opens the popup, `/roster/pair` redirects into it, and the old page is deleted.
This is the moment the Discipler's side, built unlinked over old ticket 23 and then ticket 02 and ticket 04, becomes what an Admin gets.

**Blocked by:** 02, 04
It does not wait on ticket 03.

**Status:** ready-for-agent

**Old tickets:** this is old ticket 27, whole; none of it is committed.
Every criterion is below, unchanged.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `07-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".
It stays a ticket of its own so that the switch is one change, reviewed alone and reverted alone.
Old ticket 21's Comments, in `07-committed-already.md`, say the old Pair page sends `mode` back as a hidden field; it goes with the page.

## Why last

The old page can form a one-to-one, a group with a name, a declaration and a Material.
Once old ticket 02 and old ticket 04 have landed the popup can do all of that, and nothing is lost by the switch.

Joining a group is new and the old page never did it, so the switch does not depend on it.
In this cut the Group shape shares old ticket 04 with the co-leader's side of the popup, so this ticket waits for both; that is a consequence of the cut and not a dependency.

## Acceptance

### Rows

- [ ] **Pair** on a Discipler's row, on Disciplers and on All, opens the popup on the Discipler's side.
- [ ] No row, on any list, links to `/roster/pair`.

### The redirect

- [ ] `/roster/pair` redirects into `/roster?pair=…`, carrying its query, so the links from the person page and the Follow-Up tab keep working.
- [ ] A Discipler named in the old query opens the popup for them on the Discipler's side, with any Disciple the query named already ticked.
- [ ] A Disciple alone in the old query, which is the Follow-Up tab's link, opens the popup for them on the Disciple's side.
- [ ] A refusal's query (the error and every restored choice) survives the redirect, so a bookmarked or in-flight refusal still reads.
- [ ] `/roster/pair` with nobody in its query has nobody to open a popup for, and redirects to the Roster.
  Nothing links to it that way once old ticket 07 has removed *Pair people*.
  This one is a default taken while writing the tickets, not a line of the spec; James can overrule it on this ticket.
- [ ] The person page and the Follow-Up tab are changed to link to the popup directly, so the redirect serves old links and not the app's own.

### Deleted

- [ ] The old page, its styles and its copy that nothing else uses.
- [ ] The pairing route's refusals all return to the popup; the branch that returned to the old page is gone.
- [ ] The pairing route itself stays where it is and still posts without script.

### Glossary

- [ ] **Pair** in `CONTEXT.md` names the popup as where pairing happens, in place of "the pairing page".

### Checked

- [ ] The pairing suites that drove the old page over HTTP drive the popup's address instead, and none is deleted for being inconvenient.
- [ ] Over HTTP: each old link shape redirects where this ticket says.
- [ ] Looked at in a browser: Pair from a Discipler row, from a Disciple row, from the person page and from Follow-Up each open the right side of the popup.

## Comments

### An addendum that was here is ticket 06

On 2026-09-20 and 2026-09-21 this ticket carried an addendum, first *Unsending an invitation* and then *Declining an invitation, and one nobody answers is withdrawn after two weeks*, because this was the shortest ticket left.
James had it made a ticket of its own on 2026-09-21: `06-declining-and-the-two-weeks.md`.
Nothing of it is left here, and this ticket is the redirect and nothing else, as it was cut.
