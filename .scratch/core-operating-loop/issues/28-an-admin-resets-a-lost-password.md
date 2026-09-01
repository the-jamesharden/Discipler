# 28 — An Admin resets a lost password

**What to build:** The reset the login page already promises. Ticket 24 moved the
credential to a phone number and a password, and `app/login/page.tsx` tells anybody
who has lost theirs to *"Ask whoever runs Discipler at your church to reset it"*.
Nothing in the product lets that person do it. Today a Leader who forgets their
password is locked out until somebody runs SQL, which is the state 24 shipped and
did not claim to fix.

An Admin opens a Person's row on the Roster, confirms, and Discipler generates a new
password, sets it, ends every session on that account, and shows the password on
screen once. The Admin reads it out. Discipler sends nothing.

One-time codes are the eventual answer and remain post-launch —
`docs/adr/0008-the-phone-number-is-the-sign-in-credential.md` says the number is the
credential, and a code sent to it is the recovery that follows from that. This
ticket is the smaller thing that has to exist first: a human with an Admin tier
putting a Leader back in.

**Blocked by:** 24

**Status:** shipped

## Who sets it, and how it travels

**Discipler generates the password. An Admin never types one.** An Admin who chooses
it holds a working credential in their own habits, and a pastor typing one for
everybody types the same one for everybody. Generated, the Admin holds it for the
length of the conversation and nothing longer.

**It is shown on screen and sent nowhere.** There is no admin-initiated send anywhere
in Discipler and that is a decision, not an omission —
`docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`: *the product's job is to
say who needs a call, not to become another inbox*. Texting it would also fail for
exactly the people who need it most: `outbound_message_recipient_has_given_sms_consent`
refuses any recipient without a standing SMS consent record, which is every Admin —
provisioning does not complete their Intake — and every opted-out Leader.

**The cost is named rather than designed around: the reset only works when the two
people can talk.** An Admin who cannot reach the Leader cannot reset them usefully.
That is the trade the two decisions above buy, and it is the right way round.

## What the password looks like

**Four words from a curated list, hyphenated** — `harbour-lantern-copper-fern`. It is
going to be spoken across a room or down a phone line and then typed on a phone
keyboard, which rules out anything an Admin has to spell out character by character.
Roughly 44 bits, comfortably past `SHORTEST_PASSWORD`.

The list wants about 1024 words of four to eight letters, with no homophones and no
near-twins: `flour` and `flower` in the same list is a support call.

`generatePassword` lives in `src/domain/accounts.ts` beside `SHORTEST_PASSWORD` and
takes a random source, with the wordlist as its own module. The real source is wired
in the container next to `randomIds`, and tests pass a deterministic one — the same
seam `IdSource` and `createSequentialIds()` already establish, because otherwise every
test that resets a password asserts against a random string.

## Who can be reset

**Anybody on this Admin's Roster who holds an account**, which is
`person.user_id is not null`. That is Leaders who accepted an Invitation Link and
Admins who were provisioned, and it deliberately includes another Admin: a peer with
equal power still loses their password.

**Never themselves.** An Admin resetting their own password is not a recovery — they
already have a session — and it belongs on the self-service surface, which is ticket
30. The route refuses a self-targeted POST and the affordance is not offered.

**A Ministry whose only Admin loses their password is out of scope.** There is nobody
to reset them and this ticket does not give them a path. It is what one-time codes
fix; an operator-level path before then is a separate ticket, not this one.

## The account is one thing; the reset is Ministry-scoped

`person (ministry_id, user_id)` is unique *per Ministry* and `person_user_id_idx` is
not unique, so one account can be linked to Person rows on two Rosters — and
`resolveAdmin` says out loud that a person may administer more than one Ministry. An
Admin of Riverside resetting a shared account changes the credential that person uses
at Northside too, and Northside's history records nothing.

**This is permitted, and the event is written only in the Ministry that reset it.**
Refusing anyone who holds membership elsewhere makes the commonest real case — one
person serving two campuses — permanently unrecoverable, and any refusal that explains
itself discloses the other Ministry's existence to an Admin with no business knowing
it. Writing the event into every Ministry the account belongs to is a write outside the
acting Admin's Ministry, which is precisely the isolation the schema enforces
everywhere else.

