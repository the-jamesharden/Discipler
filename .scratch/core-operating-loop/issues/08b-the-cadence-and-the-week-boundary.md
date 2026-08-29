# 08b — The cadence and the week boundary

**What to build:** What makes a Leader's check-in sequence due, and when it is sent. Ticket 08a owns the conversation once it is open; this ticket decides that a Leader is due this week, at this Ministry's day and hour, and starts it — replacing the direct trigger 08a was built against.

**When the sequence sends** is a Ministry setting, not a constant: `checkin_day` (0–6)
and `checkin_hour`, resolved against the Ministry timezone and clamped to 8am–9pm
local by a database check constraint. A church small group meets Sunday and wants a
Monday morning prompt; campus discipleship happens midweek and Thursday evening is the
natural ask. `relationship.checkin_day` and `relationship.checkin_hour` are nullable and
null on every row, and the dispatcher reads `coalesce(r.checkin_day, ms.checkin_day)`
from the first line — per-relationship cadence is not surfaced in V1, but the query is
never rewritten to add it.

The cadence is read **at enqueue time** and stamped as `scheduled_for` on the outbound
row. **A cadence edit affects future periods only** and never cancels or reschedules an
already-enqueued message, so a coordinator moving Monday 8pm to Wednesday 7pm on a
Tuesday changes next week and not this one. That is what keeps the dispatcher
idempotent and the behavior explainable in one sentence.

**A week is the ISO week in the Ministry timezone, defined independently of the
check-in hour.** *A new week comes due* means a new ISO week, never *seven days since
the last prompt* — under that reading a cadence edit produces one week carrying two
prompts and one carrying none, and ticket 10's consecutive counters misfire silently.
The *first check-in of each calendar month* rule resolves against the same timezone;
08a carries the language, this ticket resolves the month.

