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

**Status:** shipped

- [x] `/intake/<ministry>` opens the group form and the link never breaks
- [x] The form asks gender, age band, availability, which group, then name, mobile, email and the two consents, in that order
- [x] The Discipleship Goal and the first-time question are not asked on this path
- [x] A group carries a name an Admin types when forming it and may edit from the Roster
- [x] The dropdown lists accepted, open, named groups, filtered on declared gender regardless of the Ministry setting, mixed groups always
- [x] A Ministry with no eligible group, or a Person every group is closed to, sees a page saying so with a link to the discipleship wizard
- [x] A group is open by default; an Admin may set it to require approval when forming it and change that later
- [x] Submitting for an open group writes the membership and a ministry event with the Person as actor, in the same transaction as the Intake
- [x] Submitting for an approval-required group raises a `group_join_requested` Follow-Up Item and writes no membership
- [x] An Admin admits from the item, which adds the Participant and resolves the item in one act, or resolves it alone
- [x] The joiner is sent a Welcome Message worded for a group and nothing on joining, admission or decline
- [x] The Leader is texted on every join, naming the Person's first name and the dashboard link, never a number
- [x] The Leader's Starter Message carries the dashboard link
- [x] The done page names the group, and the Leader's first name for an open group
- [x] A Person already in the group they ask for gets the done page and no write; an open item is not duplicated for the same Person and group
- [x] `consent_record.intake_path` records `group` for submissions made here
- [x] Consent records written under this link before this ticket keep a null path and are not backfilled
- [x] The tokenized reopen link still serves the single-page form
- [x] An ADR records the self-join decision and `docs/product-flow.md` and `docs/product-rules.md` no longer say groups are formed only manually

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

### Triaged, 2026-09-01

Grilled to an answer in five rounds.
Every item under *Open*, the gap the implementer found, and the questions those answers opened are settled below.
Decisions the docs contradict are marked, and the ADR the last criterion asks for records them.

**A group has a name, typed by an Admin.**
A nullable `name` on `relationship`.
The pair screen requires it when forming a group and it is editable from the Roster afterwards.
It is a label, not a ministry event, so editing overwrites no history.
Groups that exist today keep a null name, are left out of the dropdown, and keep the check-in's Participant listing until an Admin names them.
A named group's check-in question uses the name, which is the answer to the open question `docs/open-questions.md` parks under *What a group check-in calls the group*.
The name is public: the naming field says it appears on the group link, and the dropdown shows nothing else about a group.

**Picking an open group joins it.
A pastor may set a group to require approval instead.**
This contradicts `docs/product-flow.md` (*groups are always formed manually*) and `docs/product-rules.md` (*the pastor can manually create groups*), and is decided anyway: a Person who chose a group has chosen, and the pastor's judgment is kept as a per-group switch rather than a gate on everyone.
`relationship.join_requires_approval`, boolean, default false, set on the pair screen beside the name and the declared gender, editable from the Roster.
It is not a safety binding, so it is not immutable.
An open group's submit writes the membership row and a ministry event in the same transaction as the Person, the submission and the consents, with the Person as the actor, because they are.
Ticket 25's gender trigger runs at the insert as it does for every membership.
An approval-required group's submit raises a `group_join_requested` Follow-Up Item on Care Needed showing name, gender, age band, the group, and when they asked.
An Admin admits from the item, which is a new command adding a Participant to an open group and resolving the item in the same act, or resolves the item alone.
Admitting refuses if the group has ended, and the Admin closes the item by hand as with any item about a relationship that is gone.
Admin tier only.
A self-join into an open group raises nothing for the Admin: nothing is left to decide.
No Roster signal: the item is the surface.

**Which groups, and the filter.**
Accepted, not ended, and named.
Gender is asked on the screen before the group screen and the list filters on `declared_gender` always; mixed groups always appear.
`suggest_gender_match` has no bearing, because the spec scopes that setting to one-to-ones and says no setting makes a declared single-gender group mixed.
A Ministry with no eligible group, and a Person every group is closed to, see the same page: not taking group sign-ups yet, with a link to the discipleship wizard.
No silent fallback, because a fallback asks a Goal question the Person did not come to answer.

**What is asked.**
Gender and age band, because the Admin admitting and the Leader receiving want both and the age rule governs suggestion only.
Availability, because the Leader dashboard draws every member's availability on its grid and a joiner without any is a blank row.
The Goal and the first-time question are dropped: nothing on this path reads either.

**Who hears what.**
The joiner is sent the Welcome Message on submit, worded for a group and promising no match, because it is the consent receipt and the A2P first contact rather than a join notification.
They hear nothing on joining, on admission, or on decline: declining is a conversation the Admin has, per ADR-0010.
The Leader is texted on every join, direct or admitted, naming the Person's first name and the dashboard link and never a number; a Leader without standing SMS consent gets nothing, as with every send.
The Leader's Starter Message gains the dashboard link.
Nothing before acceptance changes: the invitation text and page stay as they are, and Participants' numbers stay behind sign-in and each Person's contact-sharing consent.
The done page names the group, and the Leader's first name for an open group, so the Person recognises the call; for an approval-required group it names no Leader.

