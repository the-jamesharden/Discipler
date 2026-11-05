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

- The Welcome Message is **first-ever contact**, so it carries the opt-out and rate
  disclosure, after the start every text has:
  `Riverside Chapel via Discipler: ... Reply STOP to opt out, HELP for help.`
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

**2026-09-22.** Ticket 04 is built on the old numbers, carried over unchanged, because the design prototype is already hourly and draws those same numbers.
They are one constant, `TIER_CUTOFFS` in `src/domain/suggestions.ts`, so a new decision is one edit plus the tests that pin each boundary.
The question stays open until somebody decides it.

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

- **A2P compliance requirements have not been checked against a live campaign registration.**
  The "{Messages read as} via Discipler:" start on every text is a product decision made on an understanding of carrier requirements, not a verified one. Review alongside the consent wording.
- **`docs/consent-language.md` has not had legal review**, including the `HELP` response content.
- **`checkin.start` outlives the justification it was kept for.** Ticket 08b replaced it as the weekly trigger, and ticket 11 withdrew the Admin "send one additional check-in" action it was then kept for (`docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`). It survives only as 08a's test seam, and it carries no cadence check: it can open a second sequence inside one ISO week, which sits against *One sequence per Leader per week*. That rule currently holds only because nothing routes to the command, and on the current reading nothing will. Deciding it means either withdrawing the command or giving the rule a guard that does not depend on nobody calling it.
- **The Participant reveal branch is unreachable and has not been withdrawn.** Ticket 12 stopped minting a Participant's Invitation Link and ADR-0011 settled that only a Leader is sent one, so the Participant branch of `app/invitation/[token]/page.tsx` and the Participant scoping in `src/platform/supabase/invitation-reader.ts` can no longer be reached by anything. They are kept rather than deleted, alongside an `it.skip` in `invitation-over-http.test.ts` that is now the only description of what that branch does. Deciding it means deciding whether a Participant ever gets a web surface of their own; until then the code and its test are dead weight that reads as live.
  Since 2026-09-24 a Participant does have one read-only page, their Material page (ADR-0028); it is a page of its own and reaches none of this branch, which is still unreachable.
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

An Admin names a group when forming it, and may rename it afterwards.
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

## Resolved: a church signs itself up

James asked on 2026-10-12 for a church to be able to sign itself up on the website, without an operator minting a Ministry Setup Link.
It reversed *There is no sign-up surface* in `docs/product-rules.md` and `docs/adr/0019-a-ministry-opens-from-a-link.md`, and waited for a grilling of its own.
The hard part was that the Setup Link carried the Ministry's sending number, bought and registered with the carriers by hand.

The grilling of 2026-10-25 to 2026-10-29 answered it.
A church signs itself up at `app.trydiscipler.com/signup`, and the Setup Link stays for churches James comps.
The sending number stopped being the church's: every church sends from Discipler's shared numbers, so a new church can text the moment it exists.
One church per person still holds, and there is no switch between churches.

Settled 2026-10-29.
Recorded in `docs/product-rules.md` under *Settled: A Church Signs Itself Up*, in `docs/adr/0029-a-church-signs-itself-up.md` and `docs/adr/0033-a-shared-set-of-discipler-numbers.md`.

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

Answered on 2026-10-29 for an Admin with a verified email, which every Admin who signs a church up has: "Forgot password?" emails them a one-time reset link (`docs/adr/0030-an-admin-signs-in-with-email-or-phone.md`).
It stays open for a sole Admin without one, such as a church opened from a Setup Link.

## Resolved: the Admin relationship detail

Resolved on 2026-10-12 by the pair card (Pastor feedback, ticket 07), which James settled in a Lavish review of mock-ups.
Pressing a one-to-one or a 1:2 pair on the Overview opens it over the page: both people with the contact details they agreed to share, read through the consent rule `public.contact_to_share` carries (ADR-0010), their Intake answers, the last check-in answer and the Material.
There is no six-week history on it; material history stays on Materials, and Follow-Up's fuller card (ticket 10) adds what has happened.
The original question is kept below.

The design prototype opens a relationship detail behind every card: every member's
number and email, six weeks of check-in history and the Material. Ticket 31 left it out.
There is no reader for it, and the numbers on it would bypass the one-at-a-time consent
read that `public.contact_to_share` is (ADR-0010). What needs answering: whether a reader
returning names, the six-week history and the Material with no contact details is
wanted, and where it lives -- a page under Follow-Up, or a page of its own. Until then
each Overview card links to the relationship's Follow-Up item where one exists, and to
nothing where none does. This is decision 10 of ticket 31.

## Resolved: one Discipleship Goal, plus Other

