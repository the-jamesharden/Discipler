# 14 — Material Assignment data model

**What to build:** The Week-by-Week History records which Material a relationship was working through during each week, so the Ministry can tell later what was in use when.

Material is assigned to the **relationship**, never to a Person — a Leader in two relationships may be working through two different things. One Material at a time. An assignment has a start date and an open end; assigning a new one closes the previous. Periods never overlap and never leave gaps.

When a Material changes mid-week, the week belongs to whichever was assigned **at the moment the check-in was answered**, because that is the meeting being reported on. A week is never split across two Materials.

**The assignment interface is deferred from V1; the data is not.** This ticket builds the model and the attribution rule with no admin UI. The history must be complete and correct from the first week of the pilot because it cannot be reconstructed afterwards, and getting it wrong silently invalidates every future report. Verified by tests rather than by a screen.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Material Assignment attaches to a relationship, never to a Person
- [ ] Exactly one Material is assigned at a time
- [ ] Assigning a new Material closes the previous period
- [ ] Assignment periods never overlap and never leave gaps
- [ ] A week is attributed to the Material assigned when the check-in was answered
- [ ] A Material changing mid-week never splits that week across two Materials
- [ ] No admin assignment UI is built
