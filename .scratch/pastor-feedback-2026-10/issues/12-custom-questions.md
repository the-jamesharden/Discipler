# 12 - Custom questions

**What to build:** A Ministry adds questions of its own to either form: short text, long text, one choice, several choices or yes/no.
Their answers show to an Admin on the person page and the pair card, and are never used for matching.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The Intake form editor*.
Design: `.lavish/pastor-feedback/mock-forms-editor.html` (the *Add a question* row and *Your question* chip), settled in James's Lavish review of 2026-10-12.

**Blocked by:** 07, 11

**Status:** needs-triage

## Acceptance

- [ ] Each page box ends in *Add a question* with the five kinds; the new question opens in place to be worded, and its choices are edited in place for the two choice kinds.
- [ ] A custom question is marked *Your question*, and edits, reorders and saves live like any other (ticket 11).
- [ ] The wizard asks it, with the right control for its kind, and a required one is refused empty in the wizard's usual way.
- [ ] Answers appear on the person page's intake answers and on the pair card and group card, under the person they belong to, and never on the Roster row.
- [ ] Answers are never read by Suggested Pairs or any pairing rule.
- [ ] Reopening a person's Intake shows their answers filled in.
- [ ] `docs/product-rules.md` records that custom answers are shown and never matched on.
- [ ] Checked by eye in a real browser: adding one of each kind, answering it in the wizard at phone width, and reading it on the person page and the card.

## Not in this ticket

- Removing a custom question. That follows the one removal rule in ticket 13.
