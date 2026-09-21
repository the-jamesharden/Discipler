# 06 - Declining an invitation, and one nobody answers is withdrawn after two weeks

**What to build:** Two ways an invitation ends without being accepted, and one way of telling the Admin.
A leader can **Decline** on their Invitation Link's page.
An invitation nobody answers is withdrawn by the product after two weeks.
Either way the Admin is told on the Follow-Up tab, by an item that is red as a Concern is, and there is no button that withdraws an invitation by hand.

**Blocked by:** None - can start immediately.
It is worth having no later than ticket 04, which is what hands **Add as co-leader** to an Admin: until this is built, a co-leader invited by mistake stays on the group as somebody it is waiting for, for ever.

**Status:** ready-for-agent

**Built:** 2026-09-21, and on `main` the same day: the migration was pushed to production by James, then `main` was fast-forwarded to `7607f9b` and to `233a2e4`, with CI green and both Vercel deploys succeeded.
See *Implementer, 2026-09-21* under Comments.

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

- [x] The Invitation Link's page offers **Decline** beside **Accept and start**, the same height and narrower, in a muted red, wherever it offers Accept.
  It is not offered on a link that has expired or been spent.
- [x] Pressing it shows one confirmation, *Are you sure you want to decline this invitation?*, under the Ministry's name, with **Yes, decline** and **Go back**, and nothing else.
  **Go back** returns to the page as it was, and nothing has changed.
- [x] Confirming ends her unaccepted leader membership and her link stops opening anything but what a declined link says.
  The membership is ended, never deleted.
- [x] She is shown that the Ministry has been told and nothing else is needed from her. She is sent no text.
- [x] The Admin is told by a Follow-Up item titled *Group leader [name] Declined*, with **Resolve** and **Contact info**.
  It is the `match_declined` kind, which ADR-0011 kept and nothing has raised since; it carries the Person and the relationship.
- [x] **Contact info** opens her page from the Roster. No number is shown on Follow-Up itself.
- [x] The item is red, with the left edge and the tag a Concern has, and not grey.
- [x] Both steps are ordinary form posts that work without script.
- [x] Recorded as a ministry event of its own type, naming the Person and the relationship, with no Admin on it.

### Two weeks

- [x] When an unanswered invitation reaches its expiry, the leader's unaccepted membership is ended.
  The membership is ended, never deleted: that they were invited, and when, stays in the Ministry's history.
- [x] The Admin is told by a Follow-Up item that names the Person, in James's words above, with **Resolve** and **Copy link to re-invite leader**.
  It is red, as the declined item is.
- [x] **Copy link to re-invite leader** makes a fresh invitation for another fortnight, puts her back on the relationship as somebody invited, puts the link on the Admin's clipboard, and sends her nothing.
  It is recorded as a ministry event naming the Admin and the Person.
- [x] An invitation accepted in the same moment it would have been withdrawn is accepted, and is not withdrawn.
  A leader's acceptance never fails on the product's timing.
- [x] Sending a new invitation before the two weeks are up starts them again.
- [x] Recorded as a ministry event of its own type, naming the Person and the relationship, with no Admin on it, because no Admin performed it.
- [x] The Unaccepted flag is no longer raised for a leader added to a relationship already running, in the same change that adds the two-week item, so there is never a build in which an Admin is told nothing about her.
  It is still raised, as today, for a relationship nobody has activated.
  The two-day reminder text to the leader is unchanged.

### Both

- [x] On a group that is running or paused, nothing else about the group changes: its activation, its Material, its name, its declaration, its state, its other leaders and its Disciples.
- [x] Nobody is sent anything by the withdrawal itself: not the Person, not the group's leaders, not its Disciples.
- [x] Where it leaves a relationship nobody has activated with every remaining leader accepted, it activates there and then, once, with its one Starter Message.
- [x] An open *Awaiting acceptance* item about the same relationship is closed by the same act where nobody is left to answer, so the Admin has one thing to read and not two.
- [x] Afterwards the Roster no longer shows the relationship on the Person's row, the popup offers them the group again, and they can be invited again.
- [x] Where the Person was the only leader of a relationship nobody has activated, the relationship is left with no leader.
  It stays for the Admin to cancel or re-pair from the Follow-Up item; it does not cancel itself.
  This is a default taken while writing the ticket; James can overrule it here.
- [x] Integration tests cover, for a decline and for the two weeks: a running group, a paused group, a group awaiting two leaders where the other has accepted (it activates, once, with one Starter Message), an acceptance at the same moment, and that no message goes to anybody but that one Starter Message.
- [x] Over HTTP: she declines through the page and its confirmation; the Follow-Up items appear; **Resolve** clears each; **Contact info** opens her page; **Copy link to re-invite leader** invites her again.
- [x] Looked at in a browser, at phone width: Decline beside Accept, the confirmation, and both Follow-Up items.

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

