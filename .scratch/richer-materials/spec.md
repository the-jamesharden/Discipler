# Spec: Richer Materials, and telling people when theirs changes

Status: ready-for-agent

Raised by James on 2026-09-24, from a comparison with Planning Center Groups' Resources.
He picked six gaps to close, and answered four questions the same day.
The screens and the texts are drawn as a Lavish mock-up at `.lavish/richer-materials/mockup.html` before anything is built, because each one is a new control, page or message.
James reviewed it on 2026-09-24; his answers are under *Decided at the mock-up review*.

## Problem Statement

A Material today is a title, some text and at most one PDF of up to 20 MB, and only the Leader ever sees it.

1. A Material cannot be a link, so the videos and web pages most studies come with cannot be attached, and a URL typed into the text is not clickable on the Leader dashboard.
2. A Disciple never sees their Material; the Leader passes everything on by hand.
3. Only a PDF can be uploaded, and the 20 MB cap is not reachable in production: the file goes through a Next route, and Vercel refuses a request body over about 4.5 MB.
4. A Material holds one file, so a guide plus a video plus a reading plan cannot sit together.
5. Starting many relationships on one Material is one Save per card.
6. Nobody is told when their Material is assigned or changes.

## Decided on 2026-09-24

- **Disciples are texted a link to a read-only page** of their relationship's Material, with no sign-in (James chose this over a link the Leader forwards, and over Disciple accounts).
- **The change text waits until things are quiet, and goes at most once a day.** It is sent once nothing affecting that person's Materials has changed for an hour, it says what things are now rather than what happened, each person gets at most one a day, and if everything ends up where it was when they were last told, nothing is sent.
- **Both an assignment and a content change count.** A relationship moved to another Material or to none counts, and so does the Material it is on gaining or losing a file, a link or its text. A change to the title only does not.
- **Planning Center's file types, at 50 MB each**, uploaded from the browser straight to Supabase Storage.
- The text goes to "each mentor" in James's words, and to each Disciple under the first answer; one text per person covers every relationship of theirs that changed.

## Decided at the mock-up review, 2026-09-24

- Q1, item order: in the order added, no reordering. Not queued; taken as recommended.
- Q2, the Leader's Resources card: as drawn in M-2. Not queued; taken as recommended.
- Q3, the assign page lists every live, accepted relationship not already on the Material, those on no Material first, then grouped by their current Material.
- Q4, the Disciple's page names nobody.
- Q5, all seven texts in M-5 approved as drawn. They are quoted exactly under *The wording*.
- Q6, a Disciple moved to no Material is sent nothing; their page says there is no material right now.
- Q7, the hourly tick stays; the text arrives one to two hours after the last change.
- The hint under **Text** on the create and edit pages goes: "don't keep this line". Nothing replaces it.

## Settled rules this reverses

- *Settled: No Interface Action Sends a Message* (`docs/product-rules.md`).
  An Admin's act now leads to a text, but the text is still not sent by the button: the tick sends it once the changes settle, through the same sending layer and recipient check as every other text.
  The carrier risk that rule guards against is why the text is capped at one per person per day.
  Recorded as `docs/adr/0027-a-material-change-is-texted-once-it-settles.md`, with a **Supersedes** note under the rule.
- *ADR-0011, Only a Leader Is Sent a Link*.
  It stays true of Invitation Links.
  A Disciple is now sent one other link, which opens a read-only page of their Material and asks them nothing.
  Recorded as `docs/adr/0028-a-disciple-is-sent-a-link-to-their-material.md`, which amends 0011.
- *Settled: Materials* at the Materials grill: "Title, text, optional PDF; PDF only; 20 MB cap." becomes a title, optional text and any number of files and links.

## Model

A Material is a title, optional text, and an ordered list of **items**.
An item is a **file** (storage path, the name it arrived under, its content type, its size) or a **link** (an `http` or `https` address and an optional label).
A Material carries text, at least one item, or both, which replaces `material_carries_something`.
Items are shown in the order they were added; there is no reordering (decided here, the alternative being up and down arrows on the edit page).
At most 20 items on one Material, a constant in `src/domain/materials.ts`.

A Material stays the unit of assignment: a relationship still works through one Material at a time, so the attribution *Settled: Material Assignment* exists for is untouched however many files a Material holds.
Edits stay plain, with no versioning; `material.edited` keeps recording `from` and `to`.

The existing `pdf_path` and `pdf_filename` become the first file item of their Material in the migration, and the two columns are dropped by a later migration once no deployed code reads them.

## Files

Allowed types, checked by the bucket and again by the domain:
PDF, Word (`.doc`, `.docx`), plain text, rich text, images (JPEG, PNG, GIF, WebP, HEIC), audio (MP3, M4A, WAV) and video (MP4, MOV, WebM).
At most 50 MB each.
The `material` bucket is given `file_size_limit` and `allowed_mime_types` in a migration, so the database refuses what the form would.

The browser uploads straight to the private bucket under the Admin's own session, at `<ministry_id>/<uuid>.<ext>`, so the policies ticket 14 wrote still decide.
The form then posts each new file's path, and the route reads the object's size and type back from Storage rather than trusting the browser.
A file uploaded and never saved is swept: the tick deletes any object under a Ministry's folder that no item names and that is more than a day old.
Uploading needs JavaScript; the rest of the form does not.

## Where a Material is shown

