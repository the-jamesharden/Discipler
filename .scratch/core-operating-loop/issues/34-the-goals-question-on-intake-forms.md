# 34 - The goals question on Intake forms

**What to build:** The Discipleship Goals page under Ministry Settings becomes a card on Intake forms, presented as the one question on both forms that a Ministry writes itself.

Raised by James on 2026-09-04, straight after ticket 32 shipped.
His words: the discipleship goals page needs to go on the intake form, and "discipleship goals" should just be marked as one question on the intake form.

**Blocked by:** 32

**Status:** claimed

## Decisions

1. The list of goal options is a property of the two Intake forms an Admin hands out, so it is edited on Intake forms and nowhere else.
   This supersedes decision 4 of ticket 32, which reached the page from Ministry Settings.
2. The card is headed *The goals question* and says what it is: both forms end by asking *What are you hoping for?*, and these are the options a person chooses from.
   No screen calls it *Discipleship Goals* any more; the glossary keeps the term for the fact a person states.
3. The card sits between the two link cards and the groups card, because the question is asked on both forms where the groups belong to the group link alone.
4. The four edits (add, rename, move, remove) and the two-press removal are unchanged in behaviour and wording.
   Their routes move under `/intake-forms/goals/` and land back on `/intake-forms#goals`, with what happened in the query string under `goalError` and `removing`, beside the names the group and join-request routes already use.
5. Ministry Settings loses its header link; the page is otherwise untouched.
6. Taken in the Lavish review of 2026-09-05: the order is set by dragging, not by up and down buttons.
   Each row has the cross that removes on the left and the handle it is dragged by on the right.
   Letting go posts the whole order at once, so the list on screen is the list the Ministry has and there is nothing to save.
   The handle takes focus, the arrow keys move the row and Enter posts it, for whoever is not holding a mouse.
   Before the script has run, the rows carry the up and down buttons instead, so the ordering still works without it.
7. The cross removes nothing by itself.
   It opens the same warning the Remove button opened, naming who has chosen the option, and only the button inside that warning removes (ADR-0014).

## What this touches below the routes

One command, `goal.reorder`, taking the whole order; one refusal, `goal.list_changed`, for an order that is not this Ministry's list any more; one history event, `discipleship_goal.reordered`, recording the order before and after.
No migration: the effect that rewrites positions already existed for `goal.move`, and the intake wizard, the readers and the tables are unchanged.

## Where it lands

- `app/intake-forms/goals-card.tsx`: the card, from the markup of the old page.
- `app/intake-forms/goals/`: the four routes, the shared redirect helper and the copy, moved from `app/settings/goals/`, and `reorder/`, new; the old page is gone.
- `public/discipler.css`: the rows, the cross and the handle, and the rule that hides the up and down buttons once the script has run.
- `app/intake-forms/page.tsx`: reads the list and renders the card.
- `app/settings/page.tsx`: the link is gone.
- `tests/integration/editing-the-discipleship-goals-over-http.test.ts` and `the-account-menu-over-http.test.ts` follow the move.