The Figma Make wizard multi-selects goals; the backend records one Ministry-owned goal as
the suggestion tiebreaker (ticket 21, ADR-0014), and several would change the data model
and ADR-0014's counting. Ticket 31 kept one, drawn as the design's option buttons, so the
screen changes and nothing underneath it does. The question was whether several goals
are wanted at all, and if so what the tiebreaker becomes. This was decision 7 of ticket 31.

**One goal, plus Other.**
The goal question stays one choice.
Every Ministry's form ends with *Other*, which opens a required short box for the Person's own words, so somebody whose hope is not on the list is no longer made to pick the nearest wrong option.
Two people who typed the same thing, ignoring capitals, spaces and punctuation, share a goal for Suggested Pairs exactly as two people who chose the same option do.

Settled 2026-10-12 in James's grilling of the pastor feedback (`.scratch/pastor-feedback-2026-10/spec.md`, *"Other" on the Intake goal*).
Recorded in ADR-0001's second amendment and in `docs/product-rules.md` under *Each Ministry Owns Its Discipleship Goal Options* and *The Discipleship Goal Is a Tiebreaker, Not a Tier Gate*.

## Deferred with the quarterly report

These are not unresolved so much as not yet needed. They must be answered before the reporting interface is built, and the underlying history must be complete enough to answer them later.

- Which metrics define quarterly ministry health
- Minimum cell size before an age or gender breakdown is shown, so a statistic cannot identify an individual
- How missing demographic information is represented
- Whether reporting compares one-to-one relationships against groups

## Deferred with Planning Center

V1 ships a spreadsheet paste; the Planning Center API is post-V1. When it returns, these need answering:

- Which system owns contact information when Planning Center is connected
- What data, if any, flows back to Planning Center
- What happens when Planning Center is unavailable

## Resolved: nothing puts `Discipler:` on the first text after a Silence Gap

Found on 2026-09-24 while specifying `.scratch/richer-materials/`: no code computed a Silence Gap, so a person texted again after thirty quiet days got the Ministry prefix alone.
Resolved on 2026-10-30 by James in mock-up 3 of the Exponential launch: every text now starts "{Messages read as} via Discipler:", the first text ever sent included, so no text depends on a Silence Gap to name Discipler (Exponential launch, ticket 06).

Moot since the Exponential launch (2026-10-30): every text starts "{Messages read as} via Discipler:", the first after a Silence Gap included, so no text needs a Silence Gap to decide its prefix.
See `docs/adr/0033-a-shared-set-of-discipler-numbers.md`.

## Open: whether *What has happened* lists who opened the contact details

Raised on 2026-10-13 by the Follow-Up card (Pastor feedback, ticket 10).
Ticket 10 asks *What has happened* to list who opened the contact details or read the concern, and when.
It lists who read the concern, from `concern_viewing`, because every opening of a card records a reading.
It does not list who opened the contact details, because nothing records that: *See contact details*, which is `Nudge` (`docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`), never wrote anything, and opening the card keeps whatever record Nudge kept.
Listing it would need a new recorded act on every opening of a card that shows contact details, which is a new event and a migration.
What needs deciding: whether an Admin seeing a Person's contact details is a ministry event worth recording, or whether *What has happened* stays without it.

## Open: what is left in Twilio for the Shared Numbers

Raised on 2026-10-31 by the Exponential launch, ticket 06.
Three numbers serve today, and the ticket plans for five more at about $6 a month, each added with `npm run shared-number`.
The rejected toll-free number is still to be taken out of the Messaging Service and kept.
Before any phone is in two churches, a `STOP` to one church's number needs checking on two real phones, since only Twilio's own handling proves the other church's texts keep running.
What needs deciding: when to buy the five numbers.

## Open: whether a church's reworded sentences need the A2P samples widened

Raised on 2026-10-31 by the Exponential launch, ticket 06.
The campaign's sample messages show Discipler's words, and ticket 40 lets a church reword the check-in's sentences inside Discipler's frame.
James decided on 2026-11-03 to ship ticket 40 live, with no switch, before Twilio answers, and said the check-in's wording is fine.
That sets aside what ADR-0034 and ticket 40 said about settling this first.
Until Twilio answers, a church can send reworded sentences that the campaign's samples do not show.
What needs deciding: whether the samples need widening, which is still a question for Twilio, including the campaign's declaration of links and numbers.

## Open: the sentences an Admin's phone check refuses with

Raised on 2026-10-31 by the Exponential launch, ticket 09.
The mock-up drew only the card asking for the code, so the refusal sentences in `app/account/phone/copy.ts` are drafts.
What needs deciding: whether to approve or reword them.

## Open: how an Admin with a non-US phone gets a test check-in

Raised on 2026-10-31 by the Exponential launch, ticket 09.
A non-US number is refused before Twilio is called, and the SAU BCM Admin's phone is Canadian, so that Admin cannot be checked or sent a test check-in.
What needs deciding: whether that stands, or that one Admin needs another way.

