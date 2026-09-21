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

## Addendum - Declining an invitation, and one nobody answers is withdrawn after two weeks

**Decided by James on 2026-09-21**, reviewing ticket 01 over three rounds with mock-ups (`.lavish/co-leader-acceptance/index.html`, gitignored).
It replaces the addendum of 2026-09-20, which asked for an **Unsend invitation** button on the person's page.
James: *there needs to not be an unsend button; the invite becomes revoked and invalid if it has been two weeks, and the Admin gets notified in the Follow-Up tab*; and *there should be a decline button on the page that is greyed out and smaller than accept that is red*.

It is on this ticket because this is the shortest one left, not because it belongs with the redirect.
It depends on nothing else here and can be built and reviewed on its own, ahead of the rest of this ticket.
It is worth having no later than ticket 04, which is what hands **Add as co-leader** to an Admin.

**What to build:** Two ways an invitation ends without being accepted, and one way of telling the Admin.
A leader can **Decline** on their Invitation Link's page.
An invitation nobody answers is withdrawn by the product after two weeks.
Either way the Admin is told on the Follow-Up tab, and there is no button that withdraws an invitation by hand.

### Why

An Admin can add a Discipler to a group as co-leader, and cannot take it back.
The unanswered invitation's usual answer, **Cancel**, is rightly refused on a running group, since it would end the group; since ticket 01 the Follow-Up item for a running group does not offer it.
So a co-leader invited by mistake, or one who never answers, stays on the group as somebody it is waiting for, for ever.
And a leader who wants to say no has only the `SWAP` keyword, which nothing on the page tells them about.
A fortnight is already how long an Invitation Link lives: every invitation carries its own expiry, reset when a new one is sent.
What is missing is everything after it: today the link stops working and nothing else happens.

### Decided by James

- **No Unsend button**, on the person's page or anywhere.
- **Decline sits beside Accept, the same height and a smaller width**, as a muted red outline.
- **Pressing it asks her to confirm once**, then withdraws her invitation and tells the Admin on Follow-Up. Nobody else is told.
  The confirmation is one question, in James's words, *Are you sure you want to decline this invitation?*, and two buttons. It explains nothing else.
- **`SWAP` from a leader who has not accepted still works quietly as today**: recorded for the Admin, and she is told it was passed on. Nothing about it changes.
- **Two weeks**, measured by the invitation's own expiry, which **Send a new invitation** resets.
  No day count is shown to the Admin, and no migration is needed to keep the time.
- **The Unaccepted flag goes for a co-leader**, *so the Admin does not get spammed with non-essential things*: it is no longer raised for a leader added to a relationship already running.
  A new pairing nobody has started still raises it, because its Disciple is held out of Suggested Pairs until somebody acts.
  James asked that it be called the *Unaccepted flag*, and not by the day it is raised on; on the Follow-Up tab it is tagged *Awaiting acceptance*, and on the Overview *Unaccepted*.
- **The two-week item reads** *Group leader [name] has not responded in two weeks, their invite has expired*, with **Resolve** and **Copy link to re-invite leader**.
  James wrote *her invite*; the product does not know a pronoun for a leader, so it says *their*, which he has seen and let stand.
- **The declined item is titled** *Group leader [name] Declined*, with **Resolve** and **Contact info**, which opens her page from the Roster.
- **Both items are red, the colour a Concern is, and not the grey of a review item** (James, 2026-09-21, the last thing he added to this ticket).
  Until now red on the Follow-Up tab has meant a Concern and nothing else, and the page says so in a comment; that comment changes with this.
- ***Group leader* is said before the name** on both. For a one-to-one, which has no group, it says *Discipler*; this is a default taken while writing the ticket, and James can overrule it here.
- **Copy link always gives a working link.**
  On the two-week item, which is the only place it now shows, it makes a fresh one and invites her again for another fortnight.
  Every copy is recorded in the Ministry's history with the Admin who made it, because today an Admin never sees a leader's link and the link alone is what lets its holder set the account's password.
- **Where withdrawing a leader, either way, leaves a relationship nobody has activated with every remaining leader accepted, it activates there and then, once, with its one Starter Message.**
- **The group's existing leaders are still told nothing**, by the product, about any of it.

### Acceptance

#### Declining

