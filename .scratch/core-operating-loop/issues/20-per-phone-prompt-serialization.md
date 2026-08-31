# 20 — One conversation per phone

**What to build:** A phone holds one conversation at a time. Where two scheduled messages would both land on the same number awaiting an answer, the second waits.

A phone number, not a Person, is the unit — a phone can only hold one thread regardless of how many people are reachable on it. Before a scheduled prompt is dispatched, the queue looks for an open prompt on that number: sent, unanswered, not superseded, not timed out. If one exists the new prompt is held rather than sent, and released when the open one closes by answer, supersession, or timeout. The check runs inside the queue worker's existing row lock so two workers cannot both decide the number is free.

**Keyword commands and their prompts always preempt.** `docs/check-in-rhythm.md` settles that the most recent prompt owns the next reply and that a keyword exchange opened mid-sequence takes it while the check-in question stays unanswered with its reminder clock running. Serialization must not quietly reverse that: a Leader who texts `PAUSE` gets the confirmation immediately, not after answering the check-in they are trying to pause. Serialization governs scheduled sends — the check-in rhythm and the Participant-facing messages around it — and never a reply to something the Person just sent.

This is what makes reply binding by most-recent-prompt safe for scheduled traffic, and the two rules have to be read together. The sequence diagram in `docs/check-in-rhythm.md` should show the hold and the preemption.

**Blocked by:** 03, 17

**Status:** done

- [x] A scheduled prompt to a number with an open prompt is held, not sent
- [x] A held prompt is released on answer, on supersession, and on timeout — supersession closes the reply but never frees the number on its own; see below
- [x] The timeout sweep releases the hold, proven by a test that advances the injected clock
- [x] The open-prompt check runs inside the worker's row lock, so concurrent workers cannot both send — outcome met; see *Two criteria that are met by a different mechanism* below, the row lock is not what enforces it
- [x] A keyword command and its confirmation are never held behind an open check-in question
- [x] The check-in rhythm's sequence diagram shows both the hold and the keyword preemption

## Comments

### Settled — what "timed out" means, per prompt kind

A prompt is **timed out** at the moment a reply to it can no longer change anything. The
hold above depends on this and it spans tickets 08a, 09, 17 and 20, so the four cases are
fixed here:

- **Check-in question** — 48 hours after the original send (24 to the reminder, 24 more
  before the sequence advances), or immediately when a new week's sequence begins,
  whichever comes first.
- **Concern detail request** — the same 48 hours. The `C` and the badge are already
  recorded, so nothing is lost by passing over it.
- **Keyword Exchange** — 24 hours after it opened, with no reminder.
- **Messages expecting no reply** — Welcome, Starter, closing thank-you, and a reminder
  re-send. These are never open and **never hold the phone at all.** A Starter Message
  that opened a hold would block its own relationship's first check-in.

One consequence: the longest a scheduled message can wait behind a hold is 48 hours.

This once carried a second — that a held message consumes no nudge budget over that same
window — which no longer says anything. There is no nudge budget: Nudge sends nothing, so
nothing admin-initiated is metered. Withdrawn by ADR 0010.

- [x] A check-in question times out at 48 hours or at the start of a new week, whichever is first
- [x] A Keyword Exchange times out at 24 hours with no reminder
- [x] A message expecting no reply opens no hold, proven by a Starter Message that does not delay the first check-in
- [x] The maximum hold a scheduled message can experience is 48 hours — per open conversation in front of it, not cumulative; see below

### Expect one migration after all — 2026-08-28

Ticket 03 landed `prompt_key`, `prompt_state` and the partial index this ticket
queries, and claimed serialisation would therefore be a query change rather than a
migration. That claim is narrower than it read, and the ticket 03 review corrected
it.

The rules above need `outbound_message` to say what *kind* of message a row is: a
keyword command and its confirmation are never held, and a message expecting no reply
opens no hold. Nothing on the table
distinguishes a scheduled prompt from a keyword reply today. `prompt_state` is null
on every row so far, so nullness cannot stand in for it -- a Welcome Message and an
unsent check-in question are both null and are governed by opposite rules.

Plan for adding a message-kind column here. The columns ticket 03 added still hold:
they are the serialisation key and the reply lifecycle, and neither has to change.

