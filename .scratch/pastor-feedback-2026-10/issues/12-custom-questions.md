# 12 - Custom questions

**What to build:** A Ministry adds questions of its own to either form: short text, long text, one choice, several choices or yes/no.
Their answers show to an Admin on the person page and the pair card, and are never used for matching.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The Intake form editor*.
Design: `.lavish/pastor-feedback/mock-forms-editor.html` (the *Add a question* row and *Your question* chip), settled in James's Lavish review of 2026-10-12.

**Blocked by:** 07, 11

**Status:** ready-for-agent

## Acceptance

- [x] Each page box ends in *Add a question* with the five kinds; the new question opens in place to be worded, and its choices are edited in place for the two choice kinds. (ee7b85e, d2530bb; the two text kinds only on the last page, see Comments)
- [x] A custom question is marked *Your question*, and edits, reorders and saves live like any other (ticket 11). (08bcdcb, ee7b85e)
- [x] The wizard asks it, with the right control for its kind, and a required one is refused empty in the wizard's usual way. (ee7b85e, d2530bb)
- [x] Answers appear on the person page's intake answers and on the pair card and group card, under the person they belong to, and never on the Roster row. (b21df38, ee7b85e)
- [x] Answers are never read by Suggested Pairs or any pairing rule. (08bcdcb, 364cd3c)
- [x] Reopening a person's Intake shows their answers filled in. (ee7b85e, 364cd3c)
- [x] `docs/product-rules.md` records that custom answers are shown and never matched on. (9ef7c34)
- [x] Checked by eye in a real browser: adding one of each kind, answering it in the wizard at phone width, and reading it on the person page and the card. (d2530bb; headless Chrome at 1440 wide and a 390-wide frame, and Chrome for the group card's opened rows)

## Not in this ticket

- Removing a custom question. That follows the one removal rule in ticket 13.

## Comments

Decisions made while building, each the conservative reading of a gap, with the alternative.

### Where a question may be asked, and how its answers travel

- **Short and long text are asked on the last page only.**
  Every page but the last moves on by a GET that carries the answers in the address, and what somebody types does not go into an address, which is why name, phone, email and the goal already stay there.
  So `rulesOf` gives a text question `staysOnTheLastPage`, a drag or a move off the last page is refused with the existing sentence (now naming text questions too), and on every other page *Add a question* offers One choice, Several choices and Yes / no, with the line *Short and long text are asked on the last page.*
  Alternative: change how text travels (a POST per step, a stored draft or a cookie), which ticket 11 turned down for the wizard because it writes something before the last step; or offer all five kinds on every page and refuse the text ones, which offers a button that cannot work.
- **The three choice kinds may be asked on any page, and their answers travel between screens as the built-in answers do**: a choice by its id, several choices as several values, yes/no as `yes` or `no`, each checked against what that question offers (`OwnField` in `app/intake/wizard-machine.ts`).
  After a refusal on the last step, the choice answers on it come back in the address too; what was typed does not, as the name does not.
- **A required several-choices question is refused when it arrives**, because ticks cannot say *at least one of these*.
  On an earlier page the wizard holds the screen and says *Please answer every question that is not marked optional.*, as it does for the grid; on the last page the submission is refused with the same sentence.
  Every other kind is held by the browser with `required`, as the built-in questions are.
  The sentence names no question: what reaches it is the set of ticks on the screen being looked at.
- Several choices says *Choose as many as apply.* under its wording and ticks each option picked, because otherwise it looks exactly like one choice.
  Neither is in the mock-up, which shows no several-choices question in the wizard.
- A short text takes 200 characters and a long text 4000; the boxes stop there, and more is refused as `intake.answer_too_long`.

### Choices

- A choice is an id with its wording, and an answer points at the id, so rewording a choice keeps every answer that picked it (ADR-0014).
- **A choice is not taken off.**
  Emptying one is refused (*Reword it instead.*), because its answers would go with it, and that is the removal rule ticket 13 builds for questions.
  New choices are added in a box one to a line and go last; choices are not reordered.
  Alternative: let a choice nobody has picked be taken off, which needs a count per choice at save time and a second removal rule beside ticket 13's.
- A choice question needs at least two choices, and two choices worded alike (ignoring case) are refused.
- **A new question starts optional**: *Required* is unticked in the row that opens.
  Alternative: required, as the built-in questions are; a question a Ministry adds is extra to what Discipler needs, and a newcomer held on it is a newcomer who may not finish.

### What is stored

- **The form**: a question the Ministry added is keyed `custom:<id>`, the id minted by the boundary, and its entry in the version's document carries `kind` and `choices` (`[{ id, wording }]`, empty on the three kinds without choices).
- **The answers**: `intake_answer`, one row per question answered on one submission, `(ministry_id, intake_submission_id, question_key, answer jsonb)`, unique on the submission and key, appended with the submission and never updated (a trigger refuses it).
  `answer` is the words typed, the id of the one choice, the ids of the several in the form's order, or true and false for yes and no.
  Admin-only under row-level security; `discipler_command` may select and insert, and ticket 13 adds the delete its removal needs.
  Indexed on `(ministry_id, question_key)`, so the count ticket 13 warns with is one query.
- **History**: `intake_form.question_added` (key, page, wording, hint, required, kind, choices) and `intake_form.question_edited`, which now records kind and choices for the Ministry's own questions.
  `intake.submitted` records `ownQuestionsAnswered`, the keys answered, and not what was said: what somebody types to their church can be anything, and history is read by every Admin surface.
  Alternative: the answers themselves in the event, as the goal's id is; left out because ticket 13 can write what a removal deletes into its own event, as `discipleship_goal.removed` does.

### Where they show

- **Off the Person's latest submission**, as their age band and goal are, each under the question as the Ministry's form words it now (the latest version of each form), in the form's order.
  An answer whose question no form asks, or whose value its question cannot hold, is left out.
- On the person page in the list of what they said at Intake, and on the pair card and the group card under each person; Check-Ins and Follow-Up compose the same card, so they show there too, and so does Follow-Up's card about a Person on no pair, which draws a person the same way.
  The question goes across the list and the answer under it, because a Ministry's question is a sentence and the list's own terms are a word or two.
- The person page reads a new page function, `person_intake_page(intake_person_id)`, which is `person_page()`'s document with the one Person's answers and the forms beside it; the Roster's own document does not carry them, since the Roster row never shows them.
  `person_page()` stays until this has shipped (ADR-0023).
- **Never matched on**: `tests/integration/custom-questions.test.ts` (*is never read by Suggested Pairs, the Roster or any pairing rule*) asserts that `suggestion_inputs`, `roster` and the Roster, Pair and Suggested Pairs page functions never read `intake_answer` and hand back none of what was said.
  A source-grep test in `tests/domain` that allowed only a listed set of files to name the answers was removed in the no-mistakes review (James, 2026-10-13), because the repository's test rules forbid tests that read source; the integration test proves it by running them.

### The reopened Intake

- **It asks the Ministry's own questions too, with the answers filled in**, after Discipler's questions and before the agreements: those of the latest version of the form the Person last answered (by their latest consent record's path), or the mentor and mentee form where none says.
  The version it drew them from travels as a hidden `v` and the submission is read against it (`ownQuestionsFrom` on `intake.submit`), while Discipler's own questions keep today's words and rules and the submission still records no form version, as ticket 11 decided.
  Alternative: leave the reopened page as it was, which would let a correction of somebody's number write a new latest submission with none of their answers on it, and the answers would disappear from the card.

### Faults and gaps

- The brief asks for `npm run lint`; this repository has no lint script and no linter configured, so there was nothing to run.

