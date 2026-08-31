# 12 — Pause, resume, and pause expiry

**What to build:** An Admin can pause a relationship, so they can act on something they have been told offline, and a holiday does not put a Leader in the care queue. A paused relationship stays on the Leader's list and on the Admin dashboard, visibly marked `Paused` and distinguishable from Healthy, Stalled, and Ended — stepping back never costs a Leader the people they lead. Membership is unchanged and nobody returns to the suggestion pool, so a Participant is never returned to the pool without being asked.

`Paused` **masks** the derived state rather than replacing the history behind it. No new unanswered check-ins accrue during a pause, and the pause does not answer the old ones. On resume the underlying state resurfaces — a relationship that was Stalled when it was paused is Stalled again and stays there until an answered check-in clears it. **Resuming never sets Healthy on its own**; doing so would silently erase a live care signal.

A pause runs for exactly one of five periods — 1, 2, 4, 8, or 12 weeks, defaulting to 2 — because a summer away and a fortnight away are not the same thing.

**An expired pause resumes nothing.** Expiry changes no state, sends nothing, and raises a follow-up item for the Admin showing which period was selected, that it has expired, and that the relationship has not resumed. The relationship stays `Paused` until an Admin resumes or ends it. Nobody's check-ins restart on a date they have forgotten. Resuming releases the **Resume Message**; expiry sends nothing. *(This line originally said the Starter Message. A product ruling taken during implementation gave a resume words of its own — everyone in the relationship still hears it is running again, and expiry still sends nothing. Recorded in `docs/product-rules.md` and `CONTEXT.md`; see the ruling below.)*

An expired pause is not a state and not a care condition derived from check-in history. Like a Concern it sits beside the relationship, coexists with any state, and clears only by explicit Admin action.

Leader-initiated pause over SMS is ticket 17.

**Blocked by:** 10

**Status:** shipped

- [x] An Admin can pause a relationship for 1, 2, 4, 8, or 12 weeks, defaulting to 2
- [x] Pausing suppresses that relationship's check-ins, keeps membership, and keeps everyone out of the suggestion pool
- [x] A paused relationship stays visible and marked `Paused`, and the derivation both its Leader and the Admin read says so — *the Leader's half of this is ticket 15's `Each relationship shows its status, including `Paused``, which is blocked by this ticket and renders from this same derivation*
- [x] `Paused` masks the derived state; no unanswered check-ins accrue and none are answered
- [x] A relationship Stalled when paused is Stalled on resume and clears only on an answered check-in
- [x] Resume never sets Healthy on its own
- [x] Pause expiry raises a follow-up item, sends nothing, and leaves the state `Paused`
- [x] The follow-up item shows the selected period and that it has expired
- [x] An Admin resuming releases the Resume Message — everyone in the relationship hears it is running again; expiry sends nothing — *narrowed from `releases the Starter Message` by the ruling below, which gave a resume its own words*
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
cancel reads through. *(Superseded: no Participant is sent a link at all, so
`members` carries a name and a number and `RelationshipMember` has no link field.
See the ruling at the bottom.)* `public.relationship_pauses` is the one read that cannot be
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
*(Superseded in full: a resume mints nothing and issues nothing, because the
message it sends carries no link. See the ruling at the bottom.)*

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
callers differ on, and both assertions are gone. *(Superseded: once a resume got
its own message and the link came out of the acceptance copy, `starterMessages`
had one caller and no link to carry, and it is gone. The assertions stayed gone.)*

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
*(That question came back answered in the ruling below: the link is not minted,
and a Participant does not decline.)*

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

### Second review pass — the eight findings that were not judgement calls

Two axes again, `7802866...HEAD`. Six baseline smells were left alone as the
judgement calls they were labelled; the two hard standards breaches and all six
spec findings are below.

**The settled rules said one thing and the code did another, for three rulings.**
Every product decision this ticket took was recorded in `docs/open-questions.md`
and nowhere else — which is the doc for questions that are *open*. `CONTEXT.md`
still defined the Starter Message as *sent when the relationship becomes active
and again when it resumes from a pause*, and `docs/product-rules.md` still said
*the Starter Message is released on resume* in three places, while the code sent
something else. A ruling recorded only where questions go to be asked is a ruling
the next reader will contradict.

So: **resume releases the Resume Message**, and that is now what the rules say.
`CONTEXT.md` gains a **Resume Message** entry and the Starter Message entry no
longer claims it is sent twice; the three `product-rules.md` lines name the Resume
Message; and a **Supersedes** note records the old rule, why it changed, and what
it was reaching for that still holds — everyone in a resumed relationship hears it
is running again, and expiry still sends nothing. The acceptance copy and the
withdrawal rule are recorded the same way, in the settled sections rather than
only in the ticket, and both `open-questions.md` entries now point at where they
landed instead of at this file.

