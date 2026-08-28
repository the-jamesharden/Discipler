# 03 — Intake, consent, and the Welcome Message

**What to build:** A Person opens a link and completes one short form — no account, no software to learn. They select every time window that could work on a grid rather than describing their schedule in prose, state what they are hoping to get out of discipleship, give their age as a range, select their gender, and optionally give an email. On submitting they immediately receive a Welcome Message, and they move to `Ready to Pair`.

SMS consent and contact-sharing consent are two separate decisions, because a person can reasonably agree to hear from their church and not agree to have their number handed to another congregant. The exact wording each Person agreed to is recorded with its version identifier and its own timestamp. Existing consent records are never migrated forward to a new version.

This ticket introduces the outbound queue. Every message passes a recipient-level check before it sends, enforced at the sending layer rather than at the button, and contact-sharing consent is checked at send time rather than assumed from enrollment. Every message carries the Ministry name prefix; the Welcome Message is first contact, so it also carries the compliance prefix and the opt-out and rate-disclosure language.

Intake is the only thing that grants consent — importing someone never speaks on their behalf.

**Blocked by:** 02

**Status:** shipped

- [x] A Person can complete Intake from a link with no account, reached either from a link the pastor sent them or from a QR code opening that same link
- [x] Each consent record states which of those two routes the Person arrived by
- [x] Availability is selected on a grid; Discipleship Goal, age band, and gender are captured; email is optional
- [x] SMS consent and contact-sharing consent are separate required decisions, each stored with its own timestamp and the consent version
- [x] Completing Intake enqueues a Welcome Message and moves the Person to `Ready to Pair`
- [x] All outbound messages pass through one queue with a recipient-level check at the sending layer
- [x] Contact-sharing consent is evaluated at send time
- [x] Outbound messages carry the Ministry prefix; first contact also carries the compliance prefix and opt-out language
- [x] A Person with no consent record receives nothing
- [x] The queue carries a per-recipient-phone key and a prompt state — open, answered, superseded, timed out — so the serialization in ticket 20 can be added without a schema migration

## Comments

### Amended — dual-role persons

The outbound queue is the only place the per-phone send checks live, and ticket 20
adds serialization on top of it. The schema needs the phone key and the prompt
state now so that serialization is a query change rather than a migration.

### Schema skeletons landed with ticket 02

`intake_submission` and `consent_record` exist, carrying only what Participation
Status has to read: that a submission exists, and that a consent of a given kind was
granted with its version and timestamp. What the form captures -- availability, the
Discipleship Goal, age band, gender, the optional email -- is still this ticket's,
and so is every rule above.

Two floors are already enforced in the database and this ticket sits on top of them:
a Person with no SMS consent, or with an open opt-out, cannot be the recipient of an
outbound message at all. The recipient-level checks named above -- cooldowns, nudge
limits, contact-sharing consent at send time -- are the sending layer's and are still
to be built.

### Settled — how a Person reaches Intake

Intake is the single consent gate: completing the form creates the SMS consent
record and nothing else does. There are two routes to the form and only two --
a link the pastor sends directly, which is the primary path, and a QR code opening
that same link, which is what works when a room of leaders can complete it together
at a meeting. Both put the same wording in front of the same person and both produce
the same record.

An Admin attesting to consent on a congregant's behalf is not a route, at import or
anywhere else. Inbound-keyword opt-in is post-V1.

`consent_record.source` landed with ticket 02's review pass, as `pastor_link` or
`qr_code`, and it is `not null` with no default -- so the form has to say which route
the Person came by, and a write that cannot say fails rather than guessing. Recorded
in `docs/consent-language.md` and `docs/product-rules.md`.

### Settled — the Welcome Message sends

Put to the product owner rather than resolved from the source documents, because the
answer decided whether this ticket built a send path at all.

**It sends.** *No SMS before pairing approval* governs relationship messaging. The
Welcome Message discloses no other congregant and reaches somebody who ticked the SMS
consent box seconds earlier, so it is the one message that precedes a pairing. Under
the stricter reading, consent a Person had just given would first be acted on days
later by a message about a stranger.

Recorded in `docs/open-questions.md` and `docs/product-rules.md` under *Settled: The
Welcome Message Precedes Pairing*. The mentor and mentee reveals still follow pairing
approval, unchanged.

