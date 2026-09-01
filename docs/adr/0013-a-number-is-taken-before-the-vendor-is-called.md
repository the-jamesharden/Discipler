# A Number Is Taken Before the Vendor Is Called

## Status

accepted

## Decision

The queue worker takes a recipient's number — writes `prompt_state = 'open'` on the row
it is about to send — **inside the same transaction as the row lock, before Twilio is
called**, not after delivery succeeds.

When the vendor then refuses the message, the worker gives the number back. The row is
left neither sent nor withheld and the next drain reconsiders it.

## Context

Ticket 20 requires that a phone hold one conversation at a time and that *the check runs
inside the queue worker's row lock, so concurrent workers cannot both send*.

Two workers draining one Ministry at once lock two different rows. Row locks alone
therefore serialise nothing here: what the two workers contend for is the **number**,
which is on neither row lock's path. The thing that actually serialises them is the
partial unique index on `outbound_message (ministry_id, prompt_key) where prompt_state
= 'open'` — and an index only serialises writes that have happened.

That is what forces the ordering. There are two places the write can go:

- **After delivery.** Then `open` means what the glossary says — sent, awaiting a reply
  — and nothing false is ever recorded. But both workers read a free number, both call
  Twilio, and the loser of the race discovers it *after* a text has landed on somebody's
  phone. The rule is enforced one message too late.
- **Before delivery.** Then the loser is refused by the index before it calls anybody,
  and the cost is that `open` briefly means *the queue has committed to sending this*
  rather than *this was sent*.

A duplicate text to a congregant is not recoverable. A row that claims a conversation
for a few hundred milliseconds is.

## Consequences

`prompt_state = 'open'` reads, precisely, as *the queue has taken this number*. For
every row that reaches a phone — which is all of them, on the ordinary path — that is
the same instant as the send, and `sent_at` says which.

A vendor refusal releases the number immediately, so a Twilio outage does not silently
hold a congregation's conversations for two days. What the release does **not** undo is
any supersession the claim caused: a keyword question that preempted a check-in question
and then failed to deliver leaves that question superseded rather than restoring it. A
Leader mid-keyword is mid-keyword whether or not the confirmation reached them, and
re-opening a question they have moved on from is the worse of the two wrongs.

The index is keyed on `(ministry_id, prompt_key)` rather than on the number alone, so
what is serialised is a number *within a Ministry*. One handset reachable in two
Ministries therefore holds two conversations, one per tenant. That is deliberate: every
read on this path is bounded by `app.command_ministry_id()`, so a global key would let
one congregation's open question hold another's message with neither side able to see
the row holding it or to sweep it. Whether one handset in two Ministries is one
conversation is ticket 26's question, and it is not answered here by making a tenant
wait on a row it may not read.

A worker killed between the claim and the vendor call leaves a number taken by a message
that never went out. It is bounded rather than permanent — but only because the sweep is
measured from `reply_opened_at`, written by the claim, and not from `sent_at`, which that
row will never have. A sweep reading `sent_at` would step over precisely the hold nobody
else can release, which is why the column exists.

**What this does not decide.** Whether a permanently-refused message should eventually be
parked instead of retried forever is untouched, and is the same open question
`dispatchQueue` already carries.
