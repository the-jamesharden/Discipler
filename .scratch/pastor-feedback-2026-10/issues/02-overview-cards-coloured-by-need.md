# 02 - Overview cards coloured by what they need

**What to build:** Every relationship card on Overview is coloured: green when healthy, yellow when stalled, red while it carries an unresolved concern, grey when paused or awaiting acceptance.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *Overview card colours*.
Today: `public/discipler.css` tints needs_care red, stalled amber, paused grey and awaiting acceptance gold, and a healthy card has no colour at all.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [ ] A healthy card is green.
- [ ] A stalled card is yellow.
- [ ] A card carrying an unresolved concern is red for as long as the concern is unresolved, not only during the week it was raised (Needs Care lasts the week; the concern badge lasts until resolved).
- [ ] A stalled card that also carries an unresolved concern is red.
- [ ] Paused and awaiting acceptance cards are both grey, and each keeps its own label (`Paused`, `Awaiting acceptance`).
- [ ] Every coloured card carries a word label saying why, so no meaning rests on colour alone, and the colours pass contrast in the existing palette.
- [ ] Clicking a card behaves as today. The pair card replaces that later.
- [ ] `docs/pastor-dashboard.md`, *Overview*, says what each colour means.
- [ ] Checked by eye in a real browser with one card in each condition, at desktop and phone width.

## Not in this ticket

- The pair card that opens when a card is clicked. That is ticket 07.
