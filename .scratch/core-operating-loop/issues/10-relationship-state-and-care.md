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

Concern text is the most sensitive data in the product and is treated differently from every other record. It is reached one Person at a time rather than as a list, so reading it takes deliberate effort, and it is cleared when resolved, with no way to keep it, so the Ministry does not accumulate a permanent file of people's hardest weeks. Viewing a Concern and resolving one are both recorded against the Admin who did it.

**Both consecutive counters are anchored to the ISO week in the Ministry timezone**,
never to the interval since the last prompt. The cadence is a Ministry setting an Admin
can move (ticket 08b), and a week defined as *since the last prompt* would let a cadence
edit produce one week with two prompts and one with none — the counter would misfire
with nothing on any screen to show it. The counters derive from relationship history
against the ISO anchor, so they stay correct however the cadence moves. See
`docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.

Do not tighten the thresholds. Two weeks and three weeks were chosen deliberately, and a missed meeting is not wrongdoing.

**Blocked by:** 09

**Status:** shipped

- [x] State derivation is a pure function, tested table-driven over the state matrix
- [x] Two weeks of silence yields Stalled with the silence reason and a duration in days
- [x] Three not-met replies yield Stalled with the not-meeting reason and a duration in weeks
- [x] The two reasons and their units are distinguishable by the caller
- [x] A Concern sets Needs Care that week and returns to Healthy the following week while the badge persists
- [x] Stalled clears automatically on an answered check-in; a Concern does not
- [x] Multiple Concerns on one relationship show a count
- [x] Concern text is reached one Person at a time and cleared on resolution, with no exception
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

**A week is not countable until its conversation has ended.** The view walked
`checkin_sequence` without regard to whether a sequence had closed, so the week
that opened *this minute* already read as `unanswered`. With the week before it
also unanswered that made two, and the relationship went `Stalled` the instant the
second week's tick ran -- seven days in, on a threshold the ticket says twice is
not to be tightened. The integration test asserted the seven days as though it
were the intent.

*No reply arrived* is a fact about a finished conversation; while one is open the
Leader has not answered *yet*, which is a different thing. So
`public.relationship_weeks` now emits `closed_at` as one more fact, and
`isDetermined` in the domain decides what it means -- the same seam the view's own
comment draws, with the counting kept where a test can drive it. A week already
answered still counts, open or not: the Leader has spoken. Two weeks of silence
now reaches an Admin at fourteen days.

**A gap ends a run; *consecutive* means consecutive in the calendar.** No entry
exists for a week nothing covered -- a Pause, a relationship not yet accepted, a
Ministry whose cadence was off for a term -- and the first implementation stepped
over those and joined the entries either side. That welds a silent week in March
to a silent week in June and calls the pair two consecutive weeks of silence, and
it would accrue silence across a Pause the product promises accrues none. Runs now
check adjacency with `weeksApart`.

**Silence is counted from the first week Discipler asked, not from acceptance.**
The ticket says *days since last contact*, and for a Leader who has never replied
the first implementation counted from `accepted_at`. That can precede the first
covering sequence by months -- a Leader who agreed in March on a Ministry whose
cadence started in September would have been reported two hundred days silent
after exactly two unanswered weeks. Discipler can only count from when it started
asking.

**`gone_silent` is per relationship, not per Leader.** A Leader who answers about
their first two relationships every week and is never reached about the third and
fourth accrues silence on the third and fourth -- which is the settled reading
working as intended, and the invisible failure this ticket exists to catch. The
duration is days since anyone was last in contact *about that relationship*, and
the reason names no more than that. A separate reason distinguishing *covered but
never reached* from *asked and ignored* would be a third care reason, which the
ticket does not have and which is left for a ticket that wants one.

**Two prompts inside one ISO week count once.** Not stated, and it is the failure
the ISO anchor exists to prevent -- a cadence edit from late Sunday to early Monday
puts two prompts inside seven days. Relationship-weeks are collapsed one-per-week
on the way into the derivation, and a week anything was answered in is an answered
week. The first implementation counted both and a test caught it.

**The Care Needed *view* is a reader, not a page.** Every ticket so far has
shipped domain and persistence with no UI, and ticket 15 is the Leader dashboard.
`CareNeededReader.listOpenItems` returns the union as a tagged list -- one tag per
source -- and no page renders it yet.

**Resolving clears the words, and nothing can keep them.** The first pass read
*cleared by default* as implying an exception and built one: a `keepDetail` flag
on the command, with `detail_kept` recording which way it went. Settled the other
way on review -- there is no exception. The flag, the column and its constraints
are gone, and `concern_resolution_clears_its_words` makes a resolved Concern
carrying text unrepresentable, so the guarantee is the table's rather than the
application's. `docs/product-rules.md` and `docs/pastor-dashboard.md` are updated
to say so: not through inaction, and not by decision either.

Clearing one copy turned out not to be clearing. The same prose stood in two
other places, both written by ticket 08a and neither ever emptied:

- `checkin_prompt.detail`, the raw reply as it arrived. That table is granted
  wholesale to `authenticated`, so the sentence was readable there by any Admin
  with no viewing audit and nothing that cleared it. A Concern now carries the
  `prompt_id` it came from -- `not null`, because a Concern that cannot say where
  its other copy is cannot promise to clear it -- and `resolveConcern` closes the
  Concern and empties the prompt in one data-modifying CTE, so no window exists in
  which one is gone and the other is not. `checkin_prompt_answer_matches_its_question`
  is relaxed on its `concern_detail` branch to one direction, since an answered
  prompt may now legitimately hold no words.
- The `checkin.answered` history payload, which spread the reply wholesale and so
  carried the prose into append-only storage -- the very thing the `concern.raised`
  payload already refuses by name, for the stated reason that history outlives the
  resolution. It now records `raisedConcern: true` and not the words.

Two things this ticket did not close. `Paused` weeks are absent in the derivation
and covered by the state matrix, but the reader passes `pausedAt: null` because
nothing sets a pause until ticket 12 -- so that half of the *absent rather than
unanswered* criterion is proven in the domain and not end to end. And the
derivation's Stalled/Needs-Care assertion throws uncaught inside the reader's
loop, so the day it fires it takes the whole Care Needed view down for that
Ministry rather than one row. That is deliberate and commented where it happens:
the condition means a rule has stopped being true, and a surface whose purpose is
catching what would otherwise be invisible must not quietly drop the row that
proves it.

The audit on Concern text is enforced by a grant rather than by discipline:
`concern.detail` is not in the authenticated role's column grant, so the only path
to a Leader's words is `CommandService.openConcern`, which records the viewing in
the same transaction that returns them. An Admin selecting the column directly is
refused by Postgres, which
`tests/integration/relationship-state-and-care.test.ts` asserts.
