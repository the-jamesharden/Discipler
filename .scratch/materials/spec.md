# Spec: Materials, the Ministry's own list

Status: ready-for-agent

Raised by James on 2026-09-12 and grilled the same day; the design was approved in Lavish on 2026-09-13.
The approved design is `.lavish/materials/design.html`, rendered on `public/discipler.css`.
Every screen there is numbered S-1 to S-8 and every one was approved as drawn, after the review changes were folded in.
Where this spec and the design file disagree, the design file wins on look and this spec wins on behaviour.

## Problem Statement

Ticket 14 shipped the Material model: the `material` table, dated assignment periods that never overlap or leave gaps, `app.assign_material`, `public.material_periods()`, and a private PDF bucket with Admin policies.
Ticket 31 put a Materials tab in the Admin bar and greyed it out.
Nothing lists a Ministry's Materials, nothing creates one, nothing uploads a PDF, and the command `relationship.assign_material` has nothing routing to it.
Product rules deferred the assignment interface from V1 with the words "assignments are configured during pilot support", and there is no interface for pilot support either, so that sentence means editing production by hand.

## Solution

The Materials tab becomes the v10 prototype's folder view, made editable from the Ministry's end.
Three tickets, each with one migration pushed before its code merges, each shipping on its own.

1. The tab, read-only: folders, filter, drill-in, history line.
2. Create, edit and remove a Material, with the PDF upload.
3. Assigning: from a folder's cards, from a group's card on Intake forms, and the Material's title on the group form.

The group form's two new exits (a "no group in mind" answer and a switch to the discipleship wizard) are a separate effort at `.scratch/group-form-exits/`, because they carry no Material and ship without waiting on any of this.

## Settled at the grill

- The Ministry edits its own Materials; look and feel follow the v10 prototype; the one visible addition is the New material button.
- The filter reads `relationship.declared_gender`; a one-to-one with none declared takes its leader's gender; mixed groups appear under All only.
- No health dot on a folder (review of 2026-09-13). A folder shows its count and up to three leader-initial chips.
- Only accepted, unended relationships appear; an unaccepted one has no history row.
- Every Material is a folder, including one nobody is on, with a zero count.
- No kind label (Book, Reading plan, Program). There is no column and nothing filters on it.
- Each drill-in card lists earlier periods with dates, skipping zero-length ones.
- A card's leader name links to the relationship's Follow-Up item where one exists, and to nothing otherwise. The card is not itself a link because it holds a form.
- Assigning starts now, no backdating. A "No material" option un-assigns, which the function must come to permit.
- Group assignment also lives on the group's card on Intake forms, shown only once the group is accepted; nothing is stored to apply at acceptance.
- Create and edit are pages of their own, not modals. Title, text, optional PDF; PDF only; 20 MB cap. Plain edits, no versioning.
- Remove is a flag like Discipleship Goals: hidden from folders and dropdowns, kept in history, refused while any live relationship is on it, no restore.
- The group form asks which group, never which Material; each group option shows its Material's title beneath the name, or the name alone.
- The Admin relationship detail stays an open question; nothing here reopens it.

## What each screen shows

S-1 The tab.
The Admin shell with Materials current.
A card headed "Materials" with the muted line "One material at a time, assigned to the relationship" and a small New material button on the right of the card head.
A `seg` filter All / Men's / Women's, the current one marked, carried as `?gender=` in the URL.
A `mat-grid` of folders: one per live Material in title order, then the dashed "No material assigned" folder last when any relationship is on no Material.
Each folder: the count badge top right, up to three chips of leader initials in the folder and a "+N" chip for the rest, the title beneath, and "N relationships" or "Nobody working through it" under that.

S-1b Before any Material exists.
The same card, the empty line "No materials yet. Create one, then assign it from its folder or from a group's card on Intake forms." and the dashed folder if any relationship is live.
With no live relationship the dashed folder goes too.

S-2 A Material's folder, at `/materials/<id>`.
A back link "← All materials" that keeps the filter.
A head with the title, "N relationships working through it now", and a ghost button "Edit this material" on the right.
A `rel-grid` of cards.
Each card: leader names with the state pill when not healthy; "with" the participant names; a meta line of the demo's relationship label and "since <running period start>"; a "Previously:" line of closed periods with dates when any; the Overview's flag line when any; and, pinned to the bottom of the card, the assign row: a dropdown of every live Material plus "No material", pre-selected on the current one, and a Save button.

S-3 The "No material assigned" folder, at `/materials/none`.
The same page with the sub-line "N relationships are not working through anything yet", the meta line saying "started <accepted date>", and the assign row's dropdown opening on "Choose a material…" with an Assign button.

S-4 New material, at `/materials/new`.
The narrow container, a back link "← Materials", a card headed "New material" with a lead paragraph, then Title, Text (a textarea with the hint "Shown to the leader as written, line breaks kept."), PDF (a file input with the hint "PDF only, up to 20 MB. The leader downloads it from their dashboard."), and Cancel / Create material.
No message on the page by default.
A submission with neither text nor PDF returns to the page with the red toast "A material needs text, a PDF, or both." above the fields and the typed values kept.

S-5 Edit a material, at `/materials/<id>/edit`.
A back link to the folder.
A card headed "Edit this material" with Title and Text filled, the current PDF as a row showing its filename and size, a checkbox "Remove the PDF", a file input labelled "Replace it", and Cancel / Save changes.
A second card headed "Remove this material" with the lead "Takes it off the Materials tab and out of every assign list. Its history stays: any week a relationship spent on it still says so."
While any live relationship is on it, a notice "N relationships are working through it. Move them to another material, or to none, before removing it." and a disabled Remove button.
Otherwise a live Remove button that reopens the page with a confirmation open, and only the button inside the confirmation removes.

