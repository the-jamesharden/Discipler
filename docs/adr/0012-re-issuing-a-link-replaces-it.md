# Re-issuing an Invitation Link Replaces It

## Status

accepted

## Decision

**Every re-issue of an Invitation Link mints a new token over the old one**, whether or
not the old one had expired. The superseded link opens nothing.

Re-issuing is therefore also the product's only revocation of an Invitation Link. There
is no separate revoke.

## Context

Ticket 06 shipped `invitation.reissue` so that an admin could answer the condition the
tick escalates — a leader who has not accepted and whose link has run out. It re-sent a
link that was still live rather than minting a second one, by analogy with
`intake.reopen`: the commonest reason an admin is asked is a leader who lost the text,
and minting there would stop the message already on their phone from working.

That analogy is sound for the case it was drawn from and wrong for the case that
matters most here, because the two links do not authenticate the same way. An Intake
link is handed to an admin to pass on. An Invitation Link is texted to one number and
**possession of that number is the whole of the authentication** — ticket 06 says so
outright, and it is why the admin is never shown the token.

Which makes a wrong number the highest-stakes condition the flow has, and ticket 06
names it as such: *a wrong number sends that leader's check-ins to a stranger
indefinitely*. The affordance for it, `invitation.dispute_number`, raises a Follow-Up
Item and — by design, so that a forwarded link can never re-point an account — changes
nothing else. So a live credential sat on a stranger's phone for the remainder of its
seven-to-fourteen days, the product recorded that this had happened, and nothing
anywhere could take it back. The one command that touches invitations refused to
replace a live one.

## Consequences

A leader who lost the text and finds an older message on their phone will find it dead.
That is the trade this accepts. It is recoverable by a sentence from an admin — *use
the newest one* — where the case it buys back is not recoverable at all.

`invitation.reissued` no longer writes `replacedTheLink` to its payload; every
re-issue is a replacement, so the flag could only say `true`. Rows written before this
keep it, and a `false` there is the record of a link that was re-sent rather than
replaced. This repository does not overwrite past facts.

The history event still carries both ends of the window it superseded, and still never
the token.

**What this does not decide.** Whether an admin should be able to revoke a link
*without* sending a replacement — a leader whose number is disputed arguably wants the
old link dead and no new text going anywhere — is untouched. Today the two acts are one,
and `invitation.dispute_number` still changes nothing on its own.
