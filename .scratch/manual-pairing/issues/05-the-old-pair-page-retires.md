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

## Addendum - An invitation nobody answers is withdrawn after two weeks

**Decided by James on 2026-09-21**, reviewing ticket 01, in place of the addendum of 2026-09-20.
That one asked for an **Unsend invitation** button on the person's page.
James: *there needs to not be an unsend button; the invite becomes revoked and invalid if it has been two weeks, and the Admin gets notified in the Follow-Up tab, and they can just click Resolve or copy link from that spot on the Follow-Up page.*

It is on this ticket because this is the shortest one left, not because it belongs with the redirect.
It depends on nothing else here and can be built and reviewed on its own, ahead of the rest of this ticket.
It is worth having no later than ticket 04, which is what hands **Add as co-leader** to an Admin.

**What to build:** An invitation a leader has not answered within two weeks is withdrawn by the product, and the Admin is told on the Follow-Up tab, where they can **Resolve** it or **Copy link**.
There is no button that withdraws one by hand.

### Why

An Admin can add a Discipler to a group as co-leader, and cannot take it back.
The unanswered invitation's usual answer, **Cancel**, is rightly refused on a running group, since it would end the group; since ticket 01 the Follow-Up item for a running group does not offer it.
So a co-leader invited by mistake, or one who never answers, stays on the group as somebody it is waiting for, for ever.
A fortnight is already how long an Invitation Link lives: every invitation carries its own expiry, reset when a new one is sent.
What is missing is everything after it: today the link stops working and nothing else happens.

### Decided

- **No Unsend button**, on the person's page or anywhere.
- **Two weeks**, measured by the invitation's own expiry, which is reset by **Send a new invitation**.
  No day count is shown to the Admin, and no migration is needed to keep the time (James, 2026-09-21).
- **Where withdrawing a leader leaves a relationship nobody has activated with every remaining leader accepted, it activates there and then, once, with its one Starter Message** (James, 2026-09-21: *yes, go with the new one*).
  This is an activation by the product's clock and not by a leader's press.

### Acceptance

- [ ] When an unanswered invitation reaches its expiry, the leader's unaccepted membership is ended and their link stops opening anything more than it does today.
  The membership is ended, never deleted: that they were invited, and when, stays in the Ministry's history.
- [ ] On a group that is running or paused, nothing else about the group changes: its activation, its Material, its name, its declaration, its state, its other leaders and its Disciples.
- [ ] Nobody is sent anything by the withdrawal itself: not the Person, not the group's leaders, not its Disciples.
- [ ] The Admin is told by an item on the Follow-Up tab that names the Person and the relationship and says the invitation was withdrawn after two weeks.
  An open *Awaiting acceptance* item about the same relationship is closed by the same act where nobody is left to answer, as the last acceptance closes it since ticket 01, so the Admin has one thing to read and not two.
- [ ] The item offers **Resolve** and **Copy link**.
  What **Copy link** copies is the first question below.
- [ ] An invitation accepted in the same moment it would have been withdrawn is accepted, and is not withdrawn.
  A leader's acceptance never fails on the product's timing.
- [ ] Sending a new invitation before the two weeks are up starts them again.
- [ ] Recorded as a ministry event of its own type, naming the Person and the relationship, with no Admin on it, because no Admin performed it.
- [ ] Afterwards the Roster no longer shows the relationship on the Person's row, the popup offers them the group again, and they can be invited again.
- [ ] Where the Person was the only leader of a relationship nobody has activated, the relationship is left with no leader.
  It stays for the Admin to cancel or re-pair from the Follow-Up item; it does not cancel itself.
  This is a default taken while writing the ticket; James can overrule it here.
- [ ] Integration tests cover: a running group, a paused group, a group awaiting two leaders where the other has accepted (it activates, once, with one Starter Message), an invitation accepted at the moment of expiry, a re-sent invitation, and that no message goes to anybody but that one Starter Message.
- [ ] Over HTTP: the Follow-Up item appears, **Resolve** clears it, and the Roster row is as above.
- [ ] Looked at in a browser: the item on the Follow-Up tab, and the person page and the Roster row afterwards.

### For James to answer before it is built

Put to James with mock-ups on 2026-09-21 (`.lavish/co-leader-acceptance/index.html`, gitignored, round two).

1. **What Copy link copies.**
   At two weeks the link has just stopped working, so it cannot copy that one.
   *Recommended:* always a working link: the live one while it lives, and after two weeks a fresh one, which invites the Person again for another fortnight.
   It matters because today an Admin never sees a leader's link, and the link alone is what lets its holder set the account's password; if it is built, every copy is recorded in the Ministry's history with the Admin who made it.
2. **A Decline button on the invitation page**, which James asked to see as a mock-up before it is built (*no SWAP; a Decline button, greyed, smaller than Accept, red*).
   It is not a criterion of this ticket until James has chosen from the mock-ups.
   Proposed: it withdraws the invitation as above, at once and by the leader's own act, and tells the Admin on Follow-Up as `match_declined`, the item kind ADR-0011 kept and nothing raises today.
3. **What a leader who texts `SWAP` before accepting is told**, once Decline exists. Words to a real phone.
