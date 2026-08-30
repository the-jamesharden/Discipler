# 10 — Relationship State and the Care Needed view

**What to build:** A relationship that has gone silent for two weeks reaches the Admin while it can still be recovered. A relationship reporting three weeks of not meeting reaches them too, so a faithfully-answering Leader who never meets does not stay invisible. The care item says which condition fired, because "gone silent, 23 days" and "responding, not meeting, 3 weeks" call for completely different conversations and an Admin must know which one they are walking into before they pick up the phone.

State derivation is a pure function: a relationship's history in, its current state plus care reasons plus each reason's **duration** out. The duration's unit follows its reason — silence reports days since last contact, not-meeting reports weeks reported as no meeting. They cannot share a counter. None of this is a UI inference.

```
Awaiting Leader Acceptance  → created, not yet accepted
Healthy                     → default once accepted
Stalled                     → 2 consecutive unanswered check-ins
                            OR 3 consecutive "did not meet" replies
Needs Care                  → a Concern raised this week
Paused                      → masks the derived state (ticket 12)
Ended                       → terminal, with a reason (ticket 13)
```

A relationship holds exactly one state. **Concerns are not a state** — they are badges that persist beside the relationship until an Admin resolves them, so a relationship can be Healthy with unresolved Concerns outstanding. Stalled clears automatically on any answered check-in; a Concern clears only by explicit resolution. A Concern surfaces the week it is raised, and multiple Concerns on one relationship show a count.

Concern text is the most sensitive data in the product and is treated differently from every other record. It is reached one Person at a time rather than as a list, so reading it takes deliberate effort, and it is cleared by default when resolved, so the Ministry does not accumulate a permanent file of people's hardest weeks. Viewing a Concern and resolving one are both recorded against the Admin who did it.

