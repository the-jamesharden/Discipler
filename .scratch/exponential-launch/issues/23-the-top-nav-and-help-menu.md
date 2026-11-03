# 23 - The top nav and Help menu

> **Triaged 2026-11-03 against the spec's "Search, nav and Settings" and the approved mock-up, at James's instruction to build it now.**
> The screens are `.lavish/top-nav-search/v-b2.html` (layout B), `v-b2-help.html` and the Round 2 section of `build.mjs`.
> Where this ticket as first written disagreed with the spec, the spec won: Ask Discipler is not in the Help menu, and the Account menu's circle opens to the name rather than showing it.

**What to build:** Every Admin page's header carries Help, the Settings gear and a circle with the Admin's initials, and on a phone the tab names show three at a time.

**Blocked by:** Nothing

**Status:** ready-for-human

## What was true before

- `AdminShell` in `app/shell.tsx` had an Account menu whose summary read "Account" and deliberately showed no name, to save a read.
- `initialsOf` in `app/initials.ts` was used only by people's rows.

## The rule

- The Account menu becomes a circle with the Admin's initials (`initialsOf`), opening: their name and "Admin, {Ministry}", The relationships you lead, Intake forms, Change your password, Sign out.
- "The relationships you lead" leaves the header, and "Ministry settings" becomes the gear.
- The header's buttons, right-aligned on a phone: "Refer a church" (with a gift), Help, the Settings gear, the initials.
- The Help menu: Help center, Restart onboarding, What's new (with a New tag), Office hours, Contact support, then a Learn section with Setup videos and Blog.
  Blog links to trydiscipler.com/blog in a new tab, and is hidden until that page exists.
- **No control goes nowhere.**
  An item shows only once what it opens exists; today that is the Help center alone, and "Refer a church" is not drawn.
  Each item is already written down in its place in `app/top-nav-menus.ts` with a null address, so its ticket makes it appear by setting one line.
- On a phone the tab names show three at a time: a discreet "›" at the right end shows the other three and a "‹" slides back, each shown only when there is more that way.
- On a phone the church name and its subtitle sit on a soft, mostly opaque backing, so the botanical frame does not blend into them.
- The Admin's name comes from the one page-session read, `app.page_session()` (ADR-0023), so the shell adds no read.
- One church per person, so there is no switch-organization control.
- Admins only for now: a Leader's pages do not change.

## Not in this ticket

- Search and the search bar at the end of the tab row: ticket 24.
- The setup meter, which sits under the tabs and is no pill in the header: ticket 26.
- Restart onboarding: ticket 27.
- What's new and Office hours: ticket 30.
- Contact support: ticket 25.
- Ask Discipler, a persistent circle at the bottom right and not a Help menu item: ticket 31.
- The Refer page: ticket 32.

## Acceptance

- Every Admin page renders the name and initials with the same number of database calls as before.
- A Leader's pages are unchanged.
- No control in the top nav goes nowhere.
- `npm run smoke:pages` passes.

## For James

1. Decided 2026-10-29 (Q77): the Help menu's items, as since revised in the spec.
2. After the migration is pushed and before the merge, run `npm run smoke:pages` on production; an agent cannot.

## Comments

### Triaged (2026-11-03)

This ticket was `needs-info` because it was never triaged, and James asked for it to be built now.
It was read against the spec's "Search, nav and Settings" and layout B of the mock-up, and the rule above is rewritten to match.
Two things changed from the ticket as first written, both because the spec wins: Ask Discipler left the Help menu, and the circle opens to the Admin's name rather than showing it.
The ticket's "a place for the setup meter" is nothing to build here: the spec and ticket 26 put the meter in a bar under the tabs, with no pill in the header.
The phone tabs and the name's backing were in the spec's section and not in the ticket, so they are built here.

### Built (2026-11-03)

