# 14 — Material Assignment data model

**What to build:** The Week-by-Week History records which Material a relationship was working through during each week, so the Ministry can tell later what was in use when.

Material is assigned to the **relationship**, never to a Person — a Leader in two relationships may be working through two different things. One Material at a time. An assignment has a start date and an open end; assigning a new one closes the previous. Periods never overlap and never leave gaps.

When a Material changes mid-week, the week belongs to whichever was assigned **at the moment the check-in was answered**, because that is the meeting being reported on. A week is never split across two Materials.

**The assignment interface is deferred from V1; the data is not.** This ticket builds the model and the attribution rule with no admin UI. The history must be complete and correct from the first week of the pilot because it cannot be reconstructed afterwards, and getting it wrong silently invalidates every future report. Verified by tests rather than by a screen.

**Blocked by:** 08a, 08b

**Status:** shipped

- [x] Material Assignment attaches to a relationship, never to a Person
- [x] Exactly one Material is assigned at a time
- [x] Assigning a new Material closes the previous period
- [x] Assignment periods never overlap and never leave gaps
- [x] A week is attributed to the Material assigned when the check-in was answered
- [x] A Material changing mid-week never splits that week across two Materials
- [x] No admin assignment UI is built

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

- [x] Accepting a relationship opens a Material period with a null material
- [x] The first real assignment closes the null period rather than starting the history
- [x] A week before any assignment attributes to the null period, not to nothing
- [x] Assigning a Material at the instant of acceptance yields a zero-length null period rather than an error

### Settled during implementation — what a Material *is*

The ticket said nothing about the Material itself as data, and no other ticket owns
one, so the gap was put to the product owner rather than resolved from the source
documents.

A Material is a **row on the Ministry's own list**, like a Discipleship Goal, and it
carries **typed text, an uploaded PDF, or both**. A title with neither is refused: it
would be assignable, it would attribute weeks, and a Leader opening it would find an
empty page.

A row rather than free text on the assignment, for the reason ticket 13 gave for
`ended_outcome` standing beside its free-text reason: *how many relationships worked
through Romans* is asked in counts, and two spellings are two answers no later care
repairs.

The PDF lives in a private `material` storage bucket keyed `<ministry_id>/<uuid>.pdf`,
with Ministry-scoped policies on `storage.objects`. **The route that uploads one is
not built** — that belongs with the assignment interface this ticket defers. The
columns and the bucket land now so the model needs no second migration when it does.

- [x] A Material is a Ministry-owned row, never a string on the assignment
- [x] A Material carries typed text, a PDF, or both, and never neither
- [x] PDFs live in a private bucket one Ministry cannot read another's from
- [x] No upload route is built

### Settled during implementation — which instant attributes a week

*The moment the check-in was answered* is singular and a check-in is several
messages: did you meet, how was it, what happened. So the instant is the **first**
reply that landed for that relationship in that conversation — the moment the Leader
started reporting the meeting. A Material changed between two replies therefore moves
neither of them, which is *a week is never split* holding in the one case that could
break it.

An **unanswered** week has no such moment and still has to be attributed, because the
history has to be complete and an unanswered week is exactly the kind a later report
must not silently drop. It falls back to the instant its conversation opened.

`relationship_weeks` gained a `first_answered_at` column beside the `answered_at`
ticket 10 counts silence by. The rule itself is `materialForWeek` in
`src/domain/materials.ts`, not SQL — the same split ticket 10 made between facts in
the database and counting in a pure function.

### Deliberately not built

**A reader.** There is no screen, and ticket 15 owns the one that will show a Leader
their relationship's Material. `public.material_periods` and `materialForWeek` are the
model and the rule; the wiring between them belongs to whatever first asks.

**A period closed by an ending.** An assignment has an open end by definition, and a
relationship that has ended has no further week for the open period to cover. Nothing
closes it, and nothing needs to.

**An ADR.** Raised in review and declined on the bar CLAUDE.md sets, which asks for a
decision that is hard to reverse. Attribution is not: the periods and the prompts are
both stored, and which instant names a week is a derivation over them, so changing
`materialForWeek` re-answers every week ever recorded. The decisions here that *are*
hard to reverse -- the opening period being a row, and the backfill -- were settled in
this ticket before implementation started.

### For a human

Every relationship accepted before this migration was backfilled with an opening
period at its `accepted_at`. Relationships nobody accepted got none, deliberately —
there is no week before acceptance for a period to cover.

`app.assign_material` answers `material_history_not_open` for an accepted relationship
with no periods, which no production path can produce and which the store treats as a
defect rather than a refusal. If it is ever seen, the history has genuinely broken and
the answer is a backfill, not a wider function.
