# 05 - The old Pair page retires

**What to build:** Every Pair button opens the popup, `/roster/pair` redirects into it, and the old page is deleted.
This is the moment the Discipler's side, built unlinked over old ticket 23 and then ticket 02 and ticket 04, becomes what an Admin gets.

**Blocked by:** 02, 04
It does not wait on ticket 03.

**Status:** ready-for-agent

**Old tickets:** this is old ticket 27, whole; none of it is committed.
Every criterion is below, unchanged.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `06-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".
It stays a ticket of its own so that the switch is one change, reviewed alone and reverted alone.
Old ticket 21's Comments, in `06-committed-already.md`, say the old Pair page sends `mode` back as a hidden field; it goes with the page.

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

## Addendum, 2026-09-20 - Unsending an invitation, from the person's page

**Asked for by James on 2026-09-20**, after ticket 01.
It is on this ticket because this is the shortest one left, not because it belongs with the redirect.
It depends on nothing else here and can be built and reviewed on its own, ahead of the rest of this ticket.
It is worth having no later than ticket 04, which is what hands **Add as co-leader** to an Admin.

**What to build:** A way for an Admin to take back an invitation nobody has answered.
An Admin clicks the Person's name on the Roster, and on their page, beside **Send a new invitation**, is **Unsend invitation**.

### Why

An Admin can add a Discipler to a group as co-leader, and cannot take it back.
The unanswered invitation's usual answer, **Cancel**, is refused on a running group (`relationship.already_accepted`), rightly: it would end the group.
So a co-leader invited by mistake, or one who says no, stays on the group as somebody it is waiting for, and the only way out today is to end the group for everybody.
Ticket 01's Comments and old ticket 22's both say so.

### Acceptance

- [ ] **Unsend invitation** shows on the person page wherever **Send a new invitation** does: for each relationship the Person was invited to lead and has not accepted.
- [ ] On a group that is running or paused, it ends that Person's unaccepted leader membership and their link stops opening anything.
  The membership is ended, never deleted: that they were invited, and when, stays in the Ministry's history.
- [ ] Nothing else about the group changes: its activation, its Material, its name, its declaration, its state, its other leaders and its Disciples.
- [ ] Nobody is sent anything: not the Person, not the group's leaders, not its Disciples.
  Somebody opening the link afterwards is told what any link that resolves to nothing is told.
- [ ] An invitation that has been accepted cannot be unsent, including one accepted while the Admin was clicking.
  It is refused with a code and wording of its own, and the membership stands.
- [ ] Recorded as a ministry event of its own type, naming the Admin, the Person and the relationship.
- [ ] An open *Awaiting acceptance* item about the relationship closes when unsending leaves nobody still to answer, as the last acceptance closes it since ticket 01.
  It stands while another leader has still to answer.
- [ ] Afterwards the Roster no longer shows the group on the Person's row, the popup offers them the group again, and they can be invited again.
- [ ] Where the Person is the only leader of a relationship nobody has activated, there is nothing to unsend that **Cancel** does not already do, and this ticket adds no second way to do it.
  The button is not shown there, or it is **Cancel** under its own name; say which on this ticket.
- [ ] The route is an ordinary form post that works without script, returns to the person page with a receipt, and on refusal returns there with the reason.
- [ ] Integration tests cover: a running group, a paused group, an invitation accepted in the meantime, the item closing and the item standing, and that no message goes to anybody in any of them.
- [ ] Over HTTP: an Admin unsends a co-leader's invitation from the person page, the link stops working, and the group's state is unchanged.
- [ ] Looked at in a browser: the button beside **Send a new invitation**, and the person page and the Roster row afterwards.

### For James to answer on this ticket before it is built

Neither is in the spec, and each changes what people are told.

1. **A group nobody has activated, waiting on two leaders, one of whom is unsent.**
   If the leader who remains has already accepted, every open leader membership now carries an Acceptance, which is what activates a relationship.
   Does it activate there and then, with its one Starter Message, by an Admin's click and not a leader's?
   *Recommended:* yes, exactly as the last acceptance would, once.
   The alternative is to leave it awaiting and make the Admin do something else, and there is nothing else for them to do.
   It is asked because it sends texts to real phones.
2. **A leader who declined by texting `SWAP`, whose invitation is then unsent.**
   Their `swap_requested` item is still open on the Follow-Up tab.
   *Recommended:* the same act resolves it, naming the Admin, as putting somebody into a group resolves their Join Request for it (ticket 03).
   The alternative is to leave it for the Admin to resolve by hand.
