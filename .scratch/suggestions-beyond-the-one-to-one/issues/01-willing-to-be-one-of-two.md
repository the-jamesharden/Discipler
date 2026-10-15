# 01 - Open to being one of two

**What to build:** One more question on Intake, asked of both sides: would you be discipled alongside one other person, and would you disciple two people together. Shown beside the person's name on both pairing surfaces, keeping nobody off either.

**Status:** ready-for-human

## Why

The manual pairing screen can already form a 1:2, and ticket 02 teaches Suggested Pairs to propose one.
Nothing on Intake has ever asked anybody how they feel about it.

The answer is for the Admin making the pairing, not for the product.
It does not bind: an Admin sees it and decides (decided 2026-09-18, see the spec).

## The precedent to follow

`first_time` is this question's twin and the pattern is proven end to end:

- `intake_submission.first_time boolean`, nullable, where **null is *the form did not ask*** and never a quiet no (`src/service/ports.ts:844`).
- Answers carried as **words, not yes/no**. `EXPERIENCE_ANSWERS` is `['first_time', 'done_before']`, and `src/domain/intake.ts:120` explains why: a field spelled yes/no "would invert under exactly that wording, and a first-timer recorded as experienced is a mistake nothing downstream could notice."
- The question is **worded from the side** through a `Record<DeclaredSide, string>` (`app/intake/copy.ts:185`).
- `public.roster()` reads the latest submission **where the answer is not null**, so a later correction that does not ask cannot erase an answer already given.
- On the pairing surface it "ranks nobody and refuses nobody, which is what keeps it outside ADR-0001."

Follow all five.

## Acceptance

- [x] Migration: `intake_submission.one_to_two <answer type>`, nullable, commented as null meaning the form did not ask and never a refusal.
- [x] Answers carried as words rather than a boolean, following `EXPERIENCE_ANSWERS`, worded so the answer is legible without the question above it.
- [x] The question is a `Record<DeclaredSide, string>` beside `firstTimeQuestion`:
  - **mentee** - would you be discipled alongside one other person?
  - **mentor** - would you disciple two people together?
- [x] A step in the discipleship wizard beside the first-time step, carrying its answer forward as a hidden input like every other, per `app/intake/wizard-machine.ts`.
- [x] **Not** added to `app/intake/form.tsx`, the correction form. That form does not ask the first-time question either, and the not-null read is what makes leaving it out safe.
- [x] The boundary refuses an unanswered question on the path that asks it, with a refusal code and wording beside `intake.first_time_unanswered`.
- [x] `public.roster()` widens by the answer, read as the latest not-null submission, and `RosterEntry` gains it, documented as shown by the pairing surfaces and read by nothing else.
- [x] Shown on the manual pairing screen beside the name, exactly as the first-time note is.
  Both answers said outright, so a blank reads as *the form did not ask* rather than a quiet no.
- [x] **Filters nobody and ranks nobody**, on either surface, for either side.
  A test proves a person who answered no is still listed on manual pairing.
- [x] ADR-0001 is **not** amended. An answer that neither filters nor orders is not a suggestion input.
- [x] `CONTEXT.md` names the answer and points at the boundary, stating no duration and no cap.
- [x] Intake tests cover: each side's wording; an unanswered form refused on the path that asks; a correction submission leaving an earlier answer standing; a submission predating the question reading null everywhere.

## Sequencing

If `manual-pairing/04` is built first, it ships without this note and picks it up here: one line on the row, beside the first-time note.
If this is built first, `manual-pairing/04` carries it from the start.
Either order works.

## Comments

**2026-09-18, D2 decided.**
James: the 1:2 answer does not bind, and people appear on suggested and manual pairing whatever they answered.
This ticket was previously written as a filter on the 1:2 suggestion pool with an ADR-0001 amendment; both are removed.
The two open items it carried are closed: it binds nothing, so it binds manual pairing not at all; and the two sides keep their different wordings in one column.
Read as covering both sides, since the decision was said of everyone; the spec records that as an assumption.
Status moves to `ready-for-agent`.

**2026-09-22, James, the mentee side's wording.**
The question on the mentee side reads, in his words: *Open to being mentored alongside another mentee if needed*.
Use it as written, over the paraphrase in Acceptance.
It reads as a statement to agree with rather than a question, so the answer words should be legible beside a name on their own, as the ticket already asks.
The mentor side is not yet worded by him; the twin in the same shape would be *Open to mentoring two mentees together if needed*, and is a proposal until he says.

