# 27 — The discipleship Intake wizard: mentor and mentee

**What to build:** A second Intake link that opens a step-by-step form for
discipleship. Its first question asks which side the Person is offering to stand
on — mentor or mentee — and the rest of the wizard asks everyone the same things
in the same order, differing only in wording. It lands a Person on the Roster
exactly the way today's single form does, and it records which side they declared.

Today there is exactly one Intake form and one link per Ministry
(`/intake/<ministry>`, `app/intake/form.tsx`), asking nine things on one page. It
asks nothing about which side of a relationship the Person is offering to stand
on, and that is deliberate in three places: leading is a plan an Admin records on
the Roster (ticket 16, `eligible_to_lead`), relationship kind is declared at
pairing rather than at Intake (`docs/adr/0004-relationship-kind-as-capacity-declaration.md`),
and `consent_record.source` distinguishes only *how somebody arrived* —
`pastor_link` or `qr_code` — never *what they were answering*.

This ticket does not disturb any of those. Mentor and mentee are an **answer
inside a form**, not two separate links. A dedicated mentor link reads as a
channel the Admin endorsed; a mentor answer reads as a preference the Person
stated. The second is what is wanted, and it is the weaker of the two claims,
which is the point.

The group path was split out to ticket 29. This ticket is the discipleship
wizard alone and ships without it.

## The wizard

Six screens. One component with a `side` argument, the way `app/intake/form.tsx`
is already one component for two routes — mentor and mentee are asked the same
questions and differ only in wording and in the closing line.

1. **Side.** "I'm joining as a…" — *Mentor* or *Mentee*. Nothing else on the
   screen; the screens that say anything side-specific — the first-time question,
   and the closing line — are worded from this answer, so nothing after it can be
   asked until it is given.
2. **Age band and gender**, together on one screen. Age is a band and never an
   exact age (ADR-0001). Gender is the absolute pairing constraint (ADR-0001),
   which a Ministry may disable only in settings (ticket 22).
3. **First time.** Exactly two answers, and they are worded as statements rather
   than as yes/no so that the answer is legible without the question:
   *"Yes, I've done this before"* / *"No, this is my first time."* The question
   above them takes the side: "Have you been discipled by a mentor before?" for a
   mentee, "Have you mentored someone before?" for a mentor.
4. **Availability**, the existing grid, unchanged and asked of both sides.
5. **The rest**: name, mobile, email, the Ministry's Discipleship Goal options
   (ticket 21), the SMS agreement and the contact-sharing decision — the fields
   today's single page already carries, on the screen with the Submit button.
   The consents are last deliberately: the checkbox that grants consent belongs
   on the same screen as the write it authorises.
6. **Done.** "You're on the list." The Ministry will look at their availability
   and what they're hoping for, and be in touch when there's a mentor (or a
   mentee) for them.

**Nothing is written until step 5 submits.** Each step carries the previous
answers forward as hidden inputs and posts to the next step; only the last post
reaches the database. A wizard that wrote per step would put a half-finished
Person on the Roster who never reached the consent checkbox, and `consent_record`
is the one table whose whole job is to be read back in an audit.

## What gets recorded

**Two columns on `consent_record`, beside `source`.** `source` answers *link or
QR* and stops answering it cleanly the moment a path is folded into the same
enum.

- `intake_path` — an enum whose only member is `discipleship`. Ticket 29 adds
  `group`, having decided it, exactly as `consent_source` reserves its third
  value.
- `declared_side` — `mentor` or `mentee`, and null on any path that has no sides.

Both are **nullable**, and null is a real state rather than a gap: it means the
Person answered a form that did not ask. Every record written before this ticket
is null, and so is every record written by the existing `/intake/<ministry>` form
until ticket 29 converts it. Neither is backfilled with a guess.

**`intake_submission.first_time`**, nullable boolean. Not on the consent record:
this is a matching input read by the pairing surface, not a fact about what the
Person was agreeing to. Null means the submission predates the question.

## What the answers do

**The mentor answer produces a Roster signal and nothing else.** The Person's row
shows that they offered to mentor. It does not set `eligible_to_lead` and must
not: ticket 16 made that a plan an Admin records, explicitly not a fact about the
Person and explicitly not self-declared. The Admin still decides; the answer only
changes what they are looking at when they do.

The signal is **derived** from the latest consent record's `declared_side`, not
stored a second time on `person`. A Person who reopens Intake (ticket 16) and
answers the other side has changed their offer, and the Roster should say so —
which it does for free if the row reads the latest record rather than a column
somebody has to remember to update.

**The first-time answer is shown on the pairing surface**, per candidate, on
`app/roster/pair/page.tsx`. That is the whole of its consumer and it is enough:
an Admin about to pair two people can see when both are new to this. It ranks
nothing and refuses nothing — pastoral judgment is never subordinate to a
filtered list, which is why that screen already declines to filter its candidates.

## Routes

- `/intake/<ministry>/discipleship` — the wizard, plus its own QR code on the
  ticket-23 Admin surface, labelled clearly enough that an Admin printing one for
  a room knows which one they printed.
