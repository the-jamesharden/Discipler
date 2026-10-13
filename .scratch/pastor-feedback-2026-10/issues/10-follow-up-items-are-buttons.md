# 10 - Follow-Up items are buttons

**What to build:** Each Follow-Up item becomes one button: its tag, the names, one line of reason and how long it has held.
Pressing it opens the pair card in its fuller Follow-Up form, with the item's action in the band and a *What has happened* list under the facts.
*End relationship* leaves the front of the page.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *Per tab* and *Follow-Up*.
Design: `.lavish/pastor-feedback/mock-followup-list.html` and `mock-tab-followup.html`, settled in James's Lavish review of 2026-10-12.
Today: every item carries its own row of buttons, *See contact details*, *Read the concern*, *Resolve*, *Resume relationship*, *End relationship* and others by kind (`app/follow-up/page.tsx`).

**Blocked by:** 07, 08

**Status:** needs-triage

## Acceptance

- [ ] Each item on Follow-Up is one control showing its tag, the names, one line of reason, how long it has held and an arrow, and nothing else to press. A concern's words never show on the front.
- [ ] Pressing a care item (concern, stalled) opens the pair card, or the group card, with the item and its action in the band.
- [ ] Pressing a review item opens the same card with its one action in the band: *Resume relationship* on an expired pause, *Copy link to re-invite leader* on an invitation not accepted, *Resolve* on a swap request, *Cancel relationship* where today's card offers it, and the group dropdown with *Place in this group* on *Wants a group*.
- [ ] *See contact details* goes: opening the card is the reveal, through the same consent check, and keeps whatever record Nudge keeps today.
- [ ] Under the facts, **What has happened**, newest first, read from the stored history, lists exactly: when the item was raised and why; the check-ins that led to it (unanswered, did not meet, the D); who opened the contact details or read the concern, and when; earlier Follow-Up items for this pair and who resolved them. The words of an earlier, resolved concern never appear.
- [ ] *End relationship* is on the card's foot as on ticket 07 and nowhere on the front of the page.
- [ ] `docs/pastor-dashboard.md`, *Follow-Up*, describes the buttons, the card and its history, and that the four actions now live in the card.
- [ ] Checked by eye in a real browser against the mock-ups, with an item of every kind, at desktop and phone width.

## Not in this ticket

- Any new action. The actions are today's, moved into the card.
