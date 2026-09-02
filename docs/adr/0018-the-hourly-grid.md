# The Hourly Grid

## Status

accepted

Supersedes `docs/adr/0006-the-availability-grid.md`.

## Decision

**Seven days by twelve one-hour slots, 8am to 8pm: eighty-four slots.**
One slot per hour, named by the hour it starts, 24-hour and zero-padded: `08` through `19`.
A slot key is `monday:08` through `sunday:19`, and it is spelled the same on the form, in the URL the wizard carries answers in, and in the database.

Availability is stored as one row per selected slot, keyed to the Intake submission, with the hour as an enum, so that overlap stays a join rather than an array intersection in application code.

Time of day runs across the horizontal axis and days run down the vertical axis, everywhere the grid is drawn: the Intake form, the wizard's availability screen, and the Availability Overlay on the Leader Dashboard.

The grid is still a shared unit, fixed for the product and not configurable per Ministry, for the reason ADR-0006 gave and which still holds: a count of shared slots only means something when both sides answered on the same grid.

## Context

ADR-0006 chose five named blocks and rejected an hourly grid.
The design is hourly.
The prototype and the Figma Make wizard both draw hours across the top and days down the side, and on 2026-09-01 the product owner decided, as an overriding design decision, that the backend matches the design rather than the design bending to the backend.
That decision is recorded in ticket 31 of the core operating loop under *The grid*.

ADR-0006 rejected hourly on two grounds.
Each is answered here or accepted as a cost, and the ADR says which.

**A long grid on a phone.**
Twelve columns by seven rows of small tappable cells fits a phone in landscape, and in portrait it scrolls horizontally inside its own container.
The grid is bounded to 8am to 8pm rather than the roughly 6am to 10pm ADR-0006 costed, which is what keeps it at eighty-four cells rather than one hundred and twelve.
A person who could only meet before 8am or after 8pm has no cell to say so.
That is accepted as a cost, and the bound is the design's.

**A shared-cell count that stops ranking well when two people are both broadly free.**
Two people who are both free all Saturday now share twelve cells, and two people with one real window in common share one.
This is accepted as a cost.
It reopens the suggestion tier cutoffs, which were absolute counts against thirty-five cells: ticket 04 is blocked on new cutoffs, and the question is open in `docs/open-questions.md` under *Open: the suggestion tier cutoffs on an hourly grid*.

## Considered options

**Keep five named blocks and have the design render them with clock ranges.**
Rejected by the product owner.
The design is hourly, and that is the overriding decision.

**Translate the five blocks into hours at migration time.**
Rejected.
There is no correct automatic answer: a Person who ticked *midday Tuesday* cannot be asked retrospectively which hour they meant, and a row that guessed for them would be counted as an overlap they never claimed.
ADR-0006 predicted exactly this migration and said it would have no correct automatic answer, and it was right.

**Hourly from 6am to 10pm.**
The option ADR-0006 costed at one hundred and twelve cells.
Rejected because the design bounds the day at 8am to 8pm, and because that many cells on a phone is the cost ADR-0006 was right about.

**Half-hour slots.**
Rejected.
Twice the cells for a precision nobody's answer has, and the design does not draw them.

## Consequences

- Every availability collected on the five-block grid is discarded rather than translated.
  A Person whose availability predates the change reads as having none, sits in No Schedule Overlap, and is asked again through the Roster's existing *send the Intake link again*, which reopens their form.
- The `day_block` enum is gone and `slot_hour` replaces it; `intake_availability.block` becomes `intake_availability.hour`, and `relationship_availability` returns the hour.
- The overlay draws twelve columns.
  The recommended-slot rule and the shading rules are unchanged.
- The count of shared slots is now bounded at eighty-four rather than thirty-five, so the tier cutoffs recorded in `docs/product-rules.md` under *Settled: Suggestion Tiers Are Counts of Shared Cells* are reopened rather than carried over.
  No new cutoffs are decided here.
- ADR-0006 is superseded.
  Its argument that the grid is a shared unit, and that changing its granularity invalidates every answer already collected, stands; this is the first time that consequence has been paid.