## Open: Supabase Auth's own password settings on production

Raised on 2026-11-01 by the Exponential launch, ticket 12.
The minimum password length on production is a dashboard setting, and it should be 8 so the public Auth API agrees with the app.
Leaked-password protection is a separate, optional Pro plan setting.
What needs deciding: whether to turn on leaked-password protection, once the minimum is set.

## Open: whether the list the unpaired card opens leaves Admins out

Raised on 2026-10-31 by the Exponential launch, ticket 29.
The card's count leaves Admins out, but the Roster it opens includes an Admin who has not sent an Intake, which provisioning leaves every Admin as.
So a church whose pastor has no Intake reads "2 people haven't" and lands on three rows, the pastor's own first.
The recommendation is to keep the count and leave Admins off the list opened from the card, which adds an address-only Roster view with no menu option.
The alternative is to count Admins on the card.
The card's singular forms, "1 person is ready to pair and isn't in a relationship yet." and "1 person hasn't filled in their Intake form yet.", are also new screen copy to read.

## Open: the wording of the help pages

Raised on 2026-11-01 by the Exponential launch, ticket 34.
The pages speak for Discipler about billing, offers and texting at launch, and had no mock-up.
`/help` is live and unlinked, and its billing, referral, Ask Discipler and test check-in pages describe features that land later.
What needs deciding: whether the wording stands.

## Open: "{leader noun}s" in the test check-in's first text

Raised on 2026-11-01 by the Exponential launch, ticket 35.
ADR-0031 records a conflict instead of resolving it: "the same one your {leader noun}s get" pluralises the church's noun, which ADR-0015 says Discipler never does.
What needs deciding: whether the wording changes, for example to "the same one we send each week", or ADR-0015 gains an exception, before ticket 28 ships.

## Open: whether "points" comes off the non-goals list

Raised on 2026-11-01 by the Exponential launch, ticket 35.
The spec says "points and the What's new item come off the list", and also says "Points are removed from the plan entirely".
`docs/non-goals.md` keeps "points", because removing it would read as approving points, and it has no What's new item to remove.
What needs deciding: whether that reading stands.

## Resolved: whether a past-due church keeps texting

Raised on 2026-11-01 by the Exponential launch, ticket 35.
The spec's Billing section says "everything keeps running during Stripe's retries", while its Q32 says texts go out only while trialing or active.
The docs and ticket 05 follow "everything keeps running", so a `past_due` church keeps texting, and ticket 05 is built that way.
James decided on 2026-11-03 that it stands, and the spec's Q32 line now lists past due.

## Resolved: the reply choices ticket 40 lists

Raised on 2026-11-01 by the Exponential launch, ticket 35.
Ticket 40 was triaged with the four ratings, and it is built with "Reply A for outstanding, B for good, C for okay, D for concern."

## Open: publishing the legal drafts

Raised on 2026-11-01 by the Exponential launch, ticket 36.
James filled every bracket in the privacy policy and the terms of service on 2026-11-03, with no refund on cancellation and an effective date of November 3, 2026.
No lawyer or accountant has reviewed them, including the tax line and the Stripe and Cloudflare disclosures.
The privacy policy's sentences on Stripe's fingerprint of a card or bank account were added on 2026-11-03 to match ticket 04 and the spec, after James filled it, and are his or a lawyer's to approve before it is published.
The terms' sentence on a yearly Organization's referral month was added the same day to match James's decision, and is his or a lawyer's to approve too.
The opt-in page's sign-up section still has its screenshot, which waits on ticket 15, and the checks of the Twilio Verify, HELP and STOP wording.
All three are to be published on trydiscipler.com, and sign-up stays off in production until they are live.
What is left: James publishes the two finished documents, registers himself with the US Copyright Office as the copyright agent, and adds the address's ZIP code if he wants it shown.

## Resolved: sign-up consent with no checkbox

Raised on 2026-11-01 by the Exponential launch, ticket 36.
The sign-up consent is given by continuing, with no checkbox, on a page where a phone number is required.
James reviewed it on 2026-11-02 and kept it as drafted, with no checkbox.

## Open: the live opt-in page's sample messages

Raised on 2026-11-01 by the Exponential launch, ticket 36.
James approved the corrections on 2026-11-03 and they are live: the form's wording, the confirmation, check-in prompt and follow-up samples, and Carrollton.
The HELP and STOP samples are unchanged, and the sign-up section is not published.
What is left: text HELP and STOP from a test phone and match those two samples to what arrives, and publish the sign-up section with its screenshot.

## Open: a second layer on the sign-in guessing limit

