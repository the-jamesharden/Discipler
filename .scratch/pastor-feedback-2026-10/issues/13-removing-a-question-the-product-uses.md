# 13 - Removing a question, including one the product uses

**What to build:** Any question but name and phone can be removed from a form.
Removing takes two presses, says how many answers it deletes, and, for a question the product uses, says plainly what stops working.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The Intake form editor*.
Design: `.lavish/pastor-feedback/mock-forms-remove.html`, settled in James's Lavish review of 2026-10-12.

**Blocked by:** 11, 12

**Status:** shipped

## Acceptance

- [x] An open question's row ends in *Remove question…*; pressing it asks once more in place, and only the second button removes. (e85426a)
- [x] The question says how many people's answers it deletes, and that this cannot be undone (ADR 0014: a removal destroys its answers). (7f7e083, e85426a)
- [x] For a question the product uses, it also says what stops working, in plain words: without availability Suggested Pairs cannot suggest anybody and every pairing is made by hand; without gender the gender pairing rules cannot be applied; without age band the age rule cannot be applied; without the goal there is no goal tiebreaker; without the matching question Suggested Pairs cannot tell who offered to disciple. (e85426a)
- [x] After a removal each of those surfaces says why it is doing less, rather than quietly doing it: Suggested Pairs, for one, says the Ministry's form no longer asks when people are free. (7f7e083, b42ce2d, 57e3bd4)
- [x] Name and phone have no remove control. (7f7e083, e85426a)
- [x] A removed built-in question can be added back from *Add a question*; its old answers are gone. (7f7e083, e85426a)
- [x] The removal is recorded in the Ministry's history. (7f7e083)
- [x] `docs/product-rules.md` says which questions can be removed and what each removal turns off; ADR 0014 notes it now covers every question, not only goals. (e448661)
- [x] Checked by eye in a real browser against the mock-up, removing availability and then opening Suggested Pairs, at desktop and phone width. (57e3bd4)

## Not in this ticket

- Hiding a question without deleting its answers. James chose one removal rule.

## Comments

Decisions made while building, each the conservative reading of a gap, with the alternative.

### What removal does to Required

- **Removal only; the Required lock is unchanged.**
  Gender, age band, the matching question, availability and the group stay required for as long as a form asks them (`requiredFixed` in `BUILT_IN`).
  This ticket decides what each surface does when a form no longer asks one at all, which every Person on that form then shares; it does not decide what a surface does with one Person who answered beside another who skipped, and a safeguarding rule that quietly lapsed for one Person is the case to avoid.
  Alternative: unlock Required on those five now that each surface says what it does without them.
