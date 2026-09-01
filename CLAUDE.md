# Discipler Project Instructions

This repository is the clean product-definition and rebuild workspace for Discipler.

## Product sources

Read these only for product-definition or design work:
README.md, CONTEXT.md, docs/vision.md, docs/product-flow.md,
docs/product-rules.md, docs/non-goals.md, docs/open-questions.md,
relevant files in docs/reference/.

For implementation work, read the approved spec only. If the spec is
ambiguous, stop and surface the gap instead of resolving it from the
source documents. Subagents: your task prompt is your scope, not this list.

## Working rules

- Do not assume behavior from a previous Discipler prototype unless it is explicitly adopted into this repository.
- Do not add features merely because they are common in SaaS products.
- Do not infer material product behavior when a requirement is ambiguous; surface the ambiguity.
- Prefer one shared workflow when one-to-one and group discipleship differ only in participants or wording.
- Keep pastoral judgment in the loop where the product rules require it.
- Preserve historical ministry events rather than overwriting past facts with current values.
- Treat stored ministry history as the source from which current relationship state, pastor care signals, and Ministry Intelligence are derived.
- Do not begin implementation during product-definition or grilling work unless explicitly asked.
- Treat `docs/reference/` as historical product evidence. If newer decisions conflict with reference material, surface the conflict explicitly.
- `CONTEXT.md` is a glossary only. Do not turn it into a specification, scratchpad, or implementation document.
- No `CONTEXT.md` entry states a duration or a cap that a doc or a constant already owns. Name the concept and point at where the number is enforced.
- ADRs are for consequential, hard-to-reverse, surprising decisions with a real trade-off. Do not use ADRs as a diary.

## Product guardrail

Discipler supports discipleship relationships and the ministry operating system around them. It should not become a generalized church-management platform, social network, gamification system, surveillance product, or speculative AI scoring system.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as status strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