### Implementer, 2026-09-21: what was built, what was decided, and what is for James

**What was built.**
Three commands and one effect.
`invitation.decline` is the leader's, driven by her token like acceptance.
`invitation.expire` is the product's: the tick's route asks the service to withdraw every lapsed invitation, one transaction each, as it settles an import's plans.
`invitation.copy_link` is the Admin's.
A decline and the two weeks are one act in the domain, `withdrawalOf`, and only the item that tells the Admin differs.
Activation was pulled out of `relationship.accept` into `activationOf`, so the last leader accepting and a withdrawal that leaves every leader accepted activate a relationship the same way, once, with the same Starter Message and the same Material history.

**The same moment.**
The sweep reads who has lapsed with no lock, and each `invitation.expire` then decides again inside its own transaction, behind the relationship row an acceptance holds.
So an acceptance in flight is waited for and then found accepted, and nothing is withdrawn; nothing about it is a refusal, because nobody is asking.
*Live* and *run out* are one function, `hasRunOut`, so the two can never both be true of one instant: a link is live up to and including its expiry.
This is not the `recordedAs` way the Comments above suggest.
That way only keeps the history out; the membership's end, the activation and the Starter Message would each have needed the same guard, and one missed is a second Starter Message to real phones.
Tested with two connections, and with a decline and an acceptance racing on one link: exactly one goes through.

**The migration, which James pushes by hand: `20261005000100_declining_and_the_two_weeks.sql`.**
It adds the `invitation_expired` Follow-Up kind, as this ticket said it would.
**It also adds two columns the ticket did not name, `invitation.withdrawn_at` and `invitation.withdrawn_as` (`declined` or `expired`), and rebuilds `invitation_one_live_per_person_per_relationship` to leave a withdrawn invitation out.**
Found while building: that index permits one unconsumed invitation per person per relationship, so without this a leader who declined could never be invited again from the popup, which is this ticket's own criterion; the insert is refused.
The alternative was to overwrite the old row, which loses that she was invited and when, or to mark it `consumed_at`, which is an account being made and sends her to sign in.
With the columns the old invitation keeps its own record, a new one sits beside it, and the page a declined link opens reads what to say off the row.
All additive and nullable; nothing existing is rewritten.
Keeping the two weeks still needs nothing, as the ticket says.

**Tests.**
`tests/domain/declining-and-the-two-weeks.test.ts` holds the decisions, every shared criterion run both ways.
`tests/integration/declining-and-the-two-weeks.test.ts` holds the last-but-two criterion's list, both ways: a running group, a paused group, a group awaiting two leaders where the other has accepted, an acceptance at the same moment, and every text counted.
The two weeks run on a clock of their own in a Ministry of their own, because the sweep reaches every invitation in a Ministry.
`tests/integration/declining-and-the-two-weeks-over-http.test.ts` drives it with no script: Decline and its confirmation, both items, **Resolve** through the form the page renders, **Contact info**, and **Copy link** both as the button's script asks and as a plain form post.
Two tests of ticket 01's asserted the flag this ticket takes away for a running group; they now assert it is not raised, and seed the item by hand where they are about closing one.

**Decided here, each the conservative reading, with the alternative.**

1. **The declined item carries a red tag, *Invitation declined*, as well as its title.**
   The criterion says *the left edge and the tag a Concern has*; the mock-up drew the title alone.
   The alternative is the mock-up's: no tag.
