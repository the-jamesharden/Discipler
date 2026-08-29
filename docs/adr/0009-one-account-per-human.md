# One Account per Human

## Status

accepted

## Decision

**A human holds one `auth.users` row, and their roles are derived from what they are part
of, never from a second login.** An Admin who also disciples somebody signs in once, with
one credential, and reaches both the Admin surface and their own relationships from that
account.

Concretely:

- `person.user_id` is the only link between a login and a human, and it is set once.
- Admin access is derived from `ministry_member.tier = 'admin'`.
- Leading is derived from holding an open `relationship_member` row with `role = 'leader'`.
- Neither derivation may create, require, or imply a second account.
- **Acceptance never mints an account for a human who already has one.** Where the Person
  is already linked to a login, acceptance reuses it and creates nothing.

## Context

Acceptance mints a phone identity whenever `person.user_id` is null, then inserts a
`ministry_member` row `on conflict (ministry_id, user_id) do nothing`.

For an Admin who leads, `user_id` is always null — their Person row comes from CSV import
or Intake, carrying a name and a phone, while their login was provisioned separately
against an email. Nothing has ever connected the two. So the conflict target misses, and
an Admin who accepts an Invitation Link ends up with a second `auth.users` row, a second
`ministry_member` row saying `leader`, and two passwords for one human.

Ticket 18 already states the invariant — *an Admin who leads holds a single
`ministry_member` row saying `admin`* — and the dual-role suite appears to prove it. It
does not. The fixture hand-links `person.user_id` through the service role
(`addPersonForAdmin`), which is a path no product flow has. The invariant was asserted
against a state the product cannot reach.

The dual-role human is not an edge case in this product. A ministry's Admin is very often
its most active discipler, and a product that makes them log out and back in to see their
own mentees has misunderstood who it is for.

## The link, and where it is made

The whole difficulty is that nothing identifies an Admin's login as belonging to their
Person row. `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md` already removes
the cause: it decides the credential is a phone number for every user, and says in as many
words that *Admin account provisioning changes with it*.

**The link is made when the Admin is provisioned, not when they accept.** An Admin comes
into existence with a Person row in their Ministry and `person.user_id` set, exactly as a
Leader does at Acceptance. Acceptance then finds the link already there and reuses it,
which is the behaviour it already has for a Leader accepting a second relationship.

## Considered options

**Consult the session at acceptance.** If whoever opens the link is signed in, reuse their
account. Rejected, and not narrowly: acceptance is deliberately sessionless, and possession
of the phone the link was texted to is the whole of the authentication. On a shared laptop
with an Admin still signed in, this would bind a Leader's relationship to the Admin's
account — a worse failure than the one it fixes, and a safeguarding one.

**Match by phone at acceptance.** Look up an existing `auth.users` row by the Person's
phone before minting. This is right, and it is what ADR-0008's world gives for free — but
it is not sufficient on its own, because today's Admins have no phone identity to match.
It becomes the mechanism once provisioning changes; it is not an alternative to changing
provisioning.

**Allow the second account and merge later.** Rejected. Two logins for one human is
visible to that human immediately, and merging accounts is strictly harder than not
splitting them.

## Consequences

- Ticket 24 owns the fix, because the fix is a change to how an Admin comes into
  existence. It gains an acceptance criterion for the link.
- Ticket 18's invariant becomes testable through a real flow rather than a fixture.
- `addPersonForAdmin` in `tests/support/local-supabase.ts` must be replaced by the real
  provisioning path. Until it is, the dual-role suite is asserting against a state the
  product cannot produce, and that is a known gap, recorded on ticket 18.
- Anything that gates a Leader-facing surface on `tier = 'leader'` is a bug, since the
  dual-role human's row says `admin`. Ticket 18 already says this; this ADR is why it
  cannot be relaxed.
