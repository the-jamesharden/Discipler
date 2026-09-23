# Spec: Remove a Person from the Roster

Status: ready-for-agent

Raised by James on 2026-09-22: "add a way when clicking on a profile to remove it from the roster".
Mocked up the same day on the real person pages in `.lavish/remove-from-roster/index.html` (gitignored, like every `.lavish/` path), and James answered its four questions there.

## Problem Statement

Nothing takes a Person off a Ministry's Roster.
Unpair ends a pairing and a text of `STOP` marks somebody Opted Out, and both leave them on the Roster, in its counts and in Suggested Pairs for good.
Somebody who has left the church, or was added by mistake, stays on every list an Admin works from.

## Solution

A **Remove from the Roster** card at the foot of a person's page, the width of the page, with no lead line.
It takes two presses, as removing a Material does: **Remove** opens the question in place, and only the button inside it removes.

- The question is "Remove <name> from the Roster?".
- Where they hold any pairing, it adds James's sentence, word for word: "This will remove them from all current pairings and take any one-on-one pairings back to unpaired."
- The buttons are "Yes, remove <name>" and "Keep them".
- Afterwards the Admin lands on the Roster, which says "<name> has been removed".

## Settled with James on 2026-09-22

1. **Off every live list, history kept.**
   A removal is a dated fact, a `person_removal` row, and not a delete.
   The Person leaves the Roster and its counts, the Pair page, Suggested Pairs and every open Follow-Up item about them.
   Past pairings, check-ins and Intake answers still name them wherever those are shown.
   Nothing is texted to them, then or afterwards.
2. **Removing somebody in a pairing ends their pairings too.**
   Each pairing goes the way Unpair takes it on their page: a one-to-one ends and the other person goes back to unpaired, and a group goes on without them unless they were its only Discipler or its last Disciple, in which case it ends.
   The confirmation asks nothing else.
3. **A new Intake from their number brings them back**, as the same Person with their history, Ready to Pair.
   Nothing else does: there is no list of removed people and no Put back.
4. **Everyone but Admins.**
   No card on an Admin's page, your own included, so a Ministry can never remove its last Admin.
   A removed Discipler's account is removed with them, so they can no longer sign in and see their Discipler view.

## Implementation Decisions

- One command, `person.remove`, run in the same transaction as the Unpair acts it needs, so a removal either happens whole or not at all.
- The Remove card is drawn from the Roster's own read, which now says who is an Admin.
- See `issues/01-remove-a-person-from-the-roster.md` for the decisions made while building, each with its alternative.
