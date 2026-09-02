# Discipler — Open Questions

The original seed list of 78 questions was worked through in the grilling session. Most are now settled and recorded in `docs/product-rules.md`, `CONTEXT.md`, `docs/adr/`, and the surface documents. This file now holds only what genuinely remains.

## The core loop is settled

Every question about intake, suggestion, acceptance, the check-in rhythm, relationship state, care surfacing, and the two dashboards has been resolved and recorded.

## Resolved: inbound keyword routing

The three inbound-keyword gaps are closed and recorded in `docs/product-rules.md` and `docs/check-in-rhythm.md`:

- **Which relationship a keyword applies to** — resolved by eligibility for the requested action. One eligible relationship applies directly, several draw a numbered menu, none draws a plain reply. The target is never inferred from Check-In Sequence position.
- **How a leader chooses a pause duration** — a single confirmation exchange carrying the default and the alternatives.
- **`START` carrying two meanings** — resolved by renaming rather than arbitrating. `START` is carrier-level re-opt-in only; `RESUME` resumes a paused relationship.

## Resolved: does leading a relationship make a person `Paired`?

**No.** Participation Status describes only whether a person is being discipled, so `Paired` means holding at least one open participant membership and leading never sets it. Role is a property of relationship membership rather than of a person, and a person may lead and be discipled at the same time. Recorded in `docs/product-rules.md` under *Roles Are Relationship Memberships, Not Properties of a Person*.

## Resolved: what a Person who is Paired *and* opted out reads as

**`Opted Out` wins**, which is what ticket 02 shipped. An Admin scanning the Roster
needs to see what the Person told the Ministry before they see what the Ministry
arranged for them.

The alternative reading was defensible and is now rejected on a fact that was not in
front of it: nothing is hidden either way. Opting out does not end a relationship, and
the Roster carries who each Person is in a relationship with in its own column, so an
opted-out Person's row still shows their relationships. The choice was only ever about
which fact the status column carries, not about which fact the Admin can see.

Participation Status values are therefore not strictly disjoint in what they describe.
That was already true of `No Intake Submitted`.

Settled 2026-08-28. Recorded in `docs/product-rules.md` under *Settled: Opted Out
Outranks Paired on the Roster*.

## Resolved: the Welcome Message survives *no SMS before pairing approval*

**It sends.** The rule means *no relationship SMS before pairing approval*, and the
Welcome Message is not relationship messaging: it goes to a Person who has, seconds
earlier, ticked a box on the Intake form agreeing to be texted, which is the thing
the rule exists to protect. Nothing about anybody else's pairing is disclosed in it,
and it names no other congregant.

The stricter reading was available and was rejected, because under it the SMS consent
a Person had just given would first be acted on days or weeks later, by a message
about a stranger they had not been told to expect.

Two things follow, and both are built:

- The Welcome Message is **first-ever contact**, so it carries the A2P compliance
  prefix stacked in front of the Ministry prefix, and the opt-out and rate
  disclosure: `Discipler: Riverside Chapel: ... Reply STOP to opt out, HELP for help.`
- It is the **only** message that precedes a pairing approval. Anything else reaching
  a congregant before their Leader has accepted is a regression, and the rule holds
  unchanged for the mentor and mentee reveals.

Settled 2026-08-27 while implementing ticket 03. Recorded in
`docs/product-rules.md` under *Settled: The Welcome Message Precedes Pairing*.

## Open: what would enforce the messaging order?

Separately from which rule holds: nothing enforces the ordering today. What is
enforced is the consent floor -- `outbound_message` refuses any recipient with no SMS
consent record, which an imported Person cannot have. Ordering relative to a pairing
approval is not enforced anywhere, and is presently a property of the fact that no
code sends anything yet.

The obstacle is that `outbound_message` carries no relationship, so the database
cannot see which approval a message is supposed to follow. Deciding this means
deciding whether that link belongs on the message or whether the ordering is the
sending layer's to keep.

## Open: how does a Ministry import an international leader's number?

