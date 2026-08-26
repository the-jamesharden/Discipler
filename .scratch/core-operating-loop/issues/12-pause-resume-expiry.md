# 12 — Pause, resume, and pause expiry

**What to build:** An Admin can pause a relationship, so they can act on something they have been told offline, and a holiday does not put a Leader in the care queue. A paused relationship stays on the Leader's list and on the Admin dashboard, visibly marked `Paused` and distinguishable from Healthy, Stalled, and Ended — stepping back never costs a Leader the people they lead. Membership is unchanged and nobody returns to the suggestion pool, so a Participant is never returned to the pool without being asked.

`Paused` **masks** the derived state rather than replacing the history behind it. No new unanswered check-ins accrue during a pause, and the pause does not answer the old ones. On resume the underlying state resurfaces — a relationship that was Stalled when it was paused is Stalled again and stays there until an answered check-in clears it. **Resuming never sets Healthy on its own**; doing so would silently erase a live care signal.

A pause runs for exactly one of five periods — 1, 2, 4, 8, or 12 weeks, defaulting to 2 — because a summer away and a fortnight away are not the same thing.

**An expired pause resumes nothing.** Expiry changes no state, sends nothing, and raises a follow-up item for the Admin showing which period was selected, that it has expired, and that the relationship has not resumed. The relationship stays `Paused` until an Admin resumes or ends it. Nobody's check-ins restart on a date they have forgotten. Resuming releases the Starter Message; expiry never does.

An expired pause is not a state and not a care condition derived from check-in history. Like a Concern it sits beside the relationship, coexists with any state, and clears only by explicit Admin action.

Leader-initiated pause over SMS is ticket 17.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] An Admin can pause a relationship for 1, 2, 4, 8, or 12 weeks, defaulting to 2
- [ ] Pausing suppresses that relationship's check-ins, keeps membership, and keeps everyone out of the suggestion pool
- [ ] A paused relationship stays visible and marked `Paused` to both its Leader and the Admin
- [ ] `Paused` masks the derived state; no unanswered check-ins accrue and none are answered
- [ ] A relationship Stalled when paused is Stalled on resume and clears only on an answered check-in
- [ ] Resume never sets Healthy on its own
- [ ] Pause expiry raises a follow-up item, sends nothing, and leaves the state `Paused`
- [ ] The follow-up item shows the selected period and that it has expired
- [ ] An Admin resuming releases the Starter Message; expiry never does
- [ ] The expiry item clears only by Admin action
