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

### Picked up for implementation and returned, 2026-09-01

Picked up under `/implement` and returned without code.
The status is `needs-triage`, the six items under *Open* are labelled as the product decisions, and none has an answer recorded here the way ticket 27's *Triaged* comment recorded its answers before it was built.
The working rule is to surface an ambiguity rather than resolve it from the source documents, so this comment records what an implementer found and what a human has to decide, and nothing was built.

**A seventh gap the ticket does not name, and it is the one that stops the work: a group has no name.**
The form's one new question is *a dropdown of the Ministry's groups*, and `relationship` carries `kind`, `declared_gender` and four timestamps.
Nothing on it, or on `relationship_member`, or anywhere else, is a name or a label.
`docs/open-questions.md` already parks this under *pending review before the first pilot* as *What a group check-in calls the group*, with the decision stated as *who names a group and when: a column filled at pairing, or a label an Admin sets afterwards*.
This ticket is now the second consumer of that decision, and the two want the same thing, which is worth knowing when it is made.
A dropdown that listed groups as *Leader's name plus Participant names* would leak every member's name to an unauthenticated page, which is a stronger version of the *is every group's name public* question below, so it is not an interim answer.
Until a group has a name, no version of this form can be built.

What an implementer could and could not settle from the docs, item by item:

- **Gender filter.**
  Partly derivable.
  The spec (line 185) says *no setting makes a declared single-gender group mixed* and that the Ministry setting unconstrains one-to-ones only.
  So the dropdown filters on `declared_gender` regardless of `suggest_gender_match`, mixed groups always appear, and gender is asked before the group.
  Still a human's to confirm, because it makes this the one Intake form that branches, and because a Ministry with the constraint disabled would see the filter apply anyway.
- **Join or request.**
  Not derivable, but the docs lean one way.
  `docs/product-flow.md` (line 84) says *groups are always formed manually* and `docs/product-rules.md` (line 24) says the pastor creates them by selecting participants.
  A form that wrote `relationship_member` would contradict both.
  A request an Admin acts on is the reading consistent with the docs.
  What that request is - a new Follow-Up Item kind on Care Needed, or a new surface - is undecided and changes the size of the ticket by a lot.
- **Group names on an unauthenticated page.**
  Not derivable.
  Cannot be answered until the naming question is, because what leaks depends on what a name is made of.
- **A Ministry with no groups.**
  Not derivable, and it is every Ministry's day-one state.
  Refusing, falling back to the discipleship wizard, and saying so are three different products.
- **Availability.**
  Not derivable.
  Nothing on this path reads it unless the request surface shows it to the Admin, which depends on the item above.
  The ticket-27 test would drop it, and the `intake_submission` schema does not require it, so dropping is possible.
  Dropping the Goal and keeping availability would need a reason, since both are suggestion inputs and the ticket dropped the Goal for having no consumer here.
- **Age band and the first-time question.**
  Not derivable.
  Neither has a consumer named on this path.
  Age band also feeds the `suggest_max_age_band_gap` check, which governs suggestion only and never runs for a group.

**One item ticket 27's review handed here is also open.**
Its *The reopen link does not ask the side* finding says the tokenized reopen link renders the single-page form, and that converting it to serve whichever form a Person last answered *belongs with ticket 29, which is already changing what `/intake/<ministry>` serves*.
This ticket does not mention it.
Once `/intake/<ministry>` is the group form, the reopen link has to serve something, and which form that is needs a decision.

**What could be built without a decision** is small: the `group` member of the `intake_path` enum, and the non-backfill of earlier records, which is a non-action.
Neither is worth a commit ahead of the rest.

Recommended next step: triage in the ticket-27 pattern - decide the group name first, then the join-or-request shape, then the rest follow.
Status left at `needs-triage`.
