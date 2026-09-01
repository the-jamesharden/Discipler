# 24 — Phone and Password Sign-In

**What to build:** Replace email sign-in with phone number and password, on one
form, for every user including Admins. `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`
decides this; ticket 06 shipped half of it and this is the other half.

What ticket 06 already did: a Leader accepting an Invitation Link gets a Supabase
phone identity with a password, and no email is collected anywhere in that flow.
What it did not do: `app/login` and `app/auth/sign-in` still take an email and a
password, and Admin provisioning still mints an email address. So a Leader who
accepts today holds a working account and there is no form that will take their
number.

This is deliberately its own ticket rather than the tail of 06. It supersedes what
ticket 01 shipped, it changes how an Admin comes into existence, and it rewrites
every test fixture that signs somebody in — `createMinistryWithAdmin`,
`addPersonWithAccount`, `signInAs`, `signInWith`, and the `admin-signs-in` suite.
That is a verifiable outcome of its own, and bundling it into the invitation flow
would have made one commit that could not be reviewed as either thing.

Email remains an optional contact detail on the Person record. It is not a
credential and nothing signs in with it.

**Blocked by:** 06

**Status:** shipped

- [x] One sign-in form, taking a phone number and a password, for Admins and Leaders alike
- [x] `app/login` and `app/auth/sign-in` no longer accept an email address
- [x] Admin provisioning creates a phone identity, and no account is created against an email
- [x] Admin provisioning creates the Admin's Person row and links `person.user_id` to it, so the Admin is a Person like everybody else
- [x] An Admin who accepts an Invitation Link reuses their existing account: no second `auth.users` row, no second `ministry_member` row, no second password
- [x] From one signed-in account, an Admin who leads reaches both the Admin surface and their own relationships
- [x] `addPersonForAdmin` is gone, and the dual-role case is built through the real provisioning flow
- [x] Every test fixture that signs somebody in does so by phone number
- [x] A Leader who accepted an Invitation Link can sign back in with the number that flow displayed
- [x] A lost password still requires an Admin reset; one-time codes remain post-launch

## Comments

### Why this is not a rename

The sign-in failure codes are the visible part. `app/login/failures.ts` names
`missing-credentials` and `no-such-account`, and both survive — but a phone
number that is not on any Person record is a different condition from a password
that does not match, and today only one of them is reachable. Worth deciding
whether they stay two codes or become three before the form changes.

The harder part is provisioning. `createMinistryWithAdmin` mints an email today
because that is what Supabase Auth needed; a phone identity needs a number that is
routable in the local stack's test environment, and the fixtures have to agree on
where those numbers come from without colliding across runs. Ticket 06's
integration suites hit exactly that and solved it locally; this ticket should
solve it once, in `tests/support/local-supabase.ts`.

### This ticket also carries the account invariant

`docs/adr/0009-one-account-per-human.md` decides that a human holds one login and that
their roles are derived from what they are part of. The reason it lands here rather than
on ticket 18 is that the missing piece is the link between an Admin's login and their
Person row, and that link can only be made where the Admin comes into existence — which
this ticket already rewrites.

Ticket 06's acceptance flow needs no change beyond what it already does: it reuses
`person.user_id` when it is set. Setting it for an Admin is what is missing, and once
provisioning does that, acceptance is already correct.

### What shipped, 2026-08-31

**The form half was already done and the ticket did not know it.** `app/login`,
`app/auth/sign-in` and `tests/support/app.ts` came over to the phone with ticket 06's
sweep (`610ca29`), including the third failure code the comment above asked to be
decided: `unreadable-phone` sits beside `missing-credentials` and `no-such-account`,
separating a number Discipler could not read from a password that did not match. It
is worth keeping separate -- folding it into "that did not match" has somebody
retyping a correct password against a number that was never going to be looked up.

**Provisioning is product code now, in `src/platform/supabase/provisioning.ts`.**
There was no product path at all: `createMinistryWithAdmin` in `tests/support` was
the only implementation, and `scripts/seed-demo.ts` imported a test fixture to make
a Ministry. `provisionMinistry` mints the Admin's account through the same adapter
Acceptance uses, gives them a Person row in their own Ministry, links
`person.user_id`, and enrols them at `admin`. The fixture and the seed script both
run it, so every suite in the repo is now built on a state the product can reach.

