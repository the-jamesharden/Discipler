# Pairing Suggestion Inputs

## Status

accepted

## Context

`docs/non-goals.md` states that Discipler "does not need a complex pairing algorithm," and forbids "personality matching, AI compatibility scores, demographic matching, inferred spiritual compatibility, or other weighting unless explicitly approved later." A separate non-goal states that demographics must not automatically drive individual decisions.

Availability overlap alone cannot separate two candidates with identical schedules, and ministries have real safeguarding policies that a purely schedule-based suggestion will violate. Extending the inputs was therefore necessary, and doing so required explicitly overriding a written non-goal rather than quietly drifting past it.

## Decision

Suggestions draw on exactly four inputs, in two categories that never mix.

**Constraints** filter the eligible pool before any ranking happens. They never rank, never score, and never appear as a reason for a suggestion.

- **Gender** — leader and participant must match. This is a safeguarding policy, so it is absolute: manual pairing cannot override it. A ministry that wants mixed-gender relationships disables the rule once, deliberately, in settings.
- **Age** — a leader is not suggested for a participant more than one age band above them. Intake collects a range (18–24, 25–34, 35–44, 45–54, 55–64, 65+), not an exact age, so the constraint is expressed in bands rather than years. Unlike gender, this governs suggestion only: an admin may pair across it manually.

**Ranking inputs** order whoever survives the constraints.

- **Availability overlap** — the count of shared availability slots. Always dominant.
- **Discipleship Goal** — the single option a person selects at intake. It separates candidates who already have comparable overlap, and it never outranks availability.

The output is three labels and no number. **Excellent fit** is meaningful overlap plus a matching goal; **Good fit** is meaningful overlap with differing goals; **Recommended** is everyone else who passes the constraints. A fourth section, **No Schedule Overlap**, lists people who share no availability with any eligible leader — for visibility only, never presented as a fit.

Candidates that tie on both overlap and goal are ordered by who has waited longest since completing intake — a stable ordering that favors the person who has been overlooked.

Every suggestion states its reason in plain language on its card: "Four shared time slots. You both selected Career and calling."

## Considered options

**A numeric compatibility score, surfaced as stars.** Rejected. A star rating implies a continuous, meaningful quality measure that four inputs cannot support, and it invites exactly the opaque scoring the non-goals reject. Three coarse labels are honest about how coarse the signal actually is.

**A ten-year age gap.** Superseded rather than rejected. It was the original formulation, and it became unimplementable once age was collected as a range: two adjacent bands may differ by one year or by nineteen. One band is coarser and honest about the precision the data actually supports.

**Age as a ranking input rather than a constraint.** Rejected. "Suggested because she is twelve years older" is a demographic justification for an individual pastoral decision, which a non-goal forbids outright. As a constraint it removes combinations without ever explaining a suggestion by someone's age.

**Free-text or multi-select personal information as a similarity score.** Rejected. It cannot be explained in one sentence on a card, which is the guardrail that keeps this from becoming a compatibility engine.

**Suggesting mutually hard-to-place people to each other.** Rejected. Two people who each overlap with nobody still have no shared time; pairing them produces a relationship that cannot meet and stalls by construction. Their visibility problem is solved by listing them, not by suggesting them.

## Consequences

Intake must collect gender, age, and Discipleship Goal, and cannot be backfilled for anyone already enrolled.

The reason card is a hard constraint on future changes: any new input must be expressible in one plain sentence a pastor can read aloud. An input that cannot be explained that way is out of scope by construction, regardless of how predictive it is.

Because gender is absolute and age is not, the two constraints need visibly different treatment in the admin UI. Presenting them as a uniform list of toggles would misrepresent one of them.
