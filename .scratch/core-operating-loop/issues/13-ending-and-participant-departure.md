# 13 — Ending a relationship and Participant departure

**What to build:** An Admin ends a relationship with a recorded reason, so the Ministry knows later whether it completed or broke down — a relationship that ran well and finished is an outcome, not a deletion. The history is preserved exactly, and the people in it return to the Roster as `Ready to Pair` so they can be matched again, unless they have opted out.

One Participant leaving a relationship does not end it for everyone else. Their membership receives an end date and the relationship continues with whoever remains. Their past check-in weeks stay attached to the relationship exactly as recorded, so history is not rewritten by someone leaving. A relationship dropping from three Participants to one changes nothing structurally — it is still one relationship, now with one Participant, and the check-in copy switches from the relationship's name to the Person's name on its own.

`Ended` is terminal. Ending a relationship is recorded against the Admin who did it.

**Blocked by:** 10

**Status:** shipped

- [x] An Admin can end a relationship with a recorded reason
- [x] An ended relationship's history is preserved unchanged
- [x] Ending closes every open membership on the relationship in one transaction, through a single function that is the only write path that ends a relationship
- [x] No open membership survives on a relationship carrying an `ended_at`
- [x] Participants in an ended relationship return to `Ready to Pair` unless opted out, and only once their last open participant membership closes
- [x] The Leader's Participation Status is unchanged by ending, because leading never set it
- [x] `Ended` is terminal in the derivation
- [x] One Participant leaving does not end the relationship for the others
- [x] A departed Participant's membership carries an end date rather than being deleted
- [x] A departed Participant's past weeks stay attached to the relationship
- [x] A Participant who leaves and is readmitted later gets a second membership row, and their first stays closed and intact
- [x] Check-in copy follows the remaining Participant count with no group-versus-one-to-one branch
- [x] Ending is recorded against the acting Admin

Added during implementation, and argued for in the notes below rather than agreed
before the work started — see **Implemented**.

- [x] A Leader leaving is refused, and so is the last Participant leaving: both are an ending
- [x] Ending and departure both refuse a relationship nobody has accepted
- [x] A cancellation records `discontinued` through the same single ending function
- [x] A departure is recorded against the acting Admin, refused when they are not in the Ministry

## Comments

### Amended — dual-role persons

Ending returns *participants* to the pool. A Leader was never `Paired` by leading,
so there is nothing to return them to, and a Participant with another open
participant membership stays `Paired` — the derivation handles both without a
special case, which is the point of deriving it.

One function owns ending because the invariant it maintains, that no open
membership outlives its relationship, cannot be held by a constraint alone.

### Settled — an ending records an outcome as well as a reason

`relationship.ended_reason` already exists as required free text, enforced by a check
constraint from ticket 05's migration. That alone cannot answer the question this ticket
opens with — *whether it completed or broke down* is asked in counts, and free text
cannot be classified retrospectively once a pilot has written a hundred sentences.

Add a required `ended_outcome` of exactly two values: `completed` and `discontinued`.
Two, deliberately — the question is binary, and a third value invites a taxonomy nobody
has agreed, after which every row written before it was added is unclassifiable.

- [x] Ending records a required `ended_outcome` of `completed` or `discontinued` alongside the free-text reason
- [x] The database refuses an `ended_at` without an outcome, as it already does without a reason

### Settled — what a departure is not

The ticket says a departure leaves the relationship running with whoever remains.
Two shapes cannot: a Leader leaving, and the last Participant leaving. Neither
leaves a relationship that continues — one has nobody leading it and the other has
nobody being discipled, and the check-in question about nobody has no subject to
name. Both are refused, and the refusal says the same thing in both cases: *what
you are describing is an ending*, which is the act that records an outcome.

That also means a one-to-one is never departed from. Its only Participant leaving
is the relationship finishing, and it ends with a reason and an outcome like any
other.

A relationship nobody has accepted is refused too, and for a third version of the
same reason: nothing has reached a Participant, so there is nothing to leave, and
withdrawing one nobody agreed to takes everybody out of it at once. That is
`relationship.cancel`. The same refusal a Pause already carries for that state.

### Noted — readmission has no command