**The account port stopped being a Leader's.** `LeaderAccounts` is `Accounts`, and
`src/platform/supabase/leader-accounts.ts` is `accounts.ts`. Two things mint now, and
"a phone identity with a password and no email" is decided in one of them rather than
written twice.

**Order matters more than it looks.** The first draft created the Ministry and then
minted the account, so a number that already signed somebody in left a Ministry
nobody could sign in to. The account is minted first; everything after it is undone
on failure, Ministry first so the cascade frees the Person row that would otherwise
make `discard` refuse.

**The Admin is on the Roster, and four suites had to say so.** That is the visible
consequence of the link and not a side effect to be worked around:
`admin-signs-in` no longer expects an empty Roster on the first day, and
`ministry-isolation` names each Admin among their own people. `relationship-membership`
and `participation-status` complete the Admin's Intake before pairing them, because
leading requires Intake of an Admin exactly as of anybody else -- provisioning does
not complete it, since Intake is the Person's own act and carries their consent.

**Test numbers have one source.** `aTestPhoneNumber` is exported from
`local-supabase.ts` and three suites that rolled their own now use it. The block is
picked at random per process rather than derived from the clock: `auth.users` keeps a
number for the life of the local stack, so a clock-derived number starts being
refused as taken the second time the suite runs against the same database.

**What is not here.** No password reset and no sign-out route, which is what the
login page already tells a Leader: recovery is an Admin reset until one-time codes
ship, and both remain post-launch.

### What the review changed, and the one thing it surfaced

**Provisioning reads a number the way everything else does.** It took whatever it
was handed straight to both the mint and the Person row, so an operator typing
`(555) 123-4567` would have had the account normalised one way and the record
written the other -- of a number that is load-bearing three separate times, which is
exactly what ADR-0008's closing paragraph warns about. It runs through
`asPhoneNumber` once now and both writes use the result, and the fixture reports the
number as provisioning stored it rather than as it typed it, so the two cannot agree
by accident.

**The compensation was deleted rather than documented.** Its comment claimed a
part-way failure "is undone rather than left to be reconciled later", which it could
not deliver: the delete underneath returned an error rather than throwing, the
discard after it then failed because a Person still held the account, and a bare
`catch` swallowed both.

Writing an honest comment about it was the wrong fix. The three rows go in one
transaction now, on the connection the command boundary already uses -- and
deliberately *without* `set local role discipler_command`, because that role holds
`select` on `ministry` and `ministry_member` and nothing more. No command has ever
needed to create a Ministry, and this is the one write that comes before there is a
Ministry to scope a command to, so it is the one write that cannot be one.

Postgres takes the rows back for nothing, which leaves exactly one thing that can be
half-done: the account, which no database can roll back. That is a single `discard`,
the same compensation the acceptance route makes, and the only case that still needs
a human -- a discard that itself fails -- is named in the error rather than
swallowed, because the retry an operator reaches for next is the thing it breaks.

`tests/integration/provisioning-a-ministry.test.ts` covers it with a failure *inside*
the transaction, which the refusals around it never reach: a blank name passes the
type checker and fails `person`'s check constraint, so the Ministry is already
inserted when the second statement gives way. It asserts the Ministry is gone and
that provisioning the same number again succeeds. Verified by breaking the rollback
and watching it fail.

**The credential side effect has a name.** `localSupabase()` was reshaping
`process.env` from inside a getter. `publishSupabaseCredentials()` does it out loud,
and `createMinistryWithAdmin` calls it -- which is how every suite that touches a
product adapter gets it, since they all ask for a Ministry first.

**`adminAsPerson` carries the dual-role human.** Four suites had grown the same two
lines reaching into the fixture for `adminPersonId` and `adminUserId`. It hands back
a full `AccountFixture`, so `signInWith` and `signInAs` take it like any other
account. Intake stays out of it deliberately: it is the Person's own act and carries
their consent, so a suite that needs the Admin pairable completes it itself.

**Surfaced rather than answered: provisioning records no history.** Every other
Person reaches a Roster through the command boundary and leaves an event behind; the
Admin is the one Person whose arrival is not written down, and the Ministry's own
opening is not either. That is not a slip to patch quietly -- history is scoped to a
Ministry, and there is no Ministry to scope a command to until the row exists, so it
is a real question about where the boundary starts. It is written up in
`docs/open-questions.md` under *whether provisioning a Ministry is itself a ministry
event*, and the module says in as many words that it is not answering it.
