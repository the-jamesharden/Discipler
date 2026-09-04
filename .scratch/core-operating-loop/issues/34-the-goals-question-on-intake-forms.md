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

## What this does not touch

The domain, the command service, the readers, the migrations and the intake wizard.
The goal options are still the same table, edited through the same four commands and read through the same reader the wizard reads them from.

## Where it lands

- `app/intake-forms/goals-card.tsx`: the card, from the markup of the old page.
- `app/intake-forms/goals/`: the four routes, the shared redirect helper and the copy, moved from `app/settings/goals/`; the old page is gone.
- `app/intake-forms/page.tsx`: reads the list and renders the card.
- `app/settings/page.tsx`: the link is gone.
- `tests/integration/editing-the-discipleship-goals-over-http.test.ts` and `the-account-menu-over-http.test.ts` follow the move.