International leaders have to work. They do today, on one condition: `asPhoneNumber`
accepts any E.164 number carrying a leading `+`, so `+447700900123` imports
unchanged. What it refuses is a *bare* digit string that is not North American --
`447700900123` with no `+` is rejected as `phone_unreadable`, because nothing
distinguishes it from a mistyped North American number without inventing a country
code for somebody.

So the requirement is met wherever the spreadsheet carries `+`. What is undecided is
whether an Admin exporting from another church-management system can be asked to
ensure that, or whether the importer should do something else -- a per-Ministry
default region, a prompt, or something else again. Nothing tests an international
number today either way.

## Open: does an unreadable email refuse the whole row?

Ticket 02 refuses it, so a Person with a readable name and a readable number is kept
off the Roster by one bad cell. That follows *report, never drop*: the Admin fixes the
cell and re-imports, and an address they meant to give is not Discipler's to discard
on their behalf.

The opposite reading is defensible and is arguably better -- import the Person, report
the cell -- because email is optional at Intake and the import needs only a name and a
number. It has not been taken because the report has no way to say *imported, with a
note*: a row is either added or refused, and inventing a third outcome is a change to
what the whole report means. Settle it alongside ticket 16's Roster completeness work.

## Resolved: the suggestion tier cutoffs

*Meaningful overlap* was never defined, so nothing separated Excellent fit from Good
fit. The grid is seven days by five blocks, so an overlap is a count out of
thirty-five shared cells, and the tiers are that count:

- **Excellent fit** — 4+ shared cells, spanning at least 2 distinct days
- **Good fit** — 2–3 shared cells
- **Recommended** — exactly 1
- **No Schedule Overlap** — zero

The two-distinct-days requirement on Excellent fit is the part that earns its keep:
four blocks all falling on one Saturday is most of that Saturday rather than four
separate chances to meet, and should not read as strongly as four cells spread across
a week.

Settled 2026-08-27. Recorded in `docs/product-rules.md` under *Settled: Suggestion
Tiers Are Counts of Shared Cells*.

Reopened 2026-09-01 by `docs/adr/0018-the-hourly-grid.md`; see *Open: the suggestion tier cutoffs on an hourly grid* below.

## Open: the suggestion tier cutoffs on an hourly grid

The cutoffs above - Excellent fit at 4+ shared cells across 2 distinct days, Good fit at 2-3, Recommended at exactly 1 - were counts out of thirty-five.
On 2026-09-01 the grid became seven days by twelve one-hour slots, 8am to 8pm, and a count is now out of eighty-four; see `docs/adr/0018-the-hourly-grid.md`.
The same numbers read differently against the larger denominator: two people who are both free all Saturday now share twelve cells where they shared one block before, and four shared hours is a much smaller fraction of a week than four shared blocks was.
Nothing here decides what the new cutoffs are, and the ones recorded in `docs/product-rules.md` are marked as reopened rather than replaced.
Ticket 04 cannot ship until they are re-decided.
This is decision 11 of ticket 31.

## Resolved: what the Discipleship Goal does now

**It is a tiebreaker.** The Goal orders candidates within a tier and never determines
which tier they land in. ADR-0001's goal condition on Excellent fit is dropped, and the
ADR is amended rather than superseded.

Gating was the reading that contradicted ADR-0001, not the one that departed from it.
Under gating a pair with six shared cells across four days and a differing goal is
capped at Good fit, sitting beside a pair with two cells and a matching goal — the Goal
outranking availability at the tier boundary, which the same ADR forbids in the sentence
*availability overlap is always dominant*.

The reason sentence carries the goal only where it matches: *"Four shared time slots.
You both selected Career and calling."* against *"Four shared time slots."* alone. The
card never names a mismatch.

This unblocks ticket 04's tier tests and closes the ADR conflict flagged in the
core-operating-loop spec header.

Settled 2026-08-28. Recorded in `docs/product-rules.md` under *Settled: The Discipleship
Goal Is a Tiebreaker, Not a Tier Gate* and in ADR-0001's amendment.

## Resolved: which way the age band constraint points