- `/intake/<ministry>` — **untouched by this ticket.** It keeps working exactly
  as it does today and keeps writing a null `intake_path`. Ticket 29 turns it
  into the group form. One behaviour did change, and only for a request nobody
  filling the form in can make: a body carrying `side` or `experience` on a route
  that declares no path is now refused rather than ignored, which is the rule
  `intake_path` is declared by the route at all.

**Blocked by:** 03, 23

**Status:** shipped

- [x] A discipleship Intake link exists at its own route and opens the wizard
- [x] The wizard's first question is mentor or mentee, and the screens that have
      something side-specific to say — the first-time question and the closing
      line — are worded from it
- [x] The wizard asks age band, gender, the first-time question, availability and
      the Discipleship Goal, and both sides are asked all five
- [x] Nothing is written to the database until the final step submits; an
      abandoned wizard leaves no Person, no submission and no consent record
- [x] The discipleship link has its own QR code on the Admin surface, labelled
- [x] `consent_record.intake_path` and `consent_record.declared_side` record what
      the Person answered, separately from `source`
- [x] Answering mentor shows a signal on the Roster row and does not set
      `eligible_to_lead`
- [ ] A Person who reopens Intake and answers the other side changes the signal —
      the derivation does this, but the tokenized reopen link renders the
      single-page form, which never asks the side. See *The reopen link does not
      ask the side*.
- [x] The pairing surface shows, per candidate, whether this is their first time
- [x] `/intake/<ministry>` still works and is unchanged, but for the crafted-body
      refusal noted under Routes
- [x] Consent records written before this ticket are not backfilled with a path

## Comments

### Raised during ticket 23, 2026-08-31

Ticket 23 asked only for the Admin surface that hands out the Intake link and its
QR code. Asked for three codes instead of one, the product-definition answer is
that three codes require three paths, and three paths are not a surface decision —
they touch the consent record, the Roster, eligibility and pairing. Split out
rather than folded in, so ticket 23 ships the surface it was written for and this
one gets the decisions it needs.

### Triaged, 2026-09-01

Three paths became two, and then one. The open questions this ticket was holding
are answered:

**Three paths was the wrong shape.** Mentor and mentee are not two audiences, they
are two answers to one question, and a form is the right place to ask a question.
Collapsing them removed the conflict with ADR-0004 and ticket 16 that a dedicated
mentor *link* would have created.

**The group path is ticket 29.** It is an individual joining one of the
Ministry's existing groups — not, as the original wording could be read, a group
registering itself. It takes over the existing `/intake/<ministry>` link, drops
the Discipleship Goal question and adds a group chooser in its place. It is a
different form with different questions and a dependency on ticket 25, so folding
it in would have made this ticket unshippable.

**The first-time question has a consumer**: the pairing surface. Its wording is
settled above. A question read by nothing would not have been asked.

**The mentor answer is a Roster signal**, never `eligible_to_lead`.

**Nothing differs between the two sides except wording**, so this is one
component with a `side` argument rather than two forms — the same call
`app/intake/form.tsx` already makes for its two routes.

### Shipped, 2026-09-01

Three decisions the ticket left to the implementation, each recorded here because a
reader of the ticket would otherwise expect something slightly different.

**The steps navigate by GET; only the last one posts.** The ticket says each step
carries the previous answers forward as hidden inputs and posts to the next step.
The hidden inputs are exactly as described — every screen carries every earlier
answer — but the forms for steps one to four are `method="get"` back to the same
page, so those answers land in the URL of the next screen. Next.js App Router has no
way to POST to a page, and the alternatives were worse: a route handler rendering
HTML by hand, or a cookie holding a half-finished form. GET also buys the thing a
POST wizard is worst at, which is the browser's own Back button — a POSTed step
answers it with *confirm form resubmission*.

What the ticket actually required is unchanged. Nothing is written until step five
submits, and step five is a POST: it is the one screen carrying a name and a number,
and those do not go in a URL. What travels in the URL is a side, an age band, a
gender, a first-time answer and a list of time slots, all of them values Discipler
served — every one is checked against the list it came from before the next screen
renders it, so nothing anybody types into a URL is ever reflected back.

**The Roster signal reads the latest consent record *that asked*, not simply the
latest.** The ticket says the signal is derived from the latest consent record's
`declared_side`, and also says a null there means the Person answered a form that
did not ask. Those two readings conflict for the commonest later submission there
is: the tokenized link an Admin sends to correct a phone number reopens the
single-page form, which asks nothing about sides. Read as *the latest record*, fixing
somebody's number would silently erase their offer to mentor. So the derivation
skips records that asked nothing, which keeps *answering the other side changes the
signal* exactly as specified and makes *null means not asked* true rather than
decorative.

**`intake_path` is declared by the route, not read from the form.** A hidden input
saying which form this was is a claim anybody can type into a request, and
`consent_record` is the one table whose whole job is to be read back in an audit. So
the wizard's submit route names its own path, the way the reopen route already names
its own `source`. A side or a first-time answer arriving on a route that declares no
path is refused rather than dropped, and the database carries the same rule as a
check constraint.

