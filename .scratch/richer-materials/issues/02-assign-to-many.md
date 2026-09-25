# 02 - Assign one Material to many relationships

**What to build:** **Assign to more** on a Material's folder, the page at `/materials/<id>/assign`, and `material.assign_to_relationships`, as `spec.md` *Assigning to many at once* describes and M-3 of `.lavish/richer-materials/mockup.html` draws.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [x] The page lists every live, accepted relationship not already on the Material, those on no Material first, then grouped by their Material in title order, each with a checkbox, the Men's / Women's filter carried as `?gender=`, and "Select all shown".
- [x] The button reads "Assign <title> to N relationships" and counts the ticks; with none ticked it is disabled, and the route refuses an empty list.
- [x] `material.assign_to_relationships { ministryId, materialId, relationshipIds, assignedBy }` runs `app.assign_material` for each in one transaction; any refusal refuses the lot and the page names the relationship and the reason.
- [x] Each assignment writes its own `relationship.material_assigned` event, exactly as one Save does, so history reads the same whichever way it was assigned.
- [x] The page is one read, through a page function answering for the session first (ADR-0023), and `every-page-function-answers.test.ts` picks it up.
- [x] Over HTTP: assign three at once, refuse the lot when one ended between load and press, and the folder shows the new count.

## Comments

### Implementer

**2026-09-24, built on `wave4/assign-to-many` (cut from `686c855`), not merged.**

Where things are:
the migration `supabase/migrations/20261013000200_assign_to_many.sql` (`app.assign_materials` and `public.assign_material_page`);
the command in `src/domain/commands.ts`, its rule in `src/domain/boundary.ts` (shared with `relationship.assign_material` through `refuseUnlessAssignable` and `assigning`), and the named refusal in `src/domain/errors.ts`;
the load and the batched write in `src/service/command-service.ts`, `src/service/ports.ts` and `src/platform/supabase/effect-store.ts` (`relationshipsToAssign`, `assignMaterials`);
the reader in `src/platform/supabase/materials-reader.ts` (`readAssignPage`, `assignPageFrom`);
the page at `app/materials/[id]/assign/page.tsx`, its script in `picker.tsx`, its route at `app/materials/[id]/assign/save/route.ts`, its rules in `app/materials/assign-to-more.ts`, its words at the end of `app/materials/copy.ts` and in `app/materials/assign-button.ts`, the button in `app/materials/folder.tsx`, and its styles after `.drill-head` in `public/discipler.css`.

Checked:
the whole typecheck; `tests/domain` and `tests/app` whole; `material-assignment`, `every-page-function-answers` and the new `assigning-to-many-over-http` through `scripts/locked-tests.sh`, with `assigning-a-material-over-http`, `editing-the-materials-over-http`, `the-materials-tab-over-http`, `the-materials-tab-answers-in-one-read` and `a-material-chosen-at-pairing` beside them because the write path they share changed;
the folder head and the page in Chrome on a seeded Ministry at desktop width and in a 390px frame: the count following the ticks, singular at one, disabled at none, Select all shown ticking and clearing everything and showing the mixed state between, and the refusal toast.

Decisions, each with its alternative:

- **Every assignment, one or many, is now written in one round trip through `app.assign_materials`**, which calls `app.assign_material` for each in order and stops at the first refusal.
  The port's `assignMaterial` became `assignMaterials`, so acceptance, a single card and the groups card go through it as a list of one or two.
  The alternative was one call per relationship, which is one network round trip each from Vercel to the database: seconds for a press of twenty.
- **The snapshots are read in one locked statement, ordered by id** (`relationshipsToAssign`), carrying only `acceptedAt` and `endedAt`, which is all the rule reads.
  The alternative, `relationshipFor` once per relationship, is three queries each; the id order means two overlapping presses wait for each other rather than deadlock.
- **`MaterialAssignmentRefused` carries the relationship it was about** (`relationshipId`, null where the reason is nobody's in particular).
  A single card's refusals now carry it too, and three expectations in `tests/domain/material-assignment.test.ts` and three in `tests/integration/material-assignment.test.ts` now say so.
  The alternative, a second error class for the many-act, would have had the store translate the same database answer two ways.
- **The Material is checked once, before any relationship**, so a removed one refuses as `material.not_found` naming nobody.
  The page then 404s, as the folder does for a removed Material.
- **A relationship named twice is assigned once** rather than refusing the lot as already running.
  An empty list is a defect in the command; the route refuses it first with `material.none_ticked` and "Tick at least one relationship to assign it to."
- **The page function is `assign_material_page(refused uuid)`, composing `materials_page()`** and adding the names of the one relationship a refused press named, read whether or not it has ended (members open at its ending).
  An ended relationship is off the tab's list, so without this the most likely refusal could not be named.
  The alternative, carrying the name on the address, would put typed text into a red toast.
  It does not redefine `materials_page`, which ticket 01 changes.
- **After a refusal the ticks are not kept**; the page redraws without the refused one and says "Tick the others again to assign them."
  The alternative, carrying every ticked id back on the address, grows the URL with the list.
- **Script is the improvement and never the mechanism**, as on the availability grid.
  Without script the button reads "Assign <title> to the ticked relationships" and is never disabled, and Select all shown is not drawn.
  The button's words live in `app/materials/assign-button.ts` so the browser is not sent `copy.ts`.
- **The filter is drawn as `.seg`, as M-3 draws it**, not the tab's `.seg-toggle`.
  It reuses the tab's `FILTERS`, `filterIn` and `underFilter`, and travels as `?gender=` to the page, on the form, back to the folder and on Cancel.
  **Assign to more** carries the folder's filter to the page.
- **Every row shows its pill, Healthy included**, as M-3 draws it; the folder's cards hide Healthy.
- **A group reads "Group of N"**, N being its Disciples; a named group is its name "led by" its Leaders, an unnamed one its Leaders "with" its Disciples.
- **Done lands in the Material's folder with the filter kept and no message**, as a single card's Save does; its head's count is the receipt.
- **A relationship on a removed Material is not listed**, as the tab does not show it; removal is refused while anybody is on it, so it cannot arise outside a race.
- **`label.pick`, not `.pick`, in the stylesheet**, because the availability grid's cells are `td.pick`.

For James:

- Push `20261013000200_assign_to_many.sql` to production by hand before this merges, then `npm run smoke:pages`.
  Ticket 01's `20261013000100` goes first.
- Wording not in the mock-up: the refusal sentences at the end of `app/materials/copy.ts` ("Nothing was assigned. <who> has ended since this page was opened, so it is no longer listed. Tick the others again to assign them." and the others), "Tick at least one relationship to assign it to.", the empty list ("Every relationship is already working through it." / "No men's relationships to assign it to."), and the button before script counts ("Assign <title> to the ticked relationships").
- The lead's "Everyone in it hears about the change, at most once a day." is true once ticket 03 ships; kept as approved.
- At 390px the foot wraps: Cancel on its own line, then the button full width over two lines for a long title.

