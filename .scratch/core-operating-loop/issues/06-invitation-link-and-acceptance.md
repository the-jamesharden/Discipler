# 06 — Invitation Link and Acceptance

**What to build:** A Leader receives a text telling them they have been matched and inviting them to look — an invitation, not an assignment. Tapping through reveals who they have been matched with and for which Ministry *before* anything is asked of them. Only then do they set a name and a password and accept. Acceptance activates the relationship, releases the Starter Message to everyone in it, and stamps `accepted_at` as the durable record that this Leader agreed to this relationship. That timestamp is the whole of the activation — there is no status column to set.

The Invitation Link is individualized, bound to the Person record rather than to an email address, and resolves without a session — possession of the phone it was sent to is the authentication. It expires in seven to fourteen days and is **consumed on account creation, not on resolution**, so a Leader who opens it and gets interrupted by a phone call can return to the same message rather than needing a re-issue.

The phone number Discipler will text is displayed, not requested, so a Leader cannot mistype their way out of their own check-ins. A "not my number" affordance notifies the Admin and changes nothing, so a forwarded link can never re-point an account. The name the Leader types is stored as given; a spelling difference from Intake is not an error and raises nothing.

Participants hear who their Leader is and how to recognize their number, so an unknown text tomorrow is not alarming, and are given a way to say the match is not right without a conversation. No phone number is ever sent to a Leader by SMS.

Two access tiers only: Admin, who sees everything in their Ministry, and Leader, who sees only their own relationships. Coordinator, staff, and pastor team all name the Admin role and must not become separate tiers. Sessions are long-lived, on the order of a year; recovery is by password, and a lost password requires an Admin reset until one-time codes ship post-launch.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] A Leader receives an Invitation Link on relationship creation and can resolve it without a session
- [x] The match is revealed before any input is requested
- [x] The Leader sets a name and password to accept; the typed name is stored as given
- [x] The phone number is displayed, not accepted as input, and "not my number" notifies the Admin without changing anything
- [x] The link survives being opened and abandoned, and is consumed on account creation
- [x] The link expires within seven to fourteen days
- [x] Acceptance activates the relationship, releases the Starter Message to everyone in it, and records a timestamp
- [x] Participants receive their Leader's name and number where contact-sharing consent permits, and a way to decline the match
- [x] No message to a Leader contains a phone number
- [x] Exactly two access tiers exist, and `tier` governs access only — it never determines who leads a relationship and never gates the Leader surface
- [x] Account creation sets `person.user_id`, linking the login to the Person record in that Ministry
- [x] A Leader can see only the relationships they hold an open leader membership on

## Comments

### Amended — dual-role persons

The Invitation Link was already bound to the Person record rather than to an email
address, so the account-to-Person link this adds is the fact the flow already
assumed. Every Leader who logs in has a Person row in that Ministry; one without
is an error, not a supported state.

An Admin who also leads holds a single `ministry_member` row with `tier = 'admin'`,
because `unique (ministry_id, user_id)` permits no second one. The Leader surface
must therefore never require a `tier = 'leader'` row to exist — see ticket 19.

### Settled — the sign-in credential is a phone number and a password

