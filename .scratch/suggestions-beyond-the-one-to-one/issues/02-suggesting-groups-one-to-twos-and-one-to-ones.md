# 02 - Suggesting groups, 1:2 pairs and one-to-ones

**What to build:** A segmented toggle on Suggested Pairs between **Group**, **1:2 pair** and **1:1** suggestions, and a scorer that answers for all three.

**Blocked by:** 01, and `core-operating-loop/04-suggested-pairs` shipping

**Status:** needs-info

## Why this is `needs-info` and not `ready-for-agent`

**Suggested Pairs does not exist.**
`app/suggested-pairs/page.tsx` renders an empty state.
There is no ranking function, no leader pool, no participant pool.
`core-operating-loop/04-suggested-pairs` is `ready-for-agent` with none of its criteria met, and is itself waiting on the tier cutoffs being re-decided for the hourly grid.

This ticket is a control over an engine nobody has built.
What follows is what is known now, so that ticket 04 can be built with this in view rather than retrofitted.

## What ticket 04 already assumes

Its leader pool is "filtered by the kind of relationship being suggested - a leader already holding an open group is out of the pool for group suggestions and still in it for one-to-ones."
So suggesting by kind was foreseen; a control letting the Admin choose which kind they are looking at was not.

The page's current subtitle, `ONE_TO_ONE_ONLY` - "Relationships with more than one participant are formed manually" - is the sentence this ticket deletes.

## What is known now

- **The toggle** switches between Group, 1:2 and 1:1 suggestions (decided 2026-09-18).
  It is the same three-segment control the manual pairing screen gets in `manual-pairing/04`, and reuses its `.pair-seg` styling rather than growing a second one.
- **The mode changes who is in the pool, never how they are ordered.**
  Ranking is unchanged in all three: availability overlap dominant, Discipleship Goal separating comparable overlaps, ties by longest wait.
- **Ticket 01's answer filters nobody.**
  Everyone eligible appears in 1:2 suggestions whatever they answered (decided 2026-09-18).
  The answer is shown on the suggestion card beside each name, as it is on manual pairing, and never appears as the card's reason, which stays ADR-0001's one sentence about overlap and goal.
- Gender rules carry over exactly as ticket 04's own comments settle them, including that a suggestion into a group that declared a gender offers only people of it, whatever `suggest_gender_match` says.
- A 1:2 is a `group` to `kindFor(1, 2)`, so a suggestion accepted into one arrives at `/roster/pair` needing a name and a declaration, which `manual-pairing/04` supplies.

## Open items for a human

- **Does a 1:2 suggestion propose two participants at once, or one participant into an existing pair?**
  These are different products.
  The first is a three-person proposal with its own reason sentence; the second is closer to a join request.
- **What does a group suggestion propose?**
  A leader and N participants chosen how?
  ADR-0001's ranking is pairwise and says nothing about assembling a set.
- **Does the reason sentence survive?**
  ADR-0001 makes it a hard constraint that every suggestion states its reason in one plain sentence.
  "Four shared time slots" is true of a pair.
  What it says of a group of five is not obvious, and if it cannot be said, ADR-0001 rules the Group segment out by construction, and Group belongs on the toggle as a disabled segment with an honest line.

## Acceptance

Deliberately not written yet.
Ticket 04 has to ship first, and the three questions above have to be answered, or this ticket will specify a screen over an engine that turns out not to work that way.

## Comments

**2026-09-18, D2 decided.**
James: the toggle is between group, 1:2 and 1:1 suggestions, and ticket 01's answer does not bind.
Removed from this ticket: the 1:2 pool filtered by ticket 01's answer, *null is not consent*, and the question of a willingness answer for groups, which falls away once no answer filters.
The answer is now shown on the card and filters nobody.
Three open items remain, all about what a multi-person suggestion is, so status stays `needs-info`.
