# Discipler — Open Questions

The original seed list of 78 questions was worked through in the grilling session. Most are now settled and recorded in `docs/product-rules.md`, `CONTEXT.md`, `docs/adr/`, and the surface documents. This file now holds only what genuinely remains.

## The core loop is settled

Every question about intake, suggestion, acceptance, the check-in rhythm, relationship state, care surfacing, and the two dashboards has been resolved and recorded.

## Resolved: inbound keyword routing

The three inbound-keyword gaps are closed and recorded in `docs/product-rules.md` and `docs/check-in-rhythm.md`:

- **Which relationship a keyword applies to** — resolved by eligibility for the requested action. One eligible relationship applies directly, several draw a numbered menu, none draws a plain reply. The target is never inferred from Check-In Sequence position.
- **How a leader chooses a pause duration** — a single confirmation exchange carrying the default and the alternatives.
- **`START` carrying two meanings** — resolved by renaming rather than arbitrating. `START` is carrier-level re-opt-in only; `RESUME` resumes a paused relationship.

## Open: pending review before the first pilot

- **A2P compliance requirements have not been checked against a live campaign registration.** The `Discipler:` identification prefix and its trigger points are a product decision made on an understanding of carrier requirements, not a verified one. Review alongside the consent wording.
- **`docs/consent-language.md` has not had legal review**, including the `HELP` response content.

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
