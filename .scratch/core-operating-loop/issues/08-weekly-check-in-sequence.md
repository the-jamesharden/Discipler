# 08 — The weekly Check-In Sequence

**What to build:** Once a week a Leader gets a single text conversation covering every relationship they lead, one after another — leading three relationships does not mean three separate threads. Relationships are asked about in a consistent order, earliest start date first, so the conversation is predictable week to week.

Per relationship: "did you meet" first, then "how did it go" only on a yes, then "what was the Concern" only on a concern. A Leader who answers no moves straight on — a missed week costs one reply, and a missed meeting is never framed as a failure. Where a closing thank-you would fall, the next relationship's opening question is sent instead; the thank-you arrives only after the final relationship, so the Leader knows the conversation is finished.

Participants receive no check-ins. Only Leaders answer — but nothing may assume one respondent per relationship, and no response record may be keyed to the relationship alone rather than to the Person who sent it, because a Ministry may ask for Participant check-ins later.

This ticket introduces the inbound webhook. One webhook handles every inbound message, and resolution is: sender's phone number → Person → their open Check-In Sequence → the question currently awaiting a reply. Nothing resolves to "the Person's relationship" — a Leader may hold several, and sequence position is what disambiguates. `STOP` is handled here as the person-level carrier opt-out.

Strict tokens only in this ticket: `1`, `2`, `A`, `B`, `C`. Generous matching is ticket 09.

Relationships in `Awaiting Leader Acceptance` and `Paused` send no check-ins and accrue no silence. Opt-out and rate-disclosure language appears on the first check-in of each calendar month; that monthly rule applies to Leaders only.

**When the sequence sends** is a Ministry setting, not a constant: `checkin_day` (0–6)
and `checkin_hour`, resolved against the Ministry timezone and clamped to 8am–9pm
local by a database check constraint. A church small group meets Sunday and wants a
Monday morning prompt; campus discipleship happens midweek and Thursday evening is the
natural ask. `relationship.checkin_day` and `relationship.checkin_hour` are nullable and
null on every row, and the dispatcher reads `coalesce(r.checkin_day, ms.checkin_day)`
from the first line — per-relationship cadence is not surfaced in V1, but the query is
never rewritten to add it.

The cadence is read **at enqueue time** and stamped as `scheduled_for` on the outbound
row. **A cadence edit affects future periods only** and never cancels or reschedules an
already-enqueued message, so a coordinator moving Monday 8pm to Wednesday 7pm on a
Tuesday changes next week and not this one. That is what keeps the dispatcher
idempotent and the behavior explainable in one sentence.

**A week is the ISO week in the Ministry timezone, defined independently of the
check-in hour.** *A new week comes due* means a new ISO week, never *seven days since
the last prompt* — under that reading a cadence edit produces one week carrying two
prompts and one carrying none, and ticket 10's consecutive counters misfire silently.
The *first check-in of each calendar month* rule resolves against the same timezone.

Implements `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] A Leader with three relationships receives one sequence covering all three, ordered by start date
- [ ] Each answer attaches to the right relationship and to the Person who sent it
- [ ] The satisfaction question follows a yes; a no ends that relationship's turn immediately
- [ ] The Concern detail request is sent only after a concern reply
- [ ] The thank-you is sent only after the final relationship
- [ ] One webhook resolves inbound messages by phone number to the question awaiting a reply
- [ ] `STOP` opts the Person out at the person level
- [ ] Participants receive no check-ins and no Participant reply is read as a check-in answer
- [ ] Relationships awaiting acceptance or paused are skipped and accrue no silence
- [ ] The first check-in of each calendar month carries opt-out language
- [ ] Every prompt records the relationship and the role it was sent for, so a dual-role Person's messages are distinguishable in the data despite sharing one phone number
- [ ] A Person who leads two relationships and is a Participant in a third still receives exactly one sequence, covering the two they lead
- [ ] The sequence advances only in response to a reply
- [ ] The send time comes from the Ministry's `checkin_day` and `checkin_hour`, resolved against the Ministry timezone
- [ ] The database refuses a `checkin_hour` outside 8am–9pm, not only the form
- [ ] The dispatcher reads `coalesce(r.checkin_day, ms.checkin_day)` while every relationship override is null
- [ ] The cadence is stamped on the outbound row at enqueue time
- [ ] Editing the cadence changes future periods only and neither cancels nor reschedules an enqueued row, proven by a test that edits mid-week
- [ ] A new week is a new ISO week in the Ministry timezone, and a cadence edit does not produce a week with two prompts or none
- [ ] The monthly opt-out rule resolves the calendar month against the Ministry timezone

## Comments

### Amended — dual-role persons

A Person may lead some relationships and be a Participant in others. It changes
nothing here: Participants receive no check-ins, so the relationship they are
discipled in is answered for by *its* Leader, and they get one sequence covering
what they lead. The existing resolution path — phone number to Person to their
open sequence — was already Person-centric and needed no change.

Recording the role alongside the relationship on each prompt is what keeps
Participant check-ins addable later without a migration, which is the reason this
ticket already refuses to key responses to the relationship alone.

### Amended — the cadence, and what a week is

The ticket said *once a week* and named no day, no hour, and no clock; no Ministry
setting existed to hold one. Both are now settled, together, because settling the
cadence without settling the week boundary is what makes a cadence edit corrupt
ticket 10's counters instead of merely moving a prompt.

The settings themselves are built by ticket 22. This ticket consumes them.

### Settled — what the satisfaction tokens store

`A` is **outstanding**, `B` is **good**, `C` is **concern**. These are the values
written to history, not only the letters advertised in the message. `good` is the
stored value — `docs/product-rules.md` used `okay` once when describing the quarterly
report and has been corrected.

This was already settled in `docs/product-rules.md` and `docs/check-in-rhythm.md`; it
is recorded here because this ticket is what first writes it to history, and the pilot's
first check-in cannot be re-tokenised afterwards.

- [ ] A satisfaction reply is stored as `outstanding`, `good`, or `concern`