This ticket asked for "a name and a password" and named no identifier; ticket 01 shipped
email; ticket 15 said phone. Settled: **phone number and password, one form, everyone
including Admins.** Email is optional at Intake, so a credential built on it is one half
the people who need it may not have. See
`docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.

The link is already bound to the Person rather than to an email address, so nothing in
the invitation flow changes — the identifier the Leader signs back in with is the number
this flow displays and refuses to accept as input.

### Settled — "not my number" is a persistent follow-up item

*Notifies the Admin* means it raises a `invitation_number_disputed` follow-up item, not a
transient notification. It is the highest-stakes condition in ticket 07's table: a wrong
number sends that Leader's check-ins to a stranger indefinitely, and a notification that
scrolls out of view is exactly the failure a Follow-Up Item exists to prevent. It still
changes nothing else — a forwarded link can never re-point an account.

### Settled — a Participant declining the match raises `match_declined`

> **Superseded 2026-08-30.** A Participant is sent no link and does not decline. The
> reasoning and what is left to withdraw are in *Amended — a Participant is sent no
> link, and does not decline* at the bottom of this file, and the decision is recorded
> in `docs/adr/0011-only-a-leader-is-sent-a-link.md`. What follows is kept because it
> is the argument the reversal answers, not because it still holds.

*A way to say the match is not right without a conversation* had no recorded destination
anywhere in the spec or the tickets. It raises a `match_declined` follow-up item. It is a
Participant on a web page — a different actor and a different surface from a Leader
texting `SWAP` — and without an item it reaches nobody.

- [~] The Leader signs in with a phone number and a password, and no email is collected anywhere in this flow
- [x] "not my number" raises a persistent `invitation_number_disputed` follow-up item and changes nothing else
- [~] ~~A Participant declining the match raises a `match_declined` follow-up item~~ — withdrawn, see above

### Shipped -- the link, the reveal, and acceptance as the whole of activation

`20260829000100_the_invitation_link.sql` carries the schema; the flow is
`relationship.accept`, `invitation.dispute_number` and `match.decline` at the same
command boundary as everything else, and `app/invitation/[token]/` is the surface.
399 tests pass, none skipped.

**`accepted_at` could not be both things, so it is one of them.** The ticket calls
the relationship's timestamp "the durable record that this Leader agreed to this
relationship". Ticket 05's amendment then made a group able to hold several
Leaders, and one column cannot hold several answers -- so the two sentences the
tickets now hold jointly are only satisfiable if the per-Leader record moves.
`relationship_member.accepted_at` is each Leader's own agreement, which is where
every other fact about a role already lives; `relationship.accepted_at` is
activation, stamped when the last open leader membership carries one. This is the
one inference in the pass worth challenging, and it is written down rather than
left to be discovered in the column.

The database has the final say on activation rather than trusting the snapshot the
domain decided from: the `update relationship set accepted_at` carries a
`not exists (... accepted_at is null)` over the open leader memberships, so a
co-leader whose acceptance rolled back cannot leave a relationship activated on
their behalf.

**One link, two destinations.** A Participant needs a way to say the match is not
right, on a web page, and that is the same fact an Invitation Link already is:
*this reveals this relationship to this person, with no session*. So `invitation`
carries no role column -- the role is read off `relationship_member`, where it
cannot disagree -- and the page branches on it. A Participant's link is issued at
activation, and their Starter Message carries it.

**The Participant hears about each Leader in their own message.** Contact sharing
is one Person's decision and `discloses_person_id` holds one Person, so a group
with two Leaders enqueues two Starter Messages to each Participant rather than one
that could only honour one of the two consents. The pilot's one-to-one is exactly
one message. Worth revisiting if multi-leader groups become common; it is chattier
than ideal and it is correct on the property that matters.

**"Not my number" is reachable on a link that has run out.** Discovering the
number is wrong a fortnight later is the same condition, and the affordance that
raises it must not be the thing that expired.

**The command role can enrol a Leader, and nothing wider.** Acceptance is the only
act in Discipler that creates a `ministry_member` row without an Admin, so the
grant is insert-only, policy-scoped to the declared Ministry and to `tier =
'leader'`. An Admin who also leads keeps their one `admin` row: the insert is
`on conflict do nothing` rather than an upsert that would demote them.

**Two ticket-05 assertions were restated rather than deleted.** "Creating a
relationship enqueues nothing to anyone" is now "nothing to a Participant" -- the
Leader is invited, which is the thing they are waiting for.

### Review pass -- seven findings, all real

**A Leader could never have accepted a second relationship.** The route created an
account unconditionally, so the second invitation to somebody who had already
accepted one hit a taken phone number and was refused before it reached the
command. `leader_one_open_group` deliberately leaves leading many one-to-ones
uncapped, so this was the ordinary second pairing, and it would have left the
relationship in Awaiting Leader Acceptance permanently. There is one account per
Person, not one per relationship: the page now hides the password field from
somebody who already has one, and the route reuses `person.user_id`. That also
makes the orphan-account note below true rather than hopeful -- retrying the same
link now works.

**Two co-leaders accepting at once could have left a group activated by nobody.**
Their acceptances touch disjoint membership rows, so under READ COMMITTED each
read the other's `accepted_at` as null, each decided it was not the last to agree,
and both committed with the relationship never stamped and both tokens spent. The
`not exists` guard did not cover it: it only guards the direction the domain said
*true*. `resolveInvitation` now takes the relationship row `for update`, which is
the same answer ticket 05's review reached for the gender check. The test holds
both transactions open until both have begun, and it fails without the lock.

**A Participant was shown the other Participants.** The reader returned everyone
else in the relationship and the page rendered them as the holder's Leaders, which
contradicts the rule the policies state outright -- a Participant's membership
grants them sight of nobody -- on a page that reads on the trusted connection and
is not policed by them. `withNames` is now the other side of the relationship.

**The Participant's Starter Message read as a promise interrupted by compliance
text.** It ended `at this number:`, and the opt-out disclosure is spliced in at
enqueue while the contact is appended at dispatch -- so the number landed after
the disclosure, and where consent was absent the message shipped with a dangling
colon and no number at all. Every sentence now stands without the details, and
both orderings are tested.

**`code in PROBLEMS` walked the prototype chain**, so `?error=__proto__` on a real
link returned an object, which React refuses to render: a 500 from a query string
anybody can type. `Object.hasOwn` now.

**`?done=accepted` was believed over the token**, so a forwarded URL told a Leader
they had an account they did not have. The screen is drawn from the token's state
and `done` only chooses the tense.

**Every Supabase 422 was reported as "there is already an account".** That covers
an unparseable number and phone signups being disabled too, and answering either
with advice that is false and impossible to follow swallowed the real fault. It
matches the duplicate-identity codes and lets the rest throw.

408 tests pass, none skipped.

### Still open

> **Swept 2026-08-31.** Three of these five are done, and the orphan-account item
> below is wrong about its own severity. See *Swept — the three items that were this
> ticket's* at the bottom of this file. What remains open is the first item (ticket
> 24) and the second (ticket 07). Kept as written because it is the list the sweep
> answers.

- **Phone-and-password sign-in is half shipped.** The account this flow creates is
  a phone identity with a password, per ADR-0008, and no email is collected
  anywhere in the invitation flow. `app/login` and `app/auth/sign-in` still take an
  email, and admin provisioning still mints one. Replacing them supersedes ticket
  01 and rewrites every test fixture that signs in, which is its own verifiable
  outcome and its own ticket. Until it ships, a Leader who accepts has a working
  account and no form that will take their number.
- **Care Needed is ticket 07's.** Both follow-up kinds are raised and persist, and
  nothing yet renders them. An Admin cannot see a disputed number today.
- **`Awaiting Leader Acceptance` is still hardcoded on the Roster.** It is now
  derivable -- `relationship.accepted_at is null` -- and still is not derived.
- **An orphan account is possible.** Acceptance creates the auth user before the
  transaction that links it, so a failure in between leaves a login with no
  `person.user_id`. It is recoverable by retrying the same link, and the reverse
  order would leave an acceptance nobody can sign in to. Worth a reconciliation
  pass rather than a redesign.
- **Re-issuing an expired link.** Nothing does it. An Admin has no way to send a
  Leader a fresh invitation, which is the instruction the expiry page gives them.

### Amended 2026-08-30 — a Participant is sent no link, and does not decline

Settled while reviewing ticket 12, and recorded in `docs/product-rules.md` under
*Settled: Leader Acceptance Activates a Relationship* and in `docs/open-questions.md`.

A link asks somebody a question they have not yet answered. A Participant answered
theirs at Intake by consenting to be paired; the Leader's acceptance was the half
still outstanding. So **only a Leader is ever sent one**, and ticket 12 stopped
minting the Participant's.

That leaves this ticket's decline mechanism unreachable and unwanted: a Participant
does not decline. A match that is not working reaches an Admin as a **swap**, and a
Participant who stops meeting or stops replying says so through the silence the care
rules already read — an Admin unpairs and re-pairs either way, which is a pastoral
decision and stays one.

Recorded as `docs/adr/0011-only-a-leader-is-sent-a-link.md`, because it removes a
capability the product had shipped and reverses two settled sections.

**Still to withdraw, and not done here:** the `match.decline` command
(`src/domain/commands.ts`), its handler (`src/domain/boundary.ts`), the
`app/invitation/[token]/decline` route, the `match_declined` follow-up kind in
`src/domain/follow-up.ts`, and the tests that cover them. The `match_declined`
value in the `follow_up_kind` enum **must stay** — history that already carries it
has to read back, and this repo does not overwrite past facts.

### Swept — the withdrawal ADR-0011 named is done, bar one decision — 2026-08-31

The *Still to withdraw* list above was still standing three tickets later. Cleared:

- `match.decline` is gone from `src/domain/commands.ts`, and its branch of the
  shared `invitation.dispute_number` case in `src/domain/boundary.ts` with it. That
  case no longer branches on `command.type` at all: one command, one refusal, one
  kind, rather than a ternary choosing between a live path and a dead one.
- `app/invitation/[token]/decline/route.ts` is deleted.
- `invitation.not_a_participant` is gone from `src/domain/errors.ts` and from
  `app/invitation/copy.ts`, and `match.decline` from `isTokenDriven` in
  `src/service/command-service.ts`.
- The decline form is gone from `app/invitation/[token]/page.tsx`, and the
  `done=declined` acknowledgement with it.

**`src/domain/follow-up.ts` was deliberately left alone**, against the list above.
The list says to withdraw the `match_declined` kind there and, in the next sentence,
that the enum value must stay because *history that already carries it has to read
back*. Those cannot both hold: `FOLLOW_UP_KINDS`, `isFollowUpKind` and
`readFollowUpPayload` are the read-back path the Care Needed reader narrows a stored
row through, so dropping the kind from the domain would make an existing
`match_declined` row fail `isFollowUpKind` and vanish from an Admin's list — silently,
which is the one thing a Follow-Up Item exists not to do. Whether the domain should
keep rendering a kind nothing can write is a decision, not a refactor, so it is left
for a person. `tests/integration/care-needed.test.ts` and
`tests/integration/follow-up-items.test.ts` still cover the read-back and still pass.

**Three tests in `invitation-over-http.test.ts` were already failing at HEAD** and
were passing only against a stale `next dev` on :3000. Ticket 12 stopped minting the
Participant's link and left them behind, all three dying on `no live invitation was
issued`. Verified by running the suite against a freshly built server. The two
decline ones are deleted; the third — *shows a Participant their Leaders, never the
other Participants* — is `it.skip` with the reason on it, because deleting it would
take the only description of the Participant reveal branch with it, and whether that
branch goes is the same open decision.

`tsc --noEmit` clean; 893 pass, 1 skipped, against a rebuilt app.

**Open:** the Participant reveal branch of `app/invitation/[token]/page.tsx` and the
Participant scoping in `invitation-reader.ts` are now unreachable — nothing mints the
token that would render them. They are kept, not deleted.

### Swept — the three items that were this ticket's — 2026-08-31

The *Still open* list held five items. Two were named there as other tickets' and
still are: **phone-and-password sign-in** is ticket 24's, and **rendering Care
Needed** is ticket 07's. The other three were this ticket's and are done.

**The Roster derives Awaiting Leader Acceptance.** It is on each relationship line
on the row, from `relationship.accepted_at is null`, so an Admin can see a week
later which of their pairings actually started. The banner that used to assert it
now describes what just happened -- *its leader has been invited* -- because a
receipt that keeps claiming a state is the one thing on the page still saying
*awaiting* after the Leader has accepted. `RosterRelationship` carries the
relationship id for the same reason it carries the names: a row that can describe a
relationship and not act on it is where the next item was stuck.

**An Admin can send a Leader a fresh Invitation Link.** `invitation.reissue`, from
the row that says the relationship has not been accepted. This was a dead end
rather than a missing convenience: the tick stops reminding a Leader once their
link has run out -- deliberately, since a reminder carrying a dead link sends them
to a page telling them to find an Admin -- and raises `relationship_unaccepted`
instead, which the Admin could then do nothing about.

A live link is re-sent rather than replaced, which is `intake.reopen`'s rule for
`intake.reopen`'s reason: the commonest reason to ask is a Leader who lost the
text, and minting a second token there stops the one already on their phone from
working. The Admin never sees the token -- unlike the Intake link, this one *sends*,
because an Invitation Link authenticates by possession of the phone it was texted
to and handing it to an Admin to forward would make it reachable by anybody they
forward it to. The copy is the reminder's, so a Leader cannot tell whether the tick
or an Admin sent it. Everything that should do nothing -- an accepted relationship,
a Leader who has agreed, a Participant, another Ministry -- is absent from the
snapshot rather than refused by a check, so one read covers all four.

**The orphan account was not what this ticket recorded, and is now closed.** The
note said it was *recoverable by retrying the same link*. It was not, and the
comment in `accept/route.ts` said so too. The retry reads `person.user_id`, which
is exactly what the failed command never set -- so it called `create` a second time,
was refused because the number was taken, and told the Leader to go and sign in to
an account belonging to no Person, which would accept nothing. A permanent dead end
for that Leader, wearing a comment saying it was fine. The first test in
`tests/integration/an-orphaned-account.test.ts` is that refusal, written down.

Narrowed, not closed, by undoing the half-step rather than reconciling it
afterwards: if the acceptance *throws*, the route discards the account it just
minted, and the number is free for the retry. `discard` refuses an account any Person already holds -- that
one was not made by the attempt that is failing, and deleting it would sign a
working Leader out of their Ministry for good -- and it swallows its own failures,
because a cleanup that throws replaces the error the Leader needs to see.

**One existing assertion changed rather than being preserved.**
`pairing-over-http.test.ts` checked the page said `awaiting its leader`, which was
the banner. It now checks the row's derived label and the reworded receipt. The
fact the test was written to protect is still asserted, in the place that stays
true.

30 new and changed tests. 1135 passing across 84 files, 1 skipped -- the
pre-existing `it.skip` in `invitation-over-http.test.ts`, which waits on the
decline-surface decision and is not this sweep's.

### Corrected after review — 2026-08-31

Two axes reviewed the sweep above and both refused it the terminal status. They were
right on every count that mattered, and the code changed rather than the claim.

**The status goes back to `ready-for-agent`.** `docs/agents/triage-labels.md` sets
the bar: every criterion checked, and every item raised for a human resolved here or
migrated to `docs/open-questions.md`. Two things fail it, and naming the work as
another ticket's does not answer either. The criterion *The Leader signs in with a
phone number and a password, and no email is collected anywhere in this flow* is
still `[~]` and belongs to ticket 24. And the **Open:** note above -- the Participant
reveal branch and the Participant scoping in `invitation-reader.ts`, unreachable
since ticket 12 stopped minting the token -- was a decision left for a person with
nowhere to live. It is now in `docs/open-questions.md`, which is where parking it
makes it stop holding this ticket open.

**The orphan account is narrowed, not closed, and the sweep said closed.** The
compensation runs when `execute` throws in this process. A crash, a timeout or a
dropped connection between `create` and the command still orphans an account, and
nothing reconciles one after the fact. What the change removes is the ordinary case
and the false comment; the residue is the reason the original note asked for a
reconciliation pass, and that pass is still unwritten. The route's compensation path
is also not covered by a test -- `an-orphaned-account.test.ts` exercises the adapter
primitive it depends on, and says so.

**Three defects in the new code, found by review and fixed:**

- **The receipt claimed a text that had not been sent.** `?reinvited=<person>` was
  set from having asked, and the page confirms whenever that id names anyone on the
  Roster -- which every no-op path does, since the Leader is on the Roster under
  their own name either way. An Admin re-inviting somebody whose row has no phone
  number was told the invitation had gone. The route now redirects with `reinvited`
  only when a message was actually enqueued, read off the effects.
- **The tick would have sent the same sentence again.** `remindedAt` is read from
  `relationship.acceptance_reminded`, so recording only `invitation.reissued` left
  it null against a link that was live again, and the next tick re-sent the Admin's
  own copy. The re-issue now appends that event too and counts as the one reminder.
- **The superseded window was overwritten with no record of it.**
  `reissueInvitation` replaces the row in place, and the history event carried only
  `personId` and `replacedTheLink`. It now carries both ends of the window it
  replaced, which is what `intake.link_issued` already does, and still never the
  token.

**Four decisions in the re-issue were settled by inference and should not have
been.** CLAUDE.md: *do not infer material product behavior when a requirement is
ambiguous; surface the ambiguity*. The ticket said only *"Re-issuing an expired
link. Nothing does it."* Writing them up here afterwards is a record, not a
surfacing, so they are in `docs/open-questions.md` for a human. They are: re-sending
a live link rather than minting a new one; reusing the reminder's wording so a
Leader cannot tell an Admin's chase from the tick's; a Leader with no number
producing nothing at all; and the affordance being gated on role and state together.

**One review finding rejected.** The duplication between the re-issue's enqueue and
the tick's at ~1720 is real but has no existing helper to reuse:
`chaseTheOpenQuestion` is check-in sequence chasing and not an acceptance reminder.
Extracting one now would join two acts that differ in what they loop over and what
they record.

`tsc --noEmit` clean. 1138 passing across 84 files, 1 skipped.
