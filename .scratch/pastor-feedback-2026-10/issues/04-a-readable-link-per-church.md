# 04 - A readable link per church

**What to build:** Each Ministry's Intake forms live at a link a pastor can print on a bulletin and say from the pulpit: `/join/<short name>` for mentor/mentee and `/join/<short name>/groups` for groups.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The readable link per church*.
Today: the links are built from the Ministry id in `src/domain/outbound-copy.ts` (`/intake/<id>` for groups, `/intake/<id>/discipleship` for mentor/mentee), and Intake Forms draws a QR code for each.

**Blocked by:** nothing. Design: `.lavish/pastor-feedback/mock-link.html`, settled in James's Lavish review of 2026-10-12.

**Status:** ready-for-agent

## Acceptance

- [x] A Ministry has a short name: lowercase letters, digits and dashes, unique across Discipler. (564a2de, c6038ad)
- [x] Every existing Ministry is given one from its name when this ships, with `-2`, `-3` and so on added on a clash; a new Ministry is given one when it opens. (564a2de)
- [x] `/join/<short name>` opens the mentor/mentee form and `/join/<short name>/groups` opens the group form, each with `?via=qr` meaning what it means today. (c6038ad)
- [x] One card at the top of Intake Forms replaces today's two link cards: the editable short name first (*Your church's short name*, the address prefix beside the field, and Save), then the two forms side by side as even tiles, each with its name, QR code, readable link, *Copy link* and *Download QR code*. No helper sentences, and nothing in the card hangs below the tiles. (c6038ad, d919ac8)
- [x] A short name already taken, or one the app's own routes need, is refused with a sentence saying why. (c6038ad)
- [x] Every short name a Ministry has ever had keeps redirecting to its forms, forever. (564a2de, c6038ad)
- [x] `/intake/<ministry id>` and `/intake/<ministry id>/discipleship` keep working. (c6038ad)
- [x] Intake Forms shows the readable links, and both QR codes encode them. (c6038ad)
- [x] Every text and page that hands out an Intake link hands out the readable one. (c6038ad; no text hands one out)
- [x] A rename is recorded in the Ministry's history. (c6038ad)
- [x] `docs/product-rules.md` and `CONTEXT.md` name the short name and the redirect rule. (38c4d06)
- [ ] Checked by eye in a real browser against the mock-up, at desktop and phone width, the two tiles the same height, and a printed QR code scanned with a phone.
  Checked by eye at desktop and phone width with the tiles the same height (d919ac8), and every square decoded to its readable link; the scan of a printed code with a phone is James's.

## Not in this ticket

- The Intake form editor. That is tickets 11 to 13.

## Comments

Decisions made while building, each the conservative reading of a gap, with the alternative.

- **`/join/<short name>` redirects to the form; it does not serve it.**
  Both `/join` addresses answer with a temporary redirect to `/intake/<ministry id>/discipleship` and `/intake/<ministry id>`, carrying the query string, so `?via=qr` records a scan exactly as before and every step, submit and confirmation page is the one already built and tested.
  The address bar shows the `/intake/...` address once the form opens.
  Temporary, so no phone caches where a name leads.
  Alternative: serve each form, its steps, its submit route and its confirmation under `/join` as well, which would duplicate every Intake page (and the form editor of tickets 11 to 13 would then touch both).
- **What an Admin types is trimmed and lowercased, and nothing else is rewritten.**
  A space, an accent, an underscore, or a dash at either end or doubled is refused with a sentence.
  Alternative: turn what was typed into a short name the way the database turns a Ministry's name into its first one.
- **A short name is at most 40 characters** (`SHORT_NAME_LONGEST`, and the same in the migration), and a generated one is cut at a word to fit.
  Alternative: no cap.
- **The names the app's own routes need are every top-level route, plus `api`, `join` and `groups`.**
  A test fails when a top-level route is added to `app/` without being reserved.
  The database holds the same list in `app.short_name_is_reserved`, so a new route also needs a migration that adds it there, and another test checks the database refuses every reserved name.
  Alternative: reserve only what could collide under `/join`.
- **A Ministry may take back a short name it held before; no other Ministry may ever take one.**
  Taking back a name writes a rename to history like any other.
- **The names given when this ships go oldest Ministry first**, so the Ministry longest on Discipler keeps the plain name where two clash.
  The migration writes no history for them, as `20261013000500` wrote none for its data change: it is no Admin's act.
  `held_short_name.first_held_at` records when each was given.
  A Ministry opening from now on carries its short name in its `ministry.opened` event.
- **Download QR code saves the captioned file the two existing routes draw.**
  Each caption names the form as its tile does (`Riverside Chapel - Mentor and mentee form`, `Riverside Chapel - Groups form`; they used to end in *Discipleship* and *Join a group*, after a long dash).
  Each file is named for its link (`riverside-chapel-qr-code.svg`, `riverside-chapel-groups-qr-code.svg`).
  *Open it on its own, to print* went with the helper sentences, as the mock-up has only the two buttons.
- **The squares on the page are drawn into it without a caption**, from the same encoder as the downloaded file, at 140 pixels with the full quiet zone.
  The mock-up's placeholder was 132 pixels with almost no quiet zone.
  The old rule that the on-page code is at least 320 pixels is replaced by the mock-up's size.
- **After Save the field says so**, under the field and above the tiles: *Saved. Links and QR codes printed with the old name still open your forms.*
  A refusal sentence sits in the same place.
  The name typed is not carried back after a refusal; the field shows the name that stands.
  Alternative: no receipt, as in the mock-up.
- **Copy link copies the whole link, `https://` included**; the tile shows it without the scheme, as a bulletin would print it.
- **The groups form's own empty state still points at `/intake/<ministry id>/discipleship`.**
  It is navigation inside the forms rather than a link handed out.
- **No text changed.**
  No message Discipler sends hands out a Ministry's Intake link (`src/domain/outbound-copy.ts` composes none into a message), so *every text that hands out an Intake link* is none.
