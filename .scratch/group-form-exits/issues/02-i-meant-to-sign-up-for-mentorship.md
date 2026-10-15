# 02 - I meant to sign up for mentorship

**What to build:** The line under step three's actions, "Looking for one-to-one discipleship instead? I meant to sign up for mentorship.", linking to the discipleship wizard's first question with age band, gender and availability carried in the query string, as S-7 of `.lavish/materials/design.html` draws it.

**Blocked by:** nothing

**Status:** ready-for-human

**Built:** on `feat/group-form-exits-02`, cut from `origin/main` at 7b3db65, in d474e46 (code and tests) and df9c781 (docs).

## Acceptance

- [x] The line appears on step three of the group form and nowhere else, styled as the design's `card-note` under the form actions. (d474e46)
- [x] The link is built from the wizard machine's query for the answers already given, plus `via`, and never from hand-written parameter lists. (d474e46)
- [x] Following it opens the discipleship wizard on the mentor-or-mentee question with age band, gender and availability already answered, so pressing Back from there shows them filled and Continue moves past them. (d474e46; see decision 5)
- [x] Nothing is written by following the link; the group form's own answers are not submitted. (d474e46)
- [x] No reverse link is added to the discipleship wizard. (d474e46)
- [x] Over-HTTP: answer the group form's first two steps, follow the switch, land on the discipleship wizard's first question, finish it, and find the Person on the Roster with the side they declared and the availability they gave on the group form. (d474e46, `tests/integration/i-meant-to-sign-up-for-mentorship-over-http.test.ts`)

## Comments

### Implementer

**Where things are.**
- The query: `mentorshipSwitchQuery` in `app/intake/group-wizard-answers.ts`.
- The line: `MeantForMentorship` in `app/intake/group-wizard.tsx`, its words `MEANT_FOR_MENTORSHIP_QUESTION` and `MEANT_FOR_MENTORSHIP_LINK` in `app/intake/copy.ts`.
- The mentor and mentee form on the group page: `GroupIntakePage.discipleshipForm` in `src/service/ports.ts`, read in `readGroupIntakePage` in `src/platform/supabase/intake-reader.ts`.
- Tests: `tests/app/i-meant-to-sign-up-for-mentorship.test.ts`, `tests/integration/i-meant-to-sign-up-for-mentorship-over-http.test.ts`, and one case in `tests/integration/the-intake-form-editor.test.ts`.
- Docs: `docs/product-flow.md`, `docs/product-rules.md` (*Removing a question*), and the Group Intake Link entry in `CONTEXT.md`.

**Decisions made, each the conservative reading of a gap, with the alternative.**

1. **The answers carried are those both forms ask, read off the two wizards, not a fixed three.**
   The group wizard writes its answers as its own query; the discipleship wizard reads back the fields both forms' screens ask, checked against its own lists, and writes the query of the screen it opens on.
   On the presets that is the age band, the gender and the availability.
   Since the form editor (Pastor feedback, tickets 11 to 13) either form may have stopped asking one: an answer the group form did not ask is not carried even if a hand-written URL holds one, and an answer the discipleship form no longer asks is not carried, because its submission refuses an answer to a question it does not ask (`intake.path_unknown`).
   The group and the Ministry's own questions are never carried.
   Alternative: always carry the three, which would send somebody on to a submission the discipleship form refuses.
2. **The group page reads the mentor and mentee form as it stands**, beside the groups form, in the same read (`GroupIntakePage.discipleshipForm`), **and the link pins its version** (`v=`), so the form that opens is the one the answers were matched against even if an Admin saves a new version meanwhile.
   Alternative: no `v`, and the discipleship page serves whatever is latest when the link is followed.
3. **It opens on the first screen the discipleship wizard has unanswered**: the mentor-or-mentee question on the preset (`step=1`), or a later screen on a form that no longer asks the side.
   Alternative: always `step=1`, which on a form whose first page is the age band would open on a screen already answered.
4. **The line is on the screen that asks which group, whatever its number**, under the actions and outside the form, including where an Admin has put the group on the last page beside Submit.
   It is not on the *Nothing to join yet* screen, which already points at the discipleship form in its own words, and not on a groups form that no longer asks the group, which has no group step.
   Alternative: on every screen, or on *Nothing to join yet* as well.
5. **Continue moves past the carried screens by showing them filled; it does not skip them.**
   After the side, the age and gender screen and then the availability screen are shown with the answers already checked, and Continue on each moves on; Back from a later screen shows them filled.
   The spec says the wizard "skips the three carried steps" as if it already jumped over answered screens; it does not, and making Continue jump to the next unanswered screen would change the wizard for everybody (somebody who goes Back to the side to change it would be thrown past everything they had answered).
   The stepping rules are unchanged.
   Alternative: Continue jumps to the first unanswered screen, which saves two presses here.
6. **`via` travels as between steps**: `via=qr` when they came by the QR code, nothing for the link, which is the default.
7. **An Admin's preview stays a preview**: following the line from *Preview form* opens the mentor and mentee form with `preview=1`, so nothing is recorded at the other end either.
   Alternative: drop the flag, so a preview of one form could end in a real submission of the other.
8. **The link's words end without a full stop**, as S-7 draws them; the ticket's quotation ends with one.

**What was checked.**
Typecheck clean; `npx vitest run tests/domain tests/app` whole green; the touched integration suites green through the lock; the whole suite three times back to back through the lock, each run 241 files passed with none skipped, 3598 tests passed and 1 skipped (the existing `it.skip` in `invitation-over-http.test.ts`).
There is no lint script or ESLint config in the repository; `next build` (run inside the lock) and the typecheck are the gates.
Looked at in headless Chrome at 1440 wide and in a 390x844 frame: step three beside S-7, the discipleship wizard opened on *I'm joining as…*, the age and gender screen and the availability screen filled, and Back from the first-time screen.

**Needs James.**
- Decision 5: whether the carried screens should be skipped rather than shown filled.
- Decision 4: whether *Nothing to join yet* on the group step should carry the answers across too; today its link opens the discipleship form empty.