S-6 Groups on Intake forms.
Each accepted group's card gains, after the approval checkbox, a field labelled "Material": a dropdown of "No material" plus every live Material, pre-selected on the running one, with the hint "Shown beneath the group's name on the link, and on the leader's dashboard." followed by "Working through it since <date>." when one is running.
It saves with the name and the toggle in the one Save group press.
An unaccepted group's card shows the label and the line "A material can be assigned once <leader first name> has accepted. The group is not on the link until then either." and no dropdown.

S-7 The group form's step three.
Each group option gains the description line "Working through <title>" when its running period has a Material, and nothing when it has none.
The two exits on that screen belong to the other effort.

## The functions and readers

`materials_page(gender text default null)` in `public`, `jsonb`, `stable`, `security invoker`, `set search_path = ''`, granted to `authenticated` and revoked from `public`, `anon` and `service_role`, answering for the session first exactly as every page function does (`docs/adr/0023-a-page-is-one-read.md`).
It returns, keyed by the read each part replaces: `admin`, the Ministry's `materials` (id, title, body, pdf_path, pdf_filename, removed), `material_periods` from `public.material_periods(ministry)`, the accepted unended `relationships` with kind, name, declared gender and accepted date, their open memberships and names, and the history inputs the Overview derives the pill, the flag line and the Follow-Up badge from.
`material_page()` and `new_material_page()` are aliases returning the same document under their own names, so the edge log names the page that was loaded.
The gender argument is carried for the log; filtering is TypeScript's.

The reader splits pure and thin as the others do.
Grouping by running period, the filter, "since", the "Previously" line and the per-card pill and flags are derived in TypeScript from the document, reusing `materialInUseAt` and the Overview's flag derivation.
Removed Materials are excluded from folders and dropdowns and never from periods.

`groups_open_to_join(uuid)` gains a `material_title text` column: the title of the Material on the group's running period, or null.
`intake_forms_page()` gains the Ministry's live Materials and the running period per group so S-6 can draw its dropdowns.

## Commands and writes

`material.create { ministryId, title, body | null, pdf: { path, filename } | null, createdBy }`.
`material.edit { ministryId, materialId, title, body | null, pdf: keep | remove | { path, filename }, changedBy }`.
`material.remove { ministryId, materialId, removedBy }`.
`relationship.assign_material` gains `materialId: MaterialId | null`.

Boundary rules, in the domain and proven there: a title is non-blank and unique among the Ministry's live Materials; a Material carries text, a PDF, or both; removal is refused while any accepted unended relationship's running period is on it; assigning the Material already running is refused with no period written.

`discipler_command` gains insert and update on `material`, with policies scoped to `app.command_ministry_id()`, and no delete.
`app.assign_material` accepts a null Material once the history is open, closing the running period and opening a no-material one at the same instant, and refuses a target equal to the running one.
The trigger `app.reject_broken_material_history` needs no change: only the first period must be null.

The PDF goes to the existing private bucket at `<ministry_id>/<uuid>.pdf` from the Next route under the Admin's own session, so the policies ticket 14 wrote decide.
The route refuses anything not `application/pdf` and anything over 20 MB before storage is touched, and a refused command deletes the object it just uploaded so no orphan remains.
Replacing a PDF uploads the new one, then edits, then deletes the old one; removing deletes after the edit lands.

## Routes

- `GET /materials`, `GET /materials/none`, `GET /materials/[id]`, `GET /materials/new`, `GET /materials/[id]/edit`.
- `POST /materials/create`, `POST /materials/[id]/edit`, `POST /materials/[id]/remove`.
- `POST /materials/assign` from folder cards, `POST /intake-forms/groups/configure` extended with the Material, both executing `relationship.assign_material`.
- The tab's `href` in `app/shell.tsx` becomes `/materials`.

## Tests

- One integration file per page function, driven with a signed-in client, covering the Admin, a Leader who administers nothing, an ended session, a visitor, and an Admin of another Ministry, as `the-admin-tabs-answer-in-one-read.test.ts` does.
- Domain tests for every boundary rule above and for the un-assign and same-material refusals.
- Over-HTTP: walk tab to folder and back with the filter kept; create with text only, PDF only, both, and neither; edit each field; refuse removal while in use and remove once free; assign, swap and un-assign from a card and from the groups card; the Leader dashboard shows the change and the group form shows the title.
- `every-page-function-answers.test.ts` picks up the new functions by name.

## Acceptance

- A warm load of any Materials page makes one PostgREST call, verified the way ADR 0023's acceptance counts them.
- Every screen matches `.lavish/materials/design.html` in structure, wording and class names.
- `docs/product-rules.md` V1 Scope carries a supersession line for the material assignment interface, and `docs/pastor-dashboard.md` no longer says the interface is not built for the pilot.
- `CONTEXT.md` names Material and Material Assignment correctly and points at where the rules are enforced, with no numbers.

## Deploy order

Each ticket's migration is pushed to production before its code merges, `npm run smoke:pages` is run between the two, and a key is only ever added to a page document within one change.

## Open on 2026-09-13

Two of the six notes in the second Lavish batch were cut off before they were read; James was asked to resend them.
If either changes a screen, the ticket that owns it is updated before an agent claims it.