`app.page_session()` gains `full_name` beside `person_id` (`supabase/migrations/20261103102300_the_page_session_names_the_admin.sql`), and `resolutionOf` hands it to every page as `SignedInAdmin.fullName`.
`AdminNav` in `app/top-nav.tsx` draws the buttons, and `app/top-nav-menus.ts` says what they offer.
`AdminShell` and every Admin page on `PageShell` carry it: Settings, Intake forms, a person's page, the reset screen, new and edit Material, `/account` and `/relationships`.
`app/tab-slider.tsx` is the phone's three-at-a-time row.

Counted from the Kong log while holding the test lock, with `origin/main` built beside this branch on the same database:

| Page | `origin/main` | This branch |
| --- | --- | --- |
| `/overview`, `/check-ins`, `/suggested-pairs`, `/follow-up`, `/materials`, `/materials/new`, `/roster`, `/roster/{person}`, `/settings`, `/intake-forms`, `/account`, `/relationships` | 1 call each | 1 call each |
| `/roster/reset/{person}` | 2 | 2 |

Only those calls were seen, by name, except for the two JWKS fetches of each server's first request, on both builds alike.
`/overview` and `/roster` loaded in real headless Chrome, so with Link prefetching on, also made 1 call on both; the gear being visible prefetches no page.
A Leader's `/relationships` and `/account` are byte-identical from `<body` to `</main>` on both builds, and 1 call each.

### Decisions

- **Nothing unbuilt is shown (the caller's instruction for James).**
  Every item is written in `HELP_MENU` in its place with `href: null`, and is drawn from the moment it has an address, so its ticket sets one line: Restart onboarding (27), What's new and Office hours (30), Contact support (25), and `REFER_A_CHURCH` (32).
  The alternatives were greyed-out rows, which invite a press that does nothing, or a mailto for Contact support, which the form in ticket 25 replaces within days.
  The Help menu therefore holds only the Help center until those land.
- **What's new's New tag is drawn whenever the item is.**
  Ticket 30 must make it follow each Admin's own dismissal when it sets the address, so that one line is really two.
- **Setup videos follows the list, not a ticket.**
  `/help/setup-videos` exists but says the first videos are being recorded, so the menu offers it from the first line in `SETUP_VIDEOS`, with no further change.
  The alternative was to show it now and land the Admin on a page with nothing to watch.
- **An Admin on `/relationships` and `/account` gets the top nav**, and only a person who administers nothing keeps the old Account menu.
  That page is the Leader surface, but the Admin reaches it from their own menu, and leaving the old menu there would have kept a second menu shape and a "Ministry settings" link for them alone.
  A plain Leader's pages do not change.
- **`/account` now holds the Admin's name in the header's closed menu.**
  The page's rule that it says nothing about the person stands for the form, and `changing-a-password-over-http` now asserts it of `<main>`; the phone number is still nowhere on the page.
  The alternative was a header missing from one Admin page.
- **An Admin with no row on the Roster gets a plain person mark and "Admin, {Ministry}"**, with no name line.
  `initialsOf('')` would have drawn "?".
- **The menus close on a press elsewhere, on choosing something, and on Escape**, by a small script (`app/top-nav-menus-close.tsx`), and opening one closes the other with no script through `details name`.
  The mock-up and the old Account menu (ticket 32, decision 2) closed only from their own button, which reads as stuck once two menus sit side by side.
  Without a script they still open and close.
- **The tab row opens on the three that hold the current tab**, so on the Roster it shows Follow-Up, Materials and Roster.
  The mock-up only drew the Overview, where the first three are right.
- **On a phone every menu hangs from the buttons' right edge**, not from its own button as drawn, so a wide one cannot run off the left of a narrow phone.
- **The tab names scale down below about 400px** so "Suggested Pairs" fits its third; at 390px and up they are as drawn, and at 320px they are about 11px.
  The alternative was wrapping that one tab onto two lines.
- **The name's backing is in place but shows nothing today.**
  The spec asks for it, and the mock-up's older stylesheet drew the frame on a phone; the product has hidden the frame below 1424px wide since, so the backing sits on plain paper.
  It is one rule, kept so the name stays legible if the frame returns.
