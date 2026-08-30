# 11 — Nudge reveals contact details

**What to build:** An Admin looking at a follow-up item can act on it without leaving the view: see the Participant's contact details, or resolve the item.

**Nudge sends nothing.** It reveals the number so the Admin can reach the Participant directly. Discipler's job is to say who needs a call, not to make it and not to become another inbox. There is no admin-initiated send anywhere in the product, which is why there are no per-recipient rate limits to enforce: the Check-In Rhythm is the only participant-facing traffic, and it is self-limiting by construction.

The contact details shown respect the recipient's contact-sharing consent, which is a decision about *now* and not one assumed from enrolment. A Participant who granted sharing and later withdrew it has two records, and the older one must not answer for them.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] A follow-up item exposes contact details and resolve inline
- [ ] Contact details shown respect the recipient's contact-sharing consent
- [ ] Nudge enqueues nothing and sends nothing

## Comments

### Amended — Nudge does not send, and 11a is withdrawn — 2026-08-30

This ticket was ticket 11, *Nudge and outbound limits*, and was split into 11a
(sending limits) and 11b (the inline actions) on the grounds that the two halves
were independently verifiable. 11a was built and then reversed in full.

The premise was wrong. `Nudge` was written in `docs/product-rules.md` and
`docs/pastor-dashboard.md` as sending one additional check-in under three
per-recipient ceilings, with `See contact details` listed beside it as a separate
action. The two were one action all along and it sends nothing, so the ceilings
had no subject. Both Settled sections are amended and
`docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md` records the decision,
its cost, and what was withdrawn.

What survives from 11a is nothing in the codebase. The recipient-level check at
the sending layer that ticket 03 built is untouched and was never part of it.

The split is undone with it: with the limits gone there is one outcome left, and
it is this ticket.

### Withdrawn — send one additional check-in

Ticket 11 gave the Admin a third inline action, *send one additional check-in*,
and it is gone with the rest of the sending. An Admin who sees a missed check-in
picks up the phone.

The cost is named in ADR 0010 and is not hidden here: a conversation held outside
Discipler does not land in the week-by-week history, so the history is thinner
than it would have been. That was the trade the product owner made deliberately.
