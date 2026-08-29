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

**Status:** ready-for-agent

- [ ] One sign-in form, taking a phone number and a password, for Admins and Leaders alike
- [ ] `app/login` and `app/auth/sign-in` no longer accept an email address
- [ ] Admin provisioning creates a phone identity, and no account is created against an email
- [ ] Every test fixture that signs somebody in does so by phone number
- [ ] A Leader who accepted an Invitation Link can sign back in with the number that flow displayed
- [ ] A lost password still requires an Admin reset; one-time codes remain post-launch

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
