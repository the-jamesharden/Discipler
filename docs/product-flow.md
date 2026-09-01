# Discipler Product Flow

The settled product flow. This is a product model, not an implementation specification. Where a detail belongs to one surface, it lives in that surface's document: `docs/pastor-dashboard.md`, `docs/leader-dashboard.md`, `docs/check-in-rhythm.md`, `docs/consent-language.md`.

## Canonical flow

```text
ROSTER
   ├── added by CSV upload, or manually by an admin
   └── status: No Intake Submitted
   ↓
INTAKE  (native Discipler form; reached by a pastor-sent link or a QR code)
   ├── name, phone, availability
   ├── gender, age range, Discipleship Goal
   ├── email (optional)
   └── SMS consent + contact-sharing consent, versioned and timestamped
   ↓
   status: Ready to Pair
   ↓
SUGGESTED PAIRS                          MANUAL PAIRING
   ├── constraints filter the pool          └── an admin may pair anyone
   │     gender (absolute)                        eligible, at any time,
   │     age band (suggestion only)               including forming a
   ├── availability overlap ranks                 relationship with many
   ├── Discipleship Goal labels                   participants
   └── Excellent fit / Good fit /
       Recommended / No Schedule Overlap
   ↓
RELATIONSHIP CREATED
   └── state: Awaiting Leader Acceptance
       everyone in it leaves the suggestion pool
   ↓
INVITATION LINK  →  leader dashboard
   ├── reveal: who, and which ministry
   ├── set name + password
   └── ACCEPT
   ↓
   state: Healthy · Starter Message released to everyone
   ↓
CHECK-IN RHYTHM  (weekly, one sequence per leader)
   ├── Did you meet?              1 / 2
   ├── How did it go?             A / B / C
   ├── What was the concern?      free text
   └── next relationship, or closing thank-you
   ↓
RELATIONSHIP STATE
   ├── Healthy
   ├── Stalled       — 2 weeks silent, or 3 weeks not meeting
   ├── Needs Care    — a concern raised this week
   ├── Paused        — leader paused this relationship for 1/2/4/8/12 weeks
   │                   (default 2); check-ins suppressed, nobody returns to
   │                   the pool, relationship stays visible on both surfaces;
   │                   expiry raises admin review and resumes nothing
   └── Ended         — terminal, with a reason
   ↓
WEEK-BY-WEEK HISTORY
   ├── admin dashboard: Overview, Check-Ins, Suggested Pairs,
   │                    Follow-Up, Materials, Roster
   ├── Follow-Up: stalled · unresolved concern · expired pause · swap request
   │              nudge (reveals contact details) · resolve · resume · end
   └── Ministry Intelligence (reporting interface deferred past V1;
                              the history it reads must be complete now)
```

## The core primitive

A discipleship relationship is **one leader and N participants**. A relationship with one participant is one-to-one; a relationship with more is a group. There is no separate group entity, one state machine, and one check-in cadence. Copy branches on how many participants a relationship has — never on a group-versus-one-to-one distinction.

## Roster and intake

Roster membership, intake completion, and pairing eligibility are three different facts. A person uploaded by an admin appears as `No Intake Submitted`, cannot be paired, and receives nothing. Only completing intake — where they give both consents themselves — moves them to `Ready to Pair`. Importing a person is never consent.

**Intake is the single consent gate.** Completing the form creates the SMS consent record, and nothing else does. Discipler sends no SMS to anyone who has not completed intake, and pairs nobody who has not completed intake — on either side of the relationship. Finding an intake-less person on a roster is ordinary, because an import puts a whole congregation there at once; it is a fact about the roster, not a licence to pair them or text them.

There are two ways to reach the form, and they produce the same record with a different `source`:

- **A pastor sends the link** — by email, group chat, or however they already reach that person. The primary path.
- **A QR code** — the same link, and the one that works when a room of leaders can do it together at a meeting.

An admin cannot attest to consent on a congregant's behalf, at import or anywhere else. Inbound-keyword opt-in — where a person texts a join word and the inbound message is the consent — is post-V1; if it ships it becomes a third source here, having been decided rather than assumed.

## Suggestion

Suggestions are produced for one-to-one relationships only. A group is formed by the pastor, and may then be joined through the Ministry's group Intake link -- directly, or by asking first where the pastor has set that group to ask. See `docs/adr/0017-picking-a-group-joins-it.md`.

Constraints filter before anything is ranked. Gender must match and is absolute — manual pairing cannot override it. The age band constraint governs suggestion only and an admin may pair across it. Whoever survives is ranked by availability overlap, with Discipleship Goal separating candidates who already have comparable overlap, and ties broken by who has waited longest since intake.

Every suggestion states its reason in one plain sentence. An input that cannot be explained that way is out of scope by construction. See `docs/adr/0001-pairing-suggestion-inputs.md`.

People who share no availability with any eligible leader appear in a **No Schedule Overlap** section — listed for visibility, never presented as a fit.

## Acceptance

Creating a relationship does not activate it. The leader receives an SMS invitation link, sees who they have been matched with, sets a password, and accepts. Acceptance activates the relationship, releases the Starter Message, and records that this leader agreed to this relationship at this time.

Contact details never travel by SMS to a leader; they appear on the leader dashboard. A participant does receive their leader's name and number, so an unknown text tomorrow has context.

An unaccepted relationship holds its people out of the suggestion pool. The leader is reminded after two days, it surfaces to the admin after five, and an admin can cancel it at any point.

## Pause, resume, and swap

A leader may pause a relationship they lead for 1, 2, 4, 8, or 12 weeks, defaulting to 2. The transition is immediate and needs no admin approval. Check-ins for that relationship stop, nobody moves, and the relationship stays visible and marked `Paused` on both the leader's list and the admin dashboard.

`Paused` masks the state the relationship would otherwise derive rather than rewriting its history. Replying `RESUME` resumes it immediately and releases the Starter Message; the underlying state then resurfaces, so a relationship that was stalled when it was paused is stalled again until an answered check-in clears it. Resuming never sets Healthy on its own.

If the pause period elapses instead, nothing happens automatically. The relationship stays `Paused`, no message is sent, and a follow-up item asks the admin to review it. The admin resumes it or ends it.

`SWAP` is a leader's request to be matched with a different participant. It records the request against that relationship and raises a follow-up item. It changes no state, moves nobody, and ends nothing; the relationship stays intact until the admin acts. Neither an expired pause nor a swap request clears itself.

## History

Discipler stores what happened rather than replacing old values with new ones. A late reply attaches to the question it answers and never rewrites an earlier week as answered. Material assignments, membership changes, and relationship endings are all dated rather than overwritten.

The same history drives current state, the Follow-Up view, and Ministry Intelligence. There is no second source of truth for analytics, and no ministry's data is ever pooled with another's.