### Implemented — the form, the consents, and the sending layer

**One link serves a whole Ministry.** The ticket says a QR code opens *that same
link*, so the link cannot be per-Person, so the form asks who is filling it in --
which is also what `docs/product-rules.md` requires, since name and phone are
required Intake fields. `?via=qr` is the only difference between the two routes, and
it is what `consent_record.source` records. Intake is a way *onto* the Roster as much
as through it: somebody at a leaders' meeting who was never imported is created here.

**Contact sharing is two answers, not a checkbox.** `docs/consent-language.md` called
it a "required checkbox" while its own *Why the two are separate* section said a
Person may agree to SMS and refuse sharing -- and the send-time check, the spec's
test list, and `participation_status` all presume refusal is possible. A checkbox
cannot tell *declined* from *skipped*, so the form asks it as a choice between two
answers and the doc wording is corrected. Declining completes Intake and reaches
`Ready to Pair`; only a granted consent becomes a row, because the send-time check
asks whether one exists.

**The send-time check is a real check, not the database floor.** The floor refuses to
*enqueue* for a Person with no SMS consent or an open opt-out. Consent is a fact
about now, so `dispatchQueue` re-asks at the moment of sending: a Person who opts out
between being queued and being sent to does not receive the message already waiting
for them. A refused message is neither delivered nor lost -- it stays on the queue
with `withheld_reason`, because a congregant who did not receive something is
something an Admin has to be able to find out about. `withheld_at` and
`withheld_reason` are more than the ticket asked for: a check with no outcome other
than *sent* would have to either drop the message or retry it forever.

**A body cannot have a number withheld from it after the fact.** So the message
carries `discloses_person_id` -- whose contact details it *would* include -- and the
sending layer resolves it against contact-sharing consent at dispatch. Absent
consent removes the number and sends the rest: the Person still hears from their
church. Ticket 06 is the first real user of this; the mechanism is here because the
criterion is here.

**`prompt_key` is set on every message; `prompt_state` is null on every message so
far.** The phone is the serialisation unit whether or not a reply is expected. The
column and all four of its values exist, with the partial index ticket 20 will query,
so serialisation is a query change and not a migration -- but nothing sets a state
yet, because nothing sends a Response-Required Message until ticket 08. No domain
field was added ahead of a producer for it.
`CONTEXT.md` avoids "prompt" as a name for a Keyword Exchange, which is a different
usage from ticket 20's -- the column names follow ticket 20 so it finds what it
expects.

**Two decisions were taken to the product owner** rather than inferred, because both
are hard to reverse and neither was written down: the availability grid is seven days
by five blocks -- four when it was first held, amended to add early morning
(`docs/adr/0006-the-availability-grid.md`), and the Discipleship Goal
options belong to each Ministry, seeded with a default list.

270 tests pass against a local Supabase stack with the app running, none skipped.

### Deliberately left for later tickets

- **Cooldowns and nudge limits are not built.** The criterion above is *a
  recipient-level check at the sending layer*, and that check exists and refuses.
  The limits it will eventually also enforce -- one nudge per recipient per twelve
  hours, two a day, four a week -- are ticket 11's, and `dispatchQueue` is the place
  they land. Spelled out here because ticket 02's comment listed them alongside
  contact-sharing consent, and only the latter is done.
- **The Admin surface that edits the Discipleship Goal list.** The data model is here
  and a new Ministry is seeded with a starting list, so Intake renders. Editing it --
  and the warning that removing an option loses the answers pointing at it -- needs a
  settings screen this ticket does not otherwise have. Raised as ticket 21.
- **Nothing drains the queue on a schedule.** `dispatchQueue` is driven by its tests
  and by ticket 20's worker; the transport behind it is a port with no Twilio adapter
  yet, which is ticket 06's to add when a message first has to leave the building.
- **Availability is not refused as empty by the database.** The form requires a slot;
  the database does not, because an empty availability is visible in the No Schedule
  Overlap section rather than silently wrong.

### For a human to confirm