Raised on 2026-11-01 by the Exponential launch, ticket 13.
Discipler's own limit counts failed sign-ins per account and per network, and it needs nothing set up.
Three optional layers could go with it, and none is built.
Supabase's IP address forwarding could be turned on, sending `Sb-Forwarded-For` with a secret key, so Supabase's own per-network limit sees the person's address rather than Vercel's.
A Vercel Firewall rate-limit rule could cover `POST /auth/sign-in`.
A CAPTCHA could be added to sign-in.
What needs deciding: whether to add any of them, and which.

## Open: nothing deletes what the privacy policy says is deleted

Raised on 2026-11-03 when James approved the retention periods in `docs/legal/privacy-policy.md`, section 7.
No job in the code deletes anything yet, so each period is a promise to build before it first falls due.
Support messages have one since ticket 25: the tick deletes a `support_submission` after 12 months.
What it cannot reach is the mail those messages became, so the support@ mailbox needs its own 12-month retention, which is a setting and James's to set.
The periods with no job are help assistant chats at 90 days, abandoned sign-ups at 30 days, billing records and agreements at 7 years, and the information of an ended church or of a church that never completed Checkout and has no subscription at 12 months with an email to its Admins 30 days before.
The email to Admins is new, so its wording is James's to approve.
What needs deciding: which tickets own the jobs, and the wording of that email.
The Billing help page and ticket 33 still say a church's information is "kept", and they change with the deletion job.

## Open: spreading check-ins needs more than a faster send pass

Raised on 2026-11-03 by the Exponential launch, ticket 07.
James kept the send pass hourly for the launch, so check-ins leave all at once, as they do on production today.
Three problems were found when it was tried:

- A check-in's conversation opens at the tick while its text can wait up to an hour, so a reply in that gap is recorded as the answer to a question never sent, or gets a clarification about it.
- A Pause or an ending in that gap withholds nothing, so the question about a finished pairing still goes out.
- A church with a 9pm check-in hour can send at 10pm or later, even on an on-time pass, for example the last of 13 Leaders, and up to about 40 minutes past it if the tick opens late.

A daily cap hold reaches the same gap for longer: a check-in held overnight has its conversation open with its text unsent, so a reply, a Pause or an ending that evening has the same problems.
Rows waiting for a shared number have them too.
A hold is rare today, since it needs Twilio to answer 30023 at the POST and volume near the cap.
The eventual fix should cover all of these.

What needs deciding: whether to open the question when its text is sent, or make replies, Pause and endings aware of an unsent question, and how to keep the moments inside quiet hours, before spreading is switched on.

## Open: how Twilio reports error 30023

Raised on 2026-11-03 by the Exponential launch, ticket 07.
The hold fires when Twilio answers a send with 30023, and the tests answer it at the `POST`.
Nothing read here confirms that Twilio ever does.
If Twilio reports it later, on the message's status, the row is marked sent, the text is lost, and no hold or email happens.
Catching that needs a signed status-callback route, or keeping each message's SID and reading its status on the tick, and either one must put the refused row back on the queue.
What needs deciding: ask Twilio in the open support ticket, then whether a follow-up ticket is needed.
James decided on 2026-11-03 to merge with this open and ask Twilio, since today's volume is far below the limit.

## Open: held texts wait for the church's morning

Raised on 2026-11-03 by the Exponential launch, ticket 07.
The ticket says held texts are sent after midnight Pacific.
As built, a held text also waits for the church's own morning, so nobody is texted in the night (`waitsForTheMorning` in `src/domain/daily-cap.ts`).
What needs deciding: whether that rule stands.

## Open: the Twilio balance and spend alarm's quiet failures

Raised on 2026-11-03 by the Exponential launch, ticket 08.
A failed balance read sends no email, so a rotated token or a changed answer silences the alarm, and it shows only in the tick's response and the log.
If Resend is down through all of Twilio's retries, that day's spend alarm is lost.
Neither the balance read nor the Usage Trigger's signed callback has met the real Twilio.
What needs deciding: whether repeated failed reads should email support@, and James's one check of both against the real Twilio, with auto-recharge set to add $500 below $100 and a backup card.

## Open: sign-up's numbers and wording, before sign-up opens

Raised on 2026-11-03 by the Exponential launch, ticket 11.
The spec gives none of these, so the build chose: 5 emails per address and 30 per network each hour, a human check lasting 30 minutes, a proven address lasting 60, and one human pass per address.
The two emails, `codeEmail` and `signUpAttemptNotice` in `src/domain/sign-up-attempt.ts`, and the refusal sentences in `app/signup/copy.ts` are drafts.
A phone outside the US is refused at sign-up (`signup.phone_not_us`), so a Canadian Admin, like SAU BCM's, could not sign up.

Added on 2026-11-04 by ticket 17, all drafts inside the approved "Set up your account" screen, in `app/signup/copy.ts`:

- A phone or email with an account: "That phone number or email already has a Discipler account. Sign in, or start again with a different one."
- A church name, a full name, a timezone, the monthly or yearly choice or the terms refused by the server, which the button normally prevents: "Please enter your church or organization's name.", "Please enter your full name.", "Please choose your timezone.", "Please choose monthly or yearly.", "Please agree to the Terms of Service and Privacy Policy."
- Something failing that the person cannot fix: "We couldn't set up your account just now. Please try again in a minute."
- The email to support@ when a church signs up, `tellSupport` in `src/service/opening-a-church.ts`, which nobody outside the team reads.
- A password refused here uses the wording every other password form already uses.

Added on 2026-11-04 by ticket 19, the emails for James to word and the sentences inside the approved screen:

- The church-plant application to james@ and lerone@, `tellTheFounders` in `src/service/opening-a-church.ts`.
  Subject: "Church plant application from {church}".
  Body: "{church} applied for the church plant year when it signed up.", then the answers each on a line under the page's own labels, then "Login email: {address}", "Anything else they'd like us to know:" with their words quoted, then "Its ordinary trial starts either way. Approve or decline it with the church-plant command, using this ID:" and the ID.
- Approval to the church, during its trial, in `src/service/church-plant-decisions.ts`.
  Subject: "Your church plant application".
  Body: "Good news: {church}'s church plant application is approved. Your free year of Discipler begins when your free trial ends. You won't be charged during it. When the free year ends, billing carries on as you chose when you signed up. If you have any questions, just reply to this email."
- Approval to the church, after its trial, with the same subject.
  Body: "Good news: {church}'s church plant application is approved. Your free year of Discipler begins at your next bill, on {date}. You won't be charged during it, and anything you've already paid stays as it is. When the free year ends, billing carries on as you chose when you signed up. If you have any questions, just reply to this email."
- Decline to the church, sent only with `--email`, with the same subject.
  Body: "Thank you for telling us about {church}. We aren't able to offer your church the free year for church plants. Your subscription carries on just as it is. If you have any questions, or something has changed, just reply to this email."
- An answer refused by the server, which the button normally prevents: "Please enter your launch date, or planned launch date.", "Please enter your sending or partner church.", "Please enter your average weekly attendance.", "Please enter your lead pastor's name.", and, only for a hand-made request, "One of your church plant answers is too long. Please shorten it."

Added on 2026-11-04 by ticket 21, two checks only production can answer, neither of them a sentence:

- Email sign-in needs Supabase's email provider left on. If it is off on production, every email sign-in reads "That email or phone and password did not match.", with nothing logged.
- Any account already on production that holds an email can now sign in with it, proven or not. Every account Discipler makes without sign-up holds none, so the count of `auth.users` with an email should be zero until sign-up opens.

Added on 2026-11-04 by ticket 18, all drafts inside the approved payment and reminder screens, in `app/signup/payment/copy.ts`:

- While the webhook is on its way: "Finishing setup...", then "This is taking longer than usual." and the link "Go to Overview".
- A method that left the page and came back failed: "That didn't go through, and nothing was saved. Please try again."
- A card or bank that said no shows Stripe's own sentence, and anything else that failed: "We couldn't save that just now. Please try again, or use another card or bank account."
- The route's refusal with something to retry has the button "Try again".
- The page behind "Don't send me reminders": the sentence "Press the button and we won't remind you about finishing your account.", the button "Don't send me reminders", and then "You won't get another reminder."
- The reminder has an HTML part beside its plain text, because the approved screen has a Start button, and every other email is plain text only.

Added on 2026-11-04 by ticket 20, drafts inside the approved email and phone page and the email to support@:

- A code in the address that nobody recognizes says the sentence mock-up 6 draws for a typed one: "We don't recognize that code, but your free trial still applies."
- The email to support@, `tellSupport` in `src/service/opening-a-church.ts`, says "Offer: The first paid month free, invited by another church" for a church that came through a live referral link.

Added on 2026-11-04 by ticket 22, drafts inside the approved forgot-password pages, in `app/login/forgot/copy.ts` and `app/login/forgot/[token]/copy.ts`:

- An entry that is not an address: "That doesn't look like an email address. Please check it and try again."
- A human check that did not pass: "We couldn't confirm you're a real person. Please try again."
- A browser running no script, since Cloudflare needs one: "This page needs JavaScript. Please turn it on, or write to support@trydiscipler.com and we'll help."
- A password that could not be set, with the link still live: "We couldn't save your new password just now. Please try again in a minute."
- A refused password uses the wording every other password form already uses.
- The reset email has an HTML part beside its plain text, because the approved screen has a button, as the payment reminder does.

Also from ticket 22, three things to check on production before anybody relies on it:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, or every press of "Send me the link" reads as not a real person.
- `RESEND_API_KEY` and `RESEND_EMAIL_DOMAIN`, or the page says "Email sent." and the only sign that nothing went is `A reset email for link ... did not go` in the log.
- The link shows on the sign-in page whether or not sign-up is open, so until sign-up opens it answers "Email sent." to everybody and sends nobody anything, because nobody's account holds an address yet.

