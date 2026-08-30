# 02 — CSV import populates the Roster

**What to build:** An Admin uploads a spreadsheet of names, phone numbers, and email addresses instead of typing their congregation in by hand. Those people appear on the Roster as `No Intake Submitted`.

Being on a roster is not consent and is not a wish to participate. An imported Person receives nothing, cannot be paired, and cannot receive a check-in. Roster membership, Intake completion, and pairing eligibility are three separate facts and must never collapse into one flag.

The Roster shows every Person in the Ministry with their Participation Status. That status answers one question only — *is this person being discipled* — so it is derived rather than stored, and leading a relationship will never set it.

**Blocked by:** 01

**Status:** shipped

- [x] An Admin can upload a spreadsheet and see the imported people on the Roster
- [x] Imported people carry Participation Status `No Intake Submitted`
- [x] Importing enqueues no outbound message to anyone
- [x] An imported Person cannot be paired and cannot receive a check-in
- [x] Rows that cannot be read are reported back to the Admin rather than silently dropped
- [x] Participation Status is derived by one SQL function over intake, consent, and open participant memberships — never a stored flag, and never set by the importer
- [x] This ticket ships three of the four values — `Opted Out`, `No Intake Submitted`, `Ready to Pair` — and the `Paired` branch arrives with ticket 05, where memberships first exist
  - **Deviated from, deliberately:** all four shipped here. Ticket 05's schema landed
    before this ticket was picked up, so the reason for deferring `Paired` was gone by
    the time the derivation was written. Splitting a four-branch `case` across two
    tickets would have bought a rewrite and nothing else. Ticket 05's box is ticked
    and says where the branch lives. The criterion above is left as it was written
    rather than edited to match what was built.

## Comments

### Amended — dual-role persons

Participation Status is derived, not stored, and it means *being discipled* — see
`docs/product-rules.md` under *Roles Are Relationship Memberships*. The derivation
lands here with three values because `relationship_member` does not exist until
ticket 05; the `Paired` branch is an acceptance criterion there, not a follow-up.

### Implemented — import, and the derivation

An Admin uploads a CSV on the Roster and the congregation appears on it, reading
`No Intake Submitted`. Nothing is enqueued to anybody, and neither pairing nor a
message can reach an imported Person -- both refused by the database rather than by
application code that a later write path could forget.

**The file is the command's payload.** `person.import` carries the CSV unread, and
the boundary reads it. Deciding what Discipler will accept as a Person -- a name, a
number it can text -- is a rule like any other, so it sits on the domain side where
it is driven by tests with no upload anywhere near it. `readRosterFile` is a real CSV
reader rather than a `split(',')`, because `"Johnson, Emily"` is ordinary in an export
and the naive version reads a surname as a phone number.

**Rows come back with line numbers and codes, never prose or names.** The report
travels in the query string, which is logged and shared, so it carries *line 7* and
`no_phone` rather than a congregant's number. The Roster owns the wording, which is
the rule the sign-in page already follows, so an invented `?refused=` renders nothing.

**A Person is a name and a number.** Keying identity on the number alone would have
been smaller and is wrong: a shared phone is ordinary, and ticket 20's serialisation
exists precisely because a number may reach several people. Under the number-only key
the second person on a couple's phone is silently not imported, which is the exact
failure the *report, never drop* rule exists to prevent. Recorded in
`docs/adr/0005-a-person-is-a-name-and-a-number.md`.

**The derivation is one SQL function, and it guards its own visibility.**
`participation_status(person)` is exposed as a computed column, so the Roster reads
people and their status in one statement and no caller can fetch the first without
the second. It is `security definer` because a Leader may see a Person but not their
Intake -- which makes it a probe unless it re-applies the same visibility test the
policies on `person` apply, so it does. A bug worth recording: the guard was first
written as a plain `or` chain, and `person.user_id = auth.uid()` is NULL rather than
false for a Person with no account, so `not (...)` was NULL and refused nobody. Every
Person on an imported Roster has no account. It is `coalesce(..., false)` now, and
there is a test that forges a Person row rather than fetching one.

**All four values ship, not three.** The ticket said `Paired` would wait for ticket
05, because `relationship_member` did not exist. It does now, so the branch is here
and ticket 05's box is ticked. Splitting a four-branch `case` across two tickets would
have bought nothing but a rewrite.

**Two invariants moved into the database.** A participant whose derived status is
`no_intake_submitted` or `opted_out` cannot hold a membership, and a Person with no
SMS consent or an open opt-out cannot be the recipient of an outbound message. Both
are triggers translated into refusal codes at the store, the same way the caps are.
The second is a floor under ticket 03's send-time checks, not a replacement:
contact-sharing consent still belongs to the sending layer. Cooldowns and nudge limits
were listed here too and are withdrawn -- Nudge sends nothing, so there is no
admin-initiated send for a ceiling to govern. See ADR 0010.

