# The Availability Grid

## Status

superseded by 0018-the-hourly-grid.md

Superseded on 2026-09-01: the grid became seven days by twelve one-hour slots, 8am to 8pm, and the rest of this record stands as the history of why five blocks were chosen and what changing them was predicted to cost.

## Context

Intake collects when a person could meet, and `docs/adr/0001-pairing-suggestion-inputs.md`
makes the **count of shared availability slots** the dominant ranking input for
suggestion — "Four shared time slots" is the sentence a pastor reads off a suggestion
card.

Nothing decided what a slot was. The spec, `docs/product-rules.md`, and ADR-0001 all
name availability slots without saying how many there are or what one covers, and
ticket 03 could not build the grid without deciding.

The decision is hard to reverse. Availability is collected once per person, at
intake, and cannot be reconstructed afterwards — changing the granularity later
invalidates every answer already given and every overlap count derived from them.

## Decision

**Seven days by five named blocks: thirty-five slots.** The blocks are early morning,
morning, midday, afternoon, and evening.

Blocks are named rather than clock times. A person answering *when could you meet* is
describing the shape of their day, not committing to an hour, and a grid that asked
for hours would be asking for precision the answer does not have.

The grid is a shared unit rather than a per-person display choice. An overlap count
only means something when both sides answered on the same grid, so the grid is fixed
for the product and not configurable per ministry.

Availability is stored as one row per selected slot, keyed to the intake submission,
so that overlap is a join rather than an array intersection expressed in application
code.

## Considered options

**Seven days by three dayparts — morning, afternoon, evening.** Twenty-one slots, and
the fastest to complete. Rejected because it collapses a 6am coffee and a midday
lunch into one answer, and early morning is the slot that actually distinguishes
people with day jobs — the population this product mostly serves.

**Seven days by four blocks — early morning, midday, afternoon, evening.** Held
first, then amended. Rejected on the same argument that rejected three: mid-morning
is not midday. A person free at 10am and a person free at 1pm gave one answer under
four blocks, and the overlap count then read them as having found each other a time.

**Hourly, roughly 6am to 10pm.** About 112 slots. Rejected on two grounds: it is a
long grid to complete on a phone, which is where intake is filled in; and it makes
the count meaningless as a ranking signal, because two people who are both broadly
free on Saturday would register dozens of shared slots while two people with one real
window in common would register one.

**Free-text description of availability.** Rejected outright by the spec — the whole
point of the grid is that a person is not forced to describe their schedule in prose,
and prose cannot be counted.

**Per-ministry configurable granularity.** Rejected. Overlap counts would not be
comparable within a ministry that changed it, and the configuration would buy nothing
a fixed grid does not already give.

## Consequences

Availability cannot be backfilled or re-scaled. A change to the grid is a change to
every answer already collected, so it is a migration with no correct automatic
answer — a person who selected "midday Tuesday" cannot be asked retrospectively which
hour they meant.

The count of shared slots is bounded at thirty-five, which keeps the reason sentence
on a suggestion card honest: "Four shared time slots" is a meaningful fraction of a
week rather than a number nobody can scale. The suggestion tier cutoffs in
`docs/product-rules.md` are absolute counts against this grid, so the denominator is
load-bearing: 4 of 35 is a different claim from 4 of 28.

The Availability Overlay on the Leader Dashboard draws this same grid, so the two
surfaces cannot drift.

## Amended — a fifth block

Four blocks became five: **morning** sits between early morning and midday. The
argument is the one that rejected three dayparts in the first place, applied one step
further — a person free mid-morning and a person free at lunch were giving the same
answer and being counted as an overlap they did not have.

Amended before any pilot collected availability, which is the only window in which
this is cheap. The *Consequences* section above is unchanged and still binding: after
a pilot has answers on the grid, a change to it has no correct automatic answer.
