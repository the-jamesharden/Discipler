# Discipler Product Flow

The settled product flow. This is a product model, not an implementation specification. Where a detail belongs to one surface, it lives in that surface's document: `docs/pastor-dashboard.md`, `docs/leader-dashboard.md`, `docs/check-in-rhythm.md`, `docs/consent-language.md`.

## Canonical flow

```text
ROSTER
   ├── added by CSV upload, or manually by an admin
   └── status: No Intake Submitted
   ↓
INTAKE  (native Discipler form)
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
   ├── Paused        — leader stepped back; nobody returns to the pool
   └── Ended         — terminal, with a reason
   ↓
WEEK-BY-WEEK HISTORY
   ├── admin dashboard: Overview, Check-Ins, Suggested Pairs,
   │                    Follow-Up, Materials, Roster
   ├── Follow-Up: see contact · resolve concern · nudge · end
   └── Ministry Intelligence (reporting interface deferred past V1;
                              the history it reads must be complete now)
```

## The core primitive

A discipleship relationship is **one leader and N participants**. A relationship with one participant is one-to-one; a relationship with more is a group. There is no separate group entity, one state machine, and one check-in cadence. Copy branches on how many participants a relationship has — never on a group-versus-one-to-one distinction.

## Roster and intake

Roster membership, intake completion, and pairing eligibility are three different facts. A person uploaded by an admin appears as `No Intake Submitted`, cannot be paired, and receives nothing. Only completing intake — where they give both consents themselves — moves them to `Ready to Pair`. Importing a person is never consent.

## Suggestion

Suggestions are produced for one-to-one relationships only; groups are always formed manually.

Constraints filter before anything is ranked. Gender must match and is absolute — manual pairing cannot override it. The age band constraint governs suggestion only and an admin may pair across it. Whoever survives is ranked by availability overlap, with Discipleship Goal separating candidates who already have comparable overlap, and ties broken by who has waited longest since intake.

Every suggestion states its reason in one plain sentence. An input that cannot be explained that way is out of scope by construction. See `docs/adr/0001-pairing-suggestion-inputs.md`.

People who share no availability with any eligible leader appear in a **No Schedule Overlap** section — listed for visibility, never presented as a fit.

## Acceptance

Creating a relationship does not activate it. The leader receives an SMS invitation link, sees who they have been matched with, sets a password, and accepts. Acceptance activates the relationship, releases the Starter Message, and records that this leader agreed to this relationship at this time.

Contact details never travel by SMS to a leader; they appear on the leader dashboard. A participant does receive their leader's name and number, so an unknown text tomorrow has context.

An unaccepted relationship holds its people out of the suggestion pool. The leader is reminded after two days, it surfaces to the admin after five, and an admin can cancel it at any point.

## History

Discipler stores what happened rather than replacing old values with new ones. A late reply attaches to the question it answers and never rewrites an earlier week as answered. Material assignments, membership changes, and relationship endings are all dated rather than overwritten.

The same history drives current state, the Follow-Up view, and Ministry Intelligence. There is no second source of truth for analytics, and no ministry's data is ever pooled with another's.
