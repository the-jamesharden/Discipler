# 21 — An Admin edits the Discipleship Goal options

**What to build:** The list of Discipleship Goals a Ministry offers at Intake is the
Ministry's own, set before a semester begins. Ticket 03 landed the data model and
seeds every new Ministry with a starting list, so the Intake form renders; nothing
yet lets an Admin change it.

Removing an option loses the answers that pointed at it. Those people keep their
Intake and their availability and stay pairable — they are ranked on availability
alone until they answer again — but their stated goal is gone and cannot be
recovered. An Admin must be told that before it happens, not after.

**Blocked by:** 03

**Status:** shipped

- [x] An Admin can add, rename, reorder, and remove Discipleship Goal options
- [x] Removing an option warns how many people have chosen it and that their answer
      will be lost, and does nothing until the Admin confirms
- [x] Renaming an option keeps the answers pointing at it, because a reworded option
      is the same option
- [x] A Ministry cannot be left with no options, since Intake could not then be served
- [x] Goals are never shared or compared across Ministries

## Comments

### Why this is not part of ticket 03

Ticket 03 needed the options to exist so that Intake could render a required field.
It did not need an Admin to be able to change them, and the settings surface is a
screen that ticket otherwise has no reason to build. `docs/product-rules.md` records
the rule under *Settled: Each Ministry Owns Its Discipleship Goal Options*.

The seeded starting list carries no product meaning — it exists so a new Ministry is
never unable to serve its own form.

### Implemented — four acts, one warning, and two floors

**Four commands rather than one.** `goal.add`, `goal.rename`, `goal.move` and
`goal.remove` are four acts an Admin performs separately, and only one of them costs
anybody anything. Renaming is deliberately not remove-then-add: the option is a row
and the answers point at the row, which is what makes *a reworded option is the same
option* a property of the data rather than of whoever wrote the screen.

Reordering is *move one place*, up or down. The whole new order is the boundary's
answer and travels as one effect, so a list whose positions had drifted — gaps a
removal left — comes out contiguous rather than carrying the drift forward. An option
already at the end of the list produces no effects, no history and no refusal: an
Admin pressing up on the top option has asked for the list they are looking at.

**The warning is the screen's, and it takes two presses.** The domain cannot warn
anybody, so Remove is a link that opens a warning saying how many people have chosen
the option and what it costs; only the button inside that warning carries the
confirmation the route requires. A stale form, a copied link or a second tab lands on
the warning rather than on the removal.

The count is *people whose current answer points here*, not submissions. Intake is
append-only and re-submittable, so somebody who changed their mind is not among the
people a removal costs. One definition of that count lives in
`public.discipleship_goal_options` and both callers read it — the settings surface,
warning the Admin, and the command boundary, writing the number into history — so the
number an Admin was warned with and the number the record keeps cannot disagree.

**The empty list is refused twice.** The boundary refuses to remove the last option,
and a `before delete` trigger refuses it again, because pilot settings are written by
SQL as often as by a button. The trigger lets the cascade from deleting the Ministry
itself through: those options are going with a form nobody will open again.

**What the removal leaves behind.** `on delete set null` blanks the option on every
submission that chose it. Those people keep their Intake and their availability and
stay `Ready to Pair`, ranked on availability alone until they answer again.

What survives is the `discipleship_goal.removed` event, and it carries three things:
the wording, the `answersLost` count the Admin was warned with, and `blankedAnswers` —
every submission the delete touches, each with its person and when it was submitted.
The count and the list are different sets on purpose. The Admin decides about *people
whose current answer points here*; the delete blanks *rows*, including the superseded
submissions of somebody who has since answered differently. The answers are read inside
the same transaction as the delete, so nothing can choose the option in between.

Going forward `intake.submitted` also carries `goalId`, the same way it already carries
the name — the column it mirrors can be overwritten, and without the event the fact
would be gone from the whole system.

None of this changes what an Admin sees or is warned with: the answer is still gone
from every live surface, and the warning still says so. What it changes is that the
Ministry's own record can still say who used to want this. ADR-0014.

**Where the screen lives.** `/settings/goals`, linked from the Roster. Ticket 22's
settings surface is three sections of one form about how Discipler runs; this is a
list editor and is deliberately its own page rather than folded into that form.

### Beyond the acceptance criteria — two behaviours nobody asked for

Both were added during implementation, neither is required by the five criteria above,
and both are material product behaviour rather than mechanics. They are written down
here because inferring them silently is exactly what this repo's working rules forbid.
**Either can be reversed without touching the criteria.**

**1. A form open across a removal.** Ticket 21 says only *removing an option loses the
answers that pointed at it*. It says nothing about a congregant whose Intake page was
served before a removal and submitted after — and that person hits the foreign key on
`intake_submission`, which without handling reaches them as a 500.

So a new Intake refusal exists: `intake.goal_no_longer_offered`, caught at the constraint
in the effect store. The whole submission rolls back, and the form comes back with a
sentence saying the ministry changed its list. It is a refusal rather than a failure
because nothing they did was wrong.

What it does *not* do is preserve what they typed. Every refusal on the Intake form
travels back as a code on the query string and nothing else — deliberately, because a
name and a number are not going in a URL — so the form re-renders blank here exactly as
it does for a missing name. The copy says so rather than promising otherwise.

*Open:* whether one lost answer is worth a refusal code of its own, or whether the
ordinary "please try again" would do. Kept because the alternative on this path is a 500.

**2. What counts as two options.** Ticket 21 says nothing about duplicates. Ticket 03's
data model has `unique (ministry_id, label)`, which is exact. The boundary is stricter
in two ways, and both are rules about what a *Person reading the form* would see:

- **Case-insensitive.** `Career and calling` and `career and calling` are refused as one
  option. Two choices differing only in capitalisation are not two choices to whoever is
  reading them. An option compared against itself is not its own duplicate, which is what
  still lets an Admin fix an option's own capitalisation.
- **Internal whitespace collapsed.** `Career  and calling` is stored as
  `Career and calling`, so a double space is read as the typo it is rather than as a
  second option that renders identically.

*Open:* whether a Ministry should ever be *stopped* from offering two similarly-worded
options, or merely warned. The strict reading was taken because the loose one produces a
form nobody meant to publish, and the database index cannot express either rule.

### Superseded by ticket 34

Where the screen lives changed on 2026-09-04.
The list is the goals question card on Intake forms, edited through the routes under `/intake-forms/goals/`, and there is no page of its own.
The order is set by dragging since decision 6 of ticket 34, posted whole as `goal.reorder`; *move one place* remains as `goal.move`, for a page whose script has not run.
