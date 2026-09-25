# 01 - A Material holds several files and links

**What to build:** A Material becomes a title, optional text and an ordered list of items, each a file or a link, as `spec.md` *Model*, *Files* and *Where a Material is shown* describe and M-1 and M-2 of `.lavish/richer-materials/mockup.html` draw.

**Blocked by:** nothing

**Status:** ready-for-agent

**Built:** on `wave4/richer-materials`, not merged. Migration `20261013000100_several_files_and_links.sql` is not pushed to production.

## Acceptance

- [x] A `material_item` table (ministry, material, position, kind, and either path, filename, content type and bytes, or url and label), with row-level security matching `material`'s, `discipler_command` insert and delete scoped to `app.command_ministry_id()`, and `tests/integration/rls-coverage.test.ts` green.
- [x] The migration copies every `pdf_path` into a first file item; `material_carries_something` becomes "text or at least one item", enforced by a trigger since it spans two tables. The `pdf_*` columns are left for a later migration.
- [x] The `material` bucket carries a 50 MB `file_size_limit` and the allowed types in `spec.md`.
- [x] `material.create` and `material.edit` take the items; the domain refuses a blank title, an empty Material, more than 20 items, a link that is not `http` or `https`, a file type not on the list and a file over 50 MB, each with its own refusal and sentence.
- [x] The create and edit pages upload each chosen file from the browser straight to Storage under the Admin's session, then post paths; the route reads each object's size and type back from Storage and refuses on those, deleting what it refused.
- [x] A link is added with its address and an optional label; each item on the edit page can be removed. `public/discipler.css` gains `input[type="url"]` in its field rule, which styles no url input today.
- [x] The tick deletes objects under a Ministry's folder that no item names and that are more than a day old.
- [x] The Leader dashboard lists the text with its web addresses made links, then every item as M-2 draws; each file's signed URL is still minted under the Leader's session.
- [x] `relationships_page()` and `materials_page()` carry the items within this one migration; a warm load is still one PostgREST call.
- [x] Over HTTP: create with text only, a link only, a file only, and several of each; edit by adding, removing and replacing; refuse each boundary case; a file over 4.5 MB saves (the case that fails in production today).
- [x] `CONTEXT.md` **Material** names items, with no numbers.

## Comments

### Implementer

**2026-09-24, built on `wave4/richer-materials` (cut from `5b209da`), not merged.**

Where things are:
the migration `supabase/migrations/20261013000100_several_files_and_links.sql`;
the item model, the file types, the link reader and the sweep rule in `src/domain/materials.ts`;
the commands in `src/domain/commands.ts` and the handlers in `src/domain/boundary.ts`;
the store in `src/platform/supabase/effect-store.ts`, the row reader in `src/platform/supabase/material-items.ts`;
Storage in `src/platform/supabase/material-files.ts` (upload addresses, reading a stored file back, downloads, the sweep), wired into the tick in `app/cron/tick/route.ts`;
the routes `app/materials/uploads/route.ts`, `app/materials/create/route.ts`, `app/materials/[id]/save/route.ts` and their helpers in `app/materials/editing.ts`;
the form in `app/materials/material-form.tsx` and `app/materials/files-and-links.tsx`;
how an item is drawn, and the text made into links, in `app/materials/items.tsx`, used by `app/relationships/page.tsx`.

Checked:
the whole typecheck; `tests/domain` and `tests/app` whole (1711 passed);
through `scripts/locked-tests.sh`, every integration file that touches Materials (11 files) and the new `sweeping-unsaved-uploads`;
in Chrome on a seeded Ministry, desktop and a 390px frame: the edit page with four kinds of item, a 6 MB video and a refused `.exe` chosen through the page's own file box, Save, and the Leader's Resources card.

Decisions, each with its alternative:

- **The browser asks the app for a one-time upload address and PUTs the file to Storage itself.**
  No Supabase client in the browser and no session there; the address is minted under the Admin's session, so the storage policies still decide.
  The alternative was a browser Supabase client uploading under the Admin's cookie session.