**Both consecutive counters are anchored to the ISO week in the Ministry timezone**,
never to the interval since the last prompt. The cadence is a Ministry setting an Admin
can move (ticket 08b), and a week defined as *since the last prompt* would let a cadence
edit produce one week with two prompts and one with none — the counter would misfire
with nothing on any screen to show it. The counters derive from relationship history
against the ISO anchor, so they stay correct however the cadence moves. See
`docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.

Do not tighten the thresholds. Two weeks and three weeks were chosen deliberately, and a missed meeting is not wrongdoing.

**Blocked by:** 09

**Status:** done

- [x] State derivation is a pure function, tested table-driven over the state matrix
- [x] Two weeks of silence yields Stalled with the silence reason and a duration in days
- [x] Three not-met replies yield Stalled with the not-meeting reason and a duration in weeks
- [x] The two reasons and their units are distinguishable by the caller
- [x] A Concern sets Needs Care that week and returns to Healthy the following week while the badge persists
- [x] Stalled clears automatically on an answered check-in; a Concern does not
- [x] Multiple Concerns on one relationship show a count
- [x] Concern text is reached one Person at a time and cleared by default on resolution
- [x] Viewing and resolving a Concern are recorded against the acting Admin
- [x] Care Needed shows relationships needing attention with their reason and duration
- [x] Consecutive unanswered check-ins and consecutive not-met weeks are counted over ISO weeks in the Ministry timezone
- [x] Moving the Ministry's check-in day or hour does not change either counter for weeks already recorded

## Comments

### Settled — a covered week counts, whether or not its question was reached

A relationship-week counts as **unanswered** when the relationship was covered by an
open Check-In Sequence that week and no reply arrived for it — whether or not its
question was ever sent.

The alternative, counting only questions actually sent, has a hole big enough to defeat
this ticket. A question waits 24 hours, is re-sent once, and waits 24 more before the
sequence advances (ticket 09), so a fully silent Leader with four relationships needs
eight days to work through one sequence. A new week arrives first and abandons it. Under
sent-only counting, that Leader's third and fourth relationships are never asked, never
accrue a counter, and stay `Healthy` indefinitely — the invisible failure this ticket
exists to catch, arriving on the Leader most in need of catching.

The test is checkable from history alone: the sequence existed, its ordering covered the
relationship, no reply landed. Weeks stay genuinely absent only where already settled —
`Paused` and `Awaiting Leader Acceptance`.

### Settled — Stalled and Needs Care cannot co-occur, and that is asserted rather than ruled

No precedence rule is added, because the two cannot both hold. `Needs Care` requires a
Concern raised this week, which requires a `1` then a `C`. That reply establishes a
meeting happened and the week was answered, resetting the consecutive-unanswered count
and breaking the not-meeting streak. Both Stalled conditions are cleared by the very
reply that raises the Concern.

A precedence rule would be dead code that becomes silently wrong the moment something
else can raise a Concern — Participant check-ins, or an Admin raising one by hand —
whereas an assertion fails loudly at exactly that moment.

Concern badges are unaffected and outlive the week: a relationship may be `Stalled`
weeks later with unresolved Concerns beside it.

### Settled — Concerns live in their own table

Not in ticket 07's `follow_up_item`. The four properties this ticket gives a Concern —
text reached one Person at a time, cleared by default on resolution, viewing as well as
resolving audited, a count when several are outstanding — are shared by nothing else in
that table, and cleared-by-default is a destructive update sitting beside durable admin
records. Care Needed unions the two.

- [x] A relationship covered by an open sequence with no reply counts as unanswered that week, even where its question was never sent
- [x] A silent Leader with four relationships accrues counters on all four, proven by a test that runs two abandoned sequences
- [x] Paused and Awaiting Leader Acceptance weeks are absent rather than unanswered
- [x] The state matrix asserts that Stalled and Needs Care never co-occur, with the reason recorded in the test
- [x] Concerns are stored separately from follow-up items and Care Needed unions both

### Implemented

Domain in `src/domain/relationship-state.ts` (the derivation) and
`src/domain/concerns.ts` (what a Concern is), wired through
`src/domain/boundary.ts`; migration
`supabase/migrations/20260903000100_concerns_and_the_care_needed_view.sql`; the
union in `src/platform/supabase/care-needed-reader.ts`. Tests:
`tests/domain/relationship-state.test.ts` (the state matrix, table-driven),
`tests/domain/concerns.test.ts`, and
`tests/integration/relationship-state-and-care.test.ts`.

Four things the ticket left open, resolved as follows.

**A Concern resolved inside its own week stops setting `Needs Care`.** The ticket
says a Concern raised this week sets the state and says nothing about one an Admin
resolves on the Tuesday. Reading it as *raised this week* alone would leave the
relationship in `Needs Care` until Monday with nothing outstanding on it, which is
the opposite of what resolving means. So the state follows the *unresolved*
Concerns raised this week. The badge is unaffected either way -- it is gone,
because it was resolved.

**Absent weeks join a run rather than breaking it.** No entry exists for a week no
sequence covered, so a relationship silent in week 1, paused for weeks 2-4 and
silent again in week 5 reads as two consecutive unanswered weeks. This follows
from the settled reading rather than being chosen: unanswered means *covered and
no reply*, so weeks nothing covered are not in the list to break anything. Worth
revisiting when ticket 12 builds the Pause, because that is when it becomes
observable.

**Two prompts inside one ISO week count once.** Not stated, and it is the failure
the ISO anchor exists to prevent -- a cadence edit from late Sunday to early Monday
puts two prompts inside seven days. Relationship-weeks are collapsed one-per-week
on the way into the derivation, and a week anything was answered in is an answered
week. The first implementation counted both and a test caught it.

**The Care Needed *view* is a reader, not a page.** Every ticket so far has
shipped domain and persistence with no UI, and ticket 15 is the Leader dashboard.
`CareNeededReader.listOpenItems` returns the union as a tagged list -- one tag per
source -- and no page renders it yet.

The audit on Concern text is enforced by a grant rather than by discipline:
`concern.detail` is not in the authenticated role's column grant, so the only path
to a Leader's words is `CommandService.openConcern`, which records the viewing in
the same transaction that returns them. An Admin selecting the column directly is
refused by Postgres, which
`tests/integration/relationship-state-and-care.test.ts` asserts.
