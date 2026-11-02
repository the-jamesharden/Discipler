# 34 - Help docs

**What to build:** Discipler's help docs as Markdown in the repo, served at `/help`, which the AI guide answers from.

**Blocked by:** nothing

**Status:** shipped

## The rule

- One Markdown file per page, covering at least: getting started, the Roster and Intake, pairing, check-ins and the check-in rhythm, Follow-Up, Materials, Settings, billing and the trial, referrals, the test check-in, and texting (STOP, START, HELP).
- Every number in a page comes from the constant that enforces it, not typed by hand.
- Pages are listed in search (ticket 24).
- Nothing in them names a real church's people.

## Acceptance

- `/help` lists every page and each renders with the product's styles.
- A changed constant changes the page that states it.

## Comments

### Built (2026-10-31)

- Seventeen Markdown pages in `app/help/content/`, one per file, written for the product as it will be at launch: getting started, the test check-in, the Roster and Intake, pairing, check-ins and their rhythm, Overview, Follow-Up, Materials, what Disciplers and Disciples see, texting (STOP, START, HELP and the Disciplers' words), Settings, billing and the trial, referrals, signing in, Ask Discipler, getting help, and setup videos.
- `app/help/library.ts` lists them in order and by section, and is what everything reads: `HELP_PAGES` (slug, address, section, title, summary, first sentence, filled Markdown, headings with anchors), `helpPage(slug)` and `helpCenterAsText()`.
  Search (ticket 24) lists `HELP_PAGES`; the AI guide (ticket 31) answers from `helpCenterAsText()`, where each page is headed by its title and its address.
- Every number in a page is a placeholder, `{{name}}`, filled from `app/help/facts.ts`, which reads the constant that enforces it.
  A placeholder with no fact throws, a fact no page uses fails a test, and a test fails on any digit typed in a page outside a placeholder, an ordered list's numbering, and the shape names 1:1 and 1:2.
  `tests/app/a-changed-constant-changes-the-help-page.test.ts` changes `REMINDER_AFTER_HOURS`, `TRIAL_DAYS`, `TEST_CHECK_INS_PER_DAY` and `LONGEST_PASSWORD_BYTES` and reads the pages that state them.
- The example texts on the check-ins and texting pages are composed by the functions that compose the real texts (`meetingQuestion`, `satisfactionQuestion`, `concernDetailRequest`, `checkInThankYou`, `helpMessage`), for a made-up church and person.
- `/help` lists every page by section with its first sentence; `/help/<slug>` renders a page in a card, with Previous and Next and the support address under it.
  Both are built at build time and read no session; any other slug is a 404.
- Markdown is rendered by markdown-it 15.0.3 (pinned, ships its own types) with raw HTML off, no linkify and no typographer, and each `##` heading gets an anchor so a link can point at part of a page.
- `help` is a reserved short name, in `RESERVED_SHORT_NAMES` and in `app.short_name_is_reserved` (migration `20261101200000_help_is_a_reserved_short_name.sql`, which refuses to run if a Ministry already holds `help`).

### Decisions made

- **Help is public, with no sign-in.** The spec does not say; a pastor deciding whether to sign up may read it, and nothing on it is any church's. The alternative was Admin-only behind the session.
- **The launch's numbers live in `src/domain/launch-terms.ts`**, because most of the code that enforces them does not exist yet: the trial, the prices, the yearly discount, `EXPO26`, the church-plant window, the referral hold, the test check-in limits, the Verify and email codes, the reset link, the setup steps, the check-in sentence length, the AI guide's limits and the office hours rhythm.
  Each names the ticket that enforces it (04, 09, 11, 14, 19, 20, 22, 26, 28, 30, 31, 32, 33, 40), and that ticket imports it from there rather than defining its own, so the help page and the product cannot disagree.
  The alternative, leaving the launch's numbers out of the pages until each ticket lands, would have shipped help that is silent on billing and the trial.
- **Markdown is imported as text with `?raw`**, which Vite reads natively and `next.config.ts` teaches webpack (`asset/source`), so the words are bundled with whatever reads them and no server reads a file at run time.
  The alternative was reading the files with `fs`, which needs `outputFileTracingIncludes` on Vercel for every route that reads them.
  `next dev --turbopack` would need the same rule under `turbopack.rules`; the project does not use Turbopack today.
- **Pages beyond the ticket's list**: Overview, what Disciplers and Disciples see, signing in, Ask Discipler, getting help, and setup videos, because each is something a pastor asks and the spec puts it in the Help menu or the Help center.
- **Setup videos** are listed from `app/help/setup-videos.ts`, empty at launch, and the page says the first are being recorded until a line is added.
- **The sign-up page is named, not linked**, on Getting started, because `/signup` does not exist on this branch; link it once ticket 15 lands.
- **No Lavish mock-up was made** for the Help center, which the spec's mock-up list does not include; it is drawn from the product's own shells and styles.

### Needs James

- Read the pages: they speak for Discipler about billing, offers and texting at launch.
- Until ticket 06 merges, the quoted example texts start "Riverside Chapel:" while the texting page says every text starts "{church} via Discipler:"; once 06 changes the composers, the quotes follow by themselves.
- At merge, tickets that define their own copy of a number in `src/domain/launch-terms.ts` should import it from there instead (or move it and leave `app/help/facts.ts` pointing at the new place).

- James, 2026-11-01: `/help` ships to production with this branch as it is, public and unlinked, though its billing, referral, Ask Discipler and test check-in pages describe features that land later in the launch.
  Alternatives offered: a switch holding `/help` at 404 until launch, or hiding only the pages for unbuilt features.

### Closed out (2026-11-02)

Merged in PR #35 (49d4bb2) and its migrations are on production.
Ticket 06 merged with this one, so the quoted example texts now start "{church} via Discipler:".
What is left for James moved to `docs/open-questions.md`: *the wording of the help pages*.
