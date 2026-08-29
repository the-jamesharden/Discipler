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

*A way to say the match is not right without a conversation* had no recorded destination
anywhere in the spec or the tickets. It raises a `match_declined` follow-up item. It is a
Participant on a web page — a different actor and a different surface from a Leader
texting `SWAP` — and without an item it reaches nobody.

- [~] The Leader signs in with a phone number and a password, and no email is collected anywhere in this flow
- [x] "not my number" raises a persistent `invitation_number_disputed` follow-up item and changes nothing else
- [x] A Participant declining the match raises a `match_declined` follow-up item

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

### Still open

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
