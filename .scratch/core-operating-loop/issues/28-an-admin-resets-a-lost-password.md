# 28 — An Admin resets a lost password

**What to build:** The reset the login page already promises. Ticket 24 moved the
credential to a phone number and a password, and `app/login/page.tsx` tells anybody
who has lost theirs to *"Ask whoever runs Discipler at your church to reset it"*.
Nothing in the product lets that person do it. Today a Leader who forgets their
password is locked out until somebody runs SQL, which is the state 24 shipped and
did not claim to fix.

One-time codes are the eventual answer and remain post-launch —
`docs/adr/0008-the-phone-number-is-the-sign-in-credential.md` says the number is the
credential, and a code sent to it is the recovery that follows from that. This
ticket is the smaller thing that has to exist first: a human with an Admin tier
putting a Leader back in.

**Blocked by:** 24

**Status:** needs-triage

## What needs deciding before this is ready for an agent

These are product questions, not implementation ones, and the ticket should not be
picked up until they are answered.

- **Who sets the new password.** An Admin typing one they then read out loud, or
  Discipler generating one and showing it once. The second is harder to get wrong and
  the first is what a pastor will expect.
- **How it reaches the person.** Read out in the room, or sent to the number on file.
  Sending it is a message a Ministry pays for and a credential in an SMS log; reading
  it out means the reset only works when the two people are together.
- **Whether a reset is a ministry event.** Every other act an Admin takes on a Person
  leaves history. A password is not ministry content, but "somebody else changed this
  person's credential" is the kind of fact a Ministry may need to be able to see.
  Related to the question in `docs/open-questions.md` about provisioning recording no
  history, but not the same one.
- **Who can be reset.** A Leader, plainly. Another Admin is a different question, and
  an Admin resetting themselves is not a recovery at all.

## Acceptance criteria

Deliberately empty until the questions above are answered. Writing them now would be
inventing the mechanism, which is the thing this ticket is waiting on a human for.

## Comments

### Raised by ticket 24's review, 2026-09-01

24 carried the criterion *"A lost password still requires an Admin reset; one-time
codes remain post-launch"* and ticked it. Review found the box was carried by the
login page's copy rather than by any capability. 24's own criterion now says what
shipped — no self-serve recovery — and points here for the half that did not.
