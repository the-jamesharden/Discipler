# 11 - The form editor

**What to build:** Intake Forms gains an editor for each of the two forms: every wizard page is a box with its intro or thank-you text, and every question a row that opens in place to change its wording, hint and whether it is required, and drags to reorder within and between pages.
Saving a question makes it live at once; *Preview form* opens the form as a newcomer sees it.
Today's form, with ticket 06's Other, is every Ministry's preset, so nothing changes for anybody until an Admin edits.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The Intake form editor*.
Design: `.lavish/pastor-feedback/mock-forms-editor.html`, settled in James's Lavish review of 2026-10-12.
Today: only the goal options and the groups can be configured (`app/intake-forms`); the wizard's questions, wording and pages are fixed in `app/intake/fields.tsx` and `app/intake/wizard.tsx`.

**Blocked by:** 06

**Status:** shipped

## Acceptance

- [x] Each form, mentor and mentee and groups, has its own editor, chosen by a toggle at its top, showing its short link and *Preview form*. (89216d1)
- [x] Each wizard page is a box titled with its number and name, with its intro (first page) or thank-you (last page) text editable from the box's head. (89216d1, 85a9426)
- [x] Each question is a row with its wording, chips for what kind it is and whether it is optional, and an *Edit* button that opens it in place: wording, hint and *Required*. Name and phone are marked *Always asked* and cannot be made optional. (d51bfe1, 89216d1)
- [x] Each built-in question the product uses is marked with what uses it: *Pairing rules use this* (gender), *The age rule uses this* (age band), *Suggested Pairs uses this* (the matching question, availability, goal). The goal's choices stay edited under *Goals* as today, with Other always last. (89216d1)
- [x] Rows drag to reorder within and between pages, with buttons for a page whose script has not run, as the goals list does; pages can be added and renamed. (d51bfe1, 89216d1, 85a9426; a real mouse drag across pages checked in Chrome)
- [x] **Saving a question makes it live at once**, saying *Saved, live now* beside it. Somebody already part-way through the form finishes the version they opened. (d51bfe1, cbb799a, 89216d1, 85a9426)
- [x] *Preview form* opens the form as a newcomer sees it and records nothing. (cbb799a, 89216d1)
- [x] A rename keeps every answer already given (ADR 0014). (d51bfe1)
- [x] The wizard reads its pages, order, wording, hints and required flags from the Ministry's form, and a Ministry that has never edited sees exactly today's form. (cbb799a, 89216d1)
- [x] Every edit is recorded in the Ministry's history. (d51bfe1)
- [x] `docs/product-rules.md` says a Ministry controls its forms, what is always asked, and the preset; `CONTEXT.md` names the form and its pages. (a582389)
- [x] Checked by eye in a real browser against the mock-up, editing each form and previewing it, at desktop and phone width. (85a9426, headless Chrome at 1440 wide and a 390x844 frame, and Chrome for the drag)

## Not in this ticket

- Custom questions. That is ticket 12.
- Removing a question. That is ticket 13.

## Comments

Decisions made while building, each the conservative reading of a gap, with the alternative.

### The stored form, for tickets 12 and 13

- **A form is versions, never a row that is updated.**
  `intake_form_version` holds one row per save: `(ministry_id, form, version, definition jsonb, saved_at, saved_by)`, unique on `(ministry_id, form, version)`, with a trigger refusing every update.
  `form` is the Intake path (`discipleship` or `group`).
  A Ministry that never edited has no row and is served `presetForm`, version 0, which is never stored.
  Alternative: a row per page and per question, updated in place, which would have needed a second copy to serve somebody part-way through.