### Note on the glossary

`CONTEXT.md` avoids "prompt" as a model term, and now carries **Outstanding Reply**
for the concept these columns actually name. The column names follow this ticket
rather than the glossary, deliberately, so that what lands here finds what it
expects; the glossary entry says so.

### Built — 2026-08-31

Landed as `outbound_message.message_kind` (`scheduled_question`, `keyword_question`,
`no_reply`) and `reply_opened_at`, the rules in `src/domain/outstanding-reply.ts`, a
`claim`/`release` pair on the outbound queue, and a sweep the tick runs every pass.
`docs/check-in-rhythm.md` gained *One conversation per phone* with both diagrams;
`docs/adr/0013` records why the number is taken before the vendor is called.

Spelled *question* rather than *prompt* in everything new. `CONTEXT.md` avoids the
second word and exempts only the two columns that predate it; extending it to a new
enum would have spread the ambiguity the glossary is trying to contain, and
`keyword_prompt` in particular reads as the Keyword Exchange the glossary warns these
columns are not.

Three things this settled that the ticket left implicit.

**A message expecting no reply is never *held* either, not only never *holding*.** The
ticket fixes that such a message opens no hold; it does not say whether one waits. It
cannot: a next-day reminder re-sends the very question that is holding the number, so a
reminder that waited could only ever be released by the timeout that makes it
pointless. Held is therefore exactly `scheduled_question`.

**A new week times out last week's *question* and leaves a Keyword Exchange alone.**
The settled comment above scopes the new-week timeout to the check-in question, and
following it literally is also what keeps *keyword commands and their prompts always
preempt* true where the two rules meet: a week's first question waits behind an open
exchange, for at most the twenty-four hours it has left.

**Serialisation is enforced per Ministry.** The unique index is on
`(ministry_id, prompt_key)`, not on the number alone. Every read on this path is
bounded by `app.command_ministry_id()`, so a global index would let one congregation's
open question hold another's message on a shared handset with nothing on either side
able to see or release it. Whether one handset reachable in two Ministries is one
conversation is ticket 26's, and is not answered here by making a tenant wait on a row
it may not read.

#### Two criteria that are met by a different mechanism than the wording assumes

**"The check runs inside the worker's existing row lock."** There was no existing row
lock; the queue read and wrote with none. One was added — `for update skip locked` on
the row being sent — and the whole claim is one transaction, but the row lock is not
what makes the check safe. Two workers hold *two different rows* and share only the
key, so what actually refuses the second of them is the partial unique index. ADR 0013
says so outright. The criterion's outcome holds; its stated mechanism was not in the
code and could not have been sufficient.

**"A held prompt is released on … supersession."** Supersession closes an outstanding
reply — the row goes to `superseded`, which is what the ticket asks for — but it never
frees a number, because the only thing that supersedes is a keyword question, and that
question takes the number in the same statement. A hold is released by supersession
only in the chain *superseded → the new question answered or timed out*, or where the
vendor then refuses the superseding message and `release` gives the number back. The
state transition is asserted; a release caused by supersession alone does not exist and
is not claimed.

#### Two corrections to what this ticket asserts

**The 48-hour ceiling is per open conversation, not per message.** *The longest a
scheduled message can wait behind a hold is 48 hours* holds where one conversation is
in front of it. Three Leaders on one handset queue behind each other, and the third
waits behind two consecutive 48-hour windows. Nothing caps the cumulative wait, and
nothing here invented a cap: in practice the new week that times out every open
question ends the queue first. `docs/check-in-rhythm.md` states it the accurate way.

**Open — the reminder clock runs on a question that has not been sent.** A
`checkin_prompt` row is written when the question is *composed*, and the hold applies
to the message. A question held behind another conversation is therefore reminded
twenty-four hours after it was composed — and the reminder is a `no_reply` message, so
it goes out immediately, ahead of the original it re-sends. The Leader receives the
question once, as a reminder, and again when the number frees. Bounded by the
forty-eight hour ceiling and not obviously wrong, but nothing in this ticket or in
`docs/check-in-rhythm.md` settles it, so nothing here invented a rule for it. It wants
a decision: either the reminder clock starts at send rather than at composition, or a
held question suppresses its own reminder.
