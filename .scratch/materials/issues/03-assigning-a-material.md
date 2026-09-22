# 03 - Assigning a Material

**What to build:** The assign row at the foot of every card on S-2 and S-3, the Material field on the groups card of Intake forms in S-6, and the Material's title beneath each group on the group form's step three in S-7, all in `.lavish/materials/design.html`.
Behind them: `relationship.assign_material` gains a nullable Material and a route from each of the two cards, `app.assign_material` learns to un-assign, and `groups_open_to_join()` carries the title.

**Blocked by:** 02

**Status:** ready-for-agent

**Built:** on `wave1/assigning-a-material`, not merged. Migration `20261008000300_assigning_a_material.sql` is not pushed to production.

## Acceptance

- [x] `app.assign_material` accepts a null Material once the history is open, closing the running period and opening a no-material one at the same instant, and answers a new refusal `material_already_running` when the target equals the running period's Material; the opening-period rule in `app.reject_broken_material_history` is untouched and every ticket 14 test still passes. (All but one: the test asserting the one-opening-period index now asserts the un-assign; see Implementer.)
- [x] The command `relationship.assign_material` takes `materialId: MaterialId | null`; the store translates the new refusal; the domain names it.
- [x] Every assignment starts at the clock's now; no start date is accepted from a form.
- [x] The assign row on a Material's folder card is a form with a dropdown of every live Material plus "No material", pre-selected on the current one, and Save; on the no-material folder the dropdown opens on "Choose a material…" with Assign; the row is pinned to the bottom of the card whatever the card's text above it.
- [x] The leader name on a card is the only link on it, to the Follow-Up item where one exists.
- [x] The groups card on Intake forms gains the Material dropdown after the approval checkbox on an accepted group, saved in the same press as the name and the toggle, with the hint and the "Working through it since <date>" line; an unaccepted group's card shows the label and the sentence naming the leader instead, and no dropdown.
- [x] `groups_open_to_join(uuid)` gains `material_title text`; the group option on step three shows "Working through <title>" as its description line, and nothing when the group has none.
- [x] `intake_forms_page()` gains the live Materials and the running period per group; the change is additive within one migration.
- [x] Over-HTTP: assign from a card, swap, un-assign, assign from the groups card, refuse an unaccepted group, the Leader dashboard shows the change, the group form shows the title and drops it after an un-assign.
- [x] `docs/product-rules.md` V1 Scope gains a supersession line dated with the merge saying the material assignment interface shipped and pilot support no longer configures assignments by hand.

## Comments

### Implementer

**2026-09-22, built on `wave1/assigning-a-material` (cut from `67bc096`), not merged.**

Where things are:
the migration `supabase/migrations/20261008000300_assigning_a_material.sql`;
the command and refusal in `src/domain/commands.ts`, `src/domain/errors.ts` and `src/domain/boundary.ts`;
the store's translation in `src/platform/supabase/effect-store.ts`;
the readers in `src/platform/supabase/intake-forms-reader.ts` and `src/platform/supabase/intake-reader.ts`;
the assign row's rules in `app/materials/assigning.ts`, its route at `app/materials/assign/route.ts` and the row in `app/materials/folder.tsx`;
the groups card in `app/intake-forms/page.tsx` and `app/intake-forms/groups/configure/route.ts`;
the step-three line in `app/intake/fields.tsx`.

Checked:
the whole typecheck; `tests/domain` and `tests/app` whole; `material-assignment`, `the-intake-forms-page-answers-in-one-read` and the new `assigning-a-material-over-http` through `scripts/locked-tests.sh`; one full locked run; S-2, S-3, S-6 and S-7 in Chrome at desktop width and in a 390px frame, on a seeded Ministry, including the same-Material refusal pressed for real.

Decisions, each with its alternative:

- **The index `material_assignment_one_opening_period` is dropped.**
  The spec and the design say "the constraint already permits" an un-assign; it did not, because ticket 14 held one null period per relationship as a partial unique index.
  The un-assign the ticket asks for cannot exist beside it, so the migration drops it, and the ticket 14 test that asserted it now asserts a later null period is held.
  This is the one place "every ticket 14 test still passes" was not kept.
  The alternative was stopping to ask; the trigger still holds contiguity and the opening period, unchanged.
- **An opening period asked for twice still answers `material_history_already_open`.**
  A null Material with no actor on an open history is acceptance's shape and stays a defect; a null Material with an Admin is the un-assign.
  The alternative, letting every null on an open history be an un-assign, would have turned that defect into a plausible `material.already_running`.
- **The same-Material refusal is decided in `app.assign_material` only**, not also in the boundary.
  The boundary's snapshot does not carry the running period, and the function reads it under the row lock it writes under.
  The alternative was adding the running Material to `RelationshipSnapshot`, which every snapshot fixture would then have to state.
- **A named Material is checked against the live list in the boundary**, so a removed one is refused as `material.not_found`, and the assignment takes the list's lock as pairing does.
  The ticket does not say this; without it a stale dropdown could put a relationship on a removed Material, which no folder shows.
- **The groups card saves the name first, then the Material, as two commands.**
  A refused Material leaves the name saved and the sentence says "The name was saved."; the Material already running is swallowed, which is "writes nothing".
  The alternative, one combined command, would be new domain surface for one form.
- **A refusal on a folder's card is a page-level red toast under the head**, not a line inside the card.
  The design says the page says so and draws no place for it.
- **No success message after an assign.** The card moves to its new folder and the Admin stays in the folder they pressed it in, with the filter kept. The design draws none.
- **"Choose a material…" is `required`**, and a post of it anyway changes nothing and says nothing.
- **The unaccepted group's sentence names every leader's first name**, joined with "and", or "its leader" where none is named.
- **`intake_forms_page()` gains `timezone` as well** as `materials` and `group_materials`, because "since <date>" is printed in the Ministry's zone.
- **`groups_open_to_join` is revoked from `service_role` too** now that it is recreated; nothing calls it as that role.
- **The supersession line is dated 2026-09-22**, the build date; it should carry the merge date when this merges.
- **Intake forms' refusal lookups read own keys only** (`refusalIn`), fixing a `__proto__` code rendering an object; found while writing the new sentences.

Review (two-axis `code-review` on `67bc096...HEAD`, and a second read of the diff), fixed on the branch:
an Admin's un-assign on a history nobody opened now answers `material_history_not_open` rather than raising at commit;
the groups card leaves the Material field out where the running Material is off the live list, rather than drawing "No material" over it and un-assigning it on the next Save;
the migration restates `material_assignment`'s table comment;
`docs/pastor-dashboard.md` says the groups card does not report the Material already running.
Left as recorded: the same-Material refusal lives in SQL only, where the spec lists it among the domain's rules (see above).

For James:

- Push `20261008000300_assigning_a_material.sql` to production by hand before this merges, then `npm run smoke:pages`.
- Wording not in the design: the refusal sentences on the folder ("It is already working through that material, so nothing changed." and the others in `app/materials/copy.ts`) and on the groups card ("The name was saved. ..." in `app/intake-forms/copy.ts`).
- S-6 draws the rest of the groups card in words the shipped card does not use ("Groups on the link", "Name on the link", "Ask me before someone joins", "Save group", "led by"). Only the Material field was built; say if the card's other words should follow the design.
- S-7 heads the step "Join a group at Grace Fellowship"; the shipped step heads it with the Ministry's name alone. Untouched here.

