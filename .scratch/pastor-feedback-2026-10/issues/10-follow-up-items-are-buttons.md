# 10 - Follow-Up items are buttons

**What to build:** Each Follow-Up item becomes one button: its tag, the names, one line of reason and how long it has held.
Pressing it opens the pair card in its fuller Follow-Up form, with the item's action in the band and a *What has happened* list under the facts.
*End relationship* leaves the front of the page.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *Per tab* and *Follow-Up*.
Design: `.lavish/pastor-feedback/mock-followup-list.html` and `mock-tab-followup.html`, settled in James's Lavish review of 2026-10-12.
Today: every item carries its own row of buttons, *See contact details*, *Read the concern*, *Resolve*, *Resume relationship*, *End relationship* and others by kind (`app/follow-up/page.tsx`).

**Blocked by:** 07, 08

**Status:** ready-for-agent

## Acceptance

- [x] Each item on Follow-Up is one control showing its tag, the names, one line of reason, how long it has held and an arrow, and nothing else to press. A concern's words never show on the front. (1b38f50, 3363cd7)
- [x] Pressing a care item (concern, stalled) opens the pair card, or the group card, with the item and its action in the band. (1b38f50)
- [x] Pressing a review item opens the same card with its one action in the band: *Resume relationship* on an expired pause, *Copy link to re-invite leader* on an invitation not accepted, *Resolve* on a swap request, *Cancel relationship* where today's card offers it, and the group dropdown with *Place in this group* on *Wants a group*. (c5f3dd4, 1b38f50)
- [x] *See contact details* goes: opening the card is the reveal, through the same consent check, and keeps whatever record Nudge keeps today. (c5f3dd4, 1b38f50)
- [x] Under the facts, **What has happened**, newest first, read from the stored history, lists exactly: when the item was raised and why; the check-ins that led to it (unanswered, did not meet, the D); who opened the contact details or read the concern, and when; earlier Follow-Up items for this pair and who resolved them. The words of an earlier, resolved concern never appear. (c5f3dd4, 1b38f50, 3363cd7)
- [x] *End relationship* is on the card's foot as on ticket 07 and nowhere on the front of the page. (1b38f50)
- [x] `docs/pastor-dashboard.md`, *Follow-Up*, describes the buttons, the card and its history, and that the four actions now live in the card. (1f9ef24)
- [x] Checked by eye in a real browser against the mock-ups, with an item of every kind, at desktop and phone width. (3363cd7)

## Not in this ticket

- Any new action. The actions are today's, moved into the card.

## Comments

Decisions made while building (pf-10 builder, 2026-10-13):

- **One card per relationship, not one per item.** Every item about a live relationship opens that relationship's card at `/follow-up?card=<relationship id>`, the pair card of 07 or the group card of 08, with every open Follow-Up Item on it as a band of its own.
  So a pair carrying a concern, a stall and a swap request is one card with three bands, whichever of the three was pressed.
  An item about a Person and no live relationship (*Wants a group*, *Texted a keyword*, *Pair not made*, or an item whose relationship has since ended) opens a card of its own at `?card=<item id>`.
  The alternative was a card per item, which would draw the same pair twice with different bands.
- **The item's own card**, for the gap the brief named: the head *Follow-Up · raised 9 Oct, 3 days ago*, the Person's name, the item's band with its actions, the Person drawn as the pair card draws a person but with no side (they are on no pair here), and *What has happened* (the item raised, and earlier items about this Person). No facts and no End relationship, because there is no pair to have them.
- **Resolve stays beside the item's one action.** The item's own action (Resume, Copy link, Cancel, Place in this group, Pair by hand) is drawn solid and Resolve beside it quiet; where Resolve is all there is (a swap request, a keyword, a join request), it is the one action.
  Resolve is the only thing that closes an item, and ticket 07 leaves an expired-pause item standing after Resume; drawing the one action alone would leave such an item unresolvable.