The constraint limits how much **older** a Participant may be than their Leader and
limits nothing else. There is no limit below: a 65+ Leader with an 18-24 Participant is
five bands down and permitted.

`suggest_max_age_band_gap` now has a stated unit -- *the number of age bands a
Participant may be above their Leader* -- with a default of `1`, which is ADR-0001's
original rule and permits a 25-34 Leader with a 35-44 Participant. A Ministry wanting
*never older than their Leader* sets `0`.

The competing reading, *younger participant, older leader*, is therefore a Ministry
configuration rather than a product rule, and settling this required overturning
neither. What was actually missing was the word *above*: an integer with no stated
direction is read as symmetric by whoever implements it next, and a symmetric reading
excludes most of a ministry's real pairings.

Settled 2026-08-28. Recorded in `docs/product-rules.md` and in ADR-0001's amendment.

## Resolved: when the check-in sends, and what a week is

Both were unspecified, and neither could be settled alone. `checkin_day` (0–6) and
`checkin_hour` are Ministry settings against a Ministry timezone, clamped to 8am–9pm
local by a database check constraint. The cadence is read at enqueue time and stamped
on the outbound row; an edit affects future periods only and never cancels or
reschedules an enqueued message. The week is the ISO week in the Ministry timezone,
defined independently of the check-in hour, so a cadence edit cannot silently corrupt
the consecutive-unanswered and consecutive-not-meeting counters.

Nullable `checkin_day` and `checkin_hour` are added to `relationship` now and left
null; the dispatcher reads `coalesce` over them from the first line of code.
Per-relationship cadence is not surfaced in V1.

