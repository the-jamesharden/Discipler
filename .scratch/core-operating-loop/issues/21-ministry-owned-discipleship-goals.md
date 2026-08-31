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
stay `Ready to Pair`, ranked on availability alone until they answer again. The only
surviving record of what was lost is the `discipleship_goal.removed` event, which
carries the wording and how many answers went with it.

**Where the screen lives.** `/settings/goals`, linked from the Roster. Ticket 22's
settings surface is three sections of one form about how Discipler runs; this is a
list editor and is deliberately its own page rather than folded into that form.
