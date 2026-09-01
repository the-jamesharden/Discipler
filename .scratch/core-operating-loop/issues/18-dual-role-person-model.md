# 18 — The dual-role Person: account link and lead eligibility

**What to build:** One Person row per human per Ministry, with an optional link to their login, and an explicit flag saying whether an Admin considers them suitable to lead. These are the two facts that let the same human lead two relationships and be discipled in a third without the model tying itself in knots.

A Person is the human. An account is optional and belongs to the Person, not beside them: `person.user_id` references `auth.users`, is nullable, and is unique within a Ministry where set. Every Leader who signs in has a Person row in that Ministry — one without is an error, not a supported state — and the account is created and linked in the same act, during Acceptance.

`ministry_member.tier` is untouched by this ticket and stays what it is: an access level, `admin` or `leader`, and nothing about who leads a relationship. Because `unique (ministry_id, user_id)` allows a person only one tier, an Admin who leads holds a single row saying `admin`. Anything that gates a Leader-facing surface on `tier = 'leader'` will hide that Admin's own relationships from them.

`eligible_to_lead` is set by an Admin. It is the same field as the intended role in ticket 16 — a plan that becomes eligibility, never two facts to keep in step. It is independent of whether the Person has an account, independent of whether they have completed Intake, and independent of how many relationships they already lead.

Nothing here stores a role. Role lives on relationship membership, and Participation Status is derived.

**Blocked by:** 02, 24

**Status:** shipped

- [x] `person.user_id` is nullable, references `auth.users`, and is unique per Ministry where set
- [x] A Person may exist with no account, and an account may not exist without a Person in that Ministry — the second half closed with ticket 24: provisioning gives an Admin a Person row, which was the one path that broke it
- [x] `eligible_to_lead` is a Person-level flag, defaulting to false, settable by an Admin
- [x] Eligibility is independent of account, of Intake, and of relationships currently led
- [x] No role is stored on the Person, and `ministry_member.tier` is unchanged
- [x] A fixture builds the canonical dual-role case: an Admin who leads two relationships and is a Participant in a third
- [x] One human holds one `auth.users` row: an Admin who accepts an Invitation Link gains no second account and no second `ministry_member` row — ticket 24
- [x] The dual-role case is built through the product's own flows, not by hand-linking `person.user_id` through the service role — ticket 24

## Comments

### Partially implemented — schema landed with ticket 19

The schema half landed early, in ticket 19's migration, because leader-scoped
row-level security cannot be expressed without `person.user_id` and cannot be tested
without the fixture. `eligible_to_lead` exists as a column with its comment; the Admin
control that sets it is ticket 16's, and the box stays unchecked until that ships.

"An account may not exist without a Person in that Ministry" is a flow rule rather
than a constraint -- nothing in the database can see that an `auth.users` row was
created for a Ministry -- so it is ticket 06's to hold, at the point of Acceptance.

### The account invariant, and why the fixture hides it

`docs/adr/0009-one-account-per-human.md` makes explicit what line 7 above only implies:
a human holds one login, Admin access is derived from `ministry_member`, leading is
derived from `relationship_member`, and no derivation may imply a second account.

The product does not hold that invariant today. An Admin's Person row is never linked to
their login — the row comes from import or Intake with a name and a phone, the login was
provisioned against an email — so acceptance sees a null `person.user_id`, mints a second
account, and the `on conflict (ministry_id, user_id)` guard misses because the user_id is
new. The Admin ends up with two logins.

The suite does not catch it. `addPersonForAdmin` sets `person.user_id` through the service
role, which is a path no product flow has, so the canonical dual-role case is asserted
against a state the product cannot reach. Ticket 24 owns the fix, because the fix is to
how an Admin comes into existence; the fixture is replaced there too.

### Verified 2026-08-31 — nothing left here that ticket 24 does not own

Picked up for implementation and found to have no implementable remainder of its own.
Read against the code rather than against the checkboxes, which had drifted in both
directions. What was actually found, so the next person does not repeat the search:

**`eligible_to_lead` shipped with ticket 16, and the box was simply never ticked.**
The column and its comment are in `20260826000100_relationships_roles_and_leader_access.sql:23-37`,
defaulting false. It is set by `person.set_lead_eligibility` through the command
service, recorded as a `person.lead_eligibility_set` history event either way round,
and reached by an Admin from the control on every Roster row
(`app/roster/page.tsx:203-215`). `tests/integration/eligible-to-lead.test.ts` covers the
default, both directions, the pair of events in order, and all three independences —
account, Intake, relationships already led — which is why the criterion below it was
already ticked while this one was not.

**Nothing gates a Leader-facing surface on `tier = 'leader'`.** The warning in line 7
is honoured everywhere it could have been broken: `src/platform/supabase/leader-dashboard.ts:262-269`
asks for open leader memberships, and the RLS predicate `app.leads_relationship` does
the same. Every site that reads `tier` reads it where access is the question and
nowhere else: `20260826000100_relationships_roles_and_leader_access.sql:180`,
`src/platform/supabase/current-admin.ts:39`, and the insert guard at
`20260829000100_the_invitation_link.sql:213` that lets the command role make a
`leader` row and no other.

**"An account may not exist without a Person" already holds on every path but one.**
The Leader path cannot break it: acceptance is reached through an invitation that
carries `person_id`, and `acceptInvitation` links the account to that existing row
(`src/platform/supabase/effect-store.ts:891`). Acceptance also already does the half
of `docs/adr/0009-one-account-per-human.md` that the ADR credits it with — it reuses
`person.user_id` where it is set and mints only where it is null
(`app/invitation/[token]/accept/route.ts:46-54`). The single path that breaks the rule
is Admin provisioning, which mints against an email and creates no Person row at all.

So both open criteria reduce to one missing fact — the link between an Admin's login
and their Person row — and ADR-0009 and ticket 24's own acceptance criteria both place
it there, because it can only be made where an Admin comes into existence. Carving it
out to close this ticket early would have split the provisioning rewrite across two
commits and made neither reviewable as a whole. `Blocked by` above now lists 24 as
well as 02 -- the two open criteria are 24's, and nothing else here is waiting on
anything -- so a frontier scan passes over this ticket rather than walking the same
search again.

The canonical dual-role fixture the ticket asks for does exist and is honest about its
one flaw: `tests/integration/leader-access.test.ts:61-88` builds Greaves leading two
relationships and being discipled in a third, via `addPersonForAdmin`, which is the
service-role hand-link the last criterion is waiting to be rid of.

### Closed by ticket 24, 2026-08-31

`addPersonForAdmin` is gone. The dual-role human in all four suites that had one is
now the Ministry's own Admin, whose Person row and `person.user_id` link
`provisionMinistry` created — so the invariant this ticket states is asserted against
a state the product produces rather than one a fixture reached in through the service
role.

The account invariant is proved through the flow it was always about:
`invitation-over-http.test.ts` pairs the Admin, has them accept their own Invitation
Link, and checks there is still one `auth.users` row for their number, one
`ministry_member` row still saying `admin`, and that the password provisioning gave
them still signs them in.
