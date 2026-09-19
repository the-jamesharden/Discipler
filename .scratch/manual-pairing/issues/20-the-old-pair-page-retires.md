# 20 - The old Pair page retires

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** Every Pair button opens the popup, `/roster/pair` redirects into it, and the old page is deleted.
This is the moment the Discipler's side, built unlinked over tickets 14 to 17, becomes what an Admin gets.

**Blocked by:** 16, 17

**Touches:** popup

**Status:** ready-for-agent

**Budget:** ~100k of 250k tokens (reads 35, writes 20, test runs 20, browser check 10, gate 15).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why last

The old page can form a one-to-one, a group with a name, a declaration and a Material.
Once tickets 16 and 17 have landed the popup can do all of that, and nothing is lost by the switch.
Joining a group (tickets 18 and 19) is new and the old page never did it, so this ticket does not wait on them.

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
  Nothing links to it that way once ticket 07 has removed *Pair people*.
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