No ADR: `docs/adr/0009-one-account-per-human.md` already settled that a human holds one
login, and this is its consequence rather than a new decision.

## Every session on the account ends

A reset that leaves the old session signed in does not serve the second reason anybody
asks for one — *somebody else has it*. Sessions here are on the order of a year, so
that is not a corner case.

`docs/adr/0016-a-password-change-ends-every-session.md` records the rule and the reason
it is a rule rather than a behaviour.

**How is implementation's to find, and it must be established rather than assumed.**
supabase-js has no admin call for it: `auth.admin.signOut(jwt)` posts to `/logout` with
*the user's own* JWT, and the admin endpoints cover users, factors, passkeys and OAuth
clients and nothing else. So either GoTrue already revokes on `PUT /admin/users/{id}`
with a new password — verify it — or the sessions are deleted on the command
connection. The acceptance criterion is that the old session stops authenticating, and
an integration test asserts exactly that.

## The port

`Accounts` grows **one** method:

```
setPassword(userId, password): Promise<void>
```

It sets the password *and* ends every session on the account. One method rather than
`setPassword` plus `endSessions`, because two methods make "a password change that left
an old session alive" something a caller can write by forgetting the second call, and
that state is the one this ticket exists to prevent.

## The surface

**A Roster row action, beside the existing three**, shown only where the Person holds
an account. `RosterEntry` gains `holdsAnAccount`, which means dropping and recreating
`public.roster(uuid)` with a seventh column — the same move ticket 27 made last week.
The function is `security definer`, so it reads `person.user_id` without a grant
change: no browser session holds SELECT on every column of `person`.

A button that is always present and refuses most of the time teaches an Admin that the
product does not know its own state. The route keeps its refusal for the race, and
reaching it through the UI is not a path.

**On the Admin's own row the action is replaced by a line saying they cannot reset
their own password.** A blank where every other row has a button reads as a bug. It is
plain text and not a link, because the surface it would point at is ticket 30 and a
link that goes nowhere is what this whole ticket exists to stop being. Ticket 30 turns
it into the link.

**The reset is its own route, `/roster/reset/[personId]`.** A GET that names the Person
and warns that this signs them out, and a POST that sets the password and renders it.
Not a form on the Roster: the candidate password is minted into a hidden field at
render time (see below), and putting the form on the Roster would put a candidate
credential in the HTML of every account-holding row — a page full of would-be
passwords, which is the exact thing the intake-link design refuses.

**No phone number on this surface.** The Roster shows no contact details and a number
is reached through `public.contact_to_share` and nowhere else. A reset was asked for by
somebody already in contact — they rang, or they are standing there. A second reveal
path, on a screen reachable for any Person, would quietly widen the one disclosure the
product deliberately narrowed. An Admin holding a password and no number is a known
edge and stays one.

## Showing it once, and surviving a refresh

The password is hashed on write and cannot be read back, so post-redirect-get cannot
carry it. Both obvious answers are bad: the query string puts a live credential in
browser history and server logs — the exact thing `?intakeLinkFor=` was shaped to
avoid, carrying the Person and never the token — and a POST that renders the result
means a browser refresh silently performs a *second* reset, killing the password the
Admin has just read out.

**The GET mints the candidate password into a hidden field, and the POST sets that
value.** A refresh re-posts the same value and sets the same password: idempotent, no
storage, no query string, no client JavaScript.

The caveat is real and is accepted: a hand-crafted POST could choose the password, so
*Discipler generates it* is a property of the surface rather than a rule the server
enforces. The threat this guards against is an Admin's habits, not an Admin's malice —
and a malicious Admin can already reset anyone on their Roster and read the result.

## The order of the writes, and where the guard sits

The password is a Supabase Auth write and the event is a `history.append` through the
command boundary. They cannot be one transaction, and whichever runs second can fail.

**The password is set first, then the event, and a failed event is reported rather than
swallowed.** History claiming a credential change that never happened is the worse lie:
it is the record a Ministry would consult precisely when it is asking whether somebody's
account was touched. The same shape provisioning already uses for its one unrollbackable
step.

**Which puts the guard before the password, not in the command.** The POST re-reads the
target through the Ministry-scoped roster reader immediately before touching the
password: on this Admin's Roster, holds an account, is not the Admin themselves. The
command keeps its own refusals — an actor outside the Ministry, a target outside it —
and they become reachable only by a race, which is the shape `/roster/reinvite` already
has: *the screen the Admin clicked from was true when it rendered, and losing that race
is not an error to report.*

