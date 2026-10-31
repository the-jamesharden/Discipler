# 05 - The texting gate

**What to build:** No text leaves Discipler for a church unless its subscription is trialing or active, or it is billed outside Stripe (Q32).

**Blocked by:** 03

**Status:** ready-for-agent

## The rule

- The check lives in the one query every outbound text passes through, in `src/platform/supabase/outbound-queue.ts`, not in any page.
- A text for a church without access stays unsent and is never retried into a send later.
- Verify codes are not outbound check-in texts and are not gated by this, so a church can verify its Admin before paying.
- Participants are never texted about billing.

## Acceptance

- A church whose subscription ends gets no further check-ins, reminders or invitation texts.
- A trialing church texts normally.
- SAU BCM, Anthem and Example Ministry keep texting with no subscription.
- A page action for a church without access refuses with a refusal code rather than queuing a text.
