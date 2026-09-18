# 03 - Separate 1:1 pairs in one submission

**What to build:** The prototype's `N x 1:1 pairs` mode, in the route: one Discipler and several Disciples forming several one-to-ones rather than one group, all of them or none.

**Blocked by:** 01

**Status:** ready-for-agent

## Why

The prototype offers three things to do with the same ticked boxes, and the third is "meet with each of them separately".
Without it, an Admin pairing a Discipler with four people has to work the screen four times, and the screen's own toolbar tells them there are twelve to get through.

`CommandService.execute` takes one command (`src/service/ports.ts:41`).
There is no batch and this ticket does not add one: a batch command would be a second way to form a relationship, which is exactly what ADR-0022 spent a ticket removing.

Four separate transactions instead, pre-validated as a set.

## Acceptance

- `POST /roster/pair/create` accepts `mode`, one of `together` (absent or anything else reads as `together`) and `separate`.
  `together` is today's behaviour, byte for byte.
- `separate` is refused unless there is exactly one Discipler and two or more Disciples, with its own `PairingRefusal` code and wording.
  One Disciple is a one-to-one and needs no mode; several Disciplers cannot be split into pairs without deciding who goes with whom, which is a question the screen does not ask.
- **All or nothing.** Every pairing is validated before any is formed.
  A set where any one would be refused forms none of them, and the refusal returns the Admin to the form with the whole selection intact and the refused Disciple named.
- Validation runs through the same boundary rules as formation, not a second copy of them.
  A dry-run path through `formRelationship` or an equivalent that cannot write is what makes this true; a route that re-implemented the gender rule to pre-check it would be the fence break ADR-0004 exists to stop.
- Where the set passes validation and a write still fails partway, the response says plainly how many were formed and which were not, and does not claim success.
  It must not silently report four when two landed.
- `declaredGender`, `name` and `joinRequiresApproval` are dropped in `separate` mode rather than applied to each pairing: they are a group's properties, a one-to-one has nothing a name is for, and its gender is implied by its two people.
  `materialId` from ticket 02 **is** applied to each, for the reason that ticket gives.
- The receipt redirect counts relationships formed, so the Roster's `paired` receipt reads correctly for a set.
- Refusal round trip keeps `mode` alongside the rest, so an Admin returning to a refused submission finds the segmented control where they left it.
- Over-HTTP: one Discipler and three Disciples in `separate` mode produces three one-to-ones, each awaiting acceptance, each visible on both Roster rows; the same submission where one Disciple is of another gender and the Ministry enforces the match produces zero relationships and a refusal naming that person; `separate` with one Disciple is refused; `separate` with two Disciplers is refused.
- `together` mode's existing integration tests pass untouched.

## Notes for whoever picks this up

The all-or-nothing rule is the whole point of the ticket.
Partial formation is not a lesser outcome here, it is the bad one: the Admin cannot see what landed without leaving the screen, and nothing on this screen un-forms a relationship.

If a true dry run through the boundary turns out to be awkward, say so on this ticket before reaching for a second copy of the rules.
Forming them inside one transaction that rolls back is the other honest answer and is a store-level change, not a route-level one.
