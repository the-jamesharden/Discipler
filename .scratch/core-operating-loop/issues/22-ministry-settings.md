# 22 — Ministry Settings

**What to build:** One settings surface, three sections, one form. Everything a
Ministry is allowed to vary about how Discipler runs for them, and nothing else.

**Ministry** — display name, timezone, `from_name`. The timezone matters far more than
it looks. Every availability block is interpreted against it, and so are the check-in
cadence, the ISO week boundary behind the care counters, and the *first check-in of
each calendar month* rule. Until this ships there
is no timezone anywhere in the product and those rules resolve against nothing.

**Language** — `leader_noun` and `participant_noun`, with a live message preview
underneath showing the ministry its own words in its own messages. This is the section
that earns the tab. It is the same rule as Discipleship Goals: a Ministry's people are
called what that Ministry calls them.

**Pairing** — `suggest_gender_match`, `suggest_max_age_band_gap`, and the check-in day
and hour. Same table, same form. `suggest_gender_match` is the deliberate disable that
`docs/product-rules.md` has always said the absolute gender constraint requires, and
the two constraints must be presented differently: one is a safeguarding rule a
Ministry turns off on purpose, the other is a suggestion tuning dial. A uniform list of
toggles would misrepresent the first.

`checkin_day` is 0–6 and `checkin_hour` is an integer hour, both against the Ministry
timezone. **The hour is clamped to 8am–9pm local by a database check constraint**, not
only by the form — pilot settings will be written by SQL, and quiet-hours rules are not
advisory. A coordinator who innocently sets 6:30am creates a compliance problem
Discipler carries.

**What stays out, deliberately:** message structure, reply tokens, and the opt-out
footer. The first two are a state machine and the third is a carrier obligation. **Do
not render them as disabled fields** — a greyed-out box invites *can you turn that on
for us?* They are simply not on the screen.

Implements `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`. Ticket 08b
consumes the cadence, ticket 04 consumes the pairing constraints, tickets 10 and 11
consume the timezone.

**Blocked by:** 01

**Status:** shipped

- [x] One settings surface with three sections — Ministry, Language, Pairing — in one form
- [x] A Ministry has a timezone, and every availability block, cadence, week boundary, and messaging window resolves against it
- [x] `leader_noun` and `participant_noun` are editable and the preview beneath them renders a real message using them
- [x] `suggest_gender_match` and `suggest_max_age_band_gap` are stored settings that ticket 04's ranking reads
- [x] The gender constraint and the age constraint are visibly different controls, not two rows of one toggle list
- [x] `checkin_day` accepts 0–6 and `checkin_hour` an integer hour
- [x] A `checkin_hour` outside 8am–9pm is refused by a database check constraint, proven by a test that writes it by SQL
- [x] `relationship.checkin_day` and `relationship.checkin_hour` exist, are nullable, and are null on every row
- [x] Message structure, reply tokens, and the opt-out footer appear nowhere on the screen, including as disabled fields
- [x] Settings are per Ministry and readable only within that Ministry

## Comments

### Settled — `suggest_max_age_band_gap` has a direction

The setting is a single integer, and an integer with no stated direction is read as
symmetric by whoever implements it next — which would exclude most of a ministry's real
pairings. Its unit is now fixed: **the number of age bands a Participant may be above
their Leader.** There is no limit below.

Default `1`, which is ADR-0001's rule and permits a 25–34 Leader with a 35–44
Participant. A Ministry wanting *never older than their Leader* sets `0`. The label and
help text on the form must carry the word *above*; "age gap" alone reads as symmetric.

- [x] `suggest_max_age_band_gap` is labelled and documented as bands a Participant may be **above** their Leader
- [x] The default is `1`, and `0` is a valid setting meaning never older

### Settled — which messages carry the nouns, and in what position

Nothing in `src/domain/outbound-copy.ts` named a role, so there was nowhere for a
Ministry's word to go and a preview of *its own words in its own messages* would have
been a preview of nothing. The copy was rewritten, and the shape it was rewritten into
is a constraint on every message written from now on:

- the word sits in **noun position**, never as a verb — *someone to be their mentor*,
  because *someone to discipler* is not a sentence;
- the word names the **reader's own role**, so it stays singular however many people
  are on the other side of it — *David and Ruth is your mentor* is what the other
  shape produces for a group.

Three messages carry a noun and they are the only three that name a role at all:
`invitationMessage`, `starterMessageToLeader`, `starterMessageToParticipant`. The
preview is composed by the same two Starter Message functions the sender calls, prefix
and opt-out disclosure and all. Recorded in
`docs/adr/0015-a-ministrys-own-word-goes-in-noun-position.md`.

### What ticket 08b had already landed, and was not re-authored

`timezone`, `checkin_day`, `checkin_hour`, the 8am-9pm check constraint and the
nullable `relationship.checkin_day` / `relationship.checkin_hour` came in with
`20260901000100_the_cadence_and_the_week_boundary.sql`, whose own comment said the
second ticket to land verifies the constraint rather than re-authoring it.
`tests/integration/ministry-settings.test.ts` does exactly that: it writes 6am, 7am,
10pm and 11pm straight past the form by SQL and proves each is refused, and that 8am
and 9pm are not.

### `from_name` is what a message reads as

Not the display name and not `sending_number`. Resolved once, at the store, as
`coalesce(nullif(btrim(from_name), ''), name)`, so nothing downstream has to remember
which of the two a message carries. Null means *speak as the display name*, and it is
null rather than a copy — a Ministry that renames itself would otherwise go on
speaking as whoever it used to be.

### `suggest_gender_match` is wired to the trigger, not only stored

`app.reject_gender_mismatch` now reads the setting off the relationship's Ministry
before it does anything else, which is what makes the checkbox the *deliberate
disable* ticket 05 said this ticket would provide. A setting that only greyed out a
control would have changed nothing: gender is enforced by a trigger precisely so that
manual pairing cannot cross it.

### One criterion is narrower than it reads

*"A Ministry has a timezone, and every availability block, cadence, week boundary,
and messaging window resolves against it"* is ticked for what this ticket can carry.
The timezone exists, is editable, and is validated twice — `isKnownTimezone` against
the same `Intl` zone database the dispatcher reads, and `pg_timezone_names` in the
trigger, because pilot settings are written by SQL. The cadence, the ISO week behind
the care counters and the *first check-in of each calendar month* rule all resolve
against it today.

An **availability block** does not, and cannot yet: the grid is seven days by five
named blocks with no clock in it, and nothing in the product turns a block into an
instant. Neither does a **messaging window**, because there is no send-window code to
resolve — the quiet-hours clamp is on the cadence rather than on the queue. Both
become true when something needs them to be, against this timezone; neither is
faked here.

### Still on ticket 04

`suggest_max_age_band_gap` is stored, defaulted to `1`, bounded to the ladder and
labelled with the word *above*. Nothing ranks anything yet — the suggestion engine is
ticket 04's, and this ticket's job was to give it a setting to read rather than a
constant.