**`gender` is `male` or `female`.** Nothing in the product documents enumerates it.
It is an absolute safeguarding constraint that must *match* between a Leader and a
Participant, and `docs/product-rules.md` says a Ministry wanting mixed-gender
relationships disables the rule in settings -- so a two-value enum is what the
matching rule needs. Flagged because it is a schema enum and a person-level fact,
and widening it later is a migration.

**The consent wording still has no legal review.** Unchanged by this ticket and
called out again because the form is now real and a pilot could put it in front of
people. `docs/consent-language.md` says the same.

### Review pass — 2026-08-28

Two axes, Standards and Spec. What the review changed:

**The sending layer ran outside Ministry isolation.** `outbound-queue.ts` queried on
a bare pool as the owner role, setting neither `discipler_command` nor
`discipler.ministry_id` -- so every policy on `person`, `outbound_message`,
`person_opt_out` and `consent_record` was inert on the one path where a `person_id`
arrives with no session behind it to bound it. Every method now names the Ministry
it acts for and runs in a scoped transaction, one per call rather than one around
the drain, because `dispatchQueue` hands each message to a transport between calls.
`mayReceive` reads through `person` for the same reason: `app.current_consent` is
security definer and would otherwise answer about a Person in another Ministry.
Two tests in `the-sending-layer.test.ts` prove it.

**A second submission sent a second Welcome Message.** One link serves a whole
Ministry and nothing stopped a Person opening it twice. The Welcome Message is first
contact, so it is now enqueued only on a Person's first submission -- `RosterSnapshot`
carries `whoCompletedIntake`, read inside the unit of work so two submissions racing
cannot both read *never submitted*. The submission itself is still recorded in full,
which is what ticket 16's deliberate re-submission path builds on.

**Smaller things.** The sending layer's ports moved to `ports.ts` with every other
port. `intake-reader.ts` no longer keeps a module-level pool outside the composition
root -- it is `createPostgresIntakeReader`, wired into `container.ts` and closed by
`closeCommandService`. `QueuedMessage.id` is a branded `OutboundMessageId` and the
Discipleship Goal option carries `DiscipleshipGoalId`. `composeMessage` no longer
defaults `identifyDelivery` and `discloseOptOut` to false: which occasions require
A2P identification is a compliance question and a caller that did not think about it
should not be quietly answered *no*.

**Correction to a claim above.** *"so the serialization in ticket 20 can be added
without a schema migration"* is narrower than it reads. `prompt_key` and
`prompt_state` are there, but ticket 20 also requires that a keyword command and its
confirmation are never held and that a held message consumes no nudge budget, and
nothing on `outbound_message` yet distinguishes a scheduled prompt from a keyword
reply. Ticket 20 should expect to add a column for that.

283 tests pass against a local Supabase stack with the app running, none skipped.

### Declined in the review

**`applyEffects`'s five `flatMap`s were left as five.** The generic collector that
would replace them needs a cast to convince the compiler of what the tag already
proves, which trades five type-safe lines for one unsafe one.

**The seed goal list is repeated in migration `20260827000300`** -- once in
`app.seed_discipleship_goals()` and once in the backfill. The migration is applied;
editing it now would be rewriting history for a cosmetic gain.

### Reverted, and open — two questions for the product owner

Both were changed in the first pass of this review and then put back, because
resolving them is a product decision and the review had inferred an answer rather
than asking for one.

**Does an Intake email overwrite one the import already placed on the Person?** It
does today, and the code says so deliberately: *"What the Person typed about
themselves beats what a spreadsheet said."* Ticket 02 refuses to overwrite in the
opposite direction, so the two write paths disagree and neither ticket settled it.
Left as it was, untested, pending an answer.

**Is Statement 2's wording the doc's or the form's?** `docs/consent-language.md`
quotes *"I agree that my name and phone number may be shared…"*; the form asks *"May
we share your name and phone number…?"* to pair with its two answers. The doc's own
rule is that changing any wording requires a new version identifier, and
`CONSENT_VERSION` is unchanged at `2026-09-v1` -- so one of the two is wrong and
which one is a decision about consent copy, not a refactor. Left as it was.

### Raised, not fixed

**Nothing hands an Admin the Intake link or a QR code.** Both routes work and are
tested; the Admin's side of *"a link the pastor sent them"* is a Roster surface
ticket 03 never built. Raised as ticket 23.