- [ ] The Invitation Link's page offers **Decline** beside **Accept and start**, the same height and narrower, in a muted red, wherever it offers Accept.
  It is not offered on a link that has expired or been spent.
- [ ] Pressing it shows one confirmation, *Are you sure you want to decline this invitation?*, under the Ministry's name, with **Yes, decline** and **Go back**, and nothing else.
  **Go back** returns to the page as it was, and nothing has changed.
- [ ] Confirming ends her unaccepted leader membership and her link stops opening anything but what a declined link says.
  The membership is ended, never deleted.
- [ ] She is shown that the Ministry has been told and nothing else is needed from her. She is sent no text.
- [ ] The Admin is told by a Follow-Up item titled *Group leader [name] Declined*, with **Resolve** and **Contact info**.
  It is the `match_declined` kind, which ADR-0011 kept and nothing has raised since; it carries the Person and the relationship.
- [ ] **Contact info** opens her page from the Roster. No number is shown on Follow-Up itself.
- [ ] The item is red, with the left edge and the tag a Concern has, and not grey.
- [ ] Both steps are ordinary form posts that work without script.
- [ ] Recorded as a ministry event of its own type, naming the Person and the relationship, with no Admin on it.

#### Two weeks

- [ ] When an unanswered invitation reaches its expiry, the leader's unaccepted membership is ended.
  The membership is ended, never deleted: that they were invited, and when, stays in the Ministry's history.
- [ ] The Admin is told by a Follow-Up item that names the Person, in James's words above, with **Resolve** and **Copy link to re-invite leader**.
  It is red, as the declined item is.
- [ ] **Copy link to re-invite leader** makes a fresh invitation for another fortnight, puts her back on the relationship as somebody invited, puts the link on the Admin's clipboard, and sends her nothing.
  It is recorded as a ministry event naming the Admin and the Person.
- [ ] An invitation accepted in the same moment it would have been withdrawn is accepted, and is not withdrawn.
  A leader's acceptance never fails on the product's timing.
- [ ] Sending a new invitation before the two weeks are up starts them again.
- [ ] Recorded as a ministry event of its own type, naming the Person and the relationship, with no Admin on it, because no Admin performed it.
- [ ] The Unaccepted flag is no longer raised for a leader added to a relationship already running, in the same change that adds the two-week item, so there is never a build in which an Admin is told nothing about her.
  It is still raised, as today, for a relationship nobody has activated.
  The two-day reminder text to the leader is unchanged.

#### Both

- [ ] On a group that is running or paused, nothing else about the group changes: its activation, its Material, its name, its declaration, its state, its other leaders and its Disciples.
- [ ] Nobody is sent anything by the withdrawal itself: not the Person, not the group's leaders, not its Disciples.
- [ ] Where it leaves a relationship nobody has activated with every remaining leader accepted, it activates there and then, once, with its one Starter Message.
- [ ] An open *Awaiting acceptance* item about the same relationship is closed by the same act where nobody is left to answer, so the Admin has one thing to read and not two.
- [ ] Afterwards the Roster no longer shows the relationship on the Person's row, the popup offers them the group again, and they can be invited again.
- [ ] Where the Person was the only leader of a relationship nobody has activated, the relationship is left with no leader.
  It stays for the Admin to cancel or re-pair from the Follow-Up item; it does not cancel itself.
  This is a default taken while writing the ticket; James can overrule it here.
- [ ] Integration tests cover, for a decline and for the two weeks: a running group, a paused group, a group awaiting two leaders where the other has accepted (it activates, once, with one Starter Message), an acceptance at the same moment, and that no message goes to anybody but that one Starter Message.
- [ ] Over HTTP: she declines through the page and its confirmation; the Follow-Up items appear; **Resolve** clears each; **Contact info** opens her page; **Copy link to re-invite leader** invites her again.
- [ ] Looked at in a browser, at phone width: Decline beside Accept, the confirmation, and both Follow-Up items.

### Nothing is open on this addendum

James answered both questions on 2026-09-21: the Unaccepted flag goes for co-leaders only, and *their invite* stands.

Asked of him the same day and **not part of this ticket**: whether a Ministry's texts read *paired for mentorship* or *paired for discipleship*.
James wants it to follow the Ministry's choice between the two, and Ministry settings holds no such choice today, only two words a Ministry types freely.
It needs a new setting and a migration, and is put to him as its own question.
