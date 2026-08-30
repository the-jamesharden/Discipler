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
matched*, which reads oddly a fortnight later. No copy was invented here, because
inventing it would be a product decision made in an implementation ticket: it is
parked in `docs/open-questions.md` instead.

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

**One gap surfaced rather than resolved, and parked.** An Admin pausing a
relationship whose check-in question is currently open does not withdraw that
question. The spec states the withdrawal rule only in the Keyword Exchange section
— *a keyword resolving to the relationship whose check-in question is currently
open withdraws that pending question, so a pause never accrues silence against
itself* — and the ticket that builds it is 17. So an Admin pause taken
mid-conversation still draws that question's next-day reminder, and lets the week
age into an unanswered one: invisible while the relationship is masked as
`Paused`, and one week closer to `Stalled` when it resumes. Whether the principle
is general or belongs to the keyword route is in `docs/open-questions.md`;
implementing it here would have been inferring the answer.

**One checkbox is ticked on partial evidence, deliberately.** *Stays visible and
marked `Paused` to both its Leader and the Admin* is proven on the Admin side —
Care Needed drops it, and the derivation reports `paused` — and on the membership
that keeps it on the Leader's list at all. There is no Leader Dashboard to read it
from yet; that is ticket 15, and it renders from the same derivation.

**Not built, because nothing asks for it yet.** There is no screen. Pause, resume
and the expiry item are reachable through `CommandService.execute` and the Care
Needed reader, which is where tickets 07, 10 and 11 also stop — the six-tab Admin
dashboard is a follow-up spec.

`npm test`: 771 passing, 63 files. `tsc --noEmit` clean.

### Review pass

Two axes, `7802866...HEAD`. Four findings acted on.

**One bad row had two answers.** `care-needed-reader.pausesOf` dropped a pause
whose period had drifted out of the five — silently un-masking the relationship
back into the care queue — while `effect-store.pausedRelationships` threw and took
the whole Ministry's tick with it. Both now go through one `readStandingPause` in
`src/domain/pause.ts`, which throws and names the row. Dropping it is the wrong
answer given confidently on the surface that exists to prevent exactly that, and
the row cannot be written through the command boundary at all, so reaching it
means somebody wrote SQL.

**`pause.ts` claimed a check constraint it does not have.** The constraint is on
the `pause_expired` *item* payload; nothing constrains the `ministry_event` a Pause
is. The comment now says which is which, and points at the read-side check.

**The expiry-item test proved less than its name.** *"Only by an Admin resolving
it"* asserted an empty queue immediately after resolving and never ran another
tick. It now runs two, and a second test covers the case the ticket comments
claimed but had not proven: an Admin who resolves *without* resuming has closed a
record rather than restarted anybody's check-ins, so the next tick raises it again
and the history accumulates while the list still shows one thing to act on.

**Two non-null assertions, the only ones in `src/`.** Both were map lookups over a
list the same expression had just built. `starterMessages` now takes each
Participant already carrying their decline link, which is the only thing its two
callers differ on, and both assertions are gone.

A pre-existing flake surfaced while re-running the suite and is fixed alongside:
`the-check-in-conversation` read one conversation's prompts back `order by
c.position, c.asked_at`, and the three questions about one relationship are asked
by one command against one injected clock — so they share an instant to the
millisecond and Postgres was free to return them in any order. It now orders by
`step`, the identity column the conversation is already read back by everywhere
else. Not caused by this ticket, and it reproduces at `7802866`.

`npm test`: 774 passing, 63 files. `tsc --noEmit` clean.

### Product rulings, and what they changed

Both questions this ticket parked came back answered, along with a third the copy
settled. `docs/open-questions.md` records them; here is what moved in the code.

**The Starter Message names the Leader and sends nobody's number.** *"Great news!
You have been paired with [Leader] for discipleship, they will reach out to you
soon to set up a time to meet and kick things off!"* The old body deliberately
withheld the name so the sending layer could append name-and-number together
behind contact-sharing consent; the ruling splits those, and the number is simply
not sent. So `disclosesPersonId` is null on every message the product composes,
and a Participant in a group gets **one** message naming every Leader rather than
one per Leader — the per-Leader split existed only because contact sharing is one
Person's decision, and nothing in the message is that any more.

That leaves the whole send-time disclosure path — `disclosesPersonId`,
`withSharedContact`, `OutboundQueue.contactToShare`, the `discloses_person_id`
column — reached by no product write path. It is kept and still tested against a
forged row. **It should be given a use or removed deliberately**; left alone it is
a compliance-shaped mechanism nothing exercises.

**The decline link comes out of that message.** `match.decline` and its
`match_declined` item are now reachable only by somebody handed the link. The
Participant's Invitation Link is still minted at acceptance so the route exists
the moment a surface offers it, and whether a Participant should have a self-serve
way to decline is reopened against ticket 06 in `docs/open-questions.md`.

**A resume sends its own message**, not the Starter Message: *"Your discipleship
with [Leader] has been resumed!"*, to both sides with the other side's names. The
acceptance criterion *an Admin resuming releases the Starter Message* is met in
substance — everyone in the relationship hears it is running again, and expiry
still sends nothing — but the words are no longer the Starter Message's, which
supersedes that line of the spec.

**A Pause takes back a question already out.** No next-day reminder for a paused
pair, withdrawn on the first tick that notices rather than at the lapse, and the
conversation moves on to the relationships still running — skipping in silence any
paused alongside it, exactly as `relationshipsToAskAbout` skips them when a
conversation opens.

Withdrawn, not passed over: `relationship_weeks` drops the week entirely, so the
question never ages into `Stalled`. The bound is the sequence that was open when
the Pause landed, and its upper edge is **exclusive** — a new week closes last
week's sequence and opens this one's at the same instant, so a Pause taken at the
cadence hour would otherwise erase the silence of the week before the one it
paused. That cost a red test before it cost a pilot.

This settles the spec's *a pause never accrues silence against itself* as general
rather than the Keyword Exchange's. Ticket 17 inherits the rule rather than
building it.

`npm test`: 788 passing, 63 files. `tsc --noEmit` clean.
