# 30 — A person changes their own password

**What to build:** A small `/account` surface, reachable by anyone with a session,
where a signed-in person changes their own password.

Split out of ticket 28 rather than raised on its own. 28 gives an Admin a way to reset
somebody who is locked out; without this, whatever that reset generated is what the
person types forever, because nothing in the product changes a password from the inside.

**Blocked by:** 28

**Status:** needs-triage

## Decided during ticket 28's grilling, 2026-09-01

These were settled while working out 28 and are recorded here so they are not decided
twice. They are not a specification and this ticket is not ready for an agent.

- **`/account`, reachable by anyone with a session**, linked from `/roster` and
  `/relationships`. Not under `/settings`, which is Admin-gated, and a Leader needs it.
- **It requires the current password.** Sessions here run to about a year, so *signed
  in* is a weak proof of presence: without it, a borrowed unlocked phone is a permanent
  account takeover.
- **It ends every session, including the current one**, and returns the person to
  `/login` to sign in with what they just chose —
  `docs/adr/0016-a-password-change-ends-every-session.md`.
- **It records no history.** 28's `person.password_reset` event exists to answer *did
  somebody else change this person's credential*, and a self-change is the case where
  the answer is no. Recording both under one type destroys the distinction the event was
  created to carry.
- **`account.current_password_wrong` is added to `AccountRefusal`;
  `account.password_too_short` is reused unchanged.**
- **It takes `Accounts.setPassword` as given.** 28 builds the port method, the
  generator and the session revocation, so this ticket is a form, a check and a
  refusal.

## What still needs deciding

- Whether this surface also lets a person see or change anything else, or whether it is
  a password form and nothing more.
- What 28's Roster row does once this exists: 28 renders plain text on the Admin's own
  row saying they cannot reset their own password, deliberately not a link, because
  there was nowhere to point. This ticket makes it a link.

## Acceptance criteria

Not written. The decisions above came out of another ticket's grilling and this one has
not had its own.
