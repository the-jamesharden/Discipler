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

Do not tighten the thresholds. Two weeks and three weeks were chosen deliberately, and a missed meeting is not wrongdoing.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] State derivation is a pure function, tested table-driven over the state matrix
- [ ] Two weeks of silence yields Stalled with the silence reason and a duration in days
- [ ] Three not-met replies yield Stalled with the not-meeting reason and a duration in weeks
- [ ] The two reasons and their units are distinguishable by the caller
- [ ] A Concern sets Needs Care that week and returns to Healthy the following week while the badge persists
- [ ] Stalled clears automatically on an answered check-in; a Concern does not
- [ ] Multiple Concerns on one relationship show a count
- [ ] Concern text is reached one Person at a time and cleared by default on resolution
- [ ] Viewing and resolving a Concern are recorded against the acting Admin
- [ ] Care Needed shows relationships needing attention with their reason and duration
