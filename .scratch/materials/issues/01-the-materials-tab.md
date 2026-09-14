# 01 - The Materials tab

**What to build:** The Materials tab as `.lavish/materials/design.html` draws it in S-1, S-1b, S-2 and S-3, read-only: `materials_page(gender)` with its two aliases, the reader split pure and thin, the routes `/materials`, `/materials/none` and `/materials/[id]`, and the tab's `href` in `app/shell.tsx`.
The assign row at the foot of each card, the New material button and the Edit link are drawn in the design and belong to tickets 03 and 02; this ticket renders the cards, head and folders without them.

**Blocked by:** nothing

**Status:** claimed

## Acceptance

- `materials_page(gender text default null)` is `security invoker`, `set search_path = ''`, granted to `authenticated`, revoked from `public`, `anon` and `service_role`, and answers `signed-out` and `not-an-admin` first as every page function does.
- The document is keyed by the read each part replaces: `admin`, `materials`, `material_periods`, `relationships`, memberships and names, and the Overview's history inputs, so the badge and the cards' pills and flags derive from the same rows as the Overview.
- `material_page()` and `new_material_page()` return the same document under their own names.
- Folders appear for every live Material in title order, then the dashed "No material assigned" folder last when any accepted unended relationship has no Material running; a Material with nobody on it shows a zero count and "Nobody working through it".
- Each folder shows the count badge, up to three leader-initial chips and a "+N" chip, the title, and the relationships line; no dot and no kind label.
- The filter All / Men's / Women's is a `seg` of links carrying `?gender=`, reads `declared_gender`, gives a one-to-one with none declared its leader's gender, and files mixed groups under All only; the back link from a folder keeps it.
- Only accepted, unended relationships appear anywhere on these pages.
- A card shows the leader names with the state pill when not healthy, "with" the participants, the meta line with the relationship label and "since <running period start>" in a Material's folder or "started <accepted date>" in the no-material folder, the "Previously:" line of closed periods with dates skipping zero-length ones, and the Overview's flag line; the leader name links to the Follow-Up item where one exists.
- Removed Materials (a column ticket 02 adds; until then none exist) never appear as folders and always appear on "Previously" lines.
- The styles from the design file's "proposed additions" block land in `public/discipler.css` unchanged in class names.
- One page-function integration test per the spec's five cases; one over-HTTP test walking tab to folder and back with the filter kept and asserting no Concern text and no number appears on any Materials page.
- `docs/pastor-dashboard.md` says what the tab shows today and no longer says nothing is built for the pilot.

## Comments

**2026-09-14, implementing.** Built on branch `the-materials-tab`, off `a-page-is-one-read` because the page functions this composes are not on `main` yet.
Migration `20260927000100_the_materials_tab.sql`; reader `src/platform/supabase/materials-reader.ts`; routes under `app/materials/`; the shared flag derivation moved to `app/overview/flags.ts` so the Overview and the folders word a care item identically.
Three places where the words of the spec and the repository's rules pulled apart, resolved as follows:

- The document carries `kind` as the spec lists it, and nothing in TypeScript reads it: ADR-0004 fences the column from copy and derivation, and the kind fence test walks `app/`. A card reads as a group when it is named or has more than one Participant, the rule the Roster already uses, and the filter files a nameless single-Participant relationship that declared nothing under its Leader's gender. A group that declared nothing is under All only, as settled.
- The `removed` key is in the document from the start, always null, so the reader that keeps removed Materials out of folders and dropdowns is written once; ticket 02 replaces the constant with the column and changes no reader.
- The design's "proposed additions" block landed whole, class names unchanged, except that the two layout rules for the assign row (`display: flex` on the card and the `:nth-last-child(2)` margin) are scoped to a card that holds a `.mat-assign`. Applied to every `.rel-card` they widened the gaps on the Overview's cards, which share the class and hold no form; checked in the browser before and after.

Also: the page-function loop learned a `text` argument (`null::text`), since `materials_page(gender)` is the first page function that takes one; the Leader's gender comes from the most recent Intake submission under the Admin-only policy, ordered as `app.current_gender` orders; dates print in the Ministry's zone with the month spelled by the app so September is `Sep` on every runtime.