Added on 2026-11-04 by ticket 32, the Refer page's words being James's own:

- The email to james@ and lerone@ about a credit Discipler will not apply by itself, `referralCreditForReview` in `src/service/support-alerts.ts`, which nobody outside the team reads.
  Subject: "A referral credit is waiting for you".
  It names both churches, both Stripe customers, the opaque referral ID, and one sentence of why.
- A shared email domain sends a credit to review, except a public one such as `gmail.com` (James, 2026-11-04).
  If James finds he is reviewing credits between strangers on the same free mail service, leaving those domains out is one line in `whyTheyLookLikeOne` in `src/domain/referral-credit.ts`.

Also from ticket 32, for the Stripe steps below: the restricted key needs Invoices and Charges read, on top of what ticket 04 lists, and Customers write has to cover customer balance transactions.
Nothing here has reached real Stripe, so a credit on a test clock on staging is the check: a church invited, its first real payment, 30 days, then a "Referral credit" on the inviting customer's next invoice.
Ticket 32's review sends James an email and nothing more: he settles it in Stripe or on the church's invoice, and Discipler's row stays `in_review`.

Added on 2026-11-04 by ticket 33, choices the screens did not draw:

- An approved church plant gets no trial-ending email, because it is not about to be charged.
  The alternative is a differently worded email, which would need its words.
- A church on a schedule, which is every church with an offer, cannot cancel on Stripe's billing page: "Customers can't update or cancel subscriptions that currently have an update scheduled with a subscription schedule."
  So Cancel subscription asks on Billing itself.
  The alternative is to release the schedule first, which loses the offers Keep my subscription has to put back.
- Whether Link stays a payment method is still open.
  The page is right either way: a Link payer sees the badge "LINK", the word "Link" and no details under it, and the Settings line names Link too.
- A church whose free month was refused is told nothing on Billing, because the mock-up draws no such state.

Also from ticket 33, drafts inside the approved Billing screens, in `app/settings/billing/copy.ts`:

- The bank payer's line, new wording from the ticket: "To use a different bank account, email support@trydiscipler.com."
- The question for a church on a schedule: "Cancel your subscription? It would end on {date}.", "Check-ins keep going until then. After that they stop, and everything stays here to read.", with "Yes, cancel my subscription" and "Never mind".
- The line under its buttons, in place of "These open Stripe's secure billing page, then bring you back here.": "Update payment method opens Stripe's secure billing page, then brings you back here."
- The offers: "Church plant year" with "Free for your first year, through {date}", and "First month free" with "Your first paid month is free, through {date}".
- The next bill's note for those two: "Free for your church plant year, then {price}" and "{price}, less your first month free".
- An ended church: the row "Ended" with its date and "Check-ins have stopped. Everything is still here.", and Restart Discipler in the Payment method card.
- A bill: "Year from {month and year}" for a yearly bill, and "Processing" for a bank debit still on its way.
- A failed payment with no retry to come: "{amount}, not yet paid" and "Everything keeps running in the meantime."
- No method on file: "No payment method on file".
- Stripe not answering: "We couldn't load your plan from Stripe just now. Please try again in a moment." and "We couldn't open Stripe's billing page just now. Please try again in a moment."
- No Subscription that began: "No subscription yet", "Finish setting up" and "No bills yet."

Also from ticket 33, drafts inside the approved restart page:

- While the webhook is on its way: "Restarting Discipler...", then "This is taking longer than usual." and the link "Go to Billing".
- A payment that failed: "That didn't go through, and you weren't charged. Please try again." and "We couldn't charge that just now. Please try again, or use another card or bank account."
- No Stripe: "We can't take a payment here just now. Please try again in a moment."
- A referral credit: "Your referral credit takes {amount} off today.", and where it covers the whole bill, "Your referral credit covers today, so nothing is charged." with "You can change or cancel any time in Settings, Billing."
- The hint above the Payment Element: "Use the card or bank account on file, or add another."

Also from ticket 33, what only James can do in Stripe, and what only a sandbox can answer:

- Add `customer.updated` and `subscription_schedule.updated` to the webhook endpoint, which now listens for fifteen events.
- Rerun the catalog, which now creates the billing page's configuration.
  Until then Update payment method says Stripe's billing page could not be opened.
- Give the restricted key Customer Sessions, Customer Portal sessions and configurations, and read on Invoices and Payment Methods.
- Nothing here has met real Stripe.
  A sandbox has to answer: whether Stripe's page offers a bank in the update step, which its documents say it cannot add by hand; how a schedule cancels and previews; whether the Payment Element shows the method on file; a bank restart; a past-due retry after a new method; how a bank's name is capitalized; and whether the amount the page confirms matches the charge.

