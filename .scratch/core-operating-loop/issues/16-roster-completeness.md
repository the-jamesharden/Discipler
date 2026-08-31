# 16 — Roster completeness

**What to build:** Three gaps in the Roster that each stand between an Admin and a Person's real situation.

An Admin can **mark a Person eligible to lead** before they complete Intake, so they can plan while waiting on them. This is the intended-role field and the leader-pool flag in one: a plan that becomes eligibility, never two separate facts to keep in step. It is still a plan and not a fact — it does not make the Person pairable, does not substitute for Intake, and says nothing about whether they currently lead anything.

An Admin can **send a Person a link that reopens their own Intake form prefilled**, so availability or a phone number can be corrected without giving them an account. This is the only route by which a Participant's availability changes; there is no Participant dashboard and no SMS path for it in V1.

A Person who has **opted out** is excluded from pairing and from follow-up, so the Ministry honors what they told them. `STOP` moves a Person to `Opted Out` at the person level. They receive nothing further, appear in no suggestion, and are not surfaced as a care item — an opted-out Person is not a problem to be solved.

**Blocked by:** 04, 08a, 08b

**Status:** done

- [x] An Admin can mark a Person eligible to lead before they have completed Intake
- [x] Eligibility to lead does not make a Person pairable and does not substitute for Intake
- [x] Eligibility is independent of whether the Person has an account and of how many relationships they already lead
- [x] The Roster shows the derived Participation Status, and a Person who leads but is discipled by nobody reads `Ready to Pair` with an explanation of why
- [x] An Admin can send a tokenized link reopening a Person's Intake, prefilled
- [x] Re-submitting Intake updates availability and contact details without creating a duplicate Person
- [x] Re-submitting records a fresh consent record rather than overwriting the earlier one
- [x] `STOP` moves a Person to `Opted Out`
- [x] An opted-out Person receives no further messages, appears in no suggestion, and raises no care item
- [x] An opted-out Person in an existing relationship does not silently end it

## Comments

### Amended — dual-role persons

Q4, settled: one field. `eligible_to_lead` *is* the intended role. Two flags would
have needed a rule for what a Person marked intended-leader but not eligible means,
and there is no answer to that question anybody would want to give.

The Roster explanation matters more than it looks. A coordinator seeing a man who
leads two relationships listed as `Ready to Pair` will read it as a bug unless the
screen says what the status is about — that he is not currently being discipled,
which is exactly the thing the ministry would want to notice.

### Half of the Roster explanation landed with ticket 02

*The Roster shows the derived Participation Status* is done: the column is there and
the derivation behind it is one SQL function. *With an explanation of why* is there in
its cheapest form -- one sentence under the table saying that Participation answers
whether a Person is being discipled, and that someone who leads but is discipled by
nobody reads `Ready to Pair`. It was written with the status column rather than left
for this ticket because a status column without it invites exactly the misreading this
ticket's comment describes.

What remains here is the per-Person version: an Admin looking at one man listed
`Ready to Pair` who leads two relationships should be able to see *those two
relationships* from his row, not just the general rule.

### Settled — Opted Out outranks Paired

A Person holding an open participant membership who has also opted out reads as
`Opted Out`, which is what ticket 02 shipped. An Admin needs to see what the Person told
the Ministry before what the Ministry arranged for them.

Nothing is hidden either way, and that is what settles it: opting out does not end a
relationship, and the Roster shows who each Person is in a relationship with in its own
column, so an opted-out Person's row still shows their relationships. The choice was
only ever about which fact the status column carries.

### Settled — the Intake form is not a withdrawal route

Re-submitting Intake with SMS consent unticked is **refused**, exactly as a first
submission is (`intake.sms_consent_required` already does this). The form grants consent
and never withdraws it. Withdrawal is `STOP`, which is dated, reversible by `START`, and
person-level; a prefilled link an Admin sent producing a withdrawal that reads as the
Person's own act is the wrong shape, and `consent_record` has no column for it.

The dead end closes in copy, not schema: the refusal message in `app/intake/copy.ts`
names the real route — *if you no longer want text messages, reply STOP to any message
from us.*

### Settled — a contact-sharing decline must be recorded, and today it is not

This is a live gap and the one thing here that cannot be fixed after the fact.

Contact sharing is asked as an explicit choice between granted and declined
(`src/domain/intake.ts`), but only a grant writes a row (`src/domain/boundary.ts`
`grantedConsents`), and the sending layer reads existence
(`src/platform/supabase/outbound-queue.ts`, `exists ... consent = 'contact_sharing'`). A
Person who granted contact sharing and later re-submits declining it therefore leaves
the earlier grant standing, and their Leader keeps seeing their number — which ticket 15
checks at display time precisely so that it can be withdrawn.

A consent record must carry the decision rather than merely its own existence, and the
current decision is the latest record for that Person and consent kind. The table stays
append-only; nothing is rewritten. A decline that was never recorded cannot be recovered
from anywhere, which is why this is settled before the re-submission path is built.

- [x] A Person who is both Paired and opted out reads `Opted Out`, and their row still lists their relationships
- [x] Re-submitting Intake with SMS consent unticked is refused, and the refusal names `STOP`
- [x] A consent record carries its decision, and the current decision is the latest record per Person and kind
- [x] Re-submitting with contact sharing declined stops the number being shown to a Leader, proven end to end

### Landed ahead of this ticket — the consent record now carries its decision

