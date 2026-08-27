# 18 — The dual-role Person: account link and lead eligibility

**What to build:** One Person row per human per Ministry, with an optional link to their login, and an explicit flag saying whether an Admin considers them suitable to lead. These are the two facts that let the same human lead two relationships and be discipled in a third without the model tying itself in knots.

A Person is the human. An account is optional and belongs to the Person, not beside them: `person.user_id` references `auth.users`, is nullable, and is unique within a Ministry where set. Every Leader who signs in has a Person row in that Ministry — one without is an error, not a supported state — and the account is created and linked in the same act, during Acceptance.

`ministry_member.tier` is untouched by this ticket and stays what it is: an access level, `admin` or `leader`, and nothing about who leads a relationship. Because `unique (ministry_id, user_id)` allows a person only one tier, an Admin who leads holds a single row saying `admin`. Anything that gates a Leader-facing surface on `tier = 'leader'` will hide that Admin's own relationships from them.

`eligible_to_lead` is set by an Admin. It is the same field as the intended role in ticket 16 — a plan that becomes eligibility, never two facts to keep in step. It is independent of whether the Person has an account, independent of whether they have completed Intake, and independent of how many relationships they already lead.

Nothing here stores a role. Role lives on relationship membership, and Participation Status is derived.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] `person.user_id` is nullable, references `auth.users`, and is unique per Ministry where set
- [ ] A Person may exist with no account, and an account may not exist without a Person in that Ministry
- [ ] `eligible_to_lead` is a Person-level flag, defaulting to false, settable by an Admin
- [x] Eligibility is independent of account, of Intake, and of relationships currently led
- [x] No role is stored on the Person, and `ministry_member.tier` is unchanged
- [x] A fixture builds the canonical dual-role case: an Admin who leads two relationships and is a Participant in a third

## Comments

### Partially implemented — schema landed with ticket 19

The schema half landed early, in ticket 19's migration, because leader-scoped
row-level security cannot be expressed without `person.user_id` and cannot be tested
without the fixture. `eligible_to_lead` exists as a column with its comment; the Admin
control that sets it is ticket 16's, and the box stays unchecked until that ships.

"An account may not exist without a Person in that Ministry" is a flow rule rather
than a constraint -- nothing in the database can see that an `auth.users` row was
created for a Ministry -- so it is ticket 06's to hold, at the point of Acceptance.
