# 06 - Declining an invitation, and one nobody answers is withdrawn after two weeks

**What to build:** Two ways an invitation ends without being accepted, and one way of telling the Admin.
A leader can **Decline** on their Invitation Link's page.
An invitation nobody answers is withdrawn by the product after two weeks.
Either way the Admin is told on the Follow-Up tab, by an item that is red as a Concern is, and there is no button that withdraws an invitation by hand.

**Blocked by:** None - can start immediately.
It is worth having no later than ticket 04, which is what hands **Add as co-leader** to an Admin: until this is built, a co-leader invited by mistake stays on the group as somebody it is waiting for, for ever.

**Status:** ready-for-agent

**It adds a migration**, which James pushes to production by hand.
The two-week item is a new kind of Follow-Up Item, and the kinds are the database's `follow_up_kind` enum; the declined item needs none, because `match_declined` is already a value.
Keeping the two weeks needs no migration, as the Decided section says: an invitation already carries its own expiry.
Do not build this beside another ticket that adds a migration in the same checkout (`.scratch/text-wording/issues/01` does): the local database is rebuilt whenever the migrations change, and a half-written one from another session fails that rebuild for both.

**Where it came from:** It was an addendum on ticket 05 from 2026-09-20, put there because 05 was the shortest ticket left, and James had it made a ticket of its own on 2026-09-21.
It is no old ticket: nothing of the earlier cuts, 01 to 27, asked for it.
It began as **Unsend invitation**, a button on the person's page, which James replaced: *there needs to not be an unsend button; the invite becomes revoked and invalid if it has been two weeks, and the Admin gets notified in the Follow-Up tab*; and *there should be a decline button on the page that is greyed out and smaller than accept that is red*.
He decided everything below over five rounds with mock-ups (`.lavish/co-leader-acceptance/index.html`, gitignored).
Here "old ticket NN" means a ticket of the earlier cuts, kept under that number in `07-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket 06".

## Why

An Admin can add a Discipler to a group as co-leader, and cannot take it back.
The unanswered invitation's usual answer, **Cancel**, is rightly refused on a running group, since it would end the group; since ticket 01 the Follow-Up item for a running group does not offer it.
So a co-leader invited by mistake, or one who never answers, stays on the group as somebody it is waiting for, for ever.
And a leader who wants to say no has only the `SWAP` keyword, which nothing on the page tells them about.
A fortnight is already how long an Invitation Link lives: every invitation carries its own expiry, reset when a new one is sent.
What is missing is everything after it: today the link stops working and nothing else happens.


## Decided by James, 2026-09-21

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


## Acceptance

### Declining

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

### Two weeks

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

### Both

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

## Not part of this ticket

Asked of James the same day and parked by him: whether a Ministry's texts read *paired for mentorship* or *paired for discipleship*.
It is `.scratch/text-wording/issues/02-mentorship-or-discipleship.md`.
The rates line reaching a Person at most once a month is `.scratch/text-wording/issues/01-the-rates-line-once-a-month.md`.

## Comments

### What was already built around it, 2026-09-21

So that whoever picks this up does not build it twice.
All on `integration/manual-pairing`, and said in full in ticket 01's Comments.

- The acceptance that leaves nobody still to answer closes the open *Awaiting acceptance* item, with no Admin on the resolution; the tick looks again, behind the row an acceptance holds, before it raises one (`05064c1`, `94ec4da`). This ticket's withdrawal closes the same item the same way.
- For a leader added to a group already running, that item names them, says the group carries on, shows no day count, and offers no **Cancel** (`2dd44d4`). This ticket stops raising it for them at all.
- `raiseFollowUpItem` takes the history that is only true if its item was raised (`6c1ede1`), which is how a withdrawal at the same moment as an acceptance stays out of the history.
- The invitation page says *paired*, the Ministry heads its card, and the reveal is the class `reveal` (`3b1a5b7`, `489684b`). The confirmation and the page after declining sit in that same card.
- An invitation already lives fourteen days: `INVITATION_LIFETIME_DAYS` in `src/domain/invitations.ts`, reset by `invitation.reissue`. Nothing else happens at its expiry today.
- `match_declined` is in `FOLLOW_UP_KINDS`, in the database's `follow_up_kind`, and worded in `app/follow-up/copy.ts` and `app/overview/copy.ts`. Nothing raises it. ADR-0011 withdrew the Participant's decline and kept the value; this ticket's decline is a Leader's, which that ADR does not speak to.