*A Participant who leaves and is readmitted later gets a second membership row* is a
property of the data model, and it is what the surrogate primary key on
`relationship_member` was chosen for. Nothing in the product readmits anybody today:
`relationship.create` forms a new relationship rather than reopening a membership on
an existing one. The integration test proves the schema permits the second row and
keeps the first closed and intact; the command that would use it belongs to whichever
ticket gives an Admin that button.

### Settled — ending refuses a relationship nobody accepted

The mirror of cancelling refusing one that has been accepted, which ticket 05
already built. A relationship that never started cannot have completed, and the two
commands between them cover every relationship exactly once — `accepted_at` is
what separates them. `expects_accepted` is the one argument the single ending
function takes to tell the two acts apart.

### Settled — a cancellation records `discontinued`

`ended_at` now requires an outcome, and a cancellation writes `ended_at`. It writes
`discontinued`: nothing was completed, because nobody had accepted it. The count of
relationships that *completed* is asked of relationships that ran, and `accepted_at`
is what separates those from the ones that were withdrawn before they started.

### Implemented

Domain in `src/domain/relationships.ts` (the outcome), `src/domain/commands.ts` and
`src/domain/boundary.ts` (both commands), `src/domain/effects.ts` and
`src/domain/errors.ts`; migration
`supabase/migrations/20260907000100_ending_and_participant_departure.sql`; the store
in `src/platform/supabase/effect-store.ts` and the port in `src/service/ports.ts`.
Tests: `tests/domain/ending-and-departure.test.ts`,
`tests/integration/ending-and-departure.test.ts`, and the matrix row in
`tests/domain/relationship-state.test.ts`.

**Four behaviours were decided while building, not before.** The notes above under
*what a departure is not*, *readmission has no command*, *ending refuses a
relationship nobody accepted* and *a cancellation records `discontinued`* were
written alongside the code they describe. They read as settled because the argument
in each holds, but none of them was in the ticket when the work began, and the body
of the ticket is silent on all four — it says only that *a relationship dropping from
three Participants to one changes nothing structurally*, which is silent on zero and
silent on Leaders. They are recorded here so the record does not claim they were
agreed in advance. Each now carries an acceptance criterion of its own.

The one with reach beyond this ticket is the cancellation. `relationship.cancel`
shipped in ticket 05 writing its own columns; it now goes through
`app.end_relationship` and stamps `ended_outcome = 'discontinued'`, and the migration
backfills every row that had already ended. That is a change to shipped behaviour and
a retrospective classification of history, made here because `ended_at` cannot be
required to carry an outcome while one writer of it does not.

**`Ended` was already terminal.** The criterion is ticked against ticket 10's
derivation in `src/domain/relationship-state.ts`, which this ticket did not change.
What was added is the matrix row that proves it.

**A departure now names its actor.** The first implementation wrote `departedBy` to
the history event and nowhere else, so nothing checked it: an identifier belonging to
no member of the Ministry was accepted and kept, while the same identifier was
refused on an ending. `relationship_member.departed_by` carries the same composite key
onto `ministry_member` that `relationship.ended_by`, `follow_up_item.resolved_by` and
`concern.resolved_by` carry, and `departure.departer_is_not_in_this_ministry` is the
refusal. It earns a second keep: null on a membership closed by the relationship
ending, set on one closed by a departure, which is what tells the two apart in a row
that otherwise records only a date.

**A departure that loses a race said the wrong thing.** The store read every cause of
*no membership closed* as `departure.person_is_not_in_this_relationship`. An ending
landing between the boundary's snapshot and this write closes every membership on the
relationship, so the update finds nothing and the Admin was told the Person was never
in a relationship they were in a second earlier. The store now takes the relationship
row `for update` first, exactly as `app.end_relationship` does, and refuses
`departure.relationship_ended` or `departure.relationship_not_found` on their own
facts — leaving `person_is_not_in_this_relationship` reachable only for its real
cause.

**`isRelationshipOutcome` stays.** It looked like a guard for an HTTP surface that
does not exist, but it is the established shape here: `isPausePeriod` is checked at
this same boundary in `src/domain/boundary.ts`, and `isParticipationStatus` in
`src/platform/supabase/roster-reader.ts`. A command is built from a request body, and
the alternative is a Postgres enum error where a surface needs a code.