- **The document** (`src/platform/supabase/intake-form-document.ts` reads and writes it): `{ intro, thankYou, pages: [{ id, name, questions: [{ key, wording, menteeWording, hint, required }] }] }`.
- **A question is its key.**
  The built-in questions' keys are the names their answers travel under on the wire: `side`, `ageBand`, `gender`, `experience`, `availability`, `goalId`, `groupId`, `fullName`, `phone`, `email`.
  A rename changes `wording` and nothing else, so every answer stays (ADR-0014).
  What Discipler fixes about each one (its kind, what uses it, always asked, whether Required may be changed, whether it stays on the last page, which answer it must come after) is the `BUILT_IN` table in `src/domain/intake-form.ts`, not the stored document.
- **For ticket 12.**
  A custom question is a new key (suggested `custom:<uuid>`, so it can never collide with a built-in), with `kind` and, for the two choice kinds, `choices` added to its entry in the document; `QuestionKind` gains `long_text`, `several_choices` and `yes_no`, and `isBuiltInQuestion` widens to a `QuestionKey`.
  Its answers want a table of their own keyed by submission and question key, because `intake_submission` has a column per built-in.
  One thing to decide there: every page but the last moves on by a GET that carries the answers in the URL, so a text answer on an earlier page would travel in the address, which is why name, phone, email and the goal (with Other's words) stay on the last page (`staysOnTheLastPage`).
  Either the text kinds stay on the last page too, or ticket 12 changes how they travel.
- **For ticket 13.**
  Removing a question is the next version without it, plus deleting its answers; `requiredFixed` on gender, age band, the matching question, availability and the group is what ticket 13 relaxes once each surface says what it does without them.
  `arrangementRefusal`'s ordering rules (`after`) should treat a missing anchor as satisfied, which they already do.
- **Which version a newcomer opened** is `intake_submission.form_version` (0 for the preset, null for the tokenized reopen link and every submission before this ticket) and `formVersion` on `intake.submitted`.

### How the wizard pins a version

- Every screen carries `v=<version>` as a hidden input, as it carries the answers, and the page serves that version; the last screen posts it, and the submission is read against it (`requiredOn` of that version) and records it.
  A visitor arriving with no `v` is served the latest version.
  A `v` this Ministry never saved (a hand-edited URL) is served the latest version rather than refused.
  Versions are never changed, so a version read outside the submission's transaction cannot have moved.
  Alternative: a cookie or a stored draft, which the wizard has never had and which would write something before the last step.
- Every edit, however small, is a version, so a typo fixed in a hint after somebody opened the form is not shown to them.
  That is what *finishes the version they opened* says.

### What the editor lets an Admin change

- **Required stays fixed on gender, age band, the matching question, availability and the group, as well as name and phone.**
  The pairing rules, the age rule, Suggested Pairs and the groups form read them, and none of them yet says what it does for somebody who skipped the question; gender in particular is the safeguarding rule.
  Ticket 13 decides what each surface does without them, and can unlock Required then.
  Their rows say why in the open row's note, and the box is shown ticked and greyed.
  Name and phone carry the *Always asked* chip; the others carry what uses them.
  Alternative, the literal reading of *Name and phone cannot be made optional*: every other question optional, with a missing gender meeting the gender rule as nothing, which is a material product behaviour nobody has decided.
- **The goal, the first-time question and the email can be made optional or required.**
  A missing goal is already a state the product handles (a removed option, the groups form): the Person is ranked on availability alone.
  This narrows `docs/product-rules.md`, *Required Intake Fields*, which said the goal is required; it now says that is the preset, and a Ministry may make it optional.
  A missing first-time answer is already null (*the form did not ask*).
  A required email is refused empty as `intake.email_missing`, *Please give your email address.*
- **An optional question says so in the wizard**, as *(optional)* after its wording, which is how the email has always read (*Email (optional)*); the preset's email wording is therefore `Email`.
- **The first-time question has two wordings**, one for a mentor and one for somebody to be mentored, because the wizard words it from the side; its open row has two boxes.
- **Choices are not edited in the form.**
  The goal's choices are the Ministry's goals, edited on the goals card as before with Other always last; the groups are named under Groups; the other built-ins' answers are fixed.
  The kind is shown in a disabled select.
- **Where a question may go.**
  Name, mobile number, email and the goal stay on the last page (what is typed never goes in a URL); the first-time question comes on a later page than the side (it is worded from it), and the group on a later page than gender (the groups offered depend on it).
  A drag or a move that breaks one is refused with a sentence, and the no-script up and down buttons are not offered where the move would be refused.
- **The two agreements are not questions.**
  They stay on the last page of both forms in their versioned wording, and the editor does not show them as rows.
  Alternative: a fixed row saying so; left out because there is nothing an Admin can do to it.
- **Pages.**
  A page's name is the line at the top of its screen in the wizard (today's subtitles are the preset's names: *Welcome — let’s get you connected.* and so on), so a rename is something a newcomer sees.
  A page is added just before the last page, because the last page is where somebody submits; it is empty and the wizard skips it until a question is moved onto it, so *Step N of M* counts only pages with a question.
  Pages cannot be removed or reordered (not in this ticket).
- **The intro and the thank-you are both empty on the preset**, so a Ministry that never edits sees exactly today's form.
  The intro is a paragraph on the first screen under the progress bar.
  The thank-you is a paragraph on the page after Submit, under what Discipler already says there rather than in place of it, because that line carries facts only Discipler knows (which group they joined, who leads it, whether they are waiting).
  Alternative: the preset's thank-you as today's done message, replaced when an Admin writes one, which could say something untrue about a group.

### The editor itself

- One form at a time, chosen by the toggle (`?form=group`); the editor sits under the link card and the waiting card and above the goals and the groups.
- Everything is a form or a link, so it works with no script: *Edit* reloads with the row open (`?question=<key>`), *Rename* and the intro and thank-you *Edit* open in place the same way, and *Save* closes the row with *Saved, live now* beside it.
  The drag is the one script, as on the goals card: rows drag by their handles within and between pages, and letting go posts the whole order; arrow keys move a focused handle's row across page edges and Enter saves.
- The goals card's drag script guarded on the document's `js` class, which the editor's script sets too; each now guards on a mark of its own, so neither stops the other running.
- *Preview form* opens `/join/<short name>?preview=1` in a new tab.
  The flag travels to the end like the version; every screen and the page after Submit say *Preview.
  This is the form as a newcomer sees it.
  Nothing you enter is recorded, and nobody is texted.* The last step reads the answers as the real thing does, so its refusals show, and then writes nothing.
  Anybody can add `?preview=1` to a link; it only stops their own submission being recorded, which the notice says.
  On the groups form the preview's done page says *joined* or *on the list* from the group's approval switch, as the real submission would.
- The tokenized reopen link's single page is not the wizard and is not edited: it keeps today's wording and today's required rules.
  Alternative: draw it from the mentor and mentee form, which it is not one of (it declares no path).

### History

Every save appends one event, subject the Ministry, with `form`, `version` and `editedBy`: `intake_form.question_edited` (`key`, `from` and `to` of wording, mentee wording, hint and required), `intake_form.arranged` (`from` and `to` layouts, for a drag or a move button), `intake_form.page_added` (`pageId`, `name`), `intake_form.page_renamed` (`pageId`, `from`, `to`), `intake_form.intro_edited` and `intake_form.thank_you_edited` (`from`, `to`).
An edit that changes nothing writes nothing.

### Faults fixed on the way

- The last wizard step read *Step 5 of 5* with an 80% bar: the bar filled only the steps before this one.
  It now fills N parts in M, so *Step 1 of 5* reads 20% and the last step 100%.
- The goals card said *Both forms end by asking What are you hoping for?*; the groups form never asks it.
  It now says *The mentor and mentee form asks* the goal question in the form's current wording.
- At phone width the goals card's wording box cut long options to a few characters; below 480px the box now takes the row's width and *Save wording* goes under it.
