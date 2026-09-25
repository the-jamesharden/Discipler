# A Disciple Is Sent a Link to Their Material

## Status

accepted

Amends ADR-0011, *Only a Leader Is Sent a Link*, which stays true of Invitation Links.

## Decision

**When a Disciple's Material changes, the text that tells them carries a link to a read-only page of it, with no sign-in.**
James chose this on 2026-09-24 over a link the Leader forwards and over Disciple accounts.

One link per Participant membership, minted the first time a text carries it and never re-minted, so every text a Disciple has had opens the Material running now.
It asks nothing and changes nothing: the Ministry's name, the Material's title, its text and its files and links.
It names nobody and shows no number (James, 2026-09-24, Q4), because a link can be forwarded and a forwarded link shows whatever is on it.
It opens nothing once the membership closes or the relationship ends; that is decided each time it is read, not by revoking anything.
A file downloads through a route that checks the link again and hands back a storage link lasting minutes.

## Context

ADR-0011 settled that a Participant is sent no link and has no page, because a link asks somebody a question and a Participant had already answered theirs at Intake.
That reasoning is about links that ask; this one does not ask anything.
What changed is the need: Planning Center's Resources reach a group's members, and James wanted Disciples to see their Material without their Leader passing everything on by hand.

The ADR-0012 reasoning about Invitation Links -- that a live credential on a stranger's phone is the worst case, so re-issuing replaces the link -- weighs differently here.
This link authenticates nothing and discloses no person, so a link on the wrong phone shows somebody a study guide.
Re-minting it on every text would break every earlier text for no gain, so it is minted once.

## Consequences

- A Participant now has one page of their own. It is read-only, and a Disciple still has no account and no dashboard.
- The Participant reveal branch of `app/invitation/[token]/page.tsx`, which `docs/open-questions.md` notes is unreachable, is not revived by this: the Material page is a page of its own.
- The file route signs with the service role, because a Disciple has no session for a storage policy to read; the route is what decides, from the token and the Material running now, and it signs one object for minutes.
