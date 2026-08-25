# Grill With Docs Brief

## Objective

Stress-test and normalize the Discipler product model before implementation.

The goal of the session is not to produce code. The goal is to reach shared understanding about the domain, settle vocabulary, expose contradictions, resolve material product decisions, and leave a durable paper trail in `CONTEXT.md` and any genuinely warranted ADRs.

## Read Before Grilling

Read in this order:

1. `README.md`
2. `CONTEXT.md`
3. `docs/vision.md`
4. `docs/product-flow.md`
5. `docs/product-rules.md`
6. `docs/non-goals.md`
7. `docs/open-questions.md`
8. `docs/reference/mentee-experience.md`
9. `docs/reference/mentor-experience.md`
10. `docs/reference/pastor-experience-planning-center.md`
11. `docs/reference/Discipler_Pitch.pdf`

## What to Protect

Do not drift away from these core principles while grilling:

- Discipler supports both one-to-one and group discipleship.
- Shared behavior should use shared workflows.
- The pastor controls actual pairing.
- Suggested pairing is intentionally simple and availability-based.
- Materials are assignable and historically traceable.
- Twilio messages and responses are a primary operational data source.
- Relationship state is derived from that history.
- Three unanswered response-required messages must surface a care need.
- The same history powers immediate care and Ministry Intelligence.
- Individual concerns flow to pastors; aggregate concern analysis is on demand.
- The product should stay focused and resist speculative feature expansion.

## How to Challenge the Design

Look for:

- terms that currently mean more than one thing
- state transitions that are implied but not defined
- places where one-to-one and group behavior might accidentally fork
- conflicts between older reference documents and newer decisions
- ambiguous ownership of data
- ambiguity between meeting satisfaction and material satisfaction
- pairing edge cases
- late Twilio reply edge cases
- care-flag clearing behavior
- privacy problems in demographic reporting
- features that sound useful but are not required
- decisions that are truly hard to reverse and may deserve an ADR

## Desired Output of the Grill

By the end of the session:

- `CONTEXT.md` should contain stable canonical vocabulary
- material product ambiguities should be resolved
- the remaining open questions should be few and explicit
- ADRs should exist only for truly consequential hard-to-reverse decisions
- the product should be ready for `/to-spec`
- no implementation should have begun