- **The type is the extension's, not the browser's.** A `.docx` is sent as the Word type whatever the browser guessed, and the bucket's allowed list is those types exactly. The route reads size and type back from Storage and the domain decides on those.
- **An upload survives a refusal that is not about the files** and comes back on the page as uploaded; a refusal about the files deletes them. The alternative, deleting on every refusal, makes an Admin refused over a title upload a video again.
- **Save pressed twice does not add a file twice.** The second press posted a path the Material already held and tripped `material_item_path_uniq` as a 500 (found in Chrome). The edit now skips a file the Material already holds.
- **`pdf_path` and `pdf_filename` stay** and still count as content in the commit-time rule and in the Leader's storage read, because the code running in production between the migration push and the merge writes them. A later migration drops them; before it does, it has to copy any PDF written in that window into an item, and `sweepUnsavedUploads` stops reading `pdf_path`.
- **The link box adds one link per Save**, as two plain fields. The alternative, an "Add another link" button, needs script for something an Admin does rarely.
- **The hint under the text box is gone** on both pages, as James asked; nothing replaced it.
- **Not in the ticket, fixed on the way: the Leader dashboard scrolled sideways on a phone.** The availability table's hidden cell labels escaped its scroll box and the grid's `1fr` tracks would not shrink below the table, so the whole page was 501px wide at 390. `.lead-grid` tracks are `minmax(0, 1fr)` and `.grid-wrap` is `position: relative`; the page is 390 wide now.

For James:

- The hosted project's global Storage file size limit has to allow 50 MB before this ships (Storage settings in the Supabase dashboard).
- Wording not in the mock-up, on screens: *Uploaded. Saved when you save the material.*, *Could not upload. Remove it and try again.*, *Adding files needs JavaScript, which this browser has turned off.*, and the refusal sentences in `app/materials/copy.ts` (*One of the files is not a type a material can hold.*, *The link needs to be a full web address, starting https://*, *A material can hold up to 20 files and links.*, and the two per-file ones).

### Review fixes, 2026-09-24

A review of the ship branch found these, fixed on `fix/richer-materials-review`.
Decided in the fixing, each with the alternative:

- **The old PDF column is kept in step by trigger.**
  A PDF the old code writes during the deploy window becomes an item, and removing the item that was the old PDF clears the column.
  The carries-something rule, a Leader's storage read and the change-text fingerprint read the items alone, so dropping the column later changes none of them.
  The alternative was a re-sync step after the merge, which leaves the window's writes wrong until it runs.
- **A posted upload some Material already names is left out of the save, not refused.**
  It is what Save pressed twice, or a form brought back with Back, posts.
  A Material with nothing else is then refused as needing content.
  The alternative was a new refusal sentence, which James has not seen.
- **A failed save deletes only uploads no Material names.**
- **The sweep reads every saved path, a page at a time.**
  One unpaged read stopped at PostgREST's 1000 rows, and a saved file past that was deleted.
- **An upload the sweep has removed comes back as a failed upload row, rather than a 500.**
  It says what a failed upload already says, "Could not upload. Remove it and try again.", so there are no new words.
- **A link is kept only if it is an address as typed**: it starts `http://` or `https://`, holds no backslash, and names a host with a dot in it.
  Before, `https:example.com` passed the domain and was refused by the database as a fault.
  The refusal sentence now says "starting https:// or http://", since both are accepted.
- **A link name typed with no address is refused** as the link is, rather than dropped.
- **Items added in one Save stay files first, then the link.**
  One Save adds at most one link, and which of the two boxes an Admin used first is not something the form knows.
- **With script, create and save post by fetch** and keep everything typed on a refusal; without script it is the redirect as before.
  A refusal carried on the query string could pass the host's URL limit with a long text and many uploads.
- **Save waits for uploads, and each form presses once.**
- **The Leader dashboard signs a file when it is tapped**, at `/relationships/file/<item>`, rather than one link per file on every render (ADR-0023).
