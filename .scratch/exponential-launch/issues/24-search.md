# 24 - Search

> **Triaged 2026-11-03 against the spec's "Search, nav and Settings" and mock-up 2, which James approved.**
> The screens are `.lavish/top-nav-search/v-b2-search.html` (the bar, clicked), `v-b2-palette.html` (nothing typed), `v-b2-palette-gr.html` (typing) and the Round 2 section of `build.mjs`.
> Layout B is the search bar's look, so the ticket's question to James is answered.
> Where the mock-up lists something that does not exist yet (Billing, Refer a church, Ask Discipler), the rule below and ticket 23's "no control goes nowhere" win over the drawing.

**What to build:** A search directory, opened with ⌘K, with `/`, or by clicking the search bar at the right end of the tab row.

**Blocked by:** 23 (shipped)

**Status:** ready-for-human

## The rule

- Search is a directory, not a question box.
- It opens with ⌘K, with `/`, or by clicking the bar, which grows into a longer bar when clicked (24rem from 17rem, as drawn).
- It opens from every Admin page, including those with no tab row; the bar is drawn only where the tab row is.
- With nothing typed it is a directory of pages, under "Go to", "Settings and more" and "Help".
- Typing groups results under People, Relationships, Materials and Help, each row saying where it opens.
- No arrow-key hint is shown, though the arrow keys work.
- It lists the tabs, each Settings section, Intake forms, the Help pages and Account, plus people, relationships and Materials by name.
- **Refer and Billing are listed only once they exist.**
  Each is written in its place in `directoryPages` (`app/search/pages.ts`) with a null address, or reads the address its menu already holds, and appears the moment it has one.
- **It never searches reply text or Concerns.**
  What it reads holds no such words, so there is nothing to search: names, titles, and nothing a person wrote in a text.
- It reads through row-level security like every page, in one read of its own (`search_page`, ADR-0023), so an Admin finds only their own church.
- That read happens when search is opened, and a page that is only looked at makes no extra call.
- Admins only for now: a Leader's pages do not change.

## Not in this ticket

- Billing's page: ticket 33.
- The Refer page: ticket 32.
- Ask Discipler, the corner circle: ticket 31.
- Searching the words inside a Help page: it finds Help pages by their titles, because this is a directory.

## Acceptance

- ⌘K and `/` open it from any Admin page, except while typing in a field.
- Typing a person's name finds them; typing a Concern's words finds nothing, and neither does a reply's text.
- An Admin of one church never sees another church's names.
- A page Discipler does not have yet is not listed.
- Every Admin page renders with the same number of database calls as before.
- `npm run smoke:pages` passes.

## For James

1. Decided: layout B, mock-up 2.
2. After the migrations are pushed and before the merge, run `npm run smoke:pages` on production; an agent cannot.

## Comments

### Triaged (2026-11-03)

This ticket was `needs-info` only until mock-up 2 was approved.
It was read against the spec's "Search, nav and Settings" and layout B, and the rule above is rewritten to match.
Three things in the drawing are not built, because they do not exist yet: Billing, Refer a church and Ask Discipler.

### Built (2026-11-03)

`public.search_page()` (`supabase/migrations/20261104102400_the_search_page.sql`) is the one read, and `/search` (`app/search/route.ts`) serves it as rows, marked `private, no-store`.
`search` is a reserved short name (`20261104102401`), so that migration holds the whole list as it stood; a branch that also reserves a name must carry both.
`SearchDirectory` in `app/search/search.tsx` is mounted by `AdminNav`, so the keys work on every Admin page, and `SearchBar` is the one line added to `TabBar`.
`ADMIN_TABS` moved to `app/admin-tabs.ts`, and `app/shell.tsx` re-exports it, so the browser can list the tabs without bringing the shell along.

Counted from the Kong log while holding the test lock: `/overview`, `/check-ins`, `/suggested-pairs`, `/follow-up`, `/materials`, `/roster`, `/settings`, `/intake-forms`, `/account` and `/relationships` each made 1 call, by name.
Opening search made 1 more, `search_page`, and a real headless Chrome made no `/search` request until it was opened.
The answer for the seeded church of 9 people, 2 relationships and 2 Materials was about 5 KB.

### How a later ticket adds its page

Each is in `directoryPages` (`app/search/pages.ts`) already, and nothing is listed while its address is null.

- **Refer a church (32):** sets `REFER_A_CHURCH.href` in `app/top-nav-menus.ts`, the line that also draws the header's button.
  Nothing to change in search.
- **Restart onboarding (27), What's new and Office hours (30), Contact support (25), Setup videos, Blog:** listed under Help the moment `helpMenuFor` gives them an address.
  Nothing to change in search.
