# 08 - The group card

**What to build:** Clicking a group on Overview opens the pair card's group form: the group's name, the leader in full, and each Disciple as a row showing their phone that opens to the rest.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The group card*.
Design: `.lavish/pastor-feedback/mock-group.html`, settled in James's Lavish review of 2026-10-12.

**Blocked by:** 07

**Status:** ready-for-agent

## Acceptance

- [ ] Every group card on Overview opens the group card over the page, the same way ticket 07's card opens.
- [ ] The head says *Group*, its declared shape (women, men or mixed) and since when, the group's name and its state pill.
- [ ] The leader is shown in full, as a person is on the pair card, with the role *Discipler*.
- [ ] Under *Disciples · N*, each Disciple is a row with their name and phone; pressing the row opens their email, age band and goal. A missing phone or email is left out, not announced. It opens without script.
- [ ] The facts, the concern or stall band, the read record and End relationship behave as on ticket 07's card.
- [ ] A group of twelve stays readable on a phone: the rows keep their shape and the card scrolls inside the window.
- [ ] Checked by eye in a real browser against the mock-up, with a group of three and one of twelve, at desktop and phone width.

## Not in this ticket

- Changing who is in a group. That stays on the Roster.
