# 02 - Create, edit and remove a Material

**What to build:** The New material button on S-1, the Edit link on S-2, and the two pages S-4 and S-5 of `.lavish/materials/design.html`, with the commands, the migration and the upload route behind them.

**Blocked by:** 01

**Status:** claimed

## Acceptance

- Migration: `material.removed timestamptz` (null while live); `discipler_command` gains insert and update on `material` with policies scoped to `app.command_ministry_id()` and no delete; `materials_page()` and its aliases keep returning removed rows so history lines can name them, and the reader keeps them out of folders and dropdowns.
- Commands `material.create`, `material.edit` and `material.remove`, each naming the Admin who acted and each appending a ministry event, follow the `goal.*` commands in shape and in where their rules live.
- Boundary rules, proven in domain tests: the title is non-blank and unique among the Ministry's live Materials; a Material carries text, a PDF, or both; removal is refused while any accepted unended relationship's running period is on it, with the count in the refusal.
- `/materials/new` is the narrow container with a back link, Title, Text with its hint, PDF with its hint, and Cancel / Create material; it carries no message until a submission is refused, and a refusal returns with the red toast and the typed values kept.
- `/materials/[id]/edit` shows Title and Text filled, the current PDF as a row with filename and size, a "Remove the PDF" checkbox, a "Replace it" file input, and Cancel / Save changes; removing the PDF from a Material with no text is refused with the same toast.
- The Remove card below it shows the notice with the count and a disabled button while the Material is in use, and otherwise a Remove button that reopens the page with a confirmation open, where only the inner button removes; a removed Material's folder and edit page answer 404.
- The upload route accepts only `application/pdf` up to 20 MB, checked before storage; it writes `<ministry_id>/<uuid>.pdf` to the `material` bucket under the Admin's session; a command refused after an upload deletes the object; replacing uploads then edits then deletes the old object; removing the PDF deletes after the edit.
- The Leader dashboard shows the edited title, text and PDF on its next load with no change to its code.
- Over-HTTP: create with text only, PDF only, both and neither; edit each field; replace and remove the PDF; refuse removal while in use and remove once free; a small PDF uploaded here downloads from the Leader dashboard.
- `CONTEXT.md`'s Material entry names the row and points at the boundary for its rules, with no cap stated.

## Comments

**2026-09-14, implementing.** Built on branch `create-edit-and-remove-a-material`, off `the-materials-tab` (PR #8), because the tab, the reader and the page functions this edits are not on `main` yet.
Migration `20260928000100_create_edit_and_remove_a_material.sql`; the list rules in `src/domain/materials.ts` beside the period rules; the three commands follow the `goal.*` commands in shape, in where their rules live, and in taking the same advisory lock per Ministry; the upload in `src/platform/supabase/material-pdf.ts`; the pages and routes under `app/materials/new/`, `app/materials/create/` and `app/materials/[id]/{edit,save,remove}/`.
Four places where the spec's words and the repository pulled apart, resolved as follows:

- The spec routes `POST /materials/[id]/edit` beside `GET /materials/[id]/edit`. A route handler and a page cannot share one path in the app router, so the edit form posts to `/materials/[id]/save`, beside the page, as `/settings/save` sits beside `/settings`. `POST /materials/create` and `POST /materials/[id]/remove` are as the spec routes them.
- The edit page shows the PDF's size, which lives on the storage object and not on the row. The page functions gained one column, `pdf_bytes`, read from `storage.objects` under the Admin's own storage policy, so the page stays one read rather than asking the storage API a second time. A row a fixture wrote without an object reads null and the page prints the filename alone.
- Ticket 14's `unique (ministry_id, title)` counted removed rows. The rule is *unique among the live Materials*, so that constraint is replaced by a partial unique index where `removed is null`, and the store translates it into `material.title_taken` for the race the boundary's read cannot see.
- The edit effect carries `discarded`, the PDF the row no longer names, so the route deletes the old object after the edit lands without a second read. A deletion that fails after a landed edit is logged rather than reported as a failed save.

Also: a fourth alias `edit_material_page()` so the edge log names the edit page, picked up by the page-function loop by name; a multipart form posts a textarea's line breaks as CRLF, and the boundary stores them as newlines; a removed Material's PDF stays in the bucket, because the Material is history and the file is part of it; and the spec's "returns to the page with the typed values kept" carries the title and text on the query string, which is what every other refusal here travels as.

