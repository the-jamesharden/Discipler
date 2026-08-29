# 08a — The check-in conversation

**What to build:** Once a week a Leader gets a single text conversation covering every relationship they lead, one after another — leading three relationships does not mean three separate threads. Relationships are asked about in a consistent order, earliest start date first, so the conversation is predictable week to week.

Per relationship: "did you meet" first, then "how did it go" only on a yes, then "what was the Concern" only on a concern. A Leader who answers no moves straight on — a missed week costs one reply, and a missed meeting is never framed as a failure. Where a closing thank-you would fall, the next relationship's opening question is sent instead; the thank-you arrives only after the final relationship, so the Leader knows the conversation is finished.

Participants receive no check-ins. Only Leaders answer — but nothing may assume one respondent per relationship, and no response record may be keyed to the relationship alone rather than to the Person who sent it, because a Ministry may ask for Participant check-ins later.

This ticket introduces the inbound webhook. One webhook handles every inbound message, and resolution is: sender's phone number → Person → their open Check-In Sequence → the question currently awaiting a reply. Nothing resolves to "the Person's relationship" — a Leader may hold several, and sequence position is what disambiguates. `STOP` is handled here as the person-level carrier opt-out.

Strict tokens only in this ticket: `1`, `2`, `A`, `B`, `C`. Generous matching is ticket 09.

Relationships in `Awaiting Leader Acceptance` and `Paused` send no check-ins and accrue no silence. Opt-out and rate-disclosure language appears on the first check-in of each calendar month; that monthly rule applies to Leaders only.

**What starts a sequence is ticket 08b.** This ticket owns the conversation once it is open: its order, its question ladder, its inbound resolution, and what it writes to history. The Ministry cadence, the `scheduled_for` stamp, and the ISO week boundary are 08b's, and until 08b lands a sequence is started directly rather than by a due date.

**Blocked by:** 07

**Status:** in-review

- [x] A Leader with three relationships receives one sequence covering all three, ordered by start date
- [x] Each answer attaches to the right relationship and to the Person who sent it
- [x] The satisfaction question follows a yes; a no ends that relationship's turn immediately
- [x] The Concern detail request is sent only after a concern reply
- [x] The thank-you is sent only after the final relationship
- [x] One webhook resolves inbound messages by phone number to the question awaiting a reply
- [x] `STOP` opts the Person out at the person level
- [x] Participants receive no check-ins and no Participant reply is read as a check-in answer
- [x] Relationships awaiting acceptance or paused are skipped and accrue no silence
- [x] The first check-in of each calendar month carries opt-out language
- [x] Every prompt records the relationship and the role it was sent for, so a dual-role Person's messages are distinguishable in the data despite sharing one phone number
- [x] A Person who leads two relationships and is a Participant in a third still receives exactly one sequence, covering the two they lead
- [x] The sequence advances only in response to a reply
- [x] A satisfaction reply is stored as `outstanding`, `good`, or `concern`

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

### Settled — what the satisfaction tokens store

`A` is **outstanding**, `B` is **good**, `C` is **concern**. These are the values
written to history, not only the letters advertised in the message. `good` is the
stored value — `docs/product-rules.md` used `okay` once when describing the quarterly
report and has been corrected.

This was already settled in `docs/product-rules.md` and `docs/check-in-rhythm.md`; it
is recorded here because this ticket is what first writes it to history, and the pilot's
first check-in cannot be re-tokenised afterwards.

### Split from ticket 08 — 2026-08-29

Ticket 08 carried two independently verifiable outcomes and twenty-one criteria. It
is now 08a (this ticket) and 08b, split on the line the ticket's own amendment
history drew: the conversation, and when it fires.

No design decision changed in the split. Every paragraph and every criterion above
is ticket 08's, verbatim; the cadence, the enqueue stamp, and the ISO week boundary
moved to 08b intact. The one addition is the paragraph naming the seam, which
records where the halves meet rather than deciding anything new.

The seam is narrow: 08b decides that a Leader is due and hands off; this ticket does
not care why the sequence was started. That is what lets these criteria be proven
without a scheduler — the sequence is started directly in tests, and 08b later
replaces that trigger with the real one.

The *first check-in of each calendar month* rule straddles the seam. The language is
here; resolving the calendar month against the Ministry timezone is 08b's.

### Built — 2026-08-29

Every criterion above is proven by a test. The conversation and its ladder are
driven at the command boundary; the ordering, the dual-role Person, the skipped
relationships and the one-sequence guarantee are proven against the real database,
because each of them is a property of the read rather than of the rules.

Three things were settled while building and are recorded here rather than left in
the code to be rediscovered.

**`STOP` closes any open conversation, as abandoned.** Not a second rule: a Person
Discipler may no longer text has no conversation left to have, and leaving one open
made the *next* inbound reply fail outright — the outbound queue refuses a message
to somebody who has opted out, so the question the reply advanced to was refused and
the webhook errored. Abandoned rather than completed, so the unanswered question
stays unanswered for ticket 10.

**The order of questions within a conversation is a stored step, not a timestamp.**
A command answers one question and asks the next from a single reading of the
injected clock, so both prompts carry the same instant and *the most recent prompt*
became whichever row the planner returned first. `checkin_prompt.step` is an
identity column and settles it.

**Paused is derived from a `relationship.paused` history event.** Relationship state
lives in history throughout this codebase and pause has no column; ticket 12 is what
writes the event, and this ticket only reads it.

### Deferred — named here so nothing is implemented by inference

- **An unreadable reply advances nothing and records nothing.** Strict tokens are
  this ticket's; the clarifying re-prompt, its cap of two, and the recording of every
  unreadable reply are ticket 09's, alongside the synonyms and typos.
- **`outbound_message.prompt_state` is left null.** The schema comment anticipated
  ticket 08 setting it, but the partial unique index it feeds is per-phone
  serialisation and belongs with ticket 20 — half of it would refuse the second
  question of an ordinary conversation.
- **A phone number held by more than one Person resolves to nobody.** Ticket 26's.
  Resolving it by guessing would file one congregant's answer against another's
  relationship.
- **The calendar month for the opt-out rule resolves in UTC.** 08a carries the
  language; 08b resolves the month against the Ministry timezone, as its text says.
