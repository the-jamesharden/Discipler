# 13 - Removing a question, including one the product uses

**What to build:** Any question but name and phone can be removed from a form.
Removing takes two presses, says how many answers it deletes, and, for a question the product uses, says plainly what stops working.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The Intake form editor*.
Design: `.lavish/pastor-feedback/mock-forms-remove.html`, settled in James's Lavish review of 2026-10-12.

**Blocked by:** 11, 12

**Status:** ready-for-agent

## Acceptance

- [ ] An open question's row ends in *Remove question…*; pressing it asks once more in place, and only the second button removes.
- [ ] The question says how many people's answers it deletes, and that this cannot be undone (ADR 0014: a removal destroys its answers).
- [ ] For a question the product uses, it also says what stops working, in plain words: without availability Suggested Pairs cannot suggest anybody and every pairing is made by hand; without gender the gender pairing rules cannot be applied; without age band the age rule cannot be applied; without the goal there is no goal tiebreaker; without the matching question Suggested Pairs cannot tell who offered to disciple.
- [ ] After a removal each of those surfaces says why it is doing less, rather than quietly doing it: Suggested Pairs, for one, says the Ministry's form no longer asks when people are free.
- [ ] Name and phone have no remove control.
- [ ] A removed built-in question can be added back from *Add a question*; its old answers are gone.
- [ ] The removal is recorded in the Ministry's history.
- [ ] `docs/product-rules.md` says which questions can be removed and what each removal turns off; ADR 0014 notes it now covers every question, not only goals.
- [ ] Checked by eye in a real browser against the mock-up, removing availability and then opening Suggested Pairs, at desktop and phone width.

## Not in this ticket

- Hiding a question without deleting its answers. James chose one removal rule.