**2026-09-22, built on `wave3/one-of-two`, head `ff45bba`, cut from `origin/main` at `6636466`.**
Every criterion above is ticked.
Not merged, not pushed; the migration is written and tested locally and not pushed to production.

Where things are:

- Migration `supabase/migrations/20261010000100_open_to_being_one_of_two.sql`: enum `one_to_two_answer` (`open_to_one_to_two`, `one_to_one_only`), nullable `intake_submission.one_to_two`, `public.roster()` dropped and recreated one column wider, read as the latest submission where the answer is not null.
- Domain: `ONE_TO_TWO_ANSWERS` beside `EXPERIENCE_ANSWERS`, `oneToTwo` on the form fields, the draft and the intake record, refusal `intake.one_to_two_unanswered`.
- Wizard: step 4 of 6 between the first-time step and the grid; `oneToTwoQuestion`, `oneToTwoAnswerLabel` and `oneToTwoDescription` in `app/intake/copy.ts`; the side screen rewords it as it rewords the first-time answer; the done page says it in the side's words.
- Pairing surfaces: `oneToTwoLabel` in `app/roster/copy.ts`; the note beside the name on the Pair popup from either side, and on the Suggested Pairs card and the No Schedule Overlap row.
- `CONTEXT.md` gains *One-to-Two Answer*, pointing at `readIntakeForm`.

What was checked:

- `npm run typecheck`: clean.
- `npx vitest run tests/domain tests/app`: 80 files, 1648 passed, 0 skipped, 0 failed.
- `LOCKED_TESTS_PORT=3124 scripts/locked-tests.sh -- <the five touched integration files>`: 5 files, 71 passed, 0 skipped, 0 failed.
- `LOCKED_TESTS_PORT=3124 scripts/locked-tests.sh` (whole suite, with server): 188 files, 2793 passed, 1 skipped (a pre-existing skip inside `invitation-over-http`), 0 failed.
- In Chrome on port 3104: step 4 for both sides at phone width, the Pair popup from a Discipler and from a Disciple, the Suggested Pairs card and the No Schedule Overlap row, and the popup at phone width.

Decisions made, each with its alternative:

- **The mentor side's wording** is *Open to mentoring two mentees together if needed*, the twin proposed in the previous comment, used as sent.
  Alternative: wait for James's own words; put first under For James instead.
- **The two answers read as sentences per side**: mentee *Yes, I'm open to being one of two* / *No, I'd rather meet one-to-one*; mentor *Yes, I'm open to mentoring two together* / *No, one mentee at a time*.
  Under them: *If it helps the pairing work out.* and *That is perfectly fine too.*
  Help line: *Sometimes one mentor walks with two people at once. Either answer is fine.*
  Alternative: a bare Yes/No under the statement, which the first-time precedent argues against.
- **The wire and column words are the same for both sides**, `open_to_one_to_two` and `one_to_one_only`, so one column holds one vocabulary.
  Alternative: side-specific words, which would let the Roster row word the note per side at the cost of four enum members for one fact.
- **The note beside the name is side-neutral**: *Open to one-to-two* and *Prefers one-to-one*.
  A Roster row's latest side and latest answer can come from different submissions, so wording the note from the side would sometimes be wrong.
  First written as *Open to a 1:2 pair* and *One-to-one only*; both changed because a Suggested Pairs card carries no figure but the age band (a number on it reads as a score, and the test guards it), and *One-to-one only* already heads that page meaning something else.
  Alternative: word it from the declared side.
- **The note is shown on both popups**, on Disciple rows from a Discipler beside the first-time note, and on Discipler rows from a Disciple beside *leads N*.
  The ticket says *exactly as the first-time note is*, which today is Disciple rows only, but the mentor's answer would then be shown nowhere on manual pairing.
  Alternative: Disciple rows only.
- **The person page does not show it.**
  Its *At Intake* line shows the first-time answer, but the ticket documents the new answer as shown by the pairing surfaces and read by nothing else.
  Alternative: add it to that line as well.
- **The suggestion candidate carries it to the card** and the ranking never reads it; a test proves identical pairs, tiers and reasons whatever anybody answered.
  Alternative: decorate the card in the reader after ranking, keeping the domain type untouched.
- **The side screen rewords it**, so re-answering the side drops it and asks again, as with the first-time answer.
  Alternative: carry it across a side change under different words.
- **The refusal wording** is *Please tell us whether you're open to a mentor working with two mentees together.*, one sentence for both sides, since refusals are not worded per side.
- **The done page** adds a *Pairing* row with the answer in the side's words, only when the side is also known.
- **Every form fixture** across the test suites gained `oneToTwo: null` (a form that did not ask) and the discipleship-path fixtures gained a real answer, since the boundary now refuses that path unanswered.

