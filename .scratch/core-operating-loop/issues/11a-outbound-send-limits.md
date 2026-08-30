# 11a — Outbound send limits

**What to build:** An Admin who clicks Nudge twenty times causes at most one message.

That limit is enforced at the sending layer, not at the button. A disabled button is a courtesy; the limit is the rule, and any future feature that sends a message inherits it without exception. The reason is that Discipler's entire participant-facing surface is SMS: a Ministry that over-messages its own congregation gets its number carrier-flagged, and every relationship in that Ministry goes dark at once.

Nudge limits per recipient: one per twelve hours, at most two per day, at most four per week. These are pilot starting values, to be tuned from pilot data. They govern nudges specifically — the Check-In Rhythm is self-limiting by construction and needs no separate ceiling.

The daily and weekly caps are resolved against the Ministry timezone, on the same ISO
week anchor the check-in counters use, so *at most two per day* and *at most four per
week* mean the same thing on every surface.

**The button is ticket 11b's.** That ticket puts Nudge and send-one-check-in on the follow-up item; this ticket owns the rule they are subject to, and does not need a button to prove it.

**Blocked by:** 10

**Status:** shipped

- [x] Nudge clicked repeatedly enqueues at most one message
- [x] The cooldown, daily cap, and weekly cap are enforced at the sending layer
- [x] The limits are configuration, not constants scattered through call sites
- [x] The daily and weekly windows resolve against the Ministry timezone and the ISO week
- [x] The Check-In Rhythm is not subject to the nudge ceiling
- [x] Nudge caps are counted per recipient Person while the ticket 20 hold is per phone number; a held message consumes no nudge budget and a nudge closes no open prompt

## Comments

### Amended — dual-role persons

Two limiters now sit on the same queue and must not be confused. The nudge caps
are a ministry-conduct rule counted per Person. The hold in ticket 20 is a
conversation rule counted per phone number, because a phone can only hold one
conversation at a time regardless of how many people are reachable on it.

### Split from ticket 11 — 2026-08-30

Ticket 11 carried two independently verifiable outcomes: a sending-layer invariant
and an Admin surface. It is now 11a (this ticket) and 11b, split on the line the
ticket's own text drew — *that limit is enforced at the sending layer, not at the
button.*

No design decision changed in the split. Every paragraph and every criterion above
is ticket 11's, verbatim; the follow-up item's inline actions and their consent
gate moved to 11b intact. The one addition is the paragraph naming the seam.

The seam is narrow: 11b adds callers, this ticket refuses them. That is what lets
these criteria be proven without a button — the send is invoked directly in tests,
and 11b later gives it a real caller.

`Blocked by: 10` is ticket 11's, unchanged on both halves. This ticket's criteria
reference ticket 20 as ticket 11 did, without depending on it.

### Shipped — what was built

The rule is `src/domain/nudge-limits.ts`: `NudgeLimits`, the pilot values as one
named `PILOT_NUDGE_LIMITS`, and `nudgeRefusedBy`, which is given the nudges already
sent and the instant to judge them at and touches nothing else. `dispatchQueue`
takes the limits as an argument defaulted to the pilot values, so tuning them from
pilot data is an edit in one place and a Ministry-scoped source can replace the
constant later without the rule changing shape.

The week comes from `isoWeekOf`, which is the function the check-in counters
already use. The day is a new `calendarDayOf` beside `calendarMonthOf`, reading
through the same `zonedTime`, so the day boundary and the week boundary cannot
fall in different places for the same Ministry.

`outbound_message` gained a `kind` enum of two values, defaulted to `'other'`, so
no existing send path changed to keep meaning what it already meant. A database
check refuses a nudge that names no Person, because a nudge counted against nobody
is the unmetered path this ticket exists to prevent. The queue's new
`nudgesSentTo` reads sent nudges only, which is where *a held message consumes no
nudge budget* actually lives.

739 tests pass against a local Supabase stack, none skipped — 22 new across
`tests/domain/nudge-limits.test.ts` and `tests/integration/nudge-limits.test.ts`.

### Surfaced — the daily cap cannot bind at the pilot values

Not a defect and not resolved here. A twelve-hour cooldown already allows at most
two sends in a twenty-four hour day, so *at most two per day* can never be the
ceiling that refuses while the cooldown stands at twelve hours. The weekly cap does
the work.

`perDay` is enforced and tested on its own terms rather than dropped, because a
cooldown tuned down from pilot data is exactly the case it exists for. Recorded so
that whoever tunes these next does not read it as dead code, and so that the
redundancy is a known property of the starting values rather than a discovery.

### Not built here

**Nothing enqueues a nudge in production.** The ceiling refuses nudges wherever
they come from, and tests enqueue them directly — the same way 08a was proven
without a scheduler. The Nudge button, and the caller that gives this rule
something to refuse, are ticket 11b's.

**A withheld nudge appends no `ministry_event`.** It stays on the queue with its
reason, exactly as a message withheld for opt-out or absent consent does. Adding
history for one kind of refusal and not the others is a decision this ticket was
not asked to make; if a Ministry needs to ask later how often it hit its own
ceiling, that is a ticket.

**The criterion says *enqueues* at most one message; twenty clicks enqueue twenty
rows.** One is delivered and nineteen are withheld with their reason. That is the
ticket's own governing sentence — *enforced at the sending layer, not at the
button* — and the existing design that a refused message stays on the queue saying
why, because a congregant who did not receive something is a thing an Admin has to
be able to find out about. An enqueue-time gate would have satisfied the verb and
broken the rule.
