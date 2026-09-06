# 35 - A reply is answered at once

**What to build:** The webhook that receives a text sends what the reply produced as soon as it has acknowledged the text, instead of leaving it for the scheduler's next pass on the hour.

Raised by James on 2026-09-05, from a real phone against production.
His words: it asks the first thing, I responded, it recorded the response and showed it on the front end, but it never asked the second question and never sent the final thank-you message.

**Status:** claimed

## What actually happened

The reply at 11:43 UTC on 2026-09-02 was recorded and the satisfaction question was enqueued in the same second.
It was sent at 12:00:04, by the hourly cron.
The `A` at 13:22 completed the sequence and enqueued the thank-you, which was sent at 14:00:04.
Nothing was lost; every message in the conversation waited for the top of the hour.

`docs/check-in-rhythm.md` already says a reply to something the person just sent is never held and that a keyword's confirmation is sent at once.
The code never delivered that: the webhook enqueued and returned, and `dispatchQueue` had one caller, the scheduled tick.

## Decisions

1. The webhook drains the Ministry's queue after it has acknowledged the text.
   After rather than before, because the vendor is waiting on the acknowledgement and the send is its own round trip to that same vendor.
   A drain that fails leaves its rows neither sent nor withheld, and the scheduler's next pass retries them, exactly as before.
2. Two drains of one Ministry never overlap.
   With the webhook draining, two drains meeting is an ordinary Monday evening: a reply in the same second the hour turns, or two Leaders replying together.
   The per-row lock in `claim` is held for the claim and not for the vendor's round trip, so a second drain listing the queue in that gap sent the same text twice; that was reproduced before it was locked out.
   The queue serialises drains per Ministry with a session-level advisory lock held on one connection for the whole drain.
   See ADR-0020.
3. The drain is assembled in one place, `drainOutboundQueue` in the container, so the scheduler and the webhook cannot assemble it differently.

## Where it lands

- `app/sms/inbound/route.ts`: the drain, after the acknowledgement.
- `src/service/ports.ts` and `src/platform/supabase/outbound-queue.ts`: `whileDraining`.
- `src/service/outbound-dispatch.ts`: `dispatchQueue` runs inside it.
- `src/service/container.ts`: `drainOutboundQueue`, which the cron route now uses too.
- `tests/integration/the-sending-layer.test.ts`: two drains at once send each message once.
- `tests/integration/inbound-over-http.test.ts`: the webhook drains after it acknowledges.

## Not this ticket

The test Ministry on production has four People on one number, so a reply from that handset resolves to nobody and is dropped.
That is the shared-number state ticket 26 keeps deliberately, and it is why one of the two test threads on production was never answered at all.
