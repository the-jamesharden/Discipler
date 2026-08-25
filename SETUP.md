# First-Time Setup

This repository is prepared for Matt Pocock's current engineering-skill flow.

## 1. Initialize the repository

From this folder:

```bash
git init
```

A GitHub remote is optional at this stage. Matt's setup skill can also configure a local-file issue tracker.

## 2. Make sure the current skills are available

For Claude Code, Matt Pocock's current repository recommends the official marketplace plugin:

```text
claude plugins install mattpocock-skills
```

If you instead installed selected skills as ordinary files, make sure the current `grill-with-docs` dependencies are available too, especially `grilling` and `domain-modeling`.

## 3. Run the one-time repository setup

Inside Claude Code, run:

```text
/setup-matt-pocock-skills
```

Let the skill inspect the repository and ask its setup questions. It is expected to create repository-specific configuration under `docs/agents/` and add an `Agent skills` section to the root `CLAUDE.md` or `AGENTS.md`.

Do not pre-create `docs/agents/`; the setup skill is intentionally prompt-driven.

## 4. Run Grill With Docs

After setup is complete:

```text
/grill-with-docs
```

Then tell it:

```text
Use docs/grill-brief.md as the design to grill.

Read the product sources listed there before asking the first question.
Do not implement anything.
Grill me one question at a time.
Use CONTEXT.md only as the canonical domain glossary and update it inline as terminology becomes settled.
Create ADRs only when the domain-modeling skill's high bar is met.
Treat docs/open-questions.md as seed questions, not an exhaustive script.
Surface conflicts between historical reference docs and newer product rules rather than silently resolving them.
```

## 5. After alignment

The current main engineering flow is:

```text
grill-with-docs → to-spec → to-tickets → implement → code-review
```

Do not move to `to-spec` until the product language and major decisions are settled.
