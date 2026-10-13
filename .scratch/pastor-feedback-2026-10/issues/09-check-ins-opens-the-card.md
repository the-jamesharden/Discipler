# 09 - Check-Ins opens the card

**What to build:** Every relationship on Check-Ins opens the pair card in place, with this week's answer in its band.
The D concern column lists its pairs by name like the other columns, instead of a sealed count that sends the Admin to Follow-Up.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *Check-Ins*.
Design: `.lavish/pastor-feedback/mock-checkins.html` and `mock-tab-checkins.html`, settled in James's Lavish review of 2026-10-12.
Today: A and B list cards that go nowhere, and concern is a sealed count with *Go to Follow-Up* (`app/check-ins/page.tsx`).

**Blocked by:** 03, 07, 08

**Status:** needs-triage

## Acceptance

- [ ] The layout stays as ticket 03 leaves it: the three counts, then four columns with the letters coloured as the donut. No summary strip.
- [ ] Each row in A, B, C and D opens the pair card (or the group card) over Check-Ins, with a band saying this week's answer and when it came (*This week · Met · B good · answered 9:07am*).
- [ ] D concern lists its pairs by name. The concern's words are never on the list; they show in the card's band, and opening it records the read as ticket 07 does.
- [ ] Resolving from the card clears the concern on Check-Ins and Follow-Up alike, and the page says so where the Admin is.
- [ ] `docs/pastor-dashboard.md`, *Check-Ins*, describes the D column and the card and no longer says the C heading does not expand.
- [ ] Checked by eye in a real browser against the mock-ups, with at least one answer of each letter, at desktop and phone width.

## Not in this ticket

- A summary strip. James chose none.
