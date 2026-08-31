# 08a — The check-in conversation

**What to build:** Once a week a Leader gets a single text conversation covering every relationship they lead, one after another — leading three relationships does not mean three separate threads. Relationships are asked about in a consistent order, earliest start date first, so the conversation is predictable week to week.

Per relationship: "did you meet" first, then "how did it go" only on a yes, then "what was the Concern" only on a concern. A Leader who answers no moves straight on — a missed week costs one reply, and a missed meeting is never framed as a failure. Where a closing thank-you would fall, the next relationship's opening question is sent instead; the thank-you arrives only after the final relationship, so the Leader knows the conversation is finished.

Participants receive no check-ins. Only Leaders answer — but nothing may assume one respondent per relationship, and no response record may be keyed to the relationship alone rather than to the Person who sent it, because a Ministry may ask for Participant check-ins later.

This ticket introduces the inbound webhook. One webhook handles every inbound message, and resolution is: sender's phone number → Person → their open Check-In Sequence → the question currently awaiting a reply. Nothing resolves to "the Person's relationship" — a Leader may hold several, and sequence position is what disambiguates. `STOP` is handled here as the person-level carrier opt-out.

Strict tokens only in this ticket: `1`, `2`, `A`, `B`, `C`. Generous matching is ticket 09.

Relationships in `Awaiting Leader Acceptance` and `Paused` send no check-ins and accrue no silence. Opt-out and rate-disclosure language appears on the first check-in of each calendar month; that monthly rule applies to Leaders only.

**What starts a sequence is ticket 08b.** This ticket owns the conversation once it is open: its order, its question ladder, its inbound resolution, and what it writes to history. The Ministry cadence, the `scheduled_for` stamp, and the ISO week boundary are 08b's, and until 08b lands a sequence is started directly rather than by a due date.

**Blocked by:** 07

**Status:** shipped

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

### Surfaced — the glossary and this ticket disagree about "prompt"

`CONTEXT.md` marks *prompt* as a term to avoid, noting that `outbound_message`'s
`prompt_key` and `prompt_state` "predate this entry". This ticket's own criteria use
the word as the model term — *"Every prompt records the relationship and the role it
was sent for"* — as does `spec.md`, and ticket 20 is named for it.

The code follows the ticket, so the new table is `checkin_prompt`, consistent with
the columns already in the schema. The conflict is real and is not resolved here:
either the glossary's *Avoid* note needs narrowing to say it bars *prompt* only as a
synonym for Keyword Exchange, or the ticket and `spec.md` need retermIng onto
*Response-Required Message* and *Outstanding Reply*. That is a domain-modelling
decision, not an implementation one.

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

**Two defects were found by review and are fixed with regression tests that fail
without the fix.** The monthly opt-out language keyed off the last *question* sent
rather than the last *conversation* opened, so a Leader who answered on the 1st lost
that month's disclosure entirely. And the open sequence's covered relationships were
rebuilt from what the Leader leads *now*, so a relationship ending mid-week shortened
the list and bound every later answer to the wrong relationship — the sequence is now
resolved from the ids it opened with, which is what fixing the shape at open was for.

**Paused is derived from a `relationship.paused` history event.** Relationship state
lives in history throughout this codebase and pause has no column; ticket 12 is what
writes the event, and this ticket only reads it.

### OPEN — what a group check-in calls the group

**This was resolved by inference during implementation and should not have been.**
It is recorded here, and in `docs/open-questions.md`, for a human to decide.

`spec.md` says the question names *"a Participant's name when the relationship has one
participant, **the relationship's name** when it has more"*, and
`docs/check-in-rhythm.md` shows the intended message: *"Did you meet with Tuesday
Men's Group this week?"*. **`relationship` has no name column**, and nothing in this
repo has ever given a relationship a name.

What is built lists the Participants instead — *"Did you meet with Marcus and Dan this
week?"* — which is a real answer to *whom is this about* but is **not** what the spec
asked for, and it degrades as a group grows. The alternatives are a `name` column
filled at pairing, or an Admin-set label; both are schema and surface decisions
beyond this ticket.

Two tests currently lock the listing behaviour in. Whichever way this is decided,
they are the tests to change.

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

### Shipped — status line corrected 2026-08-31

All fourteen criteria were met when the work landed and the status line was left at
`ready-for-agent`. Verified before flipping it: `the-check-in-conversation.test.ts`
passes (10 tests), and the one item this ticket raised for a human — *what a group
check-in calls the group* — is parked in `docs/open-questions.md` under *pending
review before the first pilot*. A question parked there does not hold a ticket open.