- **No Resolve on a stall**, though the mock-up drew one. A stall is derived, not a stored item; nothing resolves it, and it clears itself when the Leader answers. The stalled item had no Resolve before either.
- **Who opened the contact details is not listed in *What has happened*.** Nudge records nothing today (ADR-0010), and the ticket says opening the card keeps whatever record Nudge keeps, so opening the card records nothing and there is no stored fact to list.
  Listing it would need a new recorded act on every opening, which is a new event and a migration, so it is left for James. Who read the concern is listed, from `concern_viewing`, this opening included.
- ***What has happened*, exactly the ticket's list**, newest first, each line dated by the day in the Ministry's zone: each open item raised and why (its reason sentence); each unresolved concern raised and by whom; a stall dated by the week that crossed its threshold (the second unanswered week once it closed, or the third week answered as no meeting); the check-ins that led to it, which are the very weeks the stall was derived from (`weeksBehindTheStall`) and the week each unresolved concern was answered D; every reading of an unresolved concern; and the resolved items and concerns of the pair with who resolved them.
  An earlier concern says who raised it and who resolved it, *and its words cleared*, never the words. The mock-up's *Paired* line is left out, because the ticket says *exactly*.
- **Somebody an item is about who is not one of the card's people** (asking to join a group, a co-leader invited to a running group, a disputed number) has their contact details in the item's band, through the same consent check (`public.person_card_contacts`, the predicate of `contact_to_share`), as *See contact details* gave them. Never on the two items that read red (a decline, an invitation that ran out), which showed no number before; the decline keeps its *Contact info* link to the Roster.
- **End relationship is at the card's foot on every card**, as on 07, including a group's card opened from a join request and a pair opened from a red item, where the item itself offered no End before. It is on nothing on the list.
- **The line on the list is the reason alone**: today's sentences are split (`followUpParts`, `placementParts`) into why the item is here, which the list says, and the rest, which the band adds; the whole sentence is unchanged.
- **How long it has held**: a Follow-Up Item since it was raised; a stall in its own unit (*22 days*, *3 weeks*); a Concern since the oldest unresolved one; Needs Care since the newest. The steps are the pair card's `ago` without *ago*: *today*, days under two weeks, weeks under nine, then months.
- **The names on the list are *Discipler → Disciple*** as the mock-up draws them (they were *A & B*); James's *Group leader X Declined* title stays on a decline, and an item about somebody who is not on the pair names that Person.
- **The stall line on the list lost its em dash**: *Gone silent: 22 days since last contact.* and *Answering, not meeting: 3 weeks reported as no meeting.*, as the mock-up says them (*Responding* became *Answering*).
- **Retired, because nothing posts to them any more:** `/follow-up/contact` (opening the card is the reveal) and `/follow-up/concern/view` (opening the card is the read). `follow_up_page`'s `reveal_person_id` is now passed by nothing and is left in place for the integrator to drop once the round's migrations have landed, as 08 left `relationship_names`.
- **Every item route returns to the card**: Resolve, Cancel, Place (a refusal; a placement still lands on the Roster receipt) and Copy link (a refusal, and the no-script page's way back) now take `back`, checked by the widened `A_CARD`. After the last thing on an item's own card is resolved, or a relationship is cancelled, the card has nothing to show and the list says what happened at its top.
- **Closing a card goes to the first item on the list that opens it**: `/follow-up#relationship-<id>`, the anchor the Materials tab already links to, or `#item-<id>`.
- Shared for 09: `PairCard` takes an optional `followUp` (`bands`, `history`), which replaces its own expired-pause band; `HeadLine`, `Person` and `Contact` are exported from `app/pair-card/pair-card.tsx`.
- **A reader is one line a day in *What has happened***, at their latest reading that day: every opening of the card records a reading, as 07 does, and an Admin who opened it five times one morning would otherwise be five lines. The alternative was a line per recorded reading.
- **A raised line says the item as it was raised**: an unaccepted relationship's *it has waited 42 days* is today's figure and is left out of the line dated the day it was raised.
- **Found in the browser check and fixed:** on a phone the list's *how long* column took the width the names and the reason need, so it sits on the tag's line there; the history's date column is narrower on a phone; the group dropdown in a band was taller than its buttons; *Cancel relationship* was drawn solid green, and is quiet with the red hover it had on the list, since it ends something.
