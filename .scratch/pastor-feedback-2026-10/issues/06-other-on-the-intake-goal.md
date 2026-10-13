# 06 - Other on the Intake goal

**What to build:** The goal question on the Intake wizard gains *Other*, which opens a required short text box.
Two people who typed the same thing share a goal for Suggested Pairs, exactly as two people who picked the same preset goal do.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *"Other" on the Intake goal*.
Today: *What are you hoping for?* is one required radio choice from the Ministry's own goal list (`app/intake/fields.tsx`, `GoalField`), with no Other.
James asked for this ticket to go last.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [ ] *Other* is the last option on the goal question, on every Ministry's form, and is not one of the Ministry's editable goals.
- [ ] Choosing it reveals a required short text box; submitting Other with it empty is refused in the wizard's usual way.
- [ ] The goal stays one choice.
- [ ] Reopening a person's Intake shows their Other text filled in.
- [ ] Two people's Other texts match when they are the same once capitals, spaces and punctuation are ignored, and in no other case.
- [ ] A match counts as a shared goal, the tiebreaker of *The Discipleship Goal Is a Tiebreaker, Not a Tier Gate*, with the same weight as a shared preset goal.
- [ ] Suggested Pairs says it in the reason: *you both wrote "grief"*, with the text as the person typed it.
- [ ] The text appears on the person page's intake answers and never on the Roster row.
- [ ] ADR 0001 is amended to record that a typed Other goal is now a suggestion input, why, and that matching is exact; `docs/product-rules.md` and `CONTEXT.md` follow.
- [ ] `docs/open-questions.md`, *Open: one Discipleship Goal or several*, is marked resolved: one goal, plus Other.
- [ ] Checked by eye in a real browser: the wizard step and its refusal, and a Suggested Pairs card with a shared Other, at desktop and phone width.

## Not in this ticket

- Showing the text on the pair card. That is ticket 07, which shows it once this ticket has landed.