Migration `20260828000100_a_consent_record_carries_its_decision.sql`. `consent_record`
gains `granted boolean not null`, `granted_at` is renamed `decided_at`, and one function
— `app.current_consent(person, kind)` — is the single definition of what a Person
currently consents to.

It found more readers than expected. Four already existed, not two:
`public.participation_status`, the `outbound_message` insert trigger, and both consent
checks in the sending layer. All four now call the function; ticket 15's display-time
check will be the fifth.

The domain changed with it: `IntakeRecord.grantedConsents` becomes `consentDecisions`,
and the boundary emits both decisions always rather than only the grants. The comment
that argued for the old shape — *a record saying false would make `exists` the wrong
question* — is replaced, because `exists` was the wrong question.

`tests/integration/withdrawing-consent.test.ts` covers grant, decline, withdrawal after
a grant, re-grant after a decline, an SMS withdrawal at the sending layer, and the
never-asked NULL. One existing assertion in `completing-intake.test.ts` had encoded the
old behaviour — *a refusal is the missing row rather than a row saying no* — and now
asserts the decision.

**What remains for this ticket** is the re-submission path itself: the tokenized link,
the prefilled form, and the write that produces the second decision. The mechanism
underneath it is in place and proven, so the path has somewhere correct to land.

### Landed — what was built, and the bug found on the way

**Eligibility.** `person.eligible_to_lead` has been a column since ticket 06 with a
comment naming it ticket 16's intended-role field; nothing set it. It now has a
command (`person.set_lead_eligibility`), a history event either way round, and a
control on every Roster row -- including a row reading `No Intake Submitted`, which
is the row it exists for. `public.roster` widened by a column to carry it, which
meant dropping and recreating the function.

**The Roster row.** `RosterEntry.withNames` becomes `relationships`: one entry per
open membership, each carrying the role. A man leading two relationships now reads
*Leads Ruth Adeyemi* and *Leads Sam Doyle* on his own row, beside `Ready to Pair` --
which is the per-Person half the earlier comment left for this ticket.

**The link.** `intake_link` holds one row per Person, replaced on re-issue: two live
links would both open the door with neither able to revoke the other. The Admin is
shown the link and sends it themselves rather than Discipler texting it, because the
commonest reason to reopen somebody's Intake is that the number on file is wrong --
Q settled in the implementation. `intake.submit` gains an optional token, and that
token is what makes a correction possible: without it a Person is recognised by the
name and number they typed, which is exactly what somebody changing their number
cannot be. `IntakeRecord` carries the name and number as `corrections`, set only
where the token named the Person -- a branch rather than one path, and deliberately
so: on the Ministry-wide form that pair is *how* they were just recognised, and
writing it back could only overwrite it with a differently-cased copy of itself.
Through a link an Admin sent it is the thing they came to change. A correction that
collides with somebody already on the Roster is refused as
`intake.details_belong_to_someone_else`, the same collision an import reports.

**One live bug, found under *receives no further messages*.** `leadersDueForCheckIn`
did not exclude an opted-out Leader. Opting out ends no relationship, so the cadence
still found them due, the outbound queue refused the question, and the tick is one
transaction -- so one Leader texting `STOP` would have rolled back every check-in
conversation in that Ministry, every week, with nothing on any screen to say why. It
reproduced immediately in `the-cadence` and took the *following* test down with it.
The fix is the exclusion `unacceptedRelationships` already made, for the reason it
already documented.

**Not built, because there is nothing to build it in.** *Appears in no suggestion* is
proven only as far as it can be, and the box is ticked on that basis rather than on a
suggestion engine having been checked. Ticket 04 is still `ready-for-agent`, so what
stands today is that the pairing screen's candidate list excludes them and the
database refuses the membership on either side. **Ticket 04 must carry the filter
forward when it lands** -- nothing here pins it for a scorer that does not exist.

### Surfaced — ADR-0011, and the two decisions this ticket did not make

**ADR-0011 is titled *Only a Leader Is Sent a Link*, and this ticket gives a
Participant one.** Raising it rather than quietly proceeding, as the working rules
require. It is not a conflict: 0011's closing section says in as many words that
*whether a Participant ever gets a surface of their own for anything else is
untouched -- this is a decision about the link and the decline*. The Intake Link asks
a Person nothing new and reveals nobody else to them, which is the distinction 0011
turns on. No new ADR, therefore, on the grounds that ADRs are not a diary; what did
need fixing was `CONTEXT.md`, whose *Avoid: a Participant's link* read as a blanket
ban. It now names the Invitation Link specifically, and `Intake Link` has a glossary
entry of its own.

**Two things the ticket did not settle and the implementation had to.** Both are
flagged here so they can be overruled cheaply.

*The link expires after fourteen days*, matching the Invitation Link. It is a bearer
credential -- whoever holds the URL sees and edits that Person's own answers -- and a
link with no end is still live in a forwarded text two years later. The cost is real
and worth naming: this is the only route by which availability changes, and it now
has a fuse on it. An expired link says *ask for a new one* rather than 404ing, and an
Admin pressing the control mints a replacement.

*One live link per Person, and asking twice gives back the same one.* Two live links
would both open the door with neither able to revoke the other. The first cut of this
replaced the link on every press, which meant an Admin who closed the tab and came
back could only recover the link by silently breaking the one they had already sent.
It is idempotent while a link stands.