**The pause actor.** *A leader may pause a relationship they lead* is settled, and
only the Admin route exists — there is no keyword route into `relationship.pause`
and a Leader cannot pause anything today. The rule now carries a **Not yet built**
note saying so and naming ticket 17, rather than reading as though it were met.

**`relationship_weeks` was erasing silence that had already accrued.** The real
defect of the eight. The bound was *a `relationship.paused` fell inside this
sequence*, which cannot tell the question a Pause took back from one the
conversation had already given up on: a question asked Monday, reminded Tuesday
and passed over Wednesday is a silence the Leader owns by the time an Admin pauses
on Wednesday afternoon, and the whole week was being dropped. The spec says it in
as many words — **the pause does not answer the old ones**.

The test is now the withdrawal itself, in two shapes and no third: the
`checkin.question_withdrawn` event the domain writes at the moment it takes a
question back, naming its sequence; or a turn the conversation never reached,
recognised by the absence of any prompt for it, where nothing was asked and so
nothing accrued. A lapsed question has neither. Pinned by an integration test with
two relationships on one Leader — the only shape where a question can lapse while
its conversation is still open — which fails against the old bound and passes
against this one.

**Nothing guarded a period on the way in.** `readStandingPause` throws on a period
outside the five, deliberately and rightly, but both readers go through it, so one
hand-written row took down a whole Ministry's tick *and* its whole care queue. The
guard now sits where it costs one row: a check constraint on `ministry_event` for
`relationship.paused`, written as `jsonb` equality rather than a cast to integer —
a constraint that can itself raise is a second failure mode rather than a guard
against the first — with a `coalesce` closing the gap a missing key would open,
since a check constraint passes on NULL. The command boundary checks the value it
was handed as well, refusing `pause.period_not_selectable`, because a command is
built from a request body and the union is erased at runtime. `null` and
`undefined` both still mean *the Admin did not choose*, which is two weeks.

**The test that proved less than its name.** *Accepts each of the five periods and
no others* asserted only the five and the constant. It now refuses `0, 3, 6, 13,
52, -2, 2.5, NaN` and the non-numeric shapes a JSON body arrives as, and a
separate test pins the constraint at the table against a forged insert.

**The Leader-visibility checkbox.** *Stays visible and marked `Paused` to both its
Leader and the Admin* was ticked on the Admin half, with the gap honestly
described in the comments — but `shipped` means every criterion is checked, so the
tick was doing work the prose had already retracted. The criterion is narrowed to
what this ticket delivers (the mark, and the derivation both surfaces read) and
the Leader half is handed to ticket 15, which already carries *Each relationship
shows its status, including `Paused`* and is blocked by this one.

Two factual leftovers from the smell list, fixed because they are not judgement
calls either: `RelationshipMember`'s comment promised *the link the Participant is
holding* on a type with no link field, and `type NewInvitation` was imported and
unused — neither caught by tooling, since there is no eslint config and
`noUnusedLocals` is off.

The four genuine smells are left standing: the pause-lookup duplication across
`relationship_pauses`, `pausedColumn` and `relationship_weeks`; the threefold
`readStandingPause` mapping; the double switch in `command-service`; and the
Participant link minted for a message that no longer carries it. *(The fourth
stopped being a judgement call when the ruling below removed the link outright.)*

`npm test`: 792 passing, 63 files. `tsc --noEmit` clean.

### Ruling — a Participant is sent no link, and does not decline

The judgement call this ticket reopened came back answered. A Participant consented
to be paired at Intake; the Leader's acceptance was the half still outstanding, and
a link asks somebody a question they have not yet answered. So **only a Leader is
ever sent one**, and `relationship.accept` no longer mints the Participant's.

