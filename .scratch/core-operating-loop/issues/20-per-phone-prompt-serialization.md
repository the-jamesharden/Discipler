# 20 — One conversation per phone

**What to build:** A phone holds one conversation at a time. Where two scheduled messages would both land on the same number awaiting an answer, the second waits.

A phone number, not a Person, is the unit — a phone can only hold one thread regardless of how many people are reachable on it. Before a scheduled prompt is dispatched, the queue looks for an open prompt on that number: sent, unanswered, not superseded, not timed out. If one exists the new prompt is held rather than sent, and released when the open one closes by answer, supersession, or timeout. The check runs inside the queue worker's existing row lock so two workers cannot both decide the number is free.

**Keyword commands and their prompts always preempt.** `docs/check-in-rhythm.md` settles that the most recent prompt owns the next reply and that a keyword exchange opened mid-sequence takes it while the check-in question stays unanswered with its reminder clock running. Serialization must not quietly reverse that: a Leader who texts `PAUSE` gets the confirmation immediately, not after answering the check-in they are trying to pause. Serialization governs scheduled sends — nudges and Participant-facing messages — and never a reply to something the Person just sent.

This is what makes reply binding by most-recent-prompt safe for scheduled traffic, and the two rules have to be read together. The sequence diagram in `docs/check-in-rhythm.md` should show the hold and the preemption.

**Blocked by:** 03, 17

**Status:** ready-for-agent

- [ ] A scheduled prompt to a number with an open prompt is held, not sent
- [ ] A held prompt is released on answer, on supersession, and on timeout
- [ ] The timeout sweep releases the hold, proven by a test that advances the injected clock
- [ ] The open-prompt check runs inside the worker's row lock, so concurrent workers cannot both send
- [ ] A keyword command and its confirmation are never held behind an open check-in question
- [ ] A held message consumes no nudge budget
- [ ] The check-in rhythm's sequence diagram shows both the hold and the keyword preemption

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

Two consequences: the longest a scheduled message can wait behind a hold is 48 hours, and
that is also the longest window over which a held message must consume no nudge budget —
already required above, and this is where it bites hardest.

- [ ] A check-in question times out at 48 hours or at the start of a new week, whichever is first
- [ ] A Keyword Exchange times out at 24 hours with no reminder
- [ ] A message expecting no reply opens no hold, proven by a Starter Message that does not delay the first check-in
- [ ] The maximum hold a scheduled message can experience is 48 hours

### Expect one migration after all — 2026-08-28

Ticket 03 landed `prompt_key`, `prompt_state` and the partial index this ticket
queries, and claimed serialisation would therefore be a query change rather than a
migration. That claim is narrower than it read, and the ticket 03 review corrected
it.

The rules above need `outbound_message` to say what *kind* of message a row is: a
keyword command and its confirmation are never held, a message expecting no reply
opens no hold, and a held message consumes no nudge budget. Nothing on the table
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
