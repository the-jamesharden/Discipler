# 30 — A person changes their own password

**What to build:** A small `/account` surface, reachable by anyone with a session, where a signed-in person changes their own password.
It asks for the current password and the new one twice, ends every session on the account, and returns the person to `/login` to sign in with what they just chose.

Split out of ticket 28 rather than raised on its own.
28 gives an Admin a way to reset somebody who is locked out; without this, whatever that reset generated is what the person types forever, because nothing in the product changes a password from the inside.

**Blocked by:** 28

**Status:** shipped

## The surface

**`/account` is a password form and nothing more.**
No name, no number, nothing else about the person.
A name and a number are Roster facts an Admin owns (`docs/adr/0005-a-person-is-a-name-and-a-number.md`), a name change would bear on history and safeguarding, and the number is the credential.
The route keeps the name it was given during 28's grilling, but every word a person reads says what the page does: the heading and every link to it say *Change your password*.

**It shows no phone number**, for the reason the reset surface shows none.
The current-password check takes the number from the session's own user record, never from the form.

**Reachable by anyone holding a session**, including a user who resolves to no Ministry membership at all, for instance somebody whose Person row was removed.
The credential is theirs and not the Ministry's, and a membership check would leave an orphaned account with a password it can never change.
Not under `/settings`, which is Admin-gated, and a Leader needs this.

## The form and its rules

Three fields, in this order: current password, new password, new password again.

**It requires the current password.**
Sessions here run to about a year, so *signed in* is a weak proof of presence: without it, a borrowed unlocked phone is a permanent account takeover.

**It takes the new password twice.**
The invitation form takes one field, and the difference is deliberate.
Success here ends every session, so a mistyped new password locks the person out until an Admin resets them, and for a Ministry's sole Admin there is no path at all.
The second field is the only guard the product can offer before the door closes.

**The only rule on the new password is the existing length rule.**
It need not differ from the current one: re-setting the same password is harmless and still ends every session, which is the outcome that matters.

**Form rules are checked first and together; the port is called only once the form is well-formed.**
Too short and not matching come back in field order through the existing comma-separated refusal helper, the way other forms report mistakes top to bottom.
A wrong current password therefore comes back alone.
This also means a form that was going to be refused anyway spends nothing against the sign-in rate limit.

Ordinary form POST, no client JavaScript, the way sign-in and the reset already work.
A refusal redirects back to `/account?error=<codes>`; nothing typed is carried across the round trip.

## The port

**One new method, `Accounts.changePassword(userId, currentPassword, newPassword)`**, which verifies the current password and then does exactly what `setPassword` does, sharing the revocation rather than duplicating it.
It returns `account.current_password_wrong` as a refusal.

Not a `verifyPassword` beside `setPassword`.
ADR-0016's argument for one method was that two let a caller reach a bad state by forgetting the second call.
Here, forgetting the verify would let a borrowed phone change the password unchallenged.
One method cannot be called wrong.
`docs/adr/0016-a-password-change-ends-every-session.md` is amended to say the second method is bound by the same rule.

At the platform edge the check is a password sign-in against the account's phone on a non-persisting client.
The session that check mints is ended by the update that follows it, like every other session on the account.

## Brute force

**No limiter of Discipler's own.**
A borrowed unlocked phone can guess at the current password through this form, and the exposure is exactly the one the sign-in form already has: the check goes through the same platform endpoint and sits behind the same per-IP rate limit.
Ticket 28 declined a limiter on the same grounds.
This is a decision and not an oversight, and it is recorded here so it is not re-decided.

## After success

**Every session on the account ends, including the one that made the change**, per ADR-0016.
The response clears the dead session cookie and redirects to `/login?notice=password-changed`.

**`/login` gains a notice code** beside its error codes.
A person bounced to a sign-in page with no explanation reads it as failure and tries the old password.
The code travels the way error codes already do: the page owns the wording, and nothing typed into the query string is rendered.

The surface says what will happen before the button, not after.
That is ADR-0016's consequence, stated as a requirement.

## Where it is linked from

- **`/roster`**, beside the existing navigation links, for an Admin.
- **`/relationships`**, for a Leader, who has no Roster and reaches it nowhere else.
- **The Admin's own Roster row.** 28 rendered plain text there saying they cannot reset their own password, deliberately not a link, because there was nowhere to point. It becomes the link. Every other account-holding row has an action in that place, and this is the one action that applies to the Admin's own.

**The reset page's self-targeted refusal is reworded.**
`account.cannot_reset_yourself` still says *ask another Admin of this ministry to do it for you*, which was the only advice available when 28 shipped and is now false.
It points at the new page instead, with a link.
A hand-crafted GET is exactly the reader who follows the words on the screen.

## What gets recorded

**Nothing.**
28's `person.password_reset` event exists to answer *did somebody else change this person's credential*, and a self-change is the case where the answer is no.
Recording both under one type destroys the distinction the event was created to carry.
Discipler sends nothing either.

## Refusals

Codes never prose.
Wording lives in `app/account/copy.ts`, the way `app/login/failures.ts` and `app/roster/reset/copy.ts` already do it.

- `account.current_password_wrong` - new. *That is not your current password.*
- `account.passwords_differ` - new. *The two new passwords do not match.*
- `account.password_too_short` - reused unchanged. Its existing sentence.

The login notice, under `?notice=password-changed`: *Your password has changed. Sign in with the new one.*

The warning on the form, before the button: *Changing your password signs you out everywhere, including here. You will sign in again with the new one.*

## Not in this ticket

