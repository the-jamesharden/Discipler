# 02 - Create, edit and remove a Material

**What to build:** The New material button on S-1, the Edit link on S-2, and the two pages S-4 and S-5 of `.lavish/materials/design.html`, with the commands, the migration and the upload route behind them.

**Blocked by:** 01

**Status:** ready-for-agent

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