- **Billing (33):** sets `href` on its entry to its section of Settings, and adds that section's name to `SETTINGS_SECTIONS` in `app/search/copy.ts` if it should be said under Settings.
- **Ask Discipler (31):** the entry needs an address.
  If the circle opens with no address of its own, that ticket decides between giving it one and removing the entry.
- **A new tab** joins `ADMIN_TABS` and is listed with it; any other new page is one more entry in its place.

`tests/app/search-directory.test.ts` fails if an entry's address is not a route the app has.

### Decisions

- **The names are read when search opens, and matched in the browser, rather than asked for on each key.**
  One read an open, with nothing typed reaching the server or its logs, and bursts of calls are what stalled the origin (ADR-0023).
  The alternative, a query per keystroke, would have put names being looked for in request logs and added a burst per search.
- **It reads afresh on every open**, so somebody added a minute ago is there, and the pages show at once while the names arrive.
- **A click does two things at once: the bar grows, and search opens over the page, as the two drawings show.**
  The mock-up draws the grown bar and the open directory separately and does not join them.
  The alternative was results hanging from the grown bar, which nothing draws.
  The bar stays grown behind the scrim until search closes; opened by a key, it stays its usual size, as `v-b2-palette` draws it.
- **A typed word matches the start of a word**, in any order, ignoring case and accents, because that is what the mock-up highlights: "gr" marks "Young adults *gr*oup".
  So "arcus" does not find Marcus; the alternative, anywhere in a word, brings a lot of noise on a short query.
- **A typed search also lists pages, under their own headings, between Materials and Help.**
  The spec names only People, Relationships, Materials and Help, but says pages are listed, and "roster" must find the Roster.
- **Help pages are found by title only**, with the lead sentence as the small line, and never by their words: it is a directory, and that keeps a person's words from matching a Help paragraph by accident.
  A title such as "Billing" is a Help page that exists, so it is listed; it is not the Billing page, which is not.
- **The line under a person is their pairing in the Roster's words, not "Ready to Pair".**
  The mock-up's Greg Lawson says Ready to Pair while leading Marcus Bell, which `app/roster/tags.ts` already rules out as saying the opposite of what he does.
  So it reads "Disciples Marcus Bell", "Discipled by Greg Lawson", "In Young adults group", "Awaiting Intake", "Opted out", and "Ready to Pair" only for somebody holding no pairing.
- **A relationship opens on its card on the Overview, `/overview#rel-…`, and not inside it.**
  Opening a card reads its Concerns and records the reading, which a search should not do on anybody's behalf.
  The card is outlined by `:target`, so every row is a plain link rather than a client navigation; the alternative, `?card=`, would have written a Concern viewing the Admin never asked for.
- **An unaccepted relationship the Overview does not draw yet opens on its Leader's page**, because the Overview's card appears only after the days it surfaces at; the alternative was a link to a card that is not there.
- **A Material has no small line.** The mock-up's "6 weeks" has no column behind it.
- **"Each Settings section" is one row with nothing typed, as drawn, and one row each once typed:** Ministry, Language, Pairing, and Check-in, which is the one an Admin is most likely to look for though it is inside Pairing.
  The cards gained `id`s for this.
- **On a screen with no keyboard the shortcut hints are hidden** (`hover: none` and `pointer: coarse`), so a phone says no ⌘K.
  The mock-up draws them at phone width, and a narrow window on a laptop still shows them, so a 390px capture matches the drawing.
- **Esc is a real button**, because a phone has no Esc key and otherwise closes only by a press outside.
- **Off a Mac the hints read "Ctrl K", and Ctrl K works**, because plenty of pastors use Windows.
- **The bar drops to its own row under the tabs at 1060px and below, not only on a phone**, because the six tabs and a badge no longer fit beside it; the mock-up only draws 1280 and 390.
  It takes the phone's arrangement, full width with the row's line under it.
- **With no script the bar is not drawn**, since nothing could open, as ticket 23's "no control goes nowhere" asks.
- **A native `dialog`**, so the browser keeps focus inside it, closes it on Esc, gives focus back and draws it above Waiting on you and any card; the mock-up's scrim is its `::backdrop`.
- **Found on the way:** the Overview ran 41px wide at 320px, because the relationship cards had a 320px minimum; that minimum now yields to the page.

### Closed out (2026-11-03)

Built, but not `shipped`: the last Acceptance line, `npm run smoke:pages`, has not been run, and it is James's to run on production after the migrations are pushed and before the merge.
Move this ticket to `shipped` when it passes.
It is parked in `docs/open-questions.md`, under "Open: what wave 3 left James to do in Stripe and on production".
