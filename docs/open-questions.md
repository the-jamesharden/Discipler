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
