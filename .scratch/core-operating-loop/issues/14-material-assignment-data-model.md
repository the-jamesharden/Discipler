# 14 — Material Assignment data model

**What to build:** The Week-by-Week History records which Material a relationship was working through during each week, so the Ministry can tell later what was in use when.

Material is assigned to the **relationship**, never to a Person — a Leader in two relationships may be working through two different things. One Material at a time. An assignment has a start date and an open end; assigning a new one closes the previous. Periods never overlap and never leave gaps.

When a Material changes mid-week, the week belongs to whichever was assigned **at the moment the check-in was answered**, because that is the meeting being reported on. A week is never split across two Materials.

**The assignment interface is deferred from V1; the data is not.** This ticket builds the model and the attribution rule with no admin UI. The history must be complete and correct from the first week of the pilot because it cannot be reconstructed afterwards, and getting it wrong silently invalidates every future report. Verified by tests rather than by a screen.

**Blocked by:** 08a, 08b

**Status:** ready-for-agent

- [ ] Material Assignment attaches to a relationship, never to a Person
- [ ] Exactly one Material is assigned at a time
- [ ] Assigning a new Material closes the previous period
- [ ] Assignment periods never overlap and never leave gaps
- [ ] A week is attributed to the Material assigned when the check-in was answered
- [ ] A Material changing mid-week never splits that week across two Materials
- [ ] No admin assignment UI is built

## Comments

### Settled — the first period is a real period with no material

*Periods never leave gaps* includes the time before a Ministry has assigned anything. On
acceptance a relationship opens a Material period with a **null material**, closed by
its first real assignment.

A row, not an absence of rows. A report asking which Material was in use in a given week
then gets an answer saying *none*, which is a fact, rather than no row at all, which is
indistinguishable from a defect — and this ticket's whole justification is that the
history has to be complete from the first week because it cannot be reconstructed
afterwards.

The period starts at `accepted_at` rather than at creation: no check-in week exists
before acceptance, and a period covering time no meeting could be reported in is noise. A
Ministry assigning immediately gets a zero-length null period, which the existing
constraints already permit.

The glossary entry for Material Assignment was also wrong — it said the association
between a material and *the person or group* using it, which contradicts this ticket's
first rule. Corrected in `CONTEXT.md`.

- [ ] Accepting a relationship opens a Material period with a null material
- [ ] The first real assignment closes the null period rather than starting the history
- [ ] A week before any assignment attributes to the null period, not to nothing
- [ ] Assigning a Material at the instant of acceptance yields a zero-length null period rather than an error
