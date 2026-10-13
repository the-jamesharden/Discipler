# 07 - The pair card

**What to build:** Clicking any one-to-one relationship on Overview opens a card over the page, instead of going to Follow-Up.
It shows both people side by side with their contact details and Intake answers, the facts about the pair, and, when there is one, the concern or the stall in a band under the names, with what can be done about it.
This is the shared card that tickets 09 and 10 open from Check-Ins and Follow-Up.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The pair card*.
Design: `.lavish/pastor-feedback/mock-card-healthy.html`, `mock-card-concern.html`, `mock-card-stalled.html`, `mock-role-disciple.html`, `mock-role-discipler.html`, settled in James's Lavish review of 2026-10-12.
Today: a flagged Overview card is a link to `/follow-up#relationship-<id>`, a healthy one goes nowhere, and a concern's words are read through the audited `Read the concern` post on Follow-Up (`app/follow-up/page.tsx`, `/follow-up/concern/view`).

**Blocked by:** nothing. Ticket 06's Other text appears here once 06 lands.

**Status:** ready-for-agent

## Acceptance

- [ ] Every one-to-one and 1:2 card on Overview opens the pair card over the page, without leaving it; closing returns to the Overview where it was. It works without script, as the import dialog and the Pair popup do, and the address says which card is open.
- [ ] The head says the shape and since when (*One to one · paired 7 Sep, 5 weeks ago*), both names, and the state pill.
- [ ] The two people sit side by side, the Discipler left and the Disciple right, and stack on a phone.
- [ ] Each person shows their name, their role **in this pair** (*Discipler* or *Disciple*), phone with Call and Text links, email, age band and goal, with Other text where they gave it. A missing phone or email is left out, not announced.
- [ ] A person who leads one pair and is discipled in another reads *Discipler* on one card and *Disciple* on the other, and neither card mentions the other pair.
- [ ] Beneath the people: paired since, the last check-in answer and its date (*Mon 12 Oct · Met · B good*), and the current material and since when. Never the words of a concern in that line.
- [ ] **A concern sits in a band straight under the names** with its words, who raised it and when, and **Resolve**, which clears the words as Resolve does today.
- [ ] **The concern's words show as the card opens**, and opening it records the read exactly as `Read the concern` records it today. A line under the band says who read it and when.
- [ ] **A stall sits in the same band**: which condition fired and how long it has held, in the unit that condition reports (`docs/product-rules.md`, *Stalled Reports a Duration Matched to Its Reason*).
- [ ] An expired pause shows its band with **Resume**.
- [ ] **End relationship** is a quiet link at the foot that opens the existing outcome and reason step and ends it through the existing route.
- [ ] Contact details reach the page through the same consent check Nudge uses today (ADR 0010); the card sends nothing.
- [ ] `docs/pastor-dashboard.md` (*Overview* and *Check-Ins*) says the concern shows when the card opens and the read is recorded, replacing the deliberate extra click, and the reversal is written down; `docs/open-questions.md`, *Open: the Admin relationship detail*, is marked resolved by this card.
- [ ] Checked by eye in a real browser against the mock-ups, healthy, concern and stalled, at desktop and phone width.

## Not in this ticket

- Groups. That is ticket 08.
- Opening the card from Check-Ins and Follow-Up. Those are tickets 09 and 10.
- Custom question answers on the card. Those come with ticket 12.
