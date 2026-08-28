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

**Status:** needs-triage

- [ ] An Admin can add, rename, reorder, and remove Discipleship Goal options
- [ ] Removing an option warns how many people have chosen it and that their answer
      will be lost, and does nothing until the Admin confirms
- [ ] Renaming an option keeps the answers pointing at it, because a reworded option
      is the same option
- [ ] A Ministry cannot be left with no options, since Intake could not then be served
- [ ] Goals are never shared or compared across Ministries

## Comments

### Why this is not part of ticket 03

Ticket 03 needed the options to exist so that Intake could render a required field.
It did not need an Admin to be able to change them, and the settings surface is a
screen that ticket otherwise has no reason to build. `docs/product-rules.md` records
the rule under *Settled: Each Ministry Owns Its Discipleship Goal Options*.

The seeded starting list carries no product meaning — it exists so a new Ministry is
never unable to serve its own form.