What needs deciding: the numbers, the wording, and whether sign-up stays US-only.

## Open: the check-in words' refusals and `Messages read as`

Raised on 2026-11-03 by the Exponential launch, ticket 40.
The build refuses a question without `[name]`, wording that reads as the frame, links and phone numbers, none of which the spec asked for, and the refusal sentences in `app/settings/check-in-words-copy.ts` are drafts.
`Messages read as` starts every text, has no length limit and is validated only for blank, so it could say "Reply STOP".
An emoji counts as one character toward the 160, and it can make a text cost more to send.
ADR-0034 lists "reminders" as Discipler's words and `docs/product-rules.md` says a conversation keeps its sentences, reminders included; the build reads ADR-0034's as the acceptance reminder.
What needs deciding: whether those refusals stand, the wording, whether `Messages read as` gets the same refusals, and which reading of reminders is right.

## Resolved: a trial Subscription reads as access before payment is confirmed

Raised on 2026-11-03 by the Exponential launch, ticket 03.
The spec says a church that leaves the payment step sends no texts.
With the Payment Element, a trial Subscription reads `trialing` from when the server creates it, before its setup intent is confirmed, and the webhook subscribes to no setup-intent event.
Ticket 04 settled it: a pending setup intent counts as no access, and the webhook now subscribes to `setup_intent.succeeded`.

## Open: Setup Link churches are billed outside Stripe automatically

Raised on 2026-11-03 by the Exponential launch, ticket 03.
The spec names SAU BCM and Anthem Community Church for the operator flag and says it is for churches James chooses to comp.
As built, a church opened by a Setup Link gets the flag automatically.
Ticket 05 makes the flag matter from the deploy: a church with it keeps texting with no subscription.
What needs deciding: whether that stands.

## Open: consent Statement 2's wording

Raised on 2026-11-03 by the intake consent links.
`docs/consent-language.md` words Statement 2 as "I agree that...", and the intake form asks "May we share your name and phone number...?"
What needs deciding: which one is right.

## Open: the help pages name Help menu items not yet shown

Raised on 2026-11-03 by the Exponential launch, ticket 23.
The Help menu holds only what exists, so what waits on ticket 27, and Office hours until a next call is set, are not there yet, and the help docs already mention them.
What needs deciding: nothing if ticket 27 ships by the launch; otherwise the wording of those pages.

## Open: the wording Twilio Verify really sends

Raised on 2026-11-03 by the Exponential launch, ticket 36.
The opt-in draft's sample is "Your Discipler verification code is: 123456", from Twilio's documented pattern rather than a code anyone has received.
What needs deciding: nothing; James checks a real code against the sample before the sign-up section is published.

## Resolved: a church's texts when the access read fails

Raised on 2026-11-03 by the Exponential launch, ticket 05.
Every text is checked against the church's access as it leaves, and the ticket does not say what happens when that read itself fails.
It was built so a failed read sends, and alerts, because silencing every live church over a database hiccup is worse than an ended church texting briefly.
James decided on 2026-11-03 that it stands, and the spec says so.

## Open: Discipler's HELP reply for a church without access

Raised on 2026-11-03 by the Exponential launch, ticket 05.
The fine print on every sign-up says "HELP for help", while a church without access has Discipler's own HELP reply closed like any other text.
Twilio may answer HELP itself, and nobody has checked that on a real phone.
An exemption is a hole in the one query, because a row does not say today that it is a HELP reply.
James decided on 2026-11-03 to test on a real phone, and exempt the reply if Twilio does not answer.
What is left: that test, and the exemption if it is needed, before a church can be without access, which needs sign-up open or a subscription ended.

## Resolved: a name typed into a support message reaches support@

Raised on 2026-11-03 by the Exponential launch, ticket 25.
The spec says "No email carries congregation names, phone numbers or Concerns".
The support form strips phone numbers from the message it emails, but it cannot detect a name or a Concern somebody typed, and its hint only asks people to leave them out.
The alternative is an email carrying only the kind and a reference, with the message read from the row by an operator.
James decided on 2026-11-03 that it may, and the spec's sentence now covers what Discipler composes.

## Resolved: when sign-up's consent is recorded

Raised on 2026-11-03 by the Exponential launch, tickets 15 and 17.
The spec says continuing past page two records a consent for that phone.
`consent_record` needs a Person and a Ministry, neither of which exists yet at page two, so tickets 15 and 17 record it when the church opens, and nothing is texted before then.
The attempt's row keeps only its latest send, so as built the moment the person agreed could be lost.
James decided on 2026-11-03: the record stays at opening, ticket 17 carries the time the person agreed, and the spec is reworded.

## Resolved: nothing links to sign-up yet

