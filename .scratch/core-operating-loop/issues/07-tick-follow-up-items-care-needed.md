# 07 — The scheduled tick, follow-up items, and Care Needed

**What to build:** A relationship nobody has accepted stops being invisible. Two days after creation the Leader is reminded. Five days after creation it surfaces to the Admin in the Care Needed view along with how long it has been waiting, so they can intervene. The Admin can cancel it, so people are never held out of the pool by a decision nobody made.

This ticket introduces two shared mechanisms, and both are load-bearing for everything after it.

The **scheduled tick** is a command like any other: it enters through the same boundary, reads the injected clock, and returns effects. It never reads system time.

A **Follow-Up Item** is a condition requiring Admin review. It is never cleared by the event that raised it and never clears itself; it persists until an Admin acts on it. This is the property that makes Care Needed trustworthy — nothing that needs a decision disappears before someone makes it.

Cancelling an unaccepted relationship returns everyone in it to the suggestion pool.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] A scheduled tick enters through the command boundary and reads the injected clock
- [ ] An unaccepted relationship reminds its Leader at two days
- [ ] An unaccepted relationship raises a follow-up item at five days showing how long it has waited
- [ ] A follow-up item never clears itself and is not cleared by the event that raised it
- [ ] An Admin can cancel an unaccepted relationship, returning everyone to the suggestion pool
- [ ] Accepting before the thresholds means no reminder and no follow-up item
- [ ] Care Needed lists open follow-up items for the Admin's Ministry only

## Comments

### Settled — the Follow-Up Item table

Care Needed draws on **three** sources: derived relationship states from ticket 10
(`Stalled`, `Needs Care`), Concern badges, and Follow-Up Items. Only the third is this
table, and the view is a union over all three.

**Six kinds**, named for the condition rather than the remedy:

| Kind | Raised by | Payload |
|---|---|---|
| `relationship_unaccepted` | the tick, five days after creation | how long it has waited |
| `pause_expired` | the tick, at period end (ticket 12) | the selected period |
| `swap_requested` | a Leader texting `SWAP` (ticket 17) | — |
| `participant_keyword` | a Participant texting a recognized keyword (ticket 17) | which keyword |
| `invitation_number_disputed` | *not my number* (ticket 06) | — |
| `match_declined` | a Participant declining the match on the reveal page (ticket 06) | — |

Every one is an act or a condition no later event undoes, which is the qualifying test.
Derived states are excluded by the same test: `Stalled` clears on an answered check-in,
so it could never satisfy *never clears itself*.

`match_declined` was previously unrecorded anywhere. Ticket 06 gives Participants a way
to say the match is not right without a conversation, and without an item that reaches
nobody. `invitation_number_disputed` is a persistent item and not a transient
notification — a wrong number sends a Leader's check-ins to a stranger indefinitely,
which is exactly what a notification that scrolls away fails to prevent.

**A Concern is not a row in this table.** It gets its own, because ticket 10 gives it
four properties nothing here has: text reached one Person at a time, cleared by default
on resolution, viewing as well as resolving audited, and a count when several are
outstanding. Storing erasable prose beside durable admin records invites one to be
treated like the other. The shared property — never clears itself — is a rule both
tables obey, not a reason to merge them.

**Subject: two nullable typed columns**, `relationship_id` and `person_id`, each with
the composite `(id, ministry_id)` foreign key this schema already uses, plus a check
requiring at least one. Not the polymorphic `subject_type`/`subject_id` pattern
`ministry_event` uses — that is append-only history whose subjects may be deleted, and
a polymorphic column cannot be a foreign key, so nothing would stop an item pointing at
a deleted row or across a Ministry boundary. Several kinds want both columns;
`participant_keyword` has a Person and no relationship.

**Payload: `jsonb not null default '{}'`,** enforced twice. A discriminated union at the
domain boundary so a `pause_expired` without its period is unconstructible in
TypeScript — the same technique ticket 04 requires for the suggestion reason — and a
check constraint for the two kinds that carry data, so the database refuses the bad row
even when a future writer bypasses the domain. Not typed columns: only two of six kinds
carry anything, and typed columns grow one per kind added later.

**Conditions dedupe; events accumulate.** The tick re-evaluates, so
`relationship_unaccepted` is true on days five, six and seven and must not produce three
rows. A partial unique index over open rows covers the two condition kinds only. The
other four are records that a person did something, and a second occurrence is a second
fact — a Leader texting `SWAP` again after being ignored is saying something, and
deduping makes them indistinguishable from one who asked once and waited.

**Resolution records `resolved_at` and `resolved_by`, and no free-text note.** Resolve
is one click inline (ticket 11); a note field adds a writing task to a surface designed
not to have one, and the actions an Admin took are recorded as facts of their own.
**Raising and resolving each append a `ministry_event`** — this table is mutable
operational state, so without that append a Ministry cannot ask later how many care
items it raised or how fast it closed them, and that is unreconstructable.

- [ ] The six kinds exist as an enum and nothing derived is among them
- [ ] An item carries a nullable `relationship_id` and a nullable `person_id`, each composite-keyed to its Ministry, with at least one present
- [ ] A `pause_expired` without its period, and a `participant_keyword` without its keyword, are refused by the database as well as unconstructible in the domain
- [ ] The tick run repeatedly against a five-day-old unaccepted relationship produces exactly one open item
- [ ] A pause expiring produces exactly one open item however often the tick runs
- [ ] Two `SWAP` requests on one relationship produce two items
- [ ] Resolving records the acting Admin and the time, and offers no note field
- [ ] Raising and resolving each append a history event
- [ ] A Concern is not stored in this table
- [ ] Care Needed unions derived states, Concerns, and follow-up items