Implements `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.

**Blocked by:** 07, 08a, 22

**Status:** in-review

- [x] The send time comes from the Ministry's `checkin_day` and `checkin_hour`, resolved against the Ministry timezone
- [x] The database refuses a `checkin_hour` outside 8am–9pm, not only the form
- [x] The dispatcher reads `coalesce(r.checkin_day, ms.checkin_day)` while every relationship override is null
- [x] The cadence is stamped on the outbound row at enqueue time
- [x] Editing the cadence changes future periods only and neither cancels nor reschedules an enqueued row, proven by a test that edits mid-week
- [x] A new week is a new ISO week in the Ministry timezone, and a cadence edit does not produce a week with two prompts or none
- [x] The monthly opt-out rule resolves the calendar month against the Ministry timezone

## Comments

### Amended — the cadence, and what a week is

The ticket said *once a week* and named no day, no hour, and no clock; no Ministry
setting existed to hold one. Both are now settled, together, because settling the
cadence without settling the week boundary is what makes a cadence edit corrupt
ticket 10's counters instead of merely moving a prompt.

The settings themselves are built by ticket 22. This ticket consumes them.

### Split from ticket 08 — 2026-08-29

Ticket 08 carried two independently verifiable outcomes and twenty-one criteria. It
is now 08a and 08b (this ticket), split on the line the ticket's own amendment
history drew: the conversation, and when it fires. The cadence was amended into
ticket 08 after the fact and is a scheduling concern throughout — a dispatcher and a
week calculator, both against ticket 07's injected clock.

No design decision changed in the split. Every paragraph and every criterion above is
ticket 08's, verbatim, apart from the opening sentence naming the seam and the clause
handing the monthly language to 08a.

### Surfaced — who authors the `checkin_hour` constraint

Ticket 08 stated *"The settings themselves are built by ticket 22. This ticket
consumes them"* while also claiming as its own criterion *"The database refuses a
`checkin_hour` outside 8am–9pm"* — which is ticket 22's criterion verbatim, and
ticket 08 was not blocked by 22. As written, whoever picked it up had to guess.

The dependency is now explicit, in the direction the ticket text already stated: 22
builds the settings, this ticket consumes them. **Who authors the migration carrying
the check constraint is still open** and is deliberately not decided here. Both
tickets list the criterion; the second to land verifies rather than re-authors it.

At the time of the split `ministry` has no `timezone`, `checkin_day`, or
`checkin_hour` column and `relationship` has no override columns, so nothing in this
ticket is testable until 22 lands.

### Settled while building — `checkin_day` 0 is Sunday

The spec, the ADR and this ticket all say *0-6* and none of them says which end.
Both natural conventions in this stack agree -- Postgres's `extract(dow)` and
JavaScript's `getDay` are each 0 = Sunday -- so the number now crosses the
boundary without anybody translating it, and it is written down in the migration,
in `week.ts` and in a column comment rather than left to be re-derived.

The one consequence worth naming: an ISO week runs Monday to Sunday, so a Sunday
cadence falls at the **end** of its week and not at the start of the next. That is
what keeps every week to exactly one prompt however a coordinator sets the day,
and it is covered by a test that asserts the cadence instant lands inside the week
it was asked for, for all seven days.

### Settled while building — this ticket authored the migration

Ticket 22 has not landed, and the comment above left authorship open: *both
tickets list the criterion; the second to land verifies rather than re-authors
it.* 08b landed first, so 08b carries
`20260901000100_the_cadence_and_the_week_boundary.sql`: `ministry.timezone`,
`ministry.checkin_day`, `ministry.checkin_hour` with the 8am-9pm check
constraint, the nullable `relationship` overrides with the same clamp, and
`outbound_message.scheduled_for`.

**Ticket 22 now verifies rather than re-authors.** What is left to it is the
settings *screen* and the rest of what a Ministry may vary -- `from_name`,
`leader_noun`, `participant_noun` and the preview, `suggest_gender_match`,
`suggest_max_age_band_gap` -- plus the write path and RLS that let an Admin edit
any of it. Nothing here grants an Admin write access to these columns; the pilot
writes them by SQL, which is exactly the case the constraint exists for.

### Added beyond the criteria — the timezone is checked too

An unknown timezone would make the week boundary, the cadence and the monthly rule
silently wrong for a whole Ministry rather than loudly broken, and the ADR makes
the timezone load-bearing well past the cadence. `ministry.timezone` is validated
by a `before insert or update` trigger that asks Postgres to resolve the name.

A trigger and not a check constraint on purpose: resolving a zone name is `STABLE`
and not `IMMUTABLE` -- the zone database changes under a running server -- and a
check constraint holding a stable expression is one a dump and restore can
silently fail to reproduce.

### Surfaced — a Leader whose relationships carry different cadences

The override columns exist and the dispatcher reads them, so two relationships led
by one Person can in principle name different days. Nothing in the ticket, the ADR
or the spec says what a Leader is then due at — and it cannot: **one Leader has one
conversation covering everything they lead**, so one cadence has to win.

The dispatcher takes the **earliest** instant among the relationships the
conversation covers. That is unreachable in V1 — every override is null, so they
all carry the Ministry's and the earliest is simply that — and the alternative
readings (latest, or one conversation per cadence) both contradict *one sequence
per Leader per week*.

**This is not settled product behavior.** It is a rule the code had to pick to be
written at all, it is documented where it is made, and whoever surfaces the
override columns should decide it deliberately rather than inherit it.

### Surfaced — the cadence defaults

The migration defaults every existing Ministry to `timezone = 'UTC'`,
`checkin_day = 1`, `checkin_hour = 9` — Monday 9am, the ADR's own worked example.
No document states a default. UTC is chosen because it is visibly *not set* rather
than plausibly set to somewhere wrong. Ticket 22's form is where a Ministry is
asked to choose properly.

### Surfaced — `checkin.start` was kept, not deleted

The ticket says this one replaces *"the direct trigger 08a was built against"*, and
it does — for the weekly rhythm, which now arrives only through `scheduled.tick`.
The `checkin.start` command itself still exists, carrying no cadence check, as the
Admin action the spec asks for at line 124: *"send one additional check-in"*.

Two things follow that are worth someone's deliberate attention:

- It can open a second sequence inside one ISO week, which is the point of an
  *additional* check-in but sits against *"One sequence per Leader per week."*
- Nothing routes to it yet. It is reachable only from tests until the Care Needed
  surface is built.

### Known cost — the dispatcher is N+1, under one lock each

`leadersDueForCheckIn` reads every Leader's snapshot with the same per-Person
advisory lock the direct trigger takes, in one transaction, on every tick. The lock
is load-bearing — it is what stops an inbound reply and a newly-due sequence both
finding no conversation open — but it means one tick locks every Leader in the
Ministry. Fine at pilot scale, and the first thing to revisit if a tick starts
contending with inbound replies.
