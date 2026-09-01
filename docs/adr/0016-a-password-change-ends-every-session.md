# A Password Change Ends Every Session

## Status

accepted

## Decision

**Setting a password on an account ends every session that account holds.** There is one
port method — `Accounts.setPassword` — and ending the sessions is part of what it does,
not a second call beside it.

This binds every path that will ever set a password: an Admin's reset (ticket 28), a
person changing their own (ticket 30), and anything that follows them.

## Context

Ticket 24 moved the credential to a phone number and a password and shipped no way to
change one. Ticket 28 adds the first: an Admin resets a Leader who is locked out.

Two things are asked for when somebody asks for a reset, and only one of them is *I have
forgotten it*. The other is *somebody else has it* — a shared handset, a borrowed
laptop, a password read out in a room and remembered. A reset that leaves existing
sessions alive answers the first and does nothing at all about the second.

That would be a small gap if sessions were short. They are not:
`docs/leader-dashboard.md` puts them *on the order of a year*, and there is no sign-out
route anywhere in the product. A session that survives a password change survives it for
months.

The reason this is a decision and not simply a behaviour is that the platform does not
do it for you and does not obviously offer it. supabase-js exposes no admin call that
takes a user id and ends that user's sessions: `auth.admin.signOut(jwt)` posts to
`/logout` carrying *the user's own* access token, which an Admin performing a reset does
not have. So whichever way it is implemented, it is work somebody has to choose to do —
and therefore work somebody can quietly decide to skip, or drop during a refactor,
unless the rule is written down.

## Considered options

**Revoke on an Admin's reset only.** Rejected. It makes the guarantee depend on which
door the password came through, and the self-service door is the one a person walks
through *because* they think somebody else has their password.

**Keep the current session on a self-change and end the others.** Rejected, though it is
the more polite behaviour and is what most products do. It requires digging the
`session_id` claim out of the caller's JWT and excluding it, which makes "ends every
session" conditional — and a conditional rule is one somebody has to reason about at
each call site. Signing yourself out immediately after choosing a new password, and
signing back in with it, is a defensible thing for a product to do. Leaving a stolen
session alive is not.

**Two port methods, `setPassword` and `endSessions`.** Rejected. It makes *a password
change that left an old session alive* a state a caller can reach by forgetting the
second call, which is exactly the state this decision exists to prevent. One method
cannot be called wrong.

## Consequences

An Admin who resets a Leader mid-session interrupts them. That is intended: an Admin is
being asked to reset a password precisely when something is wrong with it, and a Leader
who was working will sign back in with the four words they were just read.

A person changing their own password lands back on `/login`. The surface has to say so
before they submit rather than after.

**The mechanism is not settled here and is deliberately left open.** GoTrue may already
revoke sessions on an admin password update; if it does, the rule is satisfied by the
update itself. If it does not, the sessions are deleted on the command connection. What
this ADR fixes is the outcome, and an integration test that holds a session, changes the
password, and finds the session refused is what holds it — not any particular call.

This does not touch the Invitation Link, which authenticates by possession of a phone
rather than by session, and which
`docs/adr/0012-re-issuing-a-link-replaces-it.md` already governs.