- While a form asks gender or the age band, somebody with no answer to it (an answer deleted and the question added back, or a groups-form Person on the mentor and mentee form's pools) is not suggested at all, as before; only once the form stops asking does Suggested Pairs drop the rule, and say so.

### What a removal deletes

- **Answers given on the form it is removed from, and no other.**
  The same question is often on both forms (age band, gender, availability, email); removing it from one leaves the other's answers.
  A submission is from the groups form where the consent records written with it say so, from the form the Person last answered where its records name none (the pre-wizard form and the reopen link), and from the mentor and mentee form otherwise: `app.intake_submission_forms`.
  A Ministry's own question is keyed uniquely, so its answers are deleted by key.
  Alternative: delete across both forms, which would take answers from a form that still asks the question.
- **Superseded submissions too**, as ADR-0014 does for a goal option. The warning counts people (distinct Persons with any answer on that form); the delete takes rows.
- **Where each answer lives**: age band, gender, first-time answer and goal (option or Other's words) are columns on `intake_submission`, set to null (age band and gender lost their `not null`); the hours are `intake_availability` rows, deleted; a Ministry's own answers are `intake_answer` rows, deleted (`discipler_command` gets `delete`, as ticket 12 noted).
- **The matching question's answer lives on `consent_record.declared_side`, and is cleared there.** For James: this narrows the consent record's immutability. The trigger now accepts exactly one update, `declared_side` going from a value to null with every other column unchanged; `discipler_command` is granted `update (declared_side)` and nothing else; the discipleship path may now carry no side. What anybody agreed to, the wording version, when, how they arrived and which form are untouched and every other update is still refused (tested).
  Alternative: leave the side on the consent records and have every reader ignore it while the form does not ask it, which is the *hiding without deleting* James turned down, and would bring the old sides back on an add-back.
- **The email and the choice of group delete nothing.** The email is kept on the Person beside their name and number, as a contact detail, and may have come from an import; the choice of group is not stored as an answer at all, only as the membership or the request it made, which a form edit should not undo. The warning says so in place of a count (*The emails people gave are kept with their names and numbers, so no answers are deleted.*).
  Alternative: blank `person.email` for everybody who gave one on that form.

### History

- **The removal event keeps what was deleted**: `intake_form.question_removed` with `form`, `version`, `editedBy`, `key`, `question` (the wording, hint and required as they stood), `answersLost` (people) and `deletedAnswers` (one per submission: submission, person, when, and the answer as stored, the Ministry's own questions' typed words included, which ticket 12 left for this event).
- **`intake.submitted` events are left as they are**, as a goal option's removal leaves `goalId` on them.
- A question added back is recorded as `intake_form.question_added`, with the words it came back in.

### The matching question and the first-time question

- The first-time question is worded from the side, so **the side cannot be removed while the first-time question is asked** (the second press says *Remove the first-time question first.* and offers only *Keep it*), and **the first-time question is offered back only on a form that asks the side**.
  Alternative: let the side go and word the first-time question some neutral way, which nobody has written.

### What each surface does, and says

- **Suggested Pairs reads the mentor and mentee form.** The side and the goal are asked on no other form, and it suggests one-to-ones, which is what that form signs people up for. Removing a question from the groups form changes nothing it says.
- Without availability it suggests nobody and lists nobody under No Schedule Overlap (everybody would be there, which reads as a fact about them); it says only *The mentor and mentee form no longer asks when people are free, so Suggested Pairs cannot suggest anybody. Every pairing is made by hand, from the Roster.*
- Otherwise it says one line per question it is doing without (gender, age, goal, side), above what it still suggests, with a link to put a question back on Intake forms.
- **The settings' Pairing section** says the gender rule cannot be applied beside the gender switch (naming whichever forms stopped asking), and the age rule beside the age gap (mentor and mentee form only, since the age rule is Suggested Pairs').
- **Manual pairing**: the database's gender triggers already let a Person with no gender through (they were written for *no Intake*), so a pairing with somebody whose gender was not asked is not refused, which is what *cannot be applied* means. **The Pair popup does not say so.** It is a new message on a reviewed screen and wants a mock-up first; the settings say it of the rule as a whole. Alternative: a line in the popup when its opener has no gender because the form does not ask.
- **The groups form without gender offers only the groups open to men and women alike** (and refuses a gendered group, as it did): a group that declared a gender cannot check somebody whose gender was not asked. The warning says so. Alternative: offer every group.
- **The groups form without the group question**: everybody who fills it in is somebody with no group in mind, raises the Follow-Up placement item and is told so on the done page.
- **The wizard** skips a page a removal emptied, as it skips any empty page; the discipleship done page leaves out the availability line when none was asked.
- **The reopened page** no longer asks a built-in question the form the Person last answered has removed, so an answer an Admin deleted is not asked for again. It goes on asking everything else by today's rules.

### Submissions in flight and stray answers

- **Somebody who opened a version that still asked a question and submits after it was removed finishes the version they opened, but their answer to it is dropped.**
  They are not refused or sent back, and the version they opened still decides its wording, its pages and what is required; but an answer to a question the form as it stands no longer asks is never stored, and no history event records it, while everything else they answered is kept.
  James, 2026-10-13, from the no-mistakes review: this is how Google Forms behaves, and it keeps a removal's promise that the answers are gone, which a later submission on an older version would otherwise break with an answer nothing shows, counts or could delete.
  What is dropped is exactly what the removal would have deleted had they submitted a moment before it (`withoutWhatIsNoLongerAsked`): the email and the group they picked stand, and a group is still checked against the gender they gave, as it would have been then, even where that gender is not kept.
  The submission reads the form as it stands behind the same lock as the version opened, so a removal cannot land between the two.
  The done page lists only what was kept: its summary is built by the same rule (`stillKept`), read against the form as it stands (fixed 2026-10-14; it first echoed the answers sent).
  That read comes after the submission commits rather than behind its lock: a removal landing in that instant would at worst leave one stored answer off the summary, which a confirmation screen can bear.
  This reverses what this ticket first built, which recorded their answer because a submission is read against the version its Person opened (ticket 11).
- An answer to a question the version does not ask is refused as `intake.path_unknown`, as an answer with no question always has been: it is not the form Discipler served.

### The editor

- *Remove question…* is the open row's last button, after Save and Cancel, for every question but the name and the number. It opens the second press in the row's place (`?removingQuestion=1`, since `removing` was the goal card's). *Keep it* returns to the open row.
- The count is the people with an answer on that form, read with the page (`app.intake_answer_counts` on `intake_forms_page`); none says *Nobody has answered it yet, so no answers are deleted.* and the button is *Remove it*.
- After the removal the page box it was on says *Removed, live now*.
- A removed question of Discipler's own is offered back on an *Add back:* line under *Add a question*, by its preset wording, on each page it may be asked on; one press adds it at the foot of that page in the preset's words and opens it as saved.
