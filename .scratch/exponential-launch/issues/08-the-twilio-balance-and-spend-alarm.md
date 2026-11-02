# 08 - The Twilio balance and spend alarm

**What to build:** support@ hears about a failing Twilio balance before it stops every church's texts and codes (Q70).

**Blocked by:** 10

**Status:** ready-for-agent

## The rule

- The scheduled tick reads `GET /2010-04-01/Accounts/{sid}/Balance.json` every few minutes.
- Below $75, support@ is emailed once, and again only after the balance has recovered and fallen again.
- A Twilio Usage Trigger posts to a signed Discipler route when one day's spending passes a set amount, and support@ is emailed.
- Auto-recharge itself is a Console switch with no API, and is James's (see For James).

## Acceptance

- A stubbed balance of $70 sends one email and no more on the next ticks.
- A forged Usage Trigger request without Twilio's signature is refused.

## For James

1. As the Twilio organization owner, turn on auto-recharge: add $500 when the balance drops below $100, with a backup card.
2. Decided 2026-10-29 (Q78): $250 a day, about twice the expected daily spend at 100 churches (about $3,650 a month).