2. **Under the declined item's title: *Invited to help lead this group. The invitation has been withdrawn, and the group carries on.***
   The mock-up named the group (*Grace's Group*); the Follow-Up tab's document carries no relationship's name, and adding one is a second change to a page function.
   For a relationship not running it says *Invited to lead this group. The invitation has been withdrawn.*, and *and nobody leads it now* where that is so.
3. ***Group leader* or *Discipler* is decided by who is in it and not by the kind it was formed as**, which is ADR-0004's rule and a test's: several Disciples, or anybody else leading, is a group.
   A group fallen to one Disciple with no other leader therefore reads *Discipler*.
4. **What a declined link says: *Thanks for letting us know*, then *We've told [Ministry] you won't be leading this group. Nothing else is needed from you, and nobody else has been contacted.*, the mock-up's words.**
   For one Disciple it says *you won't be taking this on*, because there is no group.
   It names nobody: she is no longer on the relationship, so the reader hands the page a count and no names.
5. **A link the two weeks withdrew says what an expired link always said**, without the reveal and without *That's not my number*, which would now be refused: she is on nothing, and the Admin already has an item about her.
6. **Go back is a link**, not a second post: nothing has changed, so there is nothing to post.
   What she had typed is not kept.
7. **The link never goes in an address.**
   It alone lets its holder set the account's password, so the button's script is handed it as JSON, and with no script the post answers with a page holding it in a field, as a password reset does.
   Where the browser refuses the clipboard, the link is shown under the button, selected.
8. **Copy link is refused for somebody never invited to that relationship** (`reinvite.never_invited`), so the button is not a second way to make anybody a leader of anything.
   What the database refuses of the membership itself (Intake, an opt-out, gender, a group she leads since) is said in the Roster's own words.
9. **An open *Awaiting acceptance* item is closed only where nobody is left to answer, and a relationship left with no leader is not that.**
   There it stands, because it is what offers **Cancel**, which is how this ticket's *it stays for the Admin to cancel* is true; closed, the tick would raise it again within the hour.
   Its sentence then reads *Nobody leads this relationship: whoever was invited to declined or did not answer*.
10. **The sweep runs after the tick and the plans, before the drain, and is caught on its own**, so a Starter Message it causes goes out on the same pass and nothing it could fail on holds back a week's check-ins.
11. **On the Overview the two read *Declined to lead* and *Invitation expired*.**
12. **`CONTEXT.md`: one sentence on the Invitation Link**, that it can be declined and that one nobody answers is withdrawn, with no duration in it.

**Looked at in a browser, at 390 wide and at desktop width, on real data seeded through the command service.**
Decline beside Accept measures the same height, 39.3px, at 80px wide against 154px; the confirmation's two buttons are one height; the declined page, a link the two weeks withdrew, and both red items are as the mock-ups drew them, with no sideways scroll.
**Copy link to re-invite leader** was pressed for real: it says *Link copied*, stays on the tab, and the database shows her back as somebody invited, the old membership and invitation kept beside the new, one copy recorded with the Admin, and still only the one text she was ever sent.

**The whole suite ran once on the result: 171 of 172 files, 2529 tests passed, 1 skipped, which is a standing `it.skip`.**
The file that failed was `tests/domain/relationship-kind-fence.test.ts`, three tests, none of them this ticket's, and since fixed; see *For James*.
The two new integration files ran before that on their own, and the over-HTTP one against this checkout's own build.
Not run three times back to back: another session was resetting the shared database from a checkout without this migration between runs.

**Fixed along the way.**
The Follow-Up tab's items were indented 19px from the left of their card and not from the right, by a general `.card ul` rule; `ul.fu-list` now says its own margin, and the items measure flush on both sides.
Accepting on a declined link was refused as *not found*; it is refused as *declined*, in words of its own.

**For James.**

1. **The migration to push, and the two columns in it**, above.
2. **`docs/product-rules.md` still says `match_declined` is a Participant declining, and lists the Follow-Up kinds without `invitation_expired`.**
   It is a product source and this was implementation work, so it is left as it is and said here.
3. **`tests/domain/relationship-kind-fence.test.ts` was red on `integration/manual-pairing`, and was not this ticket's. Fixed, in a commit of its own.**
   Ticket 04's popup named its Group shape `'group'` in `app/roster/copy.ts`, `pair-popup-from-a-discipler.tsx` and `pair-shape.ts`, which the fence reads as a relationship's kind; ticket 04's record does not mention it, and its session had finished.
   Answered the way the fence says: the word is exported once as `GROUP_SHAPE` from `pair-shape.ts`, every comparison goes through it, `copy.ts` no longer says it, and the fence allows that one file the literal with its argument written beside it.
   No behaviour changed: `tests/domain` and `tests/app` are 72 of 72 files green, and the popup's five over-HTTP suites and this ticket's pass against a fresh build, 77 tests.

### Shipped, 2026-09-21

James asked for the redundancies to go and, with every test green, for `main`.
What was said twice is said once (`3167d49`), with no behaviour changed.
The branch was merged with the 8 commits `main` had that it lacked, and the whole suite ran on that merged commit from a clean worktree, because another session was part-way through `app/roster/lists.ts` in the shared checkout: 172 of 172 files, 2536 tests passed, 1 standing skip.
The migration went first, by James's hand, and production's ledger was read back before any code moved: a push to `main` deploys code only, and this code reads the new columns on every invitation page and in every tick.
CI on `main` then failed on this ticket's own two over-HTTP tests that run the scheduler's route: it ticks every Ministry in the database, and on CI that outgrew the default five seconds.
Another session had met the same thing locally and fixed it on this branch (`a3c8373`), giving them the allowance `the-scheduled-tick-over-http.test.ts` already explains; that one commit was put on `main` by itself, as `233a2e4`, and CI is green.
The four ticket 04 commits that followed it on this branch are not on `main`: they wait on James's answers to two mock-ups.

