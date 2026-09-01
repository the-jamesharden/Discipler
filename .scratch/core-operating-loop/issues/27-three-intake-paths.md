# 27 — Three Intake paths: mentor, mentee, and group

**What to build:** Three ways into Intake instead of one. A path for somebody
offering to mentor, a path for somebody asking to be mentored, and a path for a
group — each with its own link and its own QR code, and each landing a Person on
the Roster the same way one form does today.

Today there is exactly one Intake form and exactly one link per Ministry
(`/intake/<ministry>`, `app/intake/form.tsx`). It asks nothing about which side of
a relationship the Person is offering to stand on, and that is deliberate in three
places: leading is a plan an Admin records on the Roster (ticket 16,
`eligible_to_lead`), relationship kind is declared at pairing rather than at Intake
(`docs/adr/0004-relationship-kind-as-capacity-declaration.md`), and
`consent_record.source` distinguishes only *how somebody arrived* — `pastor_link`
or `qr_code` — never *what they were answering*.

Three paths is therefore a product change and not a rendering one. What follows is
what is settled; the open questions below are the ones that have to be answered
before this is `ready-for-agent`.

## What is settled

**Three links, three QR codes.** A pastor sends whichever one fits the
conversation, and a leaders' meeting gets a different code on the screen than a
Sunday bulletin does. Ticket 23 builds the Admin surface that hands out one link
and one code; this ticket turns that surface into three, and each has to be
labelled clearly enough that an Admin printing one for a room knows which one they
printed.

**The questions are substantially the same across all three.** This is not three
forms that happen to share a name — it is one set of questions with the path
recorded alongside the answers. Every path asks, without exception:

- **Age**, as a band and never an exact age — the age constraint is expressed in
  bands (ADR-0001)
- **Gender** — the absolute pairing constraint (ADR-0001), a Ministry may disable
  it only in settings (ticket 22)
- **First time** — whether this is the Person's first time (see the open question
  on wording, below)
- **Schedule availability** — the grid, which is the dominant ranking input
- **What they are hoping to get out of it** — the Ministry's own Discipleship Goal
  options (ticket 21), which is the suggestion tiebreaker (ADR-0001, as amended)

Four of those five are already asked today. The first-time question is new.

**A path is recorded, not inferred.** Whatever the paths turn out to mean, which
one a Person answered is a fact about their Intake and belongs on the consent
record beside `source` — a separate column, because `source` answers *link or QR*
and would stop answering it cleanly if three paths were folded into the same enum.
Three paths times two routes is six combinations and one of them is *the mentor
path, scanned off a poster*.

## Open — these are the product decisions, not implementation detail

**Does the mentor path make somebody eligible to lead?** Ticket 16 made
`eligible_to_lead` a plan an Admin records, explicitly not a fact about the Person
and explicitly not self-declared. A mentor path that silently sets it takes that
decision away from the Admin; a mentor path that sets nothing is a form whose
answer changes nothing, which is worse. The likely answer is that it is a *signal
on the Roster* the Admin still acts on — but that is a decision, and it needs
saying before anything is built.

**What does the group path do?** ADR-0004 makes relationship kind a capacity
declaration made at pairing. A Person who answered the group path has expressed a
preference for a group before any relationship exists, and the product currently
has nowhere to put that. Whether it is a preference the pairing screen shows, a
constraint on what an Admin may create, or something else, is unsettled. Ticket 25
(group gender binding) is adjacent and unresolved.

**What is the first-time question actually asking, and what consumes it?** First
time being discipled, or first time mentoring, or both depending on the path? A
question asked of every Person on every path and read by nothing is a question that
should not be asked. It needs its exact wording and at least one place that reads
the answer — the pairing surface and the Leader's first check-in are the obvious
candidates.

**Do the paths differ in anything besides the recorded path?** The five questions
above are non-negotiable on every path. Whether any path asks a sixth question of
its own is unanswered, and the answer decides whether this stays one form component
with a path argument — the way `app/intake/form.tsx` is already one component for
two routes — or genuinely becomes three.

**What happens to the single link that exists now?** People have it. It is in
bulletins and in sent texts. Whether it keeps working and records an unspecified
path, or redirects to a chooser, is a migration question with a compliance edge:
consent records already written under it say nothing about a path and must not be
backfilled with a guess.

**Blocked by:** 03, 23

**Status:** needs-triage

- [ ] Three Intake links exist, one per path, each reaching a form
- [ ] Each path has its own QR code on the Admin surface, labelled so the Admin
      knows which one they are printing
- [ ] Every path asks age band, gender, the first-time question, availability, and
      the Discipleship Goal
- [ ] Which path a Person answered is recorded on their consent record, separately
      from `source`
- [ ] Answering the mentor path does not by itself make anybody eligible to lead
- [ ] Consent records written before this ticket are not backfilled with a path

## Comments

### Raised during ticket 23, 2026-08-31

Ticket 23 asked only for the Admin surface that hands out the Intake link and its
QR code. Asked for three codes instead of one, the product-definition answer is
that three codes require three paths, and three paths are not a surface decision —
they touch the consent record, the Roster, eligibility and pairing. Split out
rather than folded in, so ticket 23 ships the surface it was written for and this
one gets the decisions it needs.
