# The Check-In Cadence and the Week Boundary

## Status

accepted

## Context

Ticket 08 asks each Leader once a week and never said which day, which hour, or
against which clock. Nothing in the spec, `docs/check-in-rhythm.md`, or
`docs/product-rules.md` carried a timezone at all, and no Ministry setting existed to
put one on.

Ministries genuinely differ. A church small group meets Sunday and wants a Monday
morning prompt; campus discipleship happens midweek and Thursday evening is the
natural ask. That is a real difference between two ministries running the same
product, not a preference.

Two further things had to be decided at the same time, because deciding the cadence
without them produces silent wrongness rather than a missing feature:

- **What happens to an already-enqueued prompt when a coordinator edits the cadence.**
  Changing Monday 8pm to Wednesday 7pm on a Tuesday can plausibly vanish this week's
  prompt, fire it twice, or fire it late.
- **What a week is.** Ticket 10 counts consecutive unanswered check-ins and
  consecutive weeks reported as no meeting. If a week is implicitly *since the last
  prompt*, then moving the hour forward creates one week carrying two prompts and one
  carrying none, and the counters misfire without anyone seeing it.

Quiet-hours rules are not advisory. A coordinator who innocently sets 6:30am creates
a compliance problem Discipler carries, not the ministry.

## Decision

**The cadence is a Ministry setting, at hour granularity.** `checkin_day` (0–6) and
`checkin_hour` (an integer hour, no minutes), both interpreted against the Ministry's
timezone, which is stored alongside them. Every availability block is already
interpreted against that same timezone.

**The hour is clamped to 8am–9pm local, enforced by a database check constraint** and
not only by the form. Pilot settings will be written by SQL, so a form-only rule is
not a rule.

**Per-relationship override columns exist now and are unused.**
`relationship.checkin_day` and `relationship.checkin_hour` are nullable and null on
every row. The dispatcher reads `coalesce(r.checkin_day, ms.checkin_day)` from the
first line of code. Behavior is identical to ministry-only until the columns are
surfaced, and the dispatcher query never has to be rewritten. This will come up: a
Leader holding a Tuesday one-to-one and a Saturday group will want different prompts
for each.

**The cadence is read at enqueue time and stamped on the outbox row.** The scheduled
tick resolves the cadence when it enqueues and writes `scheduled_for` on the
`outbound_message` row. **Edits affect future periods only.** An edit never cancels
and never reschedules an already-enqueued row.

**The week boundary is the ISO week in the Ministry timezone, defined independently
of the check-in hour.** The consecutive-week counters in ticket 10 derive from
relationship history against that anchor, never against the interval since the last
prompt.

## Considered options

**Surfacing per-relationship cadence now.** Rejected for V1 — there is no admin
surface for it and no ticket that would build one — but the columns are added now
anyway, because the schema is the expensive thing to redo and the dispatcher query is
the thing that would have to change.

**Leaving the week implicit, as the interval since the last prompt.** Rejected. It is
the reading that makes a cadence edit silently corrupt the missed-week counters,
which is the exact failure this ADR exists to prevent.

**Rescheduling or cancelling enqueued rows when the cadence is edited.** Rejected on
two grounds: it breaks the dispatcher's idempotency, and it cannot be explained to a
pastor in one sentence. *Your change takes effect from next week* can be.

**One cadence for the whole product.** Rejected. The Sunday-group and midweek-campus
difference is real, and a fixed day would make Discipler wrong for one of the two
pilot shapes.

**Minute granularity.** Rejected. It buys nothing an hour does not, and it widens the
surface the quiet-hours clamp has to police.

## Consequences

A cadence edit produces one visible oddity: an ISO week can carry a prompt sent under
the old cadence and the next week's under the new one, so two prompts can fall closer
together or further apart than seven days. The ISO anchor keeps the missed-week
counters correct through it, which is the property that matters.

The override columns are dead weight until something surfaces them. That is the price
of not migrating a table carrying live relationships and live history.

The 8am–9pm clamp means a ministry cannot ask for a 6:30am prompt even when it wants
one. The compliance exposure is Discipler's, so the ceiling is Discipler's to set.

The Ministry timezone becomes load-bearing well beyond the cadence: the ISO week
anchor, the nudge day and week windows in ticket 11, and the *first check-in of each
calendar month* rule in ticket 08 are all resolved against it.