Settled 2026-08-27. Recorded in
`docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.

## Resolved: where Ministry-level settings live

There was no settings surface and no timezone anywhere in the product. Ticket 22 adds
one surface with three sections in one form — **Ministry** (display name, timezone,
`from_name`), **Language** (`leader_noun`, `participant_noun`, with a live message
preview), and **Pairing** (`suggest_gender_match`, `suggest_max_age_band_gap`, and the
check-in day and hour).

Message structure, reply tokens, and the opt-out footer stay out, and are not rendered
as disabled fields either — a greyed-out box invites a request to enable it.

This moves the age constraint from *fixed at ten years for V1* to a configurable band
gap, which is the unit it was already evaluated in. Gender matching is unchanged.

Settled 2026-08-27.

## Open: pending review before the first pilot

- **A2P compliance requirements have not been checked against a live campaign registration.** The `Discipler:` identification prefix and its trigger points are a product decision made on an understanding of carrier requirements, not a verified one. Review alongside the consent wording.
- **`docs/consent-language.md` has not had legal review**, including the `HELP` response content.
- **`checkin.start` outlives the justification it was kept for.** Ticket 08b replaced it as the weekly trigger, and ticket 11 withdrew the Admin "send one additional check-in" action it was then kept for (`docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`). It survives only as 08a's test seam, and it carries no cadence check: it can open a second sequence inside one ISO week, which sits against *One sequence per Leader per week*. That rule currently holds only because nothing routes to the command, and on the current reading nothing will. Deciding it means either withdrawing the command or giving the rule a guard that does not depend on nobody calling it.
- **The Participant reveal branch is unreachable and has not been withdrawn.** Ticket 12 stopped minting a Participant's Invitation Link and ADR-0011 settled that only a Leader is sent one, so the Participant branch of `app/invitation/[token]/page.tsx` and the Participant scoping in `src/platform/supabase/invitation-reader.ts` can no longer be reached by anything. They are kept rather than deleted, alongside an `it.skip` in `invitation-over-http.test.ts` that is now the only description of what that branch does. Deciding it means deciding whether a Participant ever gets a web surface of their own; until then the code and its test are dead weight that reads as live.
- **Cancelling a relationship leaves its `relationship_unaccepted` item standing.** Ticket 07 raised this and asked for it to be settled: a Follow-Up Item persists until an Admin acts on it, and resolving is its own recorded act with its own actor and time, so cancelling deliberately does not resolve the item — `tests/integration/cancelling-a-relationship.test.ts` asserts it. The cost is that Care Needed can list an item about a relationship that no longer exists, which is a row an Admin closes for no reason. Deciding it means choosing between the audit rule as written and a Care Needed list with nothing dead on it; if it is the latter, it is a one-line change to the cancel command.
- **Re-issuing an Invitation Link settled three more things by inference.** Ticket 06 recorded only *"Re-issuing an expired link. Nothing does it."* The implementation had to answer four questions the ticket did not, and answered them by analogy with `intake.reopen` rather than by asking. The first — whether a link that is still live is re-sent or replaced — has since been decided the other way and is settled below. Three are still nobody's decision but a human's, and each is cheap to reverse now and awkward later. (1) The text reuses the **tick's reminder wording**, so a Leader cannot tell an Admin's personal chase from the automatic one. (2) A Leader with **no phone number on file** produces nothing at all, and the Admin is told nothing was sent rather than why — as are the other cases that fall out of the same snapshot: a Leader who is opted out, one whose SMS consent does not stand, and one with no live invitation row. (3) The affordance is offered on **role and state together** — a Leader, on a relationship not yet accepted — so a Participant never sees it, per ADR-0011.
## Resolved: re-issuing an Invitation Link replaces it

Every re-issue mints a new token over the old one, expired or not, and the superseded
link opens nothing. Re-issuing is therefore the only way an Invitation Link is ever
taken back.

The first reading re-sent a link that was still live, on `intake.reopen`'s reasoning:
the commonest reason an Admin is asked is a Leader who lost the text, and minting there
breaks the message already on their phone. That reasoning does not carry across, because
the two links do not authenticate the same way. An Intake link is handed to an Admin to
pass on; an Invitation Link is texted to one number and possession of that number is the
whole of the authentication.

Which makes a wrong number the flow's highest-stakes condition, and ticket 06 says so:
*a wrong number sends that Leader's check-ins to a stranger indefinitely*.
`invitation.dispute_number` records it and — deliberately, so a forwarded link can never
re-point an account — changes nothing else. So a live credential sat on a stranger's
phone for the rest of its window and nothing in the product could end it. The trade is
now the other way round: a Leader who lost the text finds the older message dead, which
an Admin can fix with a sentence, where a stranger's live link could not be fixed at all.

Still undecided, and narrower: whether an Admin should be able to revoke a link *without*
sending a replacement.

Settled 2026-08-31. Recorded in `docs/product-rules.md` under *Settled: Leader Acceptance
Activates a Relationship*, and in `docs/adr/0012-re-issuing-a-link-replaces-it.md`.

## Resolved: what the Starter Message says, and what a Pause does to a question already out

Three decisions, taken together because the copy settled the first two.

**The Starter Message names the Leader and sends nobody's number.** *"[Church]: Great
news! You have been paired with [Leader] for discipleship, they will reach out to you
soon to set up a time to meet and kick things off!"* Somebody about to be contacted by
a stranger is owed the stranger's name; the number is a different thing and is not
sent at all, because the Leader is the one who reaches out. No outbound message in the
product now discloses a phone number, so contact-sharing consent governs one surface
only — Nudge, which reveals a number to an Admin rather than texting it to anyone.

The consequence worth naming: the send-time disclosure path — `disclosesPersonId`,
`withSharedContact`, `OutboundQueue.contactToShare` and the `discloses_person_id`
column — is now reached by no product write path. It is kept, still tested against a
forged row, and should be either given a use or removed deliberately rather than left
to rot.

**The decline link comes out of that message — and then so does the link.** It was
the Participant's only self-serve route to say the match is not right, which
reopened ticket 06's question of whether they should have one at all.

**Settled 2026-08-30: they should not.** A Participant consented to be paired at
Intake, and declining is asking them the same question again on a web page. What
they may ask for instead is a **swap**, which reaches an Admin as a request rather
than a state change — and a Participant who simply stops meeting or stops replying
has said so through the silence the care rules already read. Either way an Admin
unpairs and re-pairs, which is a pastoral decision and stays one.

So nothing mints a Participant link any more, and `match.decline` is unreachable.
Two consequences are **deliberately not** taken here, because neither is this
ticket's: withdrawing `match.decline`, its route and the `match_declined` kind is
ticket 06's work and has to leave the enum value intact for whatever history
already carries it; and a Participant-initiated swap is a capability nothing has
built — `swap_requested` is raised by nobody today, and ticket 17 still frames
`SWAP` as a Leader's keyword.

**Since built, 2026-08-31.** The second consequence is no longer outstanding: ticket 17
shipped `SWAP` from either side on the same inbound route, and `swap_requested` carries
`payload.requestedBy` so the Admin can tell which side asked. The paragraph above is kept as
the record of what was true when ticket 12 was reviewed.

**A resume gets its own sentence**, not the Starter Message: *"Your discipleship with
[Leader] has been resumed!"*, to both sides with the other side's names in it. *You
have been paired* is true on the day the match is made, and a Ministry that sent it
after a fortnight away would be telling somebody they had been matched to the person
they have been meeting all year.

Settled 2026-08-30. Recorded in ticket 12, and in `docs/product-rules.md`: the copy under *Settled: Leader Acceptance Activates a Relationship*, the resume message as a **Supersedes** note under *Settled: Pause Is Leader-Controlled, Bounded, and Visible*, and the disclosure consequence under *Settled: Consent Is Recorded, Versioned, and Enforced at Send Time*. `CONTEXT.md` gains **Resume Message** and no longer says the Starter Message is sent twice.

## Resolved: a Pause takes back a question that is already out

A paused pair gets **no next-day reminder**. The reminder is a text to somebody who has
just told their Admin they are stepping back, which is the one message a Pause exists
to stop — so the question Discipler had out is withdrawn on the first tick that notices,
rather than at the lapse a day later, and the conversation moves on to the
relationships still running.

Withdrawn, not passed over. A passed-over question is a silence the Leader owns and
`Stalled` counts; this one is Discipler's to take back, so the relationship-week it
belonged to is dropped from `relationship_weeks` entirely. That settles the spec's
*a pause never accrues silence against itself* as general rather than belonging to the
Keyword Exchange route it was written for — ticket 17 inherits the rule rather than
building it.

Settled 2026-08-30. Recorded in ticket 12, and in `docs/product-rules.md` under *Settled: Pause Is Leader-Controlled, Bounded, and Visible*, which now states the withdrawal rule as the Pause's rather than the keyword exchange's — including the half a Pause must **not** reach: a question already asked and already lapsed is a silence that had accrued before anybody stepped back.

## Resolved: who names a group, and when

Settled 2026-09-01, by ticket 29.

An Admin names a group when forming it, and may rename it from the Roster afterwards.
The name is a label and not a ministry event, so a rename overwrites no history.
The weekly question asks about a named group by name -- *did you meet with Tuesday Men's Group this week* -- and about an unnamed one, and every one-to-one, by listing the people in it, which is what ticket 08a shipped.
Groups formed before ticket 29 have no name until an Admin gives them one.

The second consumer of the name is the group Intake link, which offers a group by name and nothing else.
See `docs/adr/0017-picking-a-group-joins-it.md`.

## Resolved: provisioning a Ministry is a ministry event, and provisioning records it

A Ministry opening is the first event in its history, `ministry.opened`, with the Ministry as its subject and its first Admin's Person id in the payload.
Provisioning writes it directly, beside the command boundary rather than through it, because there is no Ministry to scope a command to until the row exists.
The first Admin's arrival is inside the opening rather than a second event, because the transaction makes them one act and a Ministry with no Admin is not a state the product has.

What made it answerable was the Ministry Setup Link: once a real Ministry is opened by its Admin spending a link rather than by an operator running a script, the opening is plainly something that happened to the Ministry.
`tests/integration/ministry-isolation.test.ts` no longer writes the event by hand.

Settled 2026-09-01.
Recorded in `docs/product-rules.md` under *Settled: A Ministry Opens From a Ministry Setup Link* and in `docs/adr/0019-a-ministry-opens-from-a-link.md`.

Still undecided, and narrower: whether a phone that already signs somebody in may open a second Ministry on the same account.
The mint refuses it today, while the operator can still act.

## Open: what happens when a Person's Intake contradicts a relationship they are already in

Raised by ticket 25's review, and it is older than that ticket. The Gender Rule is
enforced when somebody *joins* a relationship: both halves of it -- the absolute match
between two people in a one-to-one, and the Declared Gender that binds a group -- are
triggers on `relationship_member`, and they read the Person's latest Intake at the
moment the membership is written.

Intake can be re-submitted, and a correction is the answer that counts. So a Person
already inside a relationship can answer differently afterwards, and nothing re-checks:
a declared women's group can come to hold a man, and a one-to-one can come to hold two
people who no longer match, with no refusal at any surface.

It is not a hole to quietly close, because every way of closing it is a product
decision with a cost. Refusing the Intake correction subordinates a Person's own answer
about themselves to a relationship somebody else put them in. Ending the relationship
does it silently and on a fact that is often a typo being fixed. Raising a Follow-Up
Item for an Admin keeps pastoral judgment in the loop, which is what the product rules
generally ask for, but it means a safeguarding rule that reports rather than binds.

What needs answering: which of those three a correction triggers, and whether the answer
differs between a correction made days after Intake and one made a year into a
relationship.

## Open: how a Ministry's only Admin gets back in

Ticket 28 gave an Admin a way to reset anybody else on their Roster, and named this as
the case it does not cover: a Ministry whose only Admin has lost their own password.
There is nobody with the tier to reset them, the route refuses a self-targeted POST by
design, and ticket 30's self-service change requires a session they cannot get.

One-time codes to the phone number close it — `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`
says the number is the credential, so a code sent to it is the recovery that follows —
and they remain post-launch. The question is what happens before then.

What needs answering: whether anything ships ahead of one-time codes, and if so what
shape it takes. The candidates are an operator-level path outside any Ministry (which
is a new kind of actor this product does not have), a second Admin required at
provisioning (which makes a one-pastor church impossible to set up), or nothing at all
until codes ship (which means the pilot's answer to a locked-out sole Admin is somebody
running SQL). Each is a different bet about who the first pilot Ministries are.

## Open: the Admin relationship detail

The design prototype opens a relationship detail behind every card: every member's
number and email, six weeks of check-in history and the Material. Ticket 31 left it out.
There is no reader for it, and the numbers on it would bypass the one-at-a-time consent
read that `public.contact_to_share` is (ADR-0010). What needs answering: whether a reader
returning names, the six-week history and the Material with no contact details is
wanted, and where it lives -- a page under Follow-Up, or a page of its own. Until then
each Overview card links to the relationship's Follow-Up item where one exists, and to
nothing where none does. This is decision 10 of ticket 31.

## Open: one Discipleship Goal or several

The Figma Make wizard multi-selects goals; the backend records one Ministry-owned goal as
the suggestion tiebreaker (ticket 21, ADR-0014), and several would change the data model
and ADR-0014's counting. Ticket 31 kept one, drawn as the design's option buttons, so the
screen changes and nothing underneath it does. What needs answering: whether several
goals are wanted at all, and if so what the tiebreaker becomes. This is decision 7 of
ticket 31.

## Deferred with the quarterly report

These are not unresolved so much as not yet needed. They must be answered before the reporting interface is built, and the underlying history must be complete enough to answer them later.

- Which metrics define quarterly ministry health
- Minimum cell size before an age or gender breakdown is shown, so a statistic cannot identify an individual
- How missing demographic information is represented
- Whether reporting compares one-to-one relationships against groups

## Deferred with Planning Center

V1 ships CSV upload; the Planning Center API is post-V1. When it returns, these need answering:

- Which system owns contact information when Planning Center is connected
- What data, if any, flows back to Planning Center
- What happens when Planning Center is unavailable
