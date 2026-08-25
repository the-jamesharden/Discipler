# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root. In this repo `CONTEXT.md` is a glossary only — it defines vocabulary, it is not a specification, scratchpad, or implementation document.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. ADRs here are reserved for consequential, hard-to-reverse, surprising decisions with a real trade-off; they are not a diary.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a single-context repo:

```
/
├── CONTEXT.md
└── docs/
    ├── adr/
    │   └── 0001-pairing-suggestion-inputs.md
    └── reference/
```

A multi-context layout (a root `CONTEXT-MAP.md` pointing at one `CONTEXT.md` per context, with context-scoped `docs/adr/` directories) is **not** in use here. If this repo ever grows into one, re-run `/setup-matt-pocock-skills` to switch.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

The same applies to `docs/reference/`: it is historical product evidence, so if a newer decision conflicts with reference material, surface the conflict rather than quietly picking a side.
