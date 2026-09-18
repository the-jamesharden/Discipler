# 01 - What the Pair screen reads

**What to build:** Three facts the pairing form needs and the Pair page cannot currently see: each candidate's gender, whether the Ministry enforces the absolute one-to-one gender match, and the Ministry's live Materials. No UI changes.

**Status:** ready-for-agent

## Why

`pair_page()` is `select public.roster_page()` (`20260926000100_a_page_is_one_read.sql:338`), and the Roster's document carries none of the three.
Ticket 04 cannot grey a non-matching Disciple without gender, cannot decide whether Mixed is offerable without the setting, and cannot fill the Material select without the list.

The page-function migration already anticipates this move: "a page that one day reads differently moves nobody else's document."
This is that day.

## Acceptance

- `public.roster()` widens by one column, `gender public.gender`, read as `app.current_gender(p.id)`.
  Dropped and recreated rather than replaced, since the return type widens, which is the move tickets 27, 28 and the Roster's own migration each made.
  The function's `app.is_admin_of` test is what lets it out, exactly as it does for phone and email under ADR-0021, and no column grant on `intake_submission` is added.
- `app.current_gender(uuid)` gains `grant execute` to whatever role `public.roster()` runs as, and keeps its revoke from `public` and `anon`.
  A browser session must still hold no path to call it directly, which is what its own comment says it exists to prevent.
- The function comment is updated to name gender and to say why it is there.
- `RosterEntry` gains `readonly gender: Gender | null`, documented as: the gender on their most recent Intake submission; null is *never asked*, never a mismatch; read by the pairing surface to grey rows against a declaration and by nothing else.
- `pair_page()` stops being an alias and becomes its own `plpgsql` function returning `roster_page()` merged with:
  - `suggest_gender_match`, off the Ministry row;
  - `materials`, the Ministry's Materials in title order, `removed` ones included so the reader can drop them, matching the shape `materials_page()` already builds.
- `person_page()` stays an alias of `roster_page()`. Only the Pair page's document moves.
- `RosterPage` gains `suggestGenderMatch: boolean` and `materials: readonly MaterialOption[]`, where a `MaterialOption` is id and title.
  Both are documented as read by the Pair surface only.
- The reader keeps removed Materials out of `materials`, as the Materials tab's reader already does for its dropdowns.
- A `roster_page()` document reaching `rosterFrom` without the two new keys yields `suggestGenderMatch: true` and `materials: []`, so the Roster and person pages keep working unchanged.
  True and not false is deliberate: the safe default for a safeguarding constraint is enforced, which is the reason the column itself defaults true.
- Grants: `pair_page()` keeps its revoke from `public`, `anon` and `service_role` and its grant to `authenticated`.
- Over-HTTP: a signed-in Admin loading `/roster/pair` gets gender for every candidate who has completed Intake and null for anyone who has not; a Ministry with `suggest_gender_match` false reads false; a removed Material is absent from the list.
- The existing Roster, person and Pair page tests pass untouched.

## Notes for whoever picks this up

Gender on the Roster's own function rather than only on the Pair page's document is a deliberate choice: one shape stays one shape, and a second projection of the same rows is how two readers eventually disagree.
It is Admin-gated already and is less disclosing than the phone number the same function hands out.

If that trade reads wrong, the alternative is a `candidate_genders` map added to `pair_page()` alone, and the Pair page merging it.
Say so on this ticket rather than deciding it in ticket 04.
