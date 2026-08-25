# Discipler — Open Questions

The original seed list of 78 questions was worked through in the grilling session. Most are now settled and recorded in `docs/product-rules.md`, `CONTEXT.md`, `docs/adr/`, and the surface documents. This file now holds only what genuinely remains.

## The core loop is settled apart from inbound keyword routing

Every question about intake, suggestion, acceptance, the check-in rhythm, relationship state, care surfacing, and the two dashboards has been resolved and recorded. Two questions about inbound SMS keywords remain, and they are genuine gaps rather than deferred capability.

## Open: inbound keyword routing

- **Which relationship an inbound keyword applies to.** A leader may lead several relationships, and `PAUSE`, `START`, and `SWAP` are each scoped to exactly one of them. An inbound message carrying only a keyword does not identify which, and the sequence position that disambiguates a check-in reply is unavailable — `START` and `SWAP` normally arrive with no open sequence at all. No selection or routing mechanism is defined, and none may be inferred.
- **How a leader chooses a pause duration over SMS.** A pause is 1, 2, 4, 8, or 12 weeks, defaulting to 2. There is no defined mechanism for expressing that choice in an inbound message, and whether an SMS confirmation step exists is also undefined.
- **`START` carries two meanings.** `docs/reference/` defines `START` as the carrier-level re-opt-in that reverses `STOP` for a person; it is also the keyword that resumes one paused relationship. For a person who has opted out and also holds a paused relationship, the two readings collide. The carrier behavior is preserved as documented. Note that `docs/consent-language.md` advertises only `STOP` and `HELP`, so the carrier `START` behavior has never been adopted into a canonical document.

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
