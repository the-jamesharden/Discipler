# 02 - Overview cards coloured by what they need

**What to build:** Every relationship card on Overview is coloured: green when healthy, yellow when stalled, red while it carries an unresolved concern, grey when paused or awaiting acceptance.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *Overview card colours*.
Today: `public/discipler.css` tints needs_care red, stalled amber, paused grey and awaiting acceptance gold, and a healthy card has no colour at all.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [x] A healthy card is green. (6330571)
- [x] A stalled card is yellow. (6330571)
- [x] A card carrying an unresolved concern is red for as long as the concern is unresolved, not only during the week it was raised (Needs Care lasts the week; the concern badge lasts until resolved). (6330571)
- [x] A stalled card that also carries an unresolved concern is red. (6330571)
- [x] Paused and awaiting acceptance cards are both grey, and each keeps its own label (`Paused`, `Awaiting acceptance`). (6330571)
- [x] Every coloured card carries a word label saying why, so no meaning rests on colour alone, and the colours pass contrast in the existing palette. (6330571)
- [x] Clicking a card behaves as today. The pair card replaces that later. (6330571)
- [x] `docs/pastor-dashboard.md`, *Overview*, says what each colour means. (6330571)
- [x] Checked by eye in a real browser with one card in each condition, at desktop and phone width. (6330571)

## Not in this ticket

- The pair card that opens when a card is clicked. That is ticket 07.

## Comments

Decisions made while building (pf-02-07 builder, 2026-10-12):

- **Red wins over grey as well as over yellow.**
  The spec names red over yellow and is silent on a paused relationship that still carries an unresolved concern.
  A pause stops the check-ins and resolves nothing, so the card is red and keeps its `Paused` pill.
  The alternative was grey, which would hide the one thing on the card that still needs an Admin.
- **A healthy card names itself `Healthy`, except when it is red.**
  A relationship whose Needs Care week has passed but whose concern is unresolved is in the Healthy state; its card is red, drops the `Healthy` pill, and is labelled by its flag line, `Concern`.
  The alternative was a green `Healthy` pill on a red card.
- **Classed by need, not by state.**
  The Overview cards are `need-healthy`, `need-stalled`, `need-concern` and `need-inactive`; the Materials folders keep their `s-<state>` classes and look as they did.
  The alternative was recolouring the shared `s-` classes, which would have turned every healthy Materials card green too.
- **Yellow is the amber Stalled has always used**, as the mock-up's own stylesheet keeps it, not `--yellow-fit`.
- **Contrast.**
  The healthy edge is `--primary-light` rather than `--green-fit`, which is 2.5:1 against white; a Stalled pill on a tinted card uses a lighter tint (4.6:1 instead of 4.4:1); both grey cards draw their pill grey (5.0:1; the gold `Awaiting acceptance` pill was 4.0:1); and the grey flag line (`Pause expired`, `Unaccepted`) is `#5f5f5f` rather than `--neutral` (6.0:1 instead of 4.1:1), on the Materials folders as well.
- **Hover keeps the colour.**
  A linked card used to swap its background on hover, which wiped the tint; it now lifts with a shadow instead.
- Checked at 1440 wide and in a 390x844 frame, with one card in each condition and a stalled card that also carries a concern; screenshots in the builder's scratchpad.

