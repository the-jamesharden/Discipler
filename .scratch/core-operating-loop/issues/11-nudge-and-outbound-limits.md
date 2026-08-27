# 11 — Nudge and outbound limits

**What to build:** An Admin looking at a follow-up item can act on it without leaving the view: see contact details, resolve the item, or send one additional check-in. An Admin who clicks Nudge twenty times causes at most one message.

That limit is enforced at the sending layer, not at the button. A disabled button is a courtesy; the limit is the rule, and any future feature that sends a message inherits it without exception. The reason is that Discipler's entire participant-facing surface is SMS: a Ministry that over-messages its own congregation gets its number carrier-flagged, and every relationship in that Ministry goes dark at once.

Nudge limits per recipient: one per twelve hours, at most two per day, at most four per week. These are pilot starting values, to be tuned from pilot data. They govern nudges specifically — the Check-In Rhythm is self-limiting by construction and needs no separate ceiling.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Nudge clicked repeatedly enqueues at most one message
- [ ] The cooldown, daily cap, and weekly cap are enforced at the sending layer
- [ ] The limits are configuration, not constants scattered through call sites
- [ ] A follow-up item exposes contact details, resolve, and send-one-check-in inline
- [ ] Contact details shown respect the recipient's contact-sharing consent
- [ ] The Check-In Rhythm is not subject to the nudge ceiling
- [ ] Nudge caps are counted per recipient Person while the ticket 20 hold is per phone number; a held message consumes no nudge budget and a nudge closes no open prompt

## Comments

### Amended — dual-role persons

Two limiters now sit on the same queue and must not be confused. The nudge caps
are a ministry-conduct rule counted per Person. The hold in ticket 20 is a
conversation rule counted per phone number, because a phone can only hold one
conversation at a time regardless of how many people are reachable on it.
