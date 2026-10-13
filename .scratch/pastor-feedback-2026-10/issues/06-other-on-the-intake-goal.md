# 06 - Other on the Intake goal

**What to build:** The goal question on the Intake wizard gains *Other*, which opens a required short text box.
Two people who typed the same thing share a goal for Suggested Pairs, exactly as two people who picked the same preset goal do.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *"Other" on the Intake goal*.
Today: *What are you hoping for?* is one required radio choice from the Ministry's own goal list (`app/intake/fields.tsx`, `GoalField`), with no Other.
James asked for this ticket to go last.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [x] *Other* is the last option on the goal question, on every Ministry's form, and is not one of the Ministry's editable goals. (912b08a)
- [x] Choosing it reveals a required short text box; submitting Other with it empty is refused in the wizard's usual way. (912b08a)
- [x] The goal stays one choice. (1c29e70, 912b08a)
- [x] Reopening a person's Intake shows their Other text filled in. (912b08a)
- [x] Two people's Other texts match when they are the same once capitals, spaces and punctuation are ignored, and in no other case. (912b08a)
- [x] A match counts as a shared goal, the tiebreaker of *The Discipleship Goal Is a Tiebreaker, Not a Tier Gate*, with the same weight as a shared preset goal. (912b08a)
- [x] Suggested Pairs says it in the reason: *you both wrote "grief"*, with the text as the person typed it. (912b08a)
- [x] The text appears on the person page's intake answers and never on the Roster row. (1c29e70, 912b08a)
- [x] ADR 0001 is amended to record that a typed Other goal is now a suggestion input, why, and that matching is exact; `docs/product-rules.md` and `CONTEXT.md` follow. (397cd16)
- [x] `docs/open-questions.md`, *Open: one Discipleship Goal or several*, is marked resolved: one goal, plus Other. (397cd16)
- [x] Checked by eye in a real browser: the wizard step and its refusal, and a Suggested Pairs card with a shared Other, at desktop and phone width. (912b08a, checked in headless Chrome at 1440 wide and in a 390x844 frame)

## Not in this ticket

- Showing the text on the pair card. That is ticket 07, which shows it once this ticket has landed.

## Comments

Decisions made while building, each the conservative reading of a gap, with the alternative.

- **On the wire.** Other is one more radio in the goal's own field (`goalId=other`), so the goal is one choice by construction, and the box is a separate field, `goalOther`. Alternative: a separate Other checkbox, which would let a form carry two goals.
- **Required, without a script.** The box opens under the options by the stylesheet (`:has`), and a browser that cannot tell shows it always. It carries no `required` attribute, because a required box that is hidden would stop anyone who chose an option from submitting. Other with the box empty or only spaces is refused when it arrives, as `intake.goal_other_missing`, back on the wizard's last step with the usual *Please check the following* list. Like every refusal on that step today, it does not carry back what was typed on it. Alternative: a script that toggles `required`; the Intake forms have none and stay that way.
- **Words left in the box beside an option** are dropped, not refused: the box is on the page whichever option is ticked, so somebody who typed and then picked an option answered with the option.
- **Stored as typed less whitespace**: trimmed and inner runs collapsed, as the Ministry's own option wording is read (`readWording`). No length cap, as the name field has none. Alternative: a cap, which would add a refusal and a number nobody has decided.
- **What *the same* means.** Unicode NFC, then lowercase, then every punctuation character (`\p{P}`) and every space removed; the rest must be equal. Symbols such as `+` or an emoji still count, since the ticket names only capitals, spaces and punctuation. A text that is nothing but punctuation matches nobody. A typed goal never matches an option, however alike they read. Alternative: strip everything but letters and digits, which would also ignore symbols.
- **Whose words the reason quotes.** The Disciple's, as a shared option is already spoken from the Disciple's side: `Four shared time slots. You both wrote "grief".`, the full stop outside the quotes because the words are theirs.
- **Suggested Pairs card.** Beside each name, where an option's wording shows today, a typed goal shows as `Other: "grief"`, the spelling the pair card mock-up uses. One helper, `goalAsShown` in `src/domain/discipleship-goals.ts`, spells it for every surface, so ticket 07 can use it. Alternative: show just `Other` there and the words only in the reason.
- **Person page.** A new *Hoping for* row under *At Intake* shows the option's wording or `Other: "..."`, and is left out where there is none. It shows the option too, not only Other, because a row that appeared only for Other would read as if the others had no goal. Alternative: show the Other text alone.
- **Which submission.** The Roster carries the goal off the latest submission, exactly as Suggested Pairs ranks it, so the person page never shows a goal other than the one being used. A latest submission with no goal (the group path, a removed option) shows none rather than falling back to an older answer.
- **For ticket 07.** `RosterEntry` now carries `goal` (the option's current wording) and `goalOther` (the typed words), never both, read through `public.roster`; the person page reads them from there.
- **History.** `intake.submitted` records `goalOther` beside `goalId`, so a stated goal can be read back for any date as an option's can.
- **Intake forms.** The goals card adds one sentence, *After them comes Other, on every form, with a box for their own words.*, and no control: Other is not one of the Ministry's goals. `app/intake-forms/page.tsx` is untouched (ticket 04 is changing it).
