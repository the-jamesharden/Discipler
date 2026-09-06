# One Drain per Ministry at a Time

## Status

accepted

## Decision

**Two drains of one Ministry's outbound queue never overlap.**
`dispatchQueue` runs inside `OutboundQueue.whileDraining`, which takes a session-level advisory lock keyed on the Ministry and holds it on one connection for the whole drain.
A second drain of the same Ministry waits for the first to finish and then runs.
Drains of different Ministries do not wait on each other.

## Context

Ticket 35 made the inbound webhook drain the queue the moment a reply is acknowledged, so a conversation advances in seconds rather than at the top of the hour.
That gave the drain a second caller, and two drains of one Ministry meeting became ordinary: a reply in the same second the hour turns, or two Leaders replying together.

ADR-0013 settled what two workers contend for on one *number*, and the partial unique index refuses the second of them.
It did not settle what two workers do with one *row*.
The row lock in `claim` is held for the claim's own transaction, deliberately, so that no transaction stays open across the vendor's round trip.
The vendor is called after that commit and `sent_at` is written after the vendor answers.
A drain that lists the queue inside that gap finds a row neither sent nor withheld, claims it again, and sends it again.
A message expecting no reply, which is most of them, writes nothing at claim time at all.
This was reproduced with a second drain started while the first was at the vendor: one row, two sends.

Two ways to close it were considered.

- **An in-flight marker on the row.**
  A `claimed_at` the drain stamps and `due` skips for a while, with a window after which a dead worker's row is retried.
  It needs a migration, a duration nothing else in the product owns, and the retry of a row whose send may or may not have happened.
- **One drain at a time.**
  A lock per Ministry, no schema, no window.
  A drain waits behind a few vendor calls at most, and a dead worker drops its connection and the lock with it.

A duplicate text to a congregant is not recoverable, and the second option makes it impossible rather than unlikely.

## Consequences

The queue's own serialisation, the row lock and the open-reply index, stays as it is.
It is now defence in depth on the ordinary path and the whole defence on none.

A drain blocks rather than skips when the lock is taken.
A drain that skipped would leave the message it came for to the scheduler's next pass, which is exactly the wait the webhook's drain exists to remove.

The lock is held on a connection from a pool of its own, of one, for the drain's duration.
Its own pool because the connections a drain works through must never be the ones its waiters hold: enough replies arriving together could otherwise hold every connection waiting for a lock whose holder then could not borrow one to finish with.
A second waiter in the same process queues for that one connection; a waiter in another process queues in Postgres for the lock.
Both wait behind a few vendor calls at most, and a pilot's queue between ticks is a handful of rows.

The lock is per Ministry.
One congregation's slow vendor call does not hold another's replies, for the reason every other queue method names the Ministry it acts for.
