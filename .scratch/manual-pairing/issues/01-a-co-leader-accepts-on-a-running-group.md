# 01 - A co-leader accepts on a group already running

**What to build:** What the Invitation Link's page shows, records and sends when the leader accepting was added to a group that has already started.
Today that acceptance activates the group a second time and sends the Starter Message again; after this ticket it records the co-leader's Acceptance and nothing else.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Built:** 2026-09-20, on `integration/manual-pairing`, not merged to `main`.
See *Implementer, 2026-09-20* under Comments.

**Old tickets:** this is old ticket 11, whole; none of it is committed.
What an unaccepted co-leader is given until they accept was decided by James and built at `69bbe9e`, and is in `07-committed-already.md`.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `07-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".

## Decided by James, 2026-09-20

The spec says a Discipler added to a group "gets an invitation link the same way a mentor does when first paired, and accepts on it; the group keeps running meanwhile".
It does not say what acceptance sends when the group is already running.
Until now every Acceptance either activated the relationship, which sends the Starter Message, or waited for another leader.
These three were asked of James and answered on 2026-09-20.

1. When a co-leader accepts on a running group, is anything sent to the Disciples?
   **Nothing.**
   The Starter Message went out at activation, and a second one would introduce a relationship they are already in.
2. Are the group's existing leaders told, and if so when?
   **Nothing is sent to them by the product, neither when the Admin adds the co-leader nor when the co-leader accepts.**
   If they are to be told, somebody tells them by hand, outside the product.
   This ticket builds no message, button or notice for it.
3. If the co-leader declines, or never answers, is a Follow-Up Item raised as it is for a leader invited at formation?
   **Yes, the same item**, since it is the same unanswered invitation.

## Acceptance

- [x] Accepting records the Acceptance on that leader's membership, timestamped, and nothing else about the group's history changes.
- [x] The relationship's activation moment is not restamped, and the Starter Message is not sent again.
- [x] Accepting on a running group sends nothing to the Disciples and nothing to the group's existing leaders.
  Adding the co-leader sends the existing leaders nothing either; the only message is the co-leader's own invitation.
- [x] The invitation page shows who they would be leading and who they would be leading with, before they accept.
- [x] From acceptance on, the co-leader is treated as a group formed with two leaders already treats its second leader.
  This ticket designs nothing new for check-ins or care signals.
- [x] A group that was still awaiting its first leader activates only when both have accepted, and sends one Starter Message.
- [x] Declining, and an invitation nobody answers, raise the same Follow-Up Item as they do for a leader invited at formation.
- [x] Integration tests cover: acceptance on a running group, on a paused group, on a group still awaiting its first leader (in both orders), a declined invitation, and that no message goes to a Disciple or to an existing leader in any of them.

## Comments

### Found while building old ticket 22's second stage

Written by its implementer on 2026-09-20, and kept whole in `07-committed-already.md`.
The first is why ticket 04's **Add as co-leader** button waits for this ticket.

- **Accepting on a running group re-activates it.** `relationship.accept` decides `activatesRelationship` as *every other leader has accepted*, which is true for a co-leader on a running group. It would append a second `relationship.activated`, open a second Material period, and send the Starter Message to every leader and every Disciple again. The database only guards the column. Old ticket 11's first two criteria are exactly this; it is said here because it is a text to real phones, and because old ticket 26 waits on 22, 24 and 25 but not on 11.
- **The five-day item now raises for them**, which James answered yes to on 2026-09-20. Its usual answer, **Cancel**, is refused on a running group (`relationship.already_accepted`), so there is no way to withdraw an unanswered co-leader invitation short of ending the group. *Cancelling behaves as it does for a leader invited at formation* is true and tested for a group still awaiting its leader, where cancelling takes their membership with it; on a running group there was never anything to cancel at formation either.

### Implementer, 2026-09-20: what was built, what was decided, and two things for James

**What was wrong, and the fix.**
`relationship.accept` decided activation as *every other leader has accepted*, which is true of a co-leader on a running group.
The invitation snapshot now carries the relationship's own activation (`relationshipAcceptedAt`), read off the row acceptance already locks, and a relationship activates only while that is null.
On a running or a paused group the command returns after two effects: the Acceptance on the leader's own membership, and one `relationship.leader_accepted` event with `activated: false`.
No migration, no new message, no new button.

Proved red first at both levels.
With the one condition taken back out, the four running and paused integration tests fail; with it in, they pass.

**Tests.**
`tests/domain/accepting-an-invitation.test.ts` holds the decision.
`tests/integration/a-co-leader-accepts-on-a-running-group.test.ts` holds the last criterion's list: running, paused, awaiting its first leader in both orders and with both accepting in the same moment, a declined invitation, an unanswered one, and what the page shows.
In each, what everybody in the group had been sent is read before the Admin adds the co-leader, so *nobody else was told* covers the adding as well as the accepting.
`tests/integration/an-admin-puts-somebody-into-a-group-over-http.test.ts` drives it end to end: the Admin's route, her real link, the real accept form.
The whole suite ran once on the result: 167 files, 2307 passed, 1 skipped, and 1 failed that is not this ticket's.
That one was `tests/app/pairing-copy.test.ts`, written red by the session building ticket 02 in this same checkout while the run was in flight; it passes now.
It ran once more after the fix under *For James* below: 165 of 167 files and 2328 tests passed.
The two files that failed, `tests/app/pair-shape.test.ts` and `tests/app/pairing-copy.test.ts`, are that same session's tests for ticket 02, red while it builds, and nothing in them is this ticket's.
The new integration file then ran three times back to back with no reset.

**Decided here, each the conservative reading, with the alternative.**

1. **Who the page says they would be leading with follows `countsAsLeading`.**
   On a running group it names only the leaders who have accepted; on a group nobody has activated it names everybody it waits on.
   The ticket says *who they would be leading with* and no more, and this is the rule every Admin screen already follows, so an invitee is never told somebody leads a group who has not agreed to.
   The alternative is to name every open leader membership always.
2. **The words are one sentence under the reveal: *You’d be leading with Grace Lee.***
   It sits above the form with the rest of the reveal, and is absent for somebody leading alone.
   It is on a web page, not in a text.
   It also shows on an expired or a spent link, as the reveal above it already does.
   The group's name is not shown; the ticket did not ask for it.
3. **Declining is `SWAP` by text, and the item is `swap_requested`.**
   That is what a leader invited at formation has, so it is *the same item*, and it is now tested for a co-leader on a running group.
   The page has no decline button for anybody.
   `match_declined` is a Follow-Up kind nothing raises, and it is kept on purpose: ADR-0011 withdrew the act and kept the value, so that history already holding one still reads.
4. **`relationship.leader_accepted` is the one event written**, which is how every Acceptance is recorded already.
   *Nothing else about the group's history changes* is read as no activation, no Material period and no pause or resume.

**For James.**
Both were answered by James on 2026-09-20: *whatever is broken outright, fix; for the other, a new way to unsend the invitation from the person's page, as an addendum to the shortest remaining ticket.*

1. **An open *Awaiting acceptance* item was not closed when the leader accepted. Fixed.**
   It went on telling an Admin that somebody had not accepted who had, beside a **Cancel** the relationship then refused.
   The acceptance that leaves nobody still to answer now closes it, at formation and for a co-leader alike, with no Admin on the resolution and a `follow_up.resolved` event that says `by: 'acceptance'`.
   It is the relationship's item and not one leader's, so it stands while another leader has still to answer.
   The other half is the tick, which decides from a read and raises its item a moment later: an acceptance landing in between would have left an item nothing closes.
   The raise now looks again first, behind the row lock an acceptance holds, and raises nothing about a relationship nobody is still to answer.
   *Still to be accepted by somebody* is said once in the store, for the tick's read and for that look.
   A review of the fix found one more: an Admin pressing **Resolve** on the item in the moment the leader accepts made the acceptance fail, and a leader's acceptance never fails on an Admin's timing.
   Acceptance now takes the item's row when it reads it, so the Admin's Resolve is waited for and there is then nothing left to close.
   Both overlaps are tested with two connections, and the test of the tick's wait fails with the wait taken out.
   Left as it is: where that look raises nothing, the tick's `follow_up.relationship_unaccepted` event is still written, saying the tick found the relationship unanswered for five days, which at its read was true. Nothing reads that event.
   Tests: `tests/domain/accepting-an-invitation.test.ts`, `tests/integration/the-scheduled-tick.test.ts` for a leader invited at formation, and `tests/integration/a-co-leader-accepts-on-a-running-group.test.ts` for a co-leader, for two co-leaders, and for the late raise.
   **And the item itself was wrong for a co-leader on a running group**, found on 2026-09-21 by looking at the real Follow-Up tab (`2dd44d4`).
   It was written for a relationship nobody had activated.
   For somebody added to a running group it named nobody, counted the group's age as their wait, said everyone was held out of the suggestion pool, and offered a **Cancel** a running group always refuses.
   It now reads *Claire Martinez was invited to help lead this group and has not answered. The group carries on meanwhile.*, with **Resolve** alone and no day count.
   For a relationship nobody has activated the sentence is as it was, and names the leaders it waits on.
   **One thing is left for James, because it is a migration:** the right day count needs when the membership began, and `app.history_inputs` does not carry it.
   Adding that one column would let the item say how long a co-leader has waited, as the tick already measures it.
2. **There is no way to withdraw an unanswered co-leader invitation short of ending the group. Not built here.**
   James decided against an Unsend button on 2026-09-21: an unanswered invitation is withdrawn by the product after two weeks, and the Admin is told on Follow-Up.
   It is ticket 06, *Declining an invitation, and one nobody answers is withdrawn after two weeks*, which was an addendum on ticket 05 until James had it made a ticket of its own.

**James's review of 2026-09-21, the rest of it.**
Done (`3b1a5b7` and the commit after it): the invitation page says *paired* where it said matched, the Ministry heads the card with Discipler's mark small at the foot, and the line *You've been asked to disciple... you can say no* is gone.
The reveal is sized under the Ministry, which the first of those left nearly the same size as.
**Resolve** on a co-leader's Follow-Up item is tested over HTTP through the form the page itself renders.
The page's own `asList` is gone, for the one every message is written with.
Found while showing James the Starter Message: a co-leader who accepts on a running group is sent nothing herself, so she never gets the text with her dashboard link. James's decision named the Disciples and the existing leaders; whether she gets the leader's Starter Message is put to him.
Also put to him, with mock-ups: a Decline button, what **Copy link** copies, *matched* in the invitation text and the Welcome Message, the tick's stray history event, and whether existing leaders are still told nothing.

**James's second review of 2026-09-21** (`6c1ede1`).
In his words or on his instruction: the Participant's Starter Message is *You have been paired for discipleship with [mentor name]*; no mentee is named in the Leader's; the invitation text and the Welcome Message say *paired*; the page says *You will be leading with*.
**A co-leader who accepts on a running group is sent the Leader's Starter Message, and she alone.**
That amends this ticket's third criterion, which still holds as written: nothing to the Disciples, nothing to the group's existing leaders.
The tick's `follow_up.relationship_unaccepted` event is written with its item or not at all.
The Leader's sentence, *You have been paired for discipleship.*, is James's sentence without the name, and is put to him to approve.
A side effect, put to him as well: the Ministry's word for a person being discipled is now in no message, so its field on Ministry settings saves and does nothing.
Decline and the two weeks are ticket 06.
The whole suite ran once on the result: 164 of 167 files and 2339 tests passed, and the three that failed passed when run again, two of them tests that pinned the old wording and one a random phone-number collision in a fixture.
