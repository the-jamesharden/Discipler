# 11 - The form editor

**What to build:** Intake Forms gains an editor for each of the two forms: every wizard page is a box with its intro or thank-you text, and every question a row that opens in place to change its wording, hint and whether it is required, and drags to reorder within and between pages.
Saving a question makes it live at once; *Preview form* opens the form as a newcomer sees it.
Today's form, with ticket 06's Other, is every Ministry's preset, so nothing changes for anybody until an Admin edits.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The Intake form editor*.
Design: `.lavish/pastor-feedback/mock-forms-editor.html`, settled in James's Lavish review of 2026-10-12.
Today: only the goal options and the groups can be configured (`app/intake-forms`); the wizard's questions, wording and pages are fixed in `app/intake/fields.tsx` and `app/intake/wizard.tsx`.

**Blocked by:** 06

**Status:** needs-triage

## Acceptance

- [ ] Each form, mentor and mentee and groups, has its own editor, chosen by a toggle at its top, showing its short link and *Preview form*.
- [ ] Each wizard page is a box titled with its number and name, with its intro (first page) or thank-you (last page) text editable from the box's head.
- [ ] Each question is a row with its wording, chips for what kind it is and whether it is optional, and an *Edit* button that opens it in place: wording, hint and *Required*. Name and phone are marked *Always asked* and cannot be made optional.
- [ ] Each built-in question the product uses is marked with what uses it: *Pairing rules use this* (gender), *The age rule uses this* (age band), *Suggested Pairs uses this* (the matching question, availability, goal). The goal's choices stay edited under *Goals* as today, with Other always last.
- [ ] Rows drag to reorder within and between pages, with buttons for a page whose script has not run, as the goals list does; pages can be added and renamed.
- [ ] **Saving a question makes it live at once**, saying *Saved, live now* beside it. Somebody already part-way through the form finishes the version they opened.
- [ ] *Preview form* opens the form as a newcomer sees it and records nothing.
- [ ] A rename keeps every answer already given (ADR 0014).
- [ ] The wizard reads its pages, order, wording, hints and required flags from the Ministry's form, and a Ministry that has never edited sees exactly today's form.
- [ ] Every edit is recorded in the Ministry's history.
- [ ] `docs/product-rules.md` says a Ministry controls its forms, what is always asked, and the preset; `CONTEXT.md` names the form and its pages.
- [ ] Checked by eye in a real browser against the mock-up, editing each form and previewing it, at desktop and phone width.

## Not in this ticket

- Custom questions. That is ticket 12.
- Removing a question. That is ticket 13.
