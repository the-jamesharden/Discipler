# 02 - I meant to sign up for mentorship

**What to build:** The line under step three's actions, "Looking for one-to-one discipleship instead? I meant to sign up for mentorship.", linking to the discipleship wizard's first question with age band, gender and availability carried in the query string, as S-7 of `.lavish/materials/design.html` draws it.

**Blocked by:** nothing

**Status:** ready-for-human

**Built:** on `feat/group-form-exits-02`, rebased onto `origin/main` at 948adf2.

## Acceptance

- [x] The line appears on step three of the group form and nowhere else, styled as the design's `card-note` under the form actions.
- [x] The link is built from the wizard machine's query for the answers already given, plus `via`, and never from hand-written parameter lists.
- [x] Following it opens the discipleship wizard on the mentor-or-mentee question with age band, gender and availability already answered, so pressing Back from there shows them filled and Continue moves past them. (see decision 5)
- [x] Nothing is written by following the link; the group form's own answers are not submitted.
- [x] No reverse link is added to the discipleship wizard.
- [x] Over-HTTP: answer the group form's first two steps, follow the switch, land on the discipleship wizard's first question, finish it, and find the Person on the Roster with the side they declared and the availability they gave on the group form. (`tests/integration/i-meant-to-sign-up-for-mentorship-over-http.test.ts`; see decision 9)

## Comments

### Implementer

**Where things are.**
- The query: `mentorshipSwitchQuery` in `app/intake/group-wizard-answers.ts`.
- The skip: `carried` on `FormPin`, `readCarried`, `nextStep` and `ASKED_BUILT_IN` in `app/intake/wizard-machine.ts`; `StepForm` and `Hidden` in `app/intake/wizard-shell.tsx`.
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
5. **For somebody the switch brought, Continue skips the carried screens; nobody else's stepping changes.**
   The spec and S-7's note say the carried steps are skipped (the orchestrator's review of 2026-10-15 reversed a first build that only showed them filled).
   The switch names what it carried in a query field the machine owns, `carried` (on the presets `carried=ageBand&carried=gender&carried=availability`), written and read like `via` and `v`, carried on every screen and through a refused last step, and read back only for fields the wizard asks.
   After the mentor-or-mentee screen, Continue names the next screen with something unanswered, passing any screen whose every question the switch carried and is still answered: on the preset, one Continue lands on the first-time question and the next on the last page.
   Back still walks to every screen, showing the carried ones filled, and an answer changed there is kept; a screen with a question of the Ministry's own, or with an optional question left blank, is never passed.
   Without `carried`, Continue names the next screen as it always has, so somebody who presses Back and then Continue in the ordinary wizard sees every screen.
   The progress bar still counts every screen, so it reads *Step 3 of 5* after one Continue, because Back still leads through step 2.
   Alternatives: skip every answered screen for everybody, which changes the ordinary wizard (somebody who goes Back to change the side would be thrown past everything they had answered); or a bare *came by the switch* flag, which could not tell a carried screen from one they answered themselves on this form and then went Back from.
6. **`via` travels as between steps**: `via=qr` when they came by the QR code, nothing for the link, which is the default.
7. **An Admin's preview stays a preview**: following the line from *Preview form* opens the mentor and mentee form with `preview=1`, so nothing is recorded at the other end either.
   Alternative: drop the flag, so a preview of one form could end in a real submission of the other.
8. **The link's words end without a full stop**, as S-7 draws them; the ticket's quotation ends with one.
   They never break across lines (the existing `nowrap` class): where they do not fit beside the question, the whole link drops to the next line.
9. **The availability is checked where it is kept, not on the Roster.**
   The acceptance says to find the Person on the Roster with the availability they gave, but no Roster surface (row, person page or Pair popup) draws anybody's availability.
   The journey finds them on their Roster page with *Offered to mentor* and reads their hours from `intake_availability`.
   Alternative: draw availability on the person page, which is new UI and wants a mock-up first.

**What was checked.**
Typecheck clean; `npx vitest run tests/domain tests/app` whole green; the touched integration suites green through the lock; the whole suite three times back to back through the lock, each run 241 files passed with none skipped, 3603 tests passed and 1 skipped (the existing `it.skip` in `invitation-over-http.test.ts`).
There is no lint script or ESLint config in the repository; `next build` (run inside the lock) and the typecheck are the gates.
Looked at in headless Chrome at 1440 wide and in a 390x844 frame: the group step beside S-7 with the link whole on its own line, the discipleship wizard opened on *I'm joining as…*, one Continue landing on the first-time question, and Back showing the age and gender, and the availability, filled.

**Fixed on the way.**
`a-material-chosen-at-pairing-over-http` failed once with `account.already_exists`: Acceptance mints the account from the Person's number, and a generated number had already been minted by an earlier run on the long-lived local stack.
`aPhoneNumberNobodyHolds` in `tests/support/local-supabase.ts` steps past such a number, as the minting fixtures already do, and the three suites that accept through one helper now use it.

**Needs James.**
- Decision 4: whether *Nothing to join yet* on the group step should carry the answers across too; today its link opens the discipleship form empty.
- Decision 9: whether the person page should show availability.
