# 22 — Ministry Settings

**What to build:** One settings surface, three sections, one form. Everything a
Ministry is allowed to vary about how Discipler runs for them, and nothing else.

**Ministry** — display name, timezone, `from_name`. The timezone matters far more than
it looks. Every availability block is interpreted against it, and so are the check-in
cadence, the ISO week boundary behind the care counters, the nudge day and week
windows, and the *first check-in of each calendar month* rule. Until this ships there
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

**Status:** ready-for-agent

- [ ] One settings surface with three sections — Ministry, Language, Pairing — in one form
- [ ] A Ministry has a timezone, and every availability block, cadence, week boundary, and messaging window resolves against it
- [ ] `leader_noun` and `participant_noun` are editable and the preview beneath them renders a real message using them
- [ ] `suggest_gender_match` and `suggest_max_age_band_gap` are stored settings that ticket 04's ranking reads
- [ ] The gender constraint and the age constraint are visibly different controls, not two rows of one toggle list
- [ ] `checkin_day` accepts 0–6 and `checkin_hour` an integer hour
- [ ] A `checkin_hour` outside 8am–9pm is refused by a database check constraint, proven by a test that writes it by SQL
- [ ] `relationship.checkin_day` and `relationship.checkin_hour` exist, are nullable, and are null on every row
- [ ] Message structure, reply tokens, and the opt-out footer appear nowhere on the screen, including as disabled fields
- [ ] Settings are per Ministry and readable only within that Ministry

## Comments

### Settled — `suggest_max_age_band_gap` has a direction

The setting is a single integer, and an integer with no stated direction is read as
symmetric by whoever implements it next — which would exclude most of a ministry's real
pairings. Its unit is now fixed: **the number of age bands a Participant may be above
their Leader.** There is no limit below.

Default `1`, which is ADR-0001's rule and permits a 25–34 Leader with a 35–44
Participant. A Ministry wanting *never older than their Leader* sets `0`. The label and
help text on the form must carry the word *above*; "age gap" alone reads as symmetric.

- [ ] `suggest_max_age_band_gap` is labelled and documented as bands a Participant may be **above** their Leader
- [ ] The default is `1`, and `0` is a valid setting meaning never older