Raised on 2026-11-03 by the Exponential launch, ticket 15.
The spec and mock-up 1 draw "Create an account" on the sign-in page, and no ticket built it.
Settled in the triage of 2026-11-04: it joins ticket 21, which rebuilds that page, and `ref` stays the parameter name for `/r/<code>`.
Built by ticket 21: the button shows only while `signUpIsOpen` says so.

## Open: the edges of a free month and an offer

Raised on 2026-11-03 by the Exponential launch, ticket 04.
The spec said a referral is "a 100%-off first invoice"; James decided on 2026-11-03 that a yearly church gets $77.60 off, one month at the rate it pays, and the spec says so.
A church refused a free month because its card has had one is told nothing (`free_month_refused`).
Stripe Link gives no fingerprint, so a church paying by Link always gets the free month.
Every offer church is on a Subscription Schedule, the spec says "A church may cancel itself", and whether Stripe lets a scheduled Subscription cancel at period end has not been tried.
Payment methods are listed explicitly rather than left to Stripe's dynamic methods, and `schedulePhases` assumes the trial is the current phase (ticket 19).
What needs deciding: what a refused church is told, and a sandbox test of cancelling before ticket 19 ships.

## Open: what wave 3 left James to do in Stripe and on production

Raised on 2026-11-03 by the Exponential launch, tickets 04, 14, 24 and 25.
Nothing in wave 3 has reached real Stripe, so its tests prove only what a fake can.
Ticket 04's "For James" holds the steps: the catalog, the restricted key's access, the webhook's `setup_intent.succeeded`, the publishable key, the payment methods, and the staging check before the rehearsal.
Until the key and the catalog are in place the tick reports `over200` as `failed` or `no_prices` and no email goes, and ticket 14 asks for one check of its price lookup against real Stripe after the deploy.
Ticket 25's form was never drawn in a mock-up.
What is left: those steps, looking at the form, and approving the drafted words in `app/signup/payment/copy.ts`, `app/texting-gate-copy.ts` and `app/help/contact/copy.ts` and the `textingGateUnread` email.

## Open: the over-200 follow-up's edges

Raised on 2026-11-03 by the Exponential launch, ticket 14.
The spec says "A church that stays above 200", and the ticket narrows it to churches on $97, because the follow-up exists to move them to the next price.
A dip of a minute below 200 spoils the month, because the count is read at every instant the history changed.
A paused relationship's people are not counted, because the product already says paused is not active.
When the first price cannot be found the tick reports `no_prices`, and a repeated failed alert tells nobody.
What needs deciding: whether a brief dip should spoil the month, whether paused relationships count, and who hears about a failure that repeats.

## Open: Office hours and What's new

Raised on 2026-11-03 by the Exponential launch, ticket 30.
The Office hours menu item opens the Overview's card rather than Zoom, and the card stays up all of the call's date, in the call's zone.
The launch entry is dated 2026-11-03 rather than October 30.
The repo is public, so a Zoom link in `NEXT_OFFICE_HOURS` is public too.
What needs deciding: whether a public link is acceptable or the call needs a waiting room, and the first date.

## Open: search once Ask Discipler ships

Raised on 2026-11-03 by the Exponential launch, ticket 24.
Search lists an Ask Discipler entry that needs an address, and ticket 31 may build a circle with none.
Results open over the page rather than hanging from the bar.
What needs deciding: whether ticket 31 gives the circle an address or removes the entry, and whether results stay over the page.

## Resolved: the setup meter cannot reach 100% yet

Raised on 2026-11-03 by the Exponential launch, ticket 26.
Steps 2 and 3, the tour and the test check-in, wait for tickets 27 and 28, so every church stays below 100%, and a church with only those left has no "Next:" line, though the spec says "always showing".
SAU BCM will read 5 of 7, and an Admin's first sign-in plays every finished step's confetti at once.
James decided on 2026-11-03 that the bar waits for them: `SETUP_METER_ON` stays unset on production until 27 and 28 ship.
Until then `getting-started.md`, `settings.md` and `test-check-in.md` in the help pages describe a bar that is not drawn.

## Open: Leaders on the support form

Raised on 2026-11-03 by the Exponential launch, ticket 25.
A signed-in Leader is treated as signed out, so sees the Turnstile check and gives their own address.
What needs deciding: whether that stands.

## Open: an intermittent React hydration error on Admin pages

Raised on 2026-11-03 by the Exponential launch, ticket 25.
React error 418 came on a few visits to pages with the Admin header, on a production build with the machine heavily loaded: 3 of 20 visits in one run, and 2 of 40 in another.
The page recovers by rendering in the browser, and nothing looked wrong on screen.
It did not come back in 275 visits on the combined branch, so what mismatched was never captured and the cause is not known; the history is in ticket 25.
What needs deciding: nothing yet; look again if it is seen on a phone or in production.