Nothing broken that was not mine was found.

**2026-09-22, later: the migration is on production.**
James pushed `20261010000100_open_to_being_one_of_two` from this worktree, after linking it, and production's history records it.
Checked on production afterwards: the enum holds the two words, `intake_submission.one_to_two` is typed by it, `public.roster()` returns `one_to_two`, and the grants are as before.
The deployed app on `main` is unaffected until this branch ships: its Roster reader ignores the extra key and its Intake insert leaves the column null.
A first push from the main checkout failed, because `ship/waves-2026-09-22` carries `20261007000300_what_suggested_pairs_reads.sql` from the unmerged `wave1/suggested-pairs` where production holds `20261007000100_suggested_pairs`; that divergence predates this ticket and is the integrator's.

**2026-10-15, James approved the wording and where it shows.**
The three items this comment listed for him are settled, in his words: the mentor-side wording is fine, and ship it.
Approved as built:

- mentee *Open to being mentored alongside another mentee if needed*;
- mentor *Open to mentoring two mentees together if needed*;
- the four answer sentences, *Yes, I'm open to being one of two* / *No, I'd rather meet one-to-one* and *Yes, I'm open to mentoring two together* / *No, one mentee at a time*, and the two lines under them;
- the help line *Sometimes one mentor walks with two people at once. Either answer is fine.*;
- the side-neutral note *Open to one-to-two* / *Prefers one-to-one*, shown on both Pair popups' rows and on Suggested Pairs, and not on the person page.

**2026-10-15, ported onto `main` on `feat/one-of-two`, cut from `origin/main` at `948adf2`.**
`wave3/one-of-two` was never merged.
Since it was cut, the Intake form became the Ministry's own (Pastor feedback 2026-10, tickets 11 to 13), and Roles per pairing and Pastor feedback rewrote the Roster, both Pair popups and Suggested Pairs.
So this is the branch rebuilt on the form editor, reusing its code, tests and copy wherever they still fit.
The migration `20261010000100_open_to_being_one_of_two.sql` was already on `main` and production and is unchanged.
Every criterion above is ticked.
The third is now met by the form's two wordings of the question (`wording` for a mentor, `menteeWording` for somebody to be mentored) rather than a `Record<DeclaredSide, string>` in `app/intake/copy.ts`, because the form editor owns every question's words.

Decisions made in the port, each the conservative reading, with the alternative (the first four set by the orchestrator, 2026-10-15):

- **A built-in question, `oneToTwo`, the first-time question's twin in every rule** (`BUILT_IN` in `src/domain/intake-form.ts`).
  It is worded from the side (`after: 'side'`, `needs: 'side'`), so the side cannot be removed while it is asked, and it is not added back to a form without the side.
  It has `usedBy: null`, so its row carries no use chip and its removal says only how many answers it deletes.
  It is not required by Discipler, so an Admin may make it optional, and it is removable and offered back from *Add a question* like any built-in.
  Alternative: a fixed part of the wizard outside the form, which an Admin could neither reword nor remove.
- **In the preset (version 0), on a page of its own beside the first-time page**, named *One more about how you'd be paired.* as the branch's step 4 was.
  So every Ministry that has never edited asks it.
  A Ministry that has saved an edited form does not get it automatically; *Add a question* offers it on the *Add back:* line, which reads slightly oddly for a question that form never had.
  Checked on production 2026-10-15: no Ministry has saved an edited form.
  Alternative: inserting it into stored versions, which would rewrite versions that are never changed.
- **The mentor and mentee form only**, never the groups form and not the correction form `app/intake/form.tsx`.
- **Refused only where the form served asks it.**
  An answer to it on a form that does not ask it is refused as an answer with no question (`intake.path_unknown`).
  An answer to it dropped by a removal after the version opened is not stored (`withoutWhatIsNoLongerAsked`).