The hint under **Text** on the create and edit pages is removed (James, 2026-09-24).
The Leader dashboard's Resources card lists the text, with any `http` or `https` address in it made a link, then each item: a file as a download button naming it and its size, a link as its label (or its host) opening in a new tab.
The Disciple's page shows the same, and nothing else.

## The change text

Recipients are everyone holding an open membership, Leader or Participant, on an accepted, unended relationship.
For each person and each such relationship, Discipler keeps what that person was last told: the Material and a fingerprint of its content (its text and items, not its title).
A **pending change** is one where what is running now differs from what they were last told.
A relationship's first assignment after acceptance is a change from "nothing".

The hourly tick sends a person one text when all of these hold:

- they have at least one pending change;
- nothing that feeds any of their pending changes has changed in the last hour (an assignment to the relationship, or an edit to the Material it is now on);
- they have not been sent a Material text today, in the Ministry's timezone;
- it is between 8am and 9pm in the Ministry's timezone, the check-in clamp;
- the relationship is not paused (a paused relationship's change waits for the resume, then goes by the same rule).

Sending records a new "told" row for every relationship the text covered, so the history of what each person was told is append-only.
A change undone before the text goes clears itself, because there is then nothing pending.
The tick is hourly, so "quiet for an hour" is met between one and two hours after the last change.

The text is a `no_reply` message, so it never holds a number or waits behind a check-in question, and a reply to it is read as any other reply is.
It may carry the rates line, under *The Rates Line Reaches a Person Once a Month*, and is added to that rule's list.
It is in the Ministry's voice, uses the Ministry's own nouns, and names no phone number.
The Leader's links to the Leader dashboard, a Disciple's to their Material page.

## The wording

Approved by James on 2026-09-24 (M-5, Q5). `<M>` is the Material's title, `<L>` the Leader names as the Starter Message lists them, `<n>` a count of two or more, `<dash>` the Leader dashboard link and `<page>` the Disciple's Material page link. Each is prefixed by the Ministry name, as every text is, and may carry the rates line.

- Leader, moved to a Material: `The material for your discipleship is now <M>. See it at <dash>`
- Leader, the Material was updated: `<M>, the material for your discipleship, has been updated. See it at <dash>`
- Leader, several relationships changed: `The material has changed for <n> of your discipleship relationships. See them at <dash>`
- Leader, moved to no Material: `Your discipleship no longer has a material assigned. See it at <dash>`
- Disciple, moved to a Material: `Your discipleship material with <L> is now <M>. Open it here: <page>`
- Disciple, the Material was updated: `Your discipleship material, <M>, has been updated. Open it here: <page>`
- Disciple, moved to no Material: nothing is sent.

A Leader with pending changes on two or more relationships gets the *several* text, whatever kind each change is.
A Disciple's text links one page, and a page belongs to one relationship, so a Disciple with pending changes on two relationships gets the text for the one changed most recently, and the other goes on a later day under the one-a-day rule.
That case needs a Disciple in two relationships whose Materials both change on one day; it is decided here rather than given wording of its own, the alternative being one text with two links.

A Disciple whose relationship has been moved to no Material is sent nothing, and is recorded as told, since there is nothing to open (decided here; the alternative is a text saying the Material was taken away).

## The Disciple's Material page

`/material/<token>`, no session.
One token per open membership of a Participant, minted the first time a text links to it and kept, so every text they have had keeps working.
It opens nothing once that membership closes or the relationship ends.
Tokens are stored as the other link tokens are, resolved through a security-definer function granted to `discipler_command` only, with the page then read under row-level security for that Ministry.
The page shows the Ministry's name, the Material's title, its text and its items; it names nobody and shows no number.
A file downloads through `/material/<token>/file/<item>`, which checks the token again and redirects to a signed URL a few minutes long, so no long-lived address is on the page.

## Assigning to many at once

A Material's folder gains **Assign to more**, opening `/materials/<id>/assign`: every live, accepted relationship not already on it, those on no Material first and then by the Material they are on, each with a checkbox; the Men's / Women's filter; a "Select all shown" box; and "Assign <title> to N relationships".
It is one command, `material.assign_to_relationships`, run in one transaction: any refusal refuses the lot and names why.

## Tickets

1. `01-several-files-and-links.md`: the item model, links, the wider types, 50 MB, straight-to-Storage uploads, the sweep, the edit and create pages, and the Leader dashboard.
2. `02-assign-to-many.md`: the assign page and its command.
3. `03-the-change-text-to-leaders.md`: what each person was told, the tick's rule, the Leader's text, ADR-0027.
4. `04-the-disciples-page-and-text.md`: the token, the page, the file route, the Disciple's text, ADR-0028.

02 and 01 are independent.
03 needs 01 for the content fingerprint.
04 needs 01 and 03.

## Deploy order

Each ticket's migration is pushed to production before its code merges, `npm run smoke:pages` is run between the two, and a key is only ever added to a page document within one change, as for Materials.
Before 01 ships, the production project's global Storage file size limit is checked to allow 50 MB.

## Found while writing this, not part of it

- The 20 MB cap is not reachable in production today (Problem Statement, item 3). Ticket 01 fixes it by moving the upload out of the route.
- No code computes the thirty-day Silence Gap, so the `Discipler:` prefix never goes on "the first message after a silence gap" as *The A2P Compliance Prefix Is a Stated Exception* says it must. The new texts would inherit that. Raised in `docs/open-questions.md` rather than fixed here, since it changes every message path.