- **Editing anything but the password.** See *The surface*.
- **A limiter of Discipler's own.** See *Brute force*.
- **A sign-out route.** Ending sessions here is a consequence of changing the password, not a feature of its own.
- **The sole Admin who is locked out.** They cannot get the session this surface requires. Parked in `docs/open-questions.md`.
- **One-time codes**, which remain post-launch.

## Acceptance criteria

- [x] `/account` renders a form with current password, new password and new password again, and nothing else about the person; no phone number appears on it
- [x] The form warns, before the button, that success signs the person out everywhere including here
- [x] `Accounts` exposes `changePassword(userId, currentPassword, newPassword)`, which refuses `account.current_password_wrong` and otherwise sets the password and ends every session, sharing the revocation with `setPassword`
- [x] A successful change ends every session on the account, including the one that made it - asserted by an integration test that holds two sessions, changes the password from one, and finds both refused
- [x] After success the old password is refused at sign-in and the new one works
- [x] After success the response clears the session cookie and redirects to `/login?notice=password-changed`, and `/login` renders the notice sentence for that code and nothing for an unrecognised one
- [x] A wrong current password is refused with `account.current_password_wrong`, leaves the old password working and every session alive, and is reported alone
- [x] A new password that is too short, or two that differ, is refused before the port is called, and both codes come back together in field order
- [x] The current password is checked against the phone on the session's user record; the form carries no number
- [x] No history event is written by this path, and no `outbound_message` row
- [x] A session with no Ministry membership can reach `/account` and change its password
- [x] A visitor with no session is redirected to `/login`
- [x] `/roster` and `/relationships` link to `/account` with the words *Change your password*
- [x] The Admin's own Roster row links to `/account` where 28 rendered plain text
- [x] `account.cannot_reset_yourself` is reworded to point at `/account`, with a link
- [x] `account.current_password_wrong` and `account.passwords_differ` exist as codes, worded in `app/account/copy.ts`; `account.password_too_short` is reused unchanged
- [x] `docs/adr/0016-a-password-change-ends-every-session.md` names `changePassword` as bound by the same rule

## Comments

### Decided during ticket 28's grilling, 2026-09-01

These were settled while working out 28 and were recorded here so they were not decided twice: the route and its reach, the current-password requirement, that every session ends including the current one, that no history is recorded, the two refusal codes, and that the port method and generator from 28 are taken as given.
All of them stand and are folded into the sections above.

### Grilled, 2026-09-01

Two rounds.
The first settled that the page is a password form only, that the new password is taken twice, that the only rule on it is length, that the port gains one method rather than a verify beside a set, that there is no limiter of Discipler's own, that `/login` gains a notice code, where the links go, and that anyone with a session may reach it.
The second settled the naming, the rewording of 28's self-targeted refusal, the order in which refusals are checked and reported, and the copy.
Every recommendation was accepted as put.

### Implemented, 2026-09-01

Built as specified, at three seams, each test-first.

**The form's rules live in the domain.**
`passwordChangeRefusals(newPassword, newPasswordAgain)` in `src/domain/accounts.ts` returns the codes in field order, and `app/account/change/route.ts` calls it before anything else, so too short and not matching arrive together and a wrong current password arrives alone.
The port is asked only once that list is empty.

**The port gained one method and the adapter shares the revocation.**
`Accounts.changePassword` reads the account's phone through the admin API, checks the current password with a sign-in on a client that keeps nothing, and then calls the same module-level `setPassword` the reset uses, so the two paths cannot drift.
Only `invalid_credentials` is a refusal; a rate limit or an outage is thrown, because reporting either as *that is not your current password* would send somebody off to retype a correct one.
The adapter also refuses too short at its own edge, as `create` already does, so a caller that forgets the form rule cannot set what the invitation form would have refused.

**The session's identity is read without a membership.**
`src/platform/supabase/current-user.ts` answers *is there a session and whose is it* and nothing else, which is what lets an account no Person holds reach the page.
After the change the route signs the dead session out locally so the response clears the cookie, then redirects to `/login?notice=password-changed`.

**Names decided here, none of them in the ticket.**
The POST goes to `/account/change`; the fields are `currentPassword`, `newPassword` and `newPasswordAgain`; the button says *Change the password*, the way 28's says *Reset the password*.
The too-short sentence is now exported from `app/invitation/copy.ts` and imported, rather than copied, so it stays one sentence.
The reworded self-reset refusal reads *You cannot reset your own password from here. Change it yourself instead.* and the reset screen follows it with the link.

**One thing fixed along the way.**
`app/login/failures.ts` indexed its record with a bare lookup, so `?error=__proto__` handed the page an object to render.
It now goes through the same `Object.hasOwn` check every other surface uses, and the new HTTP suite holds both the error and the notice code against that.

**A glossary entry** for *Password Change* was added to `CONTEXT.md`, and *Password Reset*'s avoid-note no longer says nothing is self-serve.

### Review, 2026-09-01

Two reviewers, standards and spec, and no hard violations on either axis.
Three things were fixed and two raised were kept.

**The route now asks who is signed in the way the page does**, through `currentUser`, rather than reading the session itself.
**A comment on the sign-out was wrong** and said the platform was not called; supabase-js does post the dead token to `/logout` first, is refused, and clears the cookie on the strength of that refusal, which is what the route wants from it.
**A cookie held by a variable named `phone`** sat beside phone numbers in the same test and was renamed.

Kept, with the reason.
The adapter refuses a too-short password at its own edge, which the ticket did not ask of the port; it mirrors `create`, costs one line, and means a caller that forgets the form rule cannot set what the invitation form would refuse.
And the current-password check's independence from the form is now held by a test that posts another account's number and password and is refused, rather than only by the page showing no number.
