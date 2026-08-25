# Discipler — Open Questions

The original seed list of 78 questions was worked through in the grilling session. Most are now settled and recorded in `docs/product-rules.md`, `CONTEXT.md`, `docs/adr/`, and the surface documents. This file now holds only what genuinely remains.

## Nothing is open in the core loop

Every question about intake, suggestion, acceptance, the check-in rhythm, relationship state, care surfacing, and the two dashboards has been resolved and recorded. What remains below is deferred capability, not unresolved design.

## Deferred with the quarterly report

These are not unresolved so much as not yet needed. They must be answered before the reporting interface is built, and the underlying history must be complete enough to answer them later.

- Which metrics define quarterly ministry health
- Minimum cell size before an age or gender breakdown is shown, so a statistic cannot identify an individual
- How missing demographic information is represented
- Whether reporting compares one-to-one relationships against groups

## Deferred with Planning Center

V1 ships CSV upload; the Planning Center API is post-V1. When it returns, these need answering:

- Which system owns contact information when Planning Center is connected
- What data, if any, flows back to Planning Center
- What happens when Planning Center is unavailable