- **A submission to the preset (version 0) with no one-to-two field at all is kept, with the answer null; on any other version, and on the preset with the field sent empty or in other words, it is refused** (`notAskedOf`; from the review, 2026-10-15).
  The question joined version 0, so somebody who opened the wizard before the deploy carries the same `v=0` as somebody after it, and the version cannot tell their forms apart.
  What can is the field: the wizard carries an answer between screens as a hidden input and posts the radios of the last page, and a browser cannot send the question's own screen unanswered because its radios are required.
  So a last page that never showed the question arrives with no `oneToTwo` field, and is stored as *the form did not ask*, which is what it was.
  An edited version is always saved after the question existed, so nobody opened one that was missing it.
  A submission to an edited version that asks the question as required is refused with `intake.one_to_two_unanswered` whether the field arrived empty or not at all (James, 2026-10-15).
  The cost is that a body crafted to skip the preset's screen is stored as null too, which records nothing untrue.
  For somebody who opened the wizard before the deploy and moves between screens after it, the step numbers shift: the next screen is drawn from the preset as it now stands, so they meet the new question at step 4 before the grid, and a later step in their address is brought back to it.
  That is unavoidable while both forms are version 0.
  Alternative: a marker field naming the screens served, which would need the wizard machine to carry something that is not an answer.
- **The question's words and hint live in the preset, the answers in `app/intake/copy.ts`.**
  The two wordings and the help line (now the question's hint) are editable like any question's.
  The four answer sentences and the two lines under them stay fixed, as every built-in question's answers are.
- **The refusal is one sentence for both sides**: *Please tell us whether you're open to one mentor meeting with two mentees together.*
  A refusal is looked up by its code and the page does not word it from the side; this reads true for a mentor and for a mentee, where the branch's sentence (*a mentor working with two mentees*) read oddly to a mentor.
  For James to confirm; it costs one line in `app/intake/copy.ts`.
  Alternative: a refusal per side, which would make the refusals the one copy that branches on the side.
- **The side's second press names whichever questions hold it.**
  With both asked it says *The first-time question and the one-to-two question are worded from this answer, so neither can be asked without it. Remove them first.*; with one, the first sentence's single form for that one (`neededFirst` in `app/intake-forms/form/copy.ts`).
  Which questions hold the side comes from `BUILT_IN` through `neededBy`, which now returns all of them; the copy only names each built-in question.
  The refusals for a move or an add-back that breaks the rule, and the side's open-row note, now name both questions.
  The one-to-two row's own note says it is worded twice, comes after *I'm joining as…*, and is shown beside each name when pairing and filters and ranks nobody.
  Alternative: keep naming only the first-time question, which would be wrong once that one is gone.
- **A second migration counts its answers.**
  `app.intake_answer_counts` reads the column, so the removal warning says how many people answered it.
  It is `20261015000200_the_one_to_two_answers_are_counted.sql`, restated whole with one row added.
- **The branch's second migration is kept, as `20261015000100_the_roster_is_revoked_from_service_role.sql`.**
  No migration has ever revoked `public.roster(uuid)` from `service_role`: every one back to `20260910000100` says `from public, anon`.
  This closes a gap that was always there, under the repository's rule that every function is revoked from `service_role` too.
  The branch's `20261011000100` timestamp was never used, and a test asserts who may execute the function.
- **The done page** keeps the branch's *Pairing* row in the side's words, only where the answer was kept and a side is known.

What was checked:

- `npm run typecheck`: clean.
  The repository has no lint script or linter configured.
- `npx vitest run tests/domain tests/app`: 105 files, 2213 passed, 0 skipped, 0 failed.
- `LOCKED_TESTS_PORT=3173 scripts/locked-tests.sh -- <the touched integration files>`: green after two test expectations were corrected (the removal's saved marker names the page, `one-to-two`, and the editor now has six page boxes), and after the review's fixes `tests/integration/the-discipleship-wizard-over-http.test.ts` passed 18 of 18.
- `LOCKED_TESTS_PORT=3173 scripts/locked-tests.sh --times 3`, after the review's fixes: three runs, each 240 files passed, 0 skipped files, 3606 passed and 1 skipped test (the pre-existing skip), 0 failed.
- By eye on this checkout's build at 1440 wide and in a 390x844 frame: step 4 for both sides; the done page's *Pairing* row; the editor's row for the question, its open row, its removal confirmation (*It deletes the answers 5 people have already given.*) and the side's removal held by both questions; both Pair popups; Suggested Pairs' card and No Schedule Overlap row.

Fixed on the way, outside the ticket:

- A question that wrapped onto a second line on a phone had the body's leading and read as two loose lines; `legend` now has a heading's line height.
- A wrapped answer on the done page's summary left one word alone; the answers are now balanced (`text-wrap: balance`).
- A Suggested Pairs line under a name that wrapped started its second line with the separator dot; the dot is now held to the part before it.

For James:

- Confirm the refusal sentence above.

Nothing else needs James beyond pushing the two new migrations to production with the branch.