A Participant does not decline. What they may ask for is a **swap**, and somebody
who stops meeting or stops replying says so through the silence the care rules
already read — an Admin unpairs and re-pairs either way. Recorded in
`docs/product-rules.md`, `CONTEXT.md` and `docs/open-questions.md`, with the
follow-on work amended onto tickets 06 (withdraw `match.decline`, keeping the enum
value for history) and 17 (`SWAP` is no longer only a Leader's keyword).

**And a defect the ruling uncovered.** Ticket 12's copy change gave a group's
Participant one message naming every Leader — the first message in the product to
*list* names — but `resolveInvitation` ordered members `by m.role, m.started_at`,
and two co-leaders paired in one action share that instant to the millisecond.
Postgres was free to return the tie either way, so the same group read *David and
Sarah* on one send and *Sarah and David* on the next; the integration test asserting
the group body was passing on luck. `relationshipFor` had it too, and the Resume
Message lists names the same way. Both now order down to `full_name` then
`person_id` — the tiebreak is the name because it is the only part of the ordering
that means anything to the person reading the message.

`npm test`: 792 passing, 63 files. `tsc --noEmit` clean.

### Third review pass — the rule held for one question and not for the others

Two axes again, `7802866...HEAD`, working tree included. Nine findings acted on;
three baseline smells left standing as the judgement calls they were labelled.

**The defect: a paused relationship was still being asked about.** *Pausing
suppresses that relationship's check-ins* was implemented for the question that
happened to be open and nowhere else. `covering` is fixed when a conversation
opens — deliberately, so that a Pause halfway through does not renumber the
questions still to come — which means a Pause taken since is in nobody's list and
every route that moves the conversation forward has to step over it. There are
three, and only one did:

- a reply that advanced the conversation (`checkin.reply`),
- a question the conversation gave up on (the passed-over branch),
- a question a Pause took back (the withdrawal branch, which had the skip).

So a Leader who replied — or whose question lapsed at forty-eight hours — was sent
the next question about a relationship that was paused, in the same minute. The
data was there and ignored: `pausedColumn` is selected for the covering rows. All
three now go through one `advancePastPaused`, and the skip loop that used to live
inline in the withdrawal branch is that function. Nothing is recorded for a turn
stepped over — nothing was asked, so there is no question to withdraw, and
`relationship_weeks` already reads a covered relationship with no prompt as
nothing having been asked.

Including the follow-up question on the relationship the answer was about. *Yes we
met*, about a pair paused an hour ago, stands — a Pause does not unsay it — but
*how did it go* is a new question, and no new question is asked about a paused
relationship.

**And a new week could still beat the withdrawal.** In the tick a due Leader
`continue`s straight after `openConversationWith`, which abandons the displaced
sequence and writes no `checkin.question_withdrawn` — so the week counted as
silence after all. Narrow: it needs an Admin who pauses between the last tick and
the cadence hour, which is the one window where no tick gets to look at the Pause
before the new week displaces it. It is also exactly the accrual the exclusive
upper bound was written to prevent, and it needs two relationships on one Leader
to reproduce, since with one there is nothing left to be asked about and no new
week comes due. `openConversationWith` now withdraws it on the way past.

Pinned by five domain tests and one integration test, all six of which fail
against the previous commit and pass against this one.

**The rulings outlived their record in three places.** The ticket's own brief and
one acceptance criterion still said *resuming releases the Starter Message* while
`CONTEXT.md`, `product-rules.md` and the code said the Resume Message; three
passages in these comments still described a Participant Invitation Link that the
final ruling had removed, including one crediting `starterMessages`, a function
that no longer exists. Corrected in place and marked as superseded rather than
rewritten — the chronology is the point of a running record, but a claim nothing
retracts is one the next reader will believe.

Ticket 17 carried the same superseded line (`RESUME` releasing the Starter
Message) and had its amendment appended outside `## Comments`, which
`docs/agents/issue-tracker.md` names as the place conversation goes. Both fixed,
and the two rules it inherits from this ticket rather than builds — the Resume
Message, and the withdrawal being general — are now written down there.

**The Participant-link ruling gets the ADR it should have had.**
`docs/adr/0011-only-a-leader-is-sent-a-link.md`. It removes a shipped capability,
reverses two settled sections, strands a command and a route, and keeps an enum
value it can never use again — which is ADR-0010's shape exactly. It had landed in
two tickets, `CONTEXT.md` and `product-rules.md`, and in no ADR. Ticket 06's
`### Settled — a Participant declining the match raises match_declined` now opens
by saying it is superseded, rather than reading as current.

**`CONTEXT.md` had started arguing.** *It is a glossary only.* The new **Resume
Message** entry carried a paragraph of reasoning where the house `_Avoid_` is a
short parenthetical, and **Invitation Link** had taken on the whole decline rule
and its rationale. Both trimmed to what the term means; the argument is in the ADR
and in `product-rules.md`, which is where argument goes.

**Two smells fixed because they were facts, not judgement calls.** The member
ordering was hand-copied into `resolveInvitation` and `relationshipFor` with
near-identical comments — one ordering rule, two sites, and two messages that list
names depending on them agreeing; it is now one `openMembersOfRelationship`, at
the cost of one column the second reader ignores. And the test named *mints no
link for the Participant* ended on an assertion about a message; that assertion is
a test of its own now, because *sent no link* is not *told nothing* and both are
worth pinning.

**Three left standing, and why.** The five periods now live in TypeScript and two
SQL check constraints, so a sixth would edit three places — but the alternative is
a function call inside a check constraint, and a constraint that can itself raise
is a second failure mode rather than a guard against the first, which is the
reasoning that put the constraint there in the first place. `PauseRefusal` mixes a
malformed-input refusal with three pastoral ones, as every other refusal union in
this codebase does. And the boundary's period guard has no route calling it yet,
which is true of `relationship.pause` entirely — the guard is not more speculative
than the command it guards.

`npm test`: 802 passing, 63 files. `tsc --noEmit` clean.