## What gets recorded

One command and one event.

- **Command** `person.reset_password` — `ministryId`, `personId`, `resetBy` (the
  Admin's account, as the session named it, exactly as `concern.view` takes it).
- **Event** `person.password_reset` — `subjectType: 'person'`, `subjectId` the Person,
  payload carrying who reset it. **No password material of any kind**, in the payload
  or anywhere else.

A password is not ministry content, but *somebody else changed this person's
credential* is a fact with an actor and a subject, and `concern.viewed` already
establishes that an Admin's act of access is a thing this product records. Nothing
surfaces history to anybody today; recording it costs one effect and buys the ability
to answer the question later.

This is **not** the open question about provisioning recording no history. There is a
Ministry to scope this command to, so the boundary problem that one turns on does not
arise here.

## Refusals

Two codes added to `AccountRefusal` in `src/domain/accounts.ts`:

- `account.no_account` — the Person holds none. The race behind the hidden button.
- `account.cannot_reset_yourself`

`account.password_too_short` is not reachable from this path: Discipler generates the
password and the generator cannot produce a short one. It stays for `create`.

Codes never prose. Wording lives in the surface's `copy.ts`, the way
`app/login/failures.ts` and `app/roster/copy.ts` already do it.

## Not in this ticket

- **A person changing their own password** — ticket 30, blocked by this one. Until it
  ships, a Leader lives with the four words they were given. That is the cost of the
  split and it is worth saying plainly.
- **Forcing a change at next sign-in.** It needs a flag on the account, a gate on every
  authenticated surface and an interstitial in the sign-in path — three mechanisms on
  top of the two this ticket adds. The generated password is strong enough to survive
  being known by an Admin, which is what forcing it would buy.
- **Rate limiting a reset.** There is no admin-initiated send here to limit and the
  actor is a named Admin acting on their own Roster.
- **Showing when a Person was last reset on the Roster.** The event carries it; nothing
  reads history today and this ticket does not build the first reader.
- **One-time codes**, and **the sole Admin who is locked out**.

## Acceptance criteria

- [x] An Admin can reset the password of any Person on their Roster who holds an
      account, from the Roster row, and the affordance appears only on those rows
- [x] `RosterEntry` carries `holdsAnAccount`, derived from `person.user_id`, through a
      recreated `public.roster(uuid)`
- [x] Discipler generates the password; no form anywhere takes one from an Admin
- [x] The generated password is four hyphenated words from the wordlist, and
      `generatePassword` is deterministic under an injected random source
- [x] The password is shown once on the reset surface and is never written to a query
      string, a redirect, a log or the event payload
- [x] Refreshing the result page re-posts the same candidate and leaves the same
      password set, rather than issuing a second one
- [x] Discipler sends nothing: no `outbound_message` row is written by this path
- [x] Every session on the reset account stops authenticating — asserted by an
      integration test that holds a session, resets, and finds it refused
- [x] `Accounts` exposes one method that sets the password and ends the sessions
      together
- [x] An Admin cannot reset their own password: the row shows why instead of the
      action, and a self-targeted POST is refused
- [x] An Admin cannot reset a Person on another Ministry's Roster, and the guard runs
      before the password is touched
- [x] A `person.password_reset` event is recorded in the resetting Ministry, naming the
      Admin and the Person and carrying no password material
- [x] A reset whose event fails to record surfaces the failure rather than swallowing it
- [x] Resetting an account linked to a Person in a second Ministry succeeds and writes
      history only in the Ministry that reset it
- [x] The reset surface shows no phone number
- [x] `account.no_account` and `account.cannot_reset_yourself` exist as codes, with
      wording in the surface's `copy.ts`

## Comments

### Raised by ticket 24's review, 2026-09-01

24 carried the criterion *"A lost password still requires an Admin reset; one-time
codes remain post-launch"* and ticked it. Review found the box was carried by the
login page's copy rather than by any capability. 24's own criterion now says what
shipped — no self-serve recovery — and points here for the half that did not.

### Triaged, 2026-09-01

The four questions this ticket was holding are answered above. Three things came out
of the grilling that the ticket had not thought to ask, and each changed the shape:

**There is no way to change a password anywhere in the product.** The `Accounts` port
has `create` and `discard` and nothing else, and there is no sign-out route either. So
whatever a reset produces is what that person types until the next reset — which is
what makes a generated four-word password tolerable only once ticket 30 exists, and is
why the self-change was pulled in and then split out rather than left unasked.

**Generating the password costs something that only shows up at the surface.** A
password that cannot be read back cannot survive a redirect, so *generate and show
once* forces either a credential in the URL or a POST that renders. The hidden-field
candidate is what keeps the decision and makes a refresh safe; the honest price is that
the generation rule is a property of the page rather than of the server.

**Revoking somebody else's sessions is not an API call.** supabase-js has no admin
endpoint that takes a user id and ends their sessions, which turns "the old session
stops working" from an implementation detail into something the ticket has to require
and a test has to prove.

**The scope was split.** With the self-change folded in, this ticket carried a
migration, a port method, a generator, a wordlist, a revocation mechanism, an Admin
surface, a history event *and* a second authenticated surface — one commit that could
not be reviewed as either thing, which is the reasoning ticket 24 used to split itself
off from 06. Ticket 30 is the self-change, blocked by this one, and takes the port
method and the generator as given.

### Implemented, 2026-09-01

Six things the ticket left open or left to implementation, settled here.

**GoTrue does revoke.** `PUT /admin/users/{id}` with a new password ends every session
on the account: the old access token is refused with `session_not_found` and the
refresh token is gone, both immediately. Verified against the local stack before
anything was written, so `Accounts.setPassword` is one `updateUserById` call and there
is no second half. `tests/integration/resetting-a-password.test.ts` holds a real
session, resets, and finds it refused; the HTTP suite asserts the same thing where a
Leader would notice it, on `/relationships`.

**Forty bits, not forty-four.** The ticket asked for *about 1024 words* and said
*roughly 44 bits*; four words out of 1024 is forty. 1024 was taken as the binding
number, because it is a power of two — each word is worth ten bits exactly, and the
container's rejection sampling discards nothing. The entropy is stated honestly in
`src/domain/accounts.ts`.

**`harbour` is not on the list, and the ticket's own example is why.** Its British and
American spellings differ, which is the same failure as a homophone wearing a
different hat: the Admin says one word and the Leader types the other spelling. The
rule the ticket stated beat the example it gave. The list also excludes silent-letter
traps (`knuckle`, `castle`, `column`) for the same reason, and every constraint that
can be checked mechanically is checked in `tests/domain/generating-a-password.test.ts`
— including no two words within one edit of each other, which is what catches the
`flour`/`flower` shape across all 523,776 pairs rather than by eye.

**The result screen is a route handler, and the stylesheet moved to `public/`.** A
Next page cannot read a POST body, so *a POST that renders* has to be a route handler,
and a route handler cannot be told the hashed path a bundled `import './globals.css'`
sits behind. `app/globals.css` is now `public/discipler.css`, linked by the layout and
by the reset result: one file, one URL, both renderers. It is plain CSS, so nothing
was lost in the move.

**`AccountRefusal` split rather than grew.** The two new codes are in it, as the ticket
said, but it is now `AccountCreationRefusal | PasswordResetRefusal` — because
`app/invitation/copy.ts` holds a `Record` over the whole union, and adding two codes to
it made a Leader's acceptance page word two refusals it cannot receive. That `Record`'s
exhaustiveness is the thing worth keeping.

**`SignedInAdmin` gained `personId`.** The Roster has to know which row is the Admin's
own to replace the action with the sentence, and nothing until now had to. It is read
in `resolveAdmin` through `person_read_self`, and it is nullable: `resolveAdmin`
answers for a `ministry_member` row, and a Ministry could hold an Admin membership for
somebody its Roster does not.

The one thing this ticket named and did not fix — a Ministry whose only Admin loses
their own password — is parked in `docs/open-questions.md` under *how a Ministry's only
Admin gets back in*, with the three candidate answers written out. It does not hold this
ticket open.

One thing was deliberately not deduplicated: refreshing the result page records a
second `person.password_reset`. The password is unchanged — that is what the hidden
candidate buys — but the account genuinely was touched twice, and there is nowhere to
keep a *this one has been used* mark that is not the storage this design does without.
