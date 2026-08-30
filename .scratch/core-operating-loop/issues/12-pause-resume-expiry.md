# 12 — Pause, resume, and pause expiry

**What to build:** An Admin can pause a relationship, so they can act on something they have been told offline, and a holiday does not put a Leader in the care queue. A paused relationship stays on the Leader's list and on the Admin dashboard, visibly marked `Paused` and distinguishable from Healthy, Stalled, and Ended — stepping back never costs a Leader the people they lead. Membership is unchanged and nobody returns to the suggestion pool, so a Participant is never returned to the pool without being asked.

`Paused` **masks** the derived state rather than replacing the history behind it. No new unanswered check-ins accrue during a pause, and the pause does not answer the old ones. On resume the underlying state resurfaces — a relationship that was Stalled when it was paused is Stalled again and stays there until an answered check-in clears it. **Resuming never sets Healthy on its own**; doing so would silently erase a live care signal.

A pause runs for exactly one of five periods — 1, 2, 4, 8, or 12 weeks, defaulting to 2 — because a summer away and a fortnight away are not the same thing.

**An expired pause resumes nothing.** Expiry changes no state, sends nothing, and raises a follow-up item for the Admin showing which period was selected, that it has expired, and that the relationship has not resumed. The relationship stays `Paused` until an Admin resumes or ends it. Nobody's check-ins restart on a date they have forgotten. Resuming releases the Starter Message; expiry never does.

An expired pause is not a state and not a care condition derived from check-in history. Like a Concern it sits beside the relationship, coexists with any state, and clears only by explicit Admin action.

Leader-initiated pause over SMS is ticket 17.

**Blocked by:** 10

**Status:** shipped

- [x] An Admin can pause a relationship for 1, 2, 4, 8, or 12 weeks, defaulting to 2
- [x] Pausing suppresses that relationship's check-ins, keeps membership, and keeps everyone out of the suggestion pool
- [x] A paused relationship stays visible and marked `Paused` to both its Leader and the Admin
- [x] `Paused` masks the derived state; no unanswered check-ins accrue and none are answered
- [x] A relationship Stalled when paused is Stalled on resume and clears only on an answered check-in
- [x] Resume never sets Healthy on its own
- [x] Pause expiry raises a follow-up item, sends nothing, and leaves the state `Paused`
- [x] The follow-up item shows the selected period and that it has expired
- [x] An Admin resuming releases the Starter Message; expiry never does
- [x] The expiry item clears only by Admin action

## Comments

Shipped. A Pause has no table and no column: it is two events in `ministry_event`
— `relationship.paused` and `relationship.resumed` — and what stands right now is
the later of them. That is what the spec asks for by name (*Pauses are dated
rather than mutated*), it is the shape ticket 08a's check-in snapshot already
assumed, and it means the whole ticket adds one SQL function and no schema.

**What landed.** `src/domain/pause.ts` owns the five periods, the default of two,
and the expiry arithmetic — `follow-up.ts` now imports the period from it rather
than defining it, which is what its own comment asked for. Two commands,
`relationship.pause` and `relationship.resume`, refused by a new `PauseRefused`
for the four cases that are not a pause: not accepted, ended, already paused, not
paused. The tick gained Pause expiry, reading a `paused` snapshot that is absent
rather than empty like every other thing it reads. `RelationshipSnapshot` grew the
standing pause and full members — a resume needs a name, a number and a decline
link for everyone in the relationship — and `memberIds` became `members`, which
cancel reads through. `public.relationship_pauses` is the one read that cannot be
a plain select, and both the command connection and the Care Needed view use it.

**The Starter Message on resume is the acceptance copy, unchanged.** The spec says
*releases the Starter Message* in both places and never describes a second
message, so the same two bodies are composed once in `starterMessages` and used by
both callers. The Leader's reads well on a resume — *you're now meeting with
Emily; we'll check in each week*. The Participant's opens *good news, you've been
matched*, which reads oddly a fortnight later. **Worth a product decision:** either
that is fine, or a resume wants its own sentence. No copy was invented here
because inventing it would be a product decision made in an implementation ticket.

A resume reuses the live Invitation Link a Participant already holds rather than
minting one, because a Person holds at most one live link per relationship and
there is a unique index that says so. It issues one only where none is live.

**Resuming does not resolve the `pause_expired` item.** The ticket says the item
clears only by explicit Admin action and draws the parallel with a Concern, which
clears only by explicit resolution. `relationship.cancel` sets the same precedent:
it does not close the `relationship_unaccepted` item that surfaced it either.
Resolving is the second click, and it records who and when.

By the same precedent, an Admin who resolves the expiry item *without* resuming
has closed a record rather than restarted anybody's check-ins — so the condition
is true again and the next tick raises it again. That is exactly what the
acceptance escalation does, and the dedupe index makes it one item however many
times it is raised while the history accumulates.

**One gap surfaced rather than resolved.** An Admin pausing a relationship whose
check-in question is currently open does not withdraw that question. The spec
states the withdrawal rule only in the Keyword Exchange section — *a keyword
resolving to the relationship whose check-in question is currently open withdraws
that pending question, so a pause never accrues silence against itself* — and the
ticket that builds it is 17. So an Admin pause taken mid-conversation lets that
one in-flight week age into an unanswered one, which is invisible while the
relationship is masked as `Paused` and shows up on resume as one week closer to
`Stalled`. Whether the principle is general or belongs to the keyword route is a
product question; implementing it here would have been inferring the answer.

**Not built, because nothing asks for it yet.** There is no screen. Pause, resume
and the expiry item are reachable through `CommandService.execute` and the Care
Needed reader, which is where tickets 07, 10 and 11 also stop — the six-tab Admin
dashboard is a follow-up spec.

`npm test`: 771 passing, 63 files. `tsc --noEmit` clean.
