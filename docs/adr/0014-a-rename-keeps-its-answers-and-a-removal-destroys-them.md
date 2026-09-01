# A Rename Keeps Its Answers and a Removal Destroys Them

## Status

accepted

## Decision

A Discipleship Goal option is a row, and an Intake answer points at that row.

**Renaming updates the row in place.** `update discipleship_goal set label = $2` — never a
delete and an insert. Every answer pointing at the option goes on pointing at it, so a
reworded option is the same option. The wording it used to carry is written to
`discipleship_goal.renamed` as `{ from, to }` before the update runs.

**Removing deletes the row, and `on delete set null` on
`intake_submission.discipleship_goal_id` blanks the option on every submission that chose
it.** A stated goal therefore comes off every live surface, and no undo puts it back on
one.

**Before the delete runs, the answers it is about to blank are read and written into the
`discipleship_goal.removed` event.** That event carries three things: the wording, the
`answersLost` count the Admin was warned with, and `blankedAnswers` — every submission the
delete touches, each with its person and when it was submitted. The count and the list are
deliberately different sets: the warning is about *people whose current answer points
here*, and the delete blanks *rows*, including the superseded submissions of somebody who
has since answered differently.

**Submissions record the option they named.** `intake.submitted` carries `goalId`, for the
same reason it already carries `fullName` — the column it mirrors can be overwritten, and
without the event the fact would be gone from the whole system. The id and not the wording:
`discipleship_goal.renamed` resolves an id to the words that stood on any given date.

## Context

`CLAUDE.md` states, without qualification: *Preserve historical ministry events rather than
overwriting past facts with current values*, and *Treat stored ministry history as the
source from which current relationship state, pastor care signals, and Ministry
Intelligence are derived*. Both of the writes above are in tension with that rule, and the
tension is the reason this ADR exists rather than a comment.

Ticket 21 requires that *removing an option loses the answers that pointed at it* and that
*renaming an option keeps the answers pointing at it, because a reworded option is the same
option*. Those two requirements are only compatible with each other if wording lives in a
column on a row the answers reference. The alternatives each break one of them:

- **Wording as the value on the submission.** Then history is perfectly preserved — every
  submission carries the words the Person actually read. But renaming is no longer possible
  at all: an Admin correcting *Career* to *Career and calling* would either rewrite what
  past congregants were shown, or split one option into two that render identically on the
  form. Ticket 03 already chose the row, and this is why.
- **A soft delete — `retired_at` rather than a delete.** History survives, and the answers
  keep pointing at wording nobody can choose any more. But the count an Admin is warned
  with stops meaning anything (`chosenBy` would include people whose option was retired
  years ago), the Intake form needs a live/retired filter it does not have, and *a Ministry
  cannot be left with no options* becomes a rule about live rows that a `before delete`
  trigger cannot enforce. It is the better shape for history and a worse shape for every
  rule the ticket actually states.
- **Delete the row, keep the answer's text.** A denormalised `goal_label` on
  `intake_submission`, written at submit time. History survives a removal *and* a rename
  keeps its answers. The cost is a second source of truth for wording that a rename must
  now either update — which is the overwrite this rule forbids, one table further along —
  or leave stale, so that a submission and the option it points at disagree.

What decided it is that the loss is bounded and the thing lost is re-askable. A Discipleship
Goal is a *stated preference*, re-submittable by the Person who stated it: Intake is
append-only and a congregant can be sent a link to answer again. It is not a consent
record, a message that was sent, a relationship that existed, or a pastoral concern that was
raised — none of which can be reconstructed by asking, and none of which anything in this
product deletes.

The Admin is warned in people, before the fact, and has to press twice.

That argument justifies blanking the *column*. It does not justify losing the *fact*, and
`CLAUDE.md` asks for both: *preserve historical ministry events*, and *treat stored ministry
history as the source from which current state is derived*. So the exemption is scoped to
the first. The live surface loses the answer, because every rule ticket 21 states depends on
that; history keeps it, because nothing required it to be destroyed. The reading and the
delete run in the one transaction the command opened, so nothing can submit this option
between them.

## Consequences

**"What did people used to want?" is answerable, but only from history.** No live query can
reach it: `intake_submission` has been blanked, and the option's row is gone. Reconstructing
it means replaying `discipleship_goal.removed` and `intake.submitted`. Any Ministry
Intelligence built over stated goals from the live tables therefore shows a removal as a
hole in the series rather than as a category that trails off, and closing that hole is a
reader nobody has written yet.

**A rename is invisible to anything reading current wording.** Past reports re-render under
the new words — a semester's report run before and after a rename shows different labels
over the same people. `discipleship_goal.renamed` is the only thing that can explain the
difference, and nothing reads it yet.

**The removal event grows with the option's use.** `blankedAnswers` is one entry per
submission, so retiring a long-standing option on a large Ministry writes a large payload.
It is bounded by that Ministry's own submission count, it is written once, and the
alternative is the loss this ADR exists to avoid.

**People whose answer was blanked stay pairable.** They keep their Intake, their
availability and their consent; they are ranked on availability alone until they answer
again. A removal costs a signal, not a participant — which is what makes the count on the
warning the honest measure of the cost.

**The floor is a database rule, not a screen's.** A `before delete` trigger refuses the
removal that would empty a Ministry's list, so it holds for a pilot's settings written by
SQL as much as for an Admin pressing a button. It lets the cascade from deleting the
Ministry itself through: those options are going with a form nobody will open again.

**What this does not decide.** Whether an Admin should be able to *act* on what the removal
event kept — a screen that lists who lost an answer, or a way to re-ask them — is untouched.
Nothing reads `discipleship_goal.removed`, `discipleship_goal.renamed` or the `goalId` on
`intake.submitted` today; they are written so that the reader remains possible, which is the
difference between a bounded loss and a permanent one.

Whether options should be *retired* rather than deleted is also still open, and is the
shape that would remove the exemption entirely rather than bounding it. It was not taken
here because it costs every rule ticket 21 states — see the third alternative above — and
because it is a bigger change than the one that closed the actual loss.

Submissions recorded *before* this decision carry no `goalId` on their `intake.submitted`
event. Removing an option those submissions chose is still recoverable, because
`blankedAnswers` is read at removal time and does not depend on the submission event — but
they have no second, independent record, and a `blankedAnswers` payload lost to a bad
migration would not be reconstructible for them.
