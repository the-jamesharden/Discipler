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

## Open: what does a Person who is Paired *and* opted out read as?

Both facts can be true at once, and settling one of them settles nothing about the
other. Opting out does not end a relationship — that is settled, in
`docs/product-rules.md`, so an opted-out Participant keeps an open participant
membership. `Paired` means holding at least one open participant membership *and
nothing else*, also settled. So the Roster has to choose which of the two it shows.

Ticket 02 shipped `Opted Out` ahead of `Paired`, on the reasoning that an Admin
scanning the Roster needs to see what the Person told the Ministry before they see
what the Ministry arranged for them. The alternative reading — `Paired` wins, and the
opt-out shows as a separate mark beside it — is defensible and would keep the
four values strictly disjoint on what they each describe.

The derivation is one SQL function, so this is a one-line change either way. It needs
deciding before the Roster is in front of a pilot Admin.

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
