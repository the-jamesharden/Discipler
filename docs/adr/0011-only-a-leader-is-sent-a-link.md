# Only a Leader Is Sent a Link

## Status

accepted

## Decision

**An Invitation Link is minted for a Leader and for nobody else.** A Participant is sent
no link, holds no link, and has no page of their own to arrive at.

**A Participant does not decline a match.** The decline route, the `match.decline`
command and the `match_declined` Follow-Up Item are withdrawn. What a Participant may ask
for is a **swap**, over the same inbound route every other keyword arrives on.

The `match_declined` value stays in the `follow_up_kind` enum. History that already
carries it has to read back, and this repository does not overwrite past facts.

## Context

A link asks somebody a question. That is what it is for: it carries a token, it opens a
page, and the page asks the person holding it to decide something. Leader Acceptance is
exactly such a question — the relationship does not activate until a Leader answers it —
and ticket 06 built the link around that.

The Participant's link was minted alongside it, on the reasoning that a Participant
should have a way to say the match is not right without having a conversation about it.
Ticket 06 recorded that as settled and gave it a destination: a `match_declined`
Follow-Up Item, because a decline that reaches nobody is not a feature.

Ticket 12 put the question back on the table by accident. Its copy ruling took the
Participant's decline link out of the acceptance message — the message was the only place
that link was ever sent — which left a minted link, a live route and a Follow-Up Item
reachable only by somebody who had been handed a URL that nothing hands out. That is not
a half-built feature; it is a mechanism with no way in.

Asked directly, the product owner settled the underlying question rather than the copy:

A Participant has already answered. They consented to be paired at Intake, which is the
whole of what Discipler asks of them before a relationship starts. The Leader's
acceptance was the half still outstanding. Minting a Participant a link implies a second
question they were never going to be asked.

And a Participant who wants out is not making a binary decision on a web page. A match
that is not working is a **swap** — the Admin unpairs and re-pairs — and a Participant
who quietly stops meeting or stops replying already reaches the Admin through the silence
the care rules read. Both land in the same place: a pastoral decision an Admin makes,
which is where this product keeps them.

## Consequences

`relationship.accept` mints one link, for the Leader. A resume mints nothing and reuses
nothing, because the Resume Message carries no link.

Two settled sections are reversed and marked as such: ticket 06's *Settled — a Participant
declining the match raises `match_declined`*, and its acceptance criterion.

**Work left dormant, deliberately not done under ticket 12:** the `match.decline` command,
its handler, the `app/invitation/[token]/decline` route, the `match_declined` follow-up
kind, and the tests covering them. They are unreachable rather than wrong, and withdrawing
them is ticket 06's, where the amendment lists them.

Ticket 17 inherits a widened `SWAP`: it is no longer only a Leader's keyword. Two things
it must settle when picked up — whether a Participant reaches `SWAP` on the same inbound
route, given that they receive no check-ins and so hold no conversation to interrupt; and
whether `swap_requested` records which side asked, because the Admin's next move differs.
Neither is inferred here.

**What this does not decide.** Whether a Participant ever gets a surface of their own for
anything else is untouched — this is a decision about the link and the decline, not about
Participants having no web presence for all time.