**Fixtures now describe reality.** `addPerson` completes Intake by default, because a
Person who has not is unpairable and a test that forgot would fail at the pairing
rather than at the fixture. `{ intake: false }` is the imported Person.

197 tests pass against a local Supabase stack, none skipped.

### Deliberately left for later tickets

- **Intake, consent and opt-out landed as skeletons.** Each is the identity of a fact
  and nothing more -- a submission exists, a consent was granted, an opt-out is open --
  because a derivation over tables that do not exist cannot be written or tested.
  Ticket 03 fills Intake and consent out with what the form captures; ticket 17 is
  what writes an opt-out.
- **Nothing merges two Person rows that turn out to be one human.** ADR-0005 accepts
  near-duplicates as the cost of representing a shared phone, and the merge belongs
  with ticket 16's Roster completeness work.
- **A Leader can read the phone number of a Person they lead**, because row-level
  security is row-level and the Leader Dashboard is the surface that owes the
  contact-sharing consent check. That check is ticket 15's, and it is a real gap until
  it ships -- recorded here rather than left for a reviewer to find.
- **The Pair action is not on a Roster row.** It needs the pairing screens, which are
  ticket 05's, and the Suggested Pairs view, which is ticket 04's.

### For a human to confirm

**A row must carry a phone number.** Everything a Person receives is SMS, and a Person
with no number can never be sent an Intake link. Confirmed while building; flagged
because it means a Ministry holding email-only records cannot import them at all.

**An unreadable email refuses the whole row**, so a Person with a good name and a good
number is kept off the Roster by one bad cell. That follows *report, never drop* --
the Admin fixes the cell and re-imports -- but the opposite reading, importing them
without the email and reporting the cell, is defensible. Now raised as an open question
in `docs/open-questions.md` rather than left in this file: taking the other reading
means inventing a third outcome for a row, which changes what the report means.

**`Opted Out` outranks `Paired` in the derivation.** Nothing in the product docs
decides which of the two a Person who is both should read as, and this ticket had to
pick one to write the `case`. Raised as an open question in `docs/open-questions.md`
rather than settled in a migration comment.

### Review — intake is the gate on both sides of a relationship

Two things were wrong here and are fixed, in migration
`20260827000200_intake_is_the_consent_gate.sql`.

**A Leader was held to nothing.** `reject_unready_participant` opens with
`if new.role <> 'participant' then return new`, so a Person who had opted out, or who
had never completed Intake, could still be inserted as the *leader* of a relationship.
The flow is import, then Intake, then pairing, and leading does not make the middle
step optional. `reject_unready_leader` is a second trigger rather than a widening of
the first, because the Admin who hits one is being told a different thing than the
Admin who hits the other, and a single function answering both would have to
reconstruct which it was in order to say so. `paired` passes it: a Person being
discipled by somebody else is free to lead, which is the whole reason it reads the
derivation rather than the tables under it.

**A consent record could not say how it was obtained.** `consent_record.source` is now
`pastor_link` or `qr_code` -- the two routes to the Intake form, both producing the
same record. It is not defaulted, so a write that cannot say how the Person reached
the form fails rather than guessing. Recorded in `docs/consent-language.md` and
`docs/product-flow.md`; an Admin attesting on a congregant's behalf is not a route,
and inbound-keyword opt-in is post-V1.

**Not fixed, and now recorded instead:** nothing enforces *no SMS before pairing
approval*. `outbound_message` carries no relationship, so the database cannot see
which approval a message should follow. Raised in `docs/open-questions.md`; it needs
answering before ticket 06 enqueues anything.

220 tests pass against a local Supabase stack, none skipped.

### Amended — recognition is the number first, the name second

The importer originally recognised a returning row by name and number together, so a
number already on the Roster under a *different* name read as a new Person and was filed
as one. Acceptance renames people — it stores the name a Leader typed, which is often not
the name the spreadsheet held — so re-uploading an unchanged spreadsheet quietly produced
a second Person.

Recognition is now two-stage: the number decides whether Discipler has seen the line
before, the name decides what kind of match it is. An exact match is
`already_on_the_roster` as before; a number under a new name is `same_number_different_name`,
which files nobody and reports the row. Discipler does not guess whether that is a rename
or the second person on a shared phone, because both are ordinary and each guess loses
the other one.

`docs/adr/0005-a-person-is-a-name-and-a-number.md` carries the reasoning as an amendment.
Ticket 26 builds the Admin's answer to the report; until it ships, the report is a dead
end an Admin can only resolve by editing their spreadsheet, and that is a known gap.