**Repeats.**
A Person already in the group they ask for gets the done page and no write.
An open item for the same Person and group is not duplicated.
A second request for a different group is legitimate: a Participant may be in any number of groups.

**Left as they are.**
The tokenized reopen link keeps serving the single-page form, recording a null path; it exists to correct a number and it works.
A group still needs at least one Participant at formation; an empty group for the link to fill is its own ticket, because every message downstream names Participants.
No size cap: a pastor who wants to stop growth sets the group to require approval.

### Shipped, 2026-09-01

Five decisions the triage left to the implementation, each recorded here because a reader of the ticket would otherwise expect something slightly different.

**The Admin acts from the Roster, because Care Needed has no page.**
The triage says the request is a Follow-Up Item on Care Needed and the Admin admits from the item.
The item is exactly that: a `group_join_requested` row in `follow_up_item`, which the Care Needed reader lists like any other kind.
But nothing in `app/` renders Care Needed and no route resolves an item -- the view exists as a reader and a test, and the Admin surface was specified only as far as the loop required.
So the Roster carries a panel, *Waiting to join a group*, beside the held-import-rows panel that already works this way, with Admit and Decline on each request.
Decline is the existing `follow_up.resolve` command, reached from a surface for the first time.
When Care Needed gets its page, the panel is its to take; the ADR says so.

**Groups are named and configured from a Groups panel, not from each member's row.**
A group is on the Roster once per member, and a rename form on every row would be the same form several times.
The panel lists every live group, named or not -- an unnamed one says so, because an unnamed group is on no link -- with the name and the switch on one form and one save, like the settings form.
It reads through `public.ministry_groups`, a function rather than a query, for the reason `groups_open_to_join` is one: *is this a group* is the capacity question ADR-0004 fences to the database, and neither reader names the literal.

**One-to-ones now hold one Participant in the database.**
Joining is the first path that adds a membership after formation, and until now nothing stopped a second Participant landing on a relationship formed as a one-to-one because nothing could put one there.
`one_to_one_one_open_participant` is a partial unique index of the same kind as the two caps ADR-0004 named, and the only reason the join path's *groups only* is a rule rather than a filter.

**The Intake path literal is fenced, not free.**
`relationship-kind-fence.test.ts` forbids the word `group` in application code, and the Intake path is that word.
It appears once, in `src/domain/intake.ts` as `GROUP_PATH`, and every comparison goes through the constant; the fence allows that file that literal and nothing else, and still refuses it the other three patterns.

**The wizard machinery was split out rather than copied.**
Two wizards ask different questions in a different order and share every stepping rule, so `wizard-machine.ts` is the rules and each wizard is a table of screens handed to it.
The discipleship wizard's exports are unchanged and its tests did not move.
The group form's list of groups is not known until the page is served, so its reader takes the offered list in and checks the answer against that; a group nobody was offered never survives the read.

Two smaller notes.
The Welcome Message now says what it may promise: `a_match` on the paths where an Admin pairs people, `nothing` on the group path, where the Person has already named where they are going and hears nothing about it by text.
And the QR code on the original link is captioned *Join a group*, because that is what it opens now, and a room reads the caption.

### Review, 2026-09-01

Three things the review caught, all fixed, and three it raised that were kept.

**A one-to-one kept a name it was given.**
The glossary says a one-to-one has none, and the boundary was storing whatever the pair form carried, so a pair named *Tuesday* was asked *did you meet with Tuesday this week*.
A name and the approval switch are now dropped for a one-to-one rather than kept, which is the one place this ticket departs from the declaration's rule of holding an Admin to what they typed: a name on a pair changes what the weekly question calls two people, and a declaration on a pair changes nothing.

**The done page promised a request that was never raised.**
Somebody already in a guarded group who submitted again was told they were on the list, because the route read the group's switch rather than what the submission did.
Both the group form's route and the admit route now read the command's effects: a request is *requested* only when an item was raised, and the Roster says a Leader was told only when somebody actually joined.

**Three doc comments had been orphaned** by code inserted between them and the thing they described.

Kept, with the reason.
`relationship.group_configured` is appended to history although the triage says a rename overwrites no history: it overwrites none, and who opened a door and when is a question a Ministry may need to answer.
The pair screen puts the name an Admin typed back into the field on a refused submission, which is the one place a typed value travels in a URL: it is the Admin's own text on an authenticated page, it is put into a field rather than rendered as text, and asking them to retype it beside their selection would be the refusal costing more than the mistake.
And the group wizard's list of groups is empty until the page hands it in, so a caller that forgets the list reads no group at all; that is the safe direction, and the page and the route are the only two callers.
