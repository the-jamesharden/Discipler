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
