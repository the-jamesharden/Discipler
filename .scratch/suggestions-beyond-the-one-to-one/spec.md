# Suggestions beyond the one-to-one

**Status:** needs-triage

## What this is

Two changes that belong together.

1. Suggested Pairs learns to suggest more than one shape: a segmented toggle between **Group**, **1:2 pair** and **1:1** suggestions, the same three the manual pairing screen offers.
2. Intake learns to ask whether a person is open to a 1:2 relationship, on both sides: would you be discipled alongside one other person, and would you disciple two people together.

The answer is information for the Admin, not a gate.
It is shown beside the person's name on both pairing surfaces and keeps nobody off either of them.

## Read this first: the surface does not exist yet

`app/suggested-pairs/page.tsx` is a placeholder.
It renders the prototype's empty state and a line saying suggestions are not available yet.

`.scratch/core-operating-loop/issues/04-suggested-pairs.md` is still `ready-for-agent`, with none of its criteria met.
Its blocker is a decision rather than code: the tier cutoffs were counts out of thirty-five cells and the grid is now eighty-four (`docs/adr/0018-the-hourly-grid.md`, `docs/open-questions.md` under *Open: the suggestion tier cutoffs on an hourly grid*).

**So ticket 02 here cannot start until that ships.**
Ticket 01 is independent and can go at any time.

## Decided

**2026-09-18, James.**

- The toggle switches between Group, 1:2 and 1:1 suggestions.
- The 1:2 answer does not bind.
  People appear on Suggested Pairs and on manual pairing whatever they answered, and the answer is shown beside their name on both.

## What that means for ADR-0001

ADR-0001 says suggestions draw on exactly four inputs: gender and age as constraints, availability overlap and Discipleship Goal as ranking inputs.

An answer that filters nobody and orders nobody is not a suggestion input, so **ADR-0001 is not amended**.
The answer stands where `first_time` stands: shown beside a name, it "ranks nobody and refuses nobody, which is what keeps it outside ADR-0001."

If it is ever wanted as a filter or a ranking input, that is the point at which the ADR changes, and not before.

## Assumed, and worth a glance

Two readings made in the absence of an explicit answer.
Each is cheap to reverse before ticket 01 is built.

- **Non-binding applies to both sides.**
  The decision named the mentor; the tickets read it as covering the disciple too, because "they appear both on the suggested pairing and also the manual pairing" was said of everyone.
- **The two sides are worded differently.**
  The disciple is asked whether they would be discipled alongside one other person.
  The mentor is asked whether they would disciple two people together.
  One column, two wordings, following `firstTimeQuestion`.

## What is deliberately not specified

**A willingness question for groups.** Nobody has asked for it.

**Backfill.** ADR-0001 records that Intake "cannot be backfilled for anyone already enrolled."
Everyone on the Roster today answers null, and null means the form did not ask.

## The tickets

| # | Ticket | Blocked by | Status |
| --- | --- | --- | --- |
| 01 | Open to being one of two | nothing | ready-for-agent |
| 02 | Suggesting groups, 1:2 pairs and one-to-ones | 01, and `core-operating-loop/04` shipping | needs-info |
