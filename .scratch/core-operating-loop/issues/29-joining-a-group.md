# 29 — Joining a group: the Intake path for small groups

**What to build:** The existing `/intake/<ministry>` link becomes the Intake form
for somebody who wants to join one of the Ministry's groups. It asks the same
things the discipleship wizard asks, minus the Discipleship Goal, and adds one
question in its place: *which group would you like to join?* — a dropdown of the
Ministry's groups.

Ticket 27 built the discipleship wizard at its own route and left this link alone.
This ticket converts it. That ordering is deliberate: the link is already in
bulletins and in sent texts, so it keeps working throughout, and nobody who has
the old link ever reaches a dead page.

## Why the Goal question goes

The Discipleship Goal is the suggestion tiebreaker (ADR-0001 as amended, ticket
21). It exists to rank a Person against candidates when the product is choosing
for them. Nobody is choosing here — the Person picked a group. A question whose
only consumer is a ranking that does not run is a question that should not be
asked, which is the same test ticket 27 applied to the first-time question.

That leaves a real gap worth naming rather than solving here: a Person who joins
a group and later moves into one-to-one discipleship has no Goal recorded, and
the pairing surface will have one fewer input for them than for everybody else.
Reopening Intake (ticket 16) is the escape hatch; whether that is good enough is
below.

## Open — these are the product decisions

**Which groups appear, and does gender filter them?** Ticket 25 binds a group's
gender to its members. A male-only group offered to a woman is the absolute
pairing constraint (ADR-0001) broken at the point of asking. The mechanical
consequence is that gender must be asked *before* the group question, and the
dropdown must filter on it — which makes this the one Intake form that genuinely
branches rather than merely stepping. Whether a Ministry that has disabled the
gender constraint in settings (ticket 22) sees an unfiltered list is part of the
same decision.

**Does picking a group join them, or ask to?** An Intake form that writes a
`relationship_member` row puts a stranger into a group without anyone deciding.
The product rule is that pastoral judgment stays in the loop, which points at a
request an Admin acts on — but that is a new surface, a new queue and a new
notification, and it needs saying before anything is built.

**Is every group's name public?** The link is unauthenticated and anybody may
open it. A dropdown of every group in the Ministry lets a stranger enumerate them
by name. Probably acceptable and possibly desirable; not decided.

**What does a Ministry with no groups show?** An empty dropdown is a form that
cannot be submitted. Whether the link refuses, falls back to the discipleship
wizard, or says something, is unanswered — and this is the state every Ministry
is in on day one.

**Is availability still asked?** A group already meets at a fixed time, so the
grid does not choose anything the way it does for a pairing. It may still be
worth having, and it may be worth *showing the group's time* instead. If the
answer is that it is asked and read by nothing, the ticket-27 test says drop it.

**Are age band and the first-time question asked here?** Both are cheap and both
have consumers on the discipleship path. Neither obviously has one here.

**Blocked by:** 25, 27

**Status:** needs-triage

- [ ] `/intake/<ministry>` opens the group form and the link never breaks
- [ ] The form asks which group the Person would like to join
- [ ] The Discipleship Goal question is not asked on this path
- [ ] `consent_record.intake_path` records `group` for submissions made here
- [ ] Consent records written under this link before this ticket keep a null
      path and are not backfilled

## Comments

### Split out of ticket 27, 2026-09-01

Ticket 27 was written as three Intake paths — mentor, mentee and group. Mentor
and mentee collapsed into one wizard with a first question, because they are two
answers rather than two audiences. Group did not collapse with them: it asks
different questions, drops one, depends on ticket 25's group gender binding, and
raises a "who admits this person" question the discipleship path does not have.

The original ticket left "what does the group path do?" open on the reading that
ADR-0004 puts relationship kind at pairing, and a Person expressing a group
preference at Intake had nowhere to go. That reading is now settled: this is not
a preference to be weighed later, it is a Person naming a specific existing
group. Whether naming it admits them is the open question that replaces it.
