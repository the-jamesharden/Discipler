# 01 - A Material holds several files and links

**What to build:** A Material becomes a title, optional text and an ordered list of items, each a file or a link, as `spec.md` *Model*, *Files* and *Where a Material is shown* describe and M-1 and M-2 of `.lavish/richer-materials/mockup.html` draw.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [ ] A `material_item` table (ministry, material, position, kind, and either path, filename, content type and bytes, or url and label), with row-level security matching `material`'s, `discipler_command` insert and delete scoped to `app.command_ministry_id()`, and `tests/integration/rls-coverage.test.ts` green.
- [ ] The migration copies every `pdf_path` into a first file item; `material_carries_something` becomes "text or at least one item", enforced by a trigger since it spans two tables. The `pdf_*` columns are left for a later migration.
- [ ] The `material` bucket carries a 50 MB `file_size_limit` and the allowed types in `spec.md`.
- [ ] `material.create` and `material.edit` take the items; the domain refuses a blank title, an empty Material, more than 20 items, a link that is not `http` or `https`, a file type not on the list and a file over 50 MB, each with its own refusal and sentence.
- [ ] The create and edit pages upload each chosen file from the browser straight to Storage under the Admin's session, then post paths; the route reads each object's size and type back from Storage and refuses on those, deleting what it refused.
- [ ] A link is added with its address and an optional label; each item on the edit page can be removed. `public/discipler.css` gains `input[type="url"]` in its field rule, which styles no url input today.
- [ ] The tick deletes objects under a Ministry's folder that no item names and that are more than a day old.
- [ ] The Leader dashboard lists the text with its web addresses made links, then every item as M-2 draws; each file's signed URL is still minted under the Leader's session.
- [ ] `relationships_page()` and `materials_page()` carry the items within this one migration; a warm load is still one PostgREST call.
- [ ] Over HTTP: create with text only, a link only, a file only, and several of each; edit by adding, removing and replacing; refuse each boundary case; a file over 4.5 MB saves (the case that fails in production today).
- [ ] `CONTEXT.md` **Material** names items, with no numbers.