Two smaller notes. The first-time answer travels as `first_time`/`done_before`
rather than as yes and no, because the screen words the answers as statements —
*No, this is my first time* — and a `yes`/`no` field inverts under exactly that
wording. And the fields themselves now live in `app/intake/fields.tsx`, shared by
both forms: the SMS agreement is the wording `consent_record.version` points at, and
two screens drifting apart would make that version ambiguous.

### Review, 2026-09-01

Four things the review caught, all fixed.

**`first_time` had the same erasure bug the side did.** The derivation read *the
latest submission* rather than the latest that asked, so an Admin correcting
somebody's phone number through the reopen link — which asks neither question —
wrote a submission with a null `first_time` and emptied the pairing surface's note.
The `is not null` filter now applies to both subselects in `public.roster`, and the
test that covers the reopen case asserts both columns rather than one.

**Going back lost the answers after the screen you went back to.** The hidden inputs
were selected by step number, so a screen reached by pressing Back carried only the
answers *before* it — somebody correcting their age found their availability quietly
emptied. They are now selected by field name: a screen carries everything it is not
itself asking for.

**The availability screen could refuse to move on and say nothing.** It is the only
screen with no `required` field, because a checkbox set cannot express *at least one
of these* — the argument the pairing screen's leader checkboxes already make. Pressing
Continue with nothing ticked now says so.

**ADR-0001 is not amended, and this ticket does not touch it.** That ADR fixes the
*suggestion* inputs at four and constrains any fifth. Showing `first_time` beside a
candidate on the manual pairing screen is not a suggestion input: nothing on that
screen suggests anybody, and its candidate list is deliberately unfiltered. Stated at
the call site so ticket 04 does not inherit it as a ranking input by accident — doing
that would need an amendment.

**The reopen link does not ask the side.** The ticket says a Person who reopens
Intake and answers the other side changes their offer; the reopen link renders the
single-page form, which never asks, so the side changes by reopening the wizard's own
link instead. The behaviour the criterion names holds — a later answer replaces an
earlier one — but the mechanism is the public link rather than the tokenized one.
Converting the reopen link to serve whichever form a Person last answered is a real
question and belongs with ticket 29, which is already changing what
`/intake/<ministry>` serves.

### Review, second round, 2026-09-01

Six things the review caught, all fixed. Three of them are the same shape: an
answer, or a screen, written down in more than one place.

**Re-answering the side carried the first-time answer onto the other side's
question.** The hidden inputs are selected by field name, which is right for age
and gender -- they govern nothing downstream -- and wrong for the one screen whose
answer *rewords* a later question. A mentee who answered *yes, I have been
discipled before*, pressed Back and switched to mentor reached the third screen
with *yes, I have mentored someone before* already selected: an answer nobody
gave, in the one field the pairing surface reads, and the ticket's own worry is
that a first-timer recorded as experienced is a mistake nothing downstream could
notice. The screen list now says what each screen rewords as well as what it asks,
and a screen drops both. Coming back and pressing Continue with the same side
costs one screen; the alternative cost an answer that was wrong and looked given.
Covered by a unit test and over HTTP.

**The wizard's screens were told apart by number again.** The screen list says it
is the only place the order is written down, and the component beside it then
branched on `at === 2`, `at === 3` and `at === 4`. They are named now --
`SIDE_STEP`, `AGE_AND_GENDER_STEP`, `FIRST_TIME_STEP`, `AVAILABILITY_STEP` -- and
derived from the list, so a screen inserted in the middle moves no number by hand.

**The four carried answers were written out four times.** The interface, the
screen list, the reader, the query composer and the hidden inputs each held their
own copy of *side, ageBand, gender, experience*, and only two of the five were
guarded by a test. They now come from one table that puts each answer beside the
list it has to come from; availability stays beside them rather than in them,
because it is a list and reads, writes and empties differently.

**The QR codes were unlabelled files.** The criterion says *labelled clearly
enough that an Admin printing one for a room knows which one they printed*, and
the label was on the Roster page and in the download filename -- neither of which
is printed. The caption is now drawn into the SVG, below the code's own quiet
zone, and the renderer takes it as a required argument rather than an optional
one, so a third code cannot ship unlabelled by omission. This labels the ticket-23
code as well, which is a small widening of this ticket: an unlabelled square
beside a labelled one answers *which one is this* only by elimination.

**The Roster column said something about every Person.** The ticket asks for one
signal -- *the Person's row shows that they offered to mentor* -- and the column
also said *asked to be mentored* and *not asked*, which is a column of state about
everybody rather than a signal about somebody. Only the mentor answer is said now.

**Two smaller ones.** The done page fell back to the mentee wording for a side it
did not recognise, which is a guess on the one path that refuses to guess
everywhere else -- it now says the half that is true for both sides. And the
first-time answer had no glossary entry although it reaches two Admin screens; it
is in `CONTEXT.md` as **First-Time Answer**.

One finding was raised and not taken. `first_time` travels as two words and lands
as a boolean, and the pairing screen turned it back into a word to look a label
up. The round trip is gone -- the label takes the boolean the Roster actually
holds -- but the column stays a nullable boolean, because that is what this ticket
specifies and the name `first_time` does not invert the way a `yes`/`no` field
would.
